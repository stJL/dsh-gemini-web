import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { detectDualChannel, findAgentLimbScript, findCliScript } from './detector.js'
import { loadConfig } from '../config.js'

const execFileAsync = promisify(execFile)

export interface AgentTaskOptions {
  task: string
  model?: string
  site?: 'aistudio' | 'flow' | 'gemini'
  entry?: 'chat' | 'task'
  thinkingLevel?: string
  thinkingPolicy?: 'adaptive' | 'custom' | 'strict'
  thinkingTimeout?: number
  noFallback?: boolean
  timeoutSec?: number
  sessionId?: string
  newChat?: boolean
  downloadDir?: string
}

export interface AgentTaskResult {
  ok: boolean
  channel: 'agentlimb' | 'cdp' | 'none'
  model?: string
  initialModel?: string
  output?: string
  files?: string[]
  fellBack?: boolean
  fallbackChain?: string[]
  fallbackHistory?: string
  error?: string
  elapsedSec?: number
}

export function getWorkspaceDownloadDir(): string {
  try {
    const wsFile = path.join(os.homedir(), '.dsh', 'storages', 'workspace.json')
    if (fs.existsSync(wsFile)) {
      const data = JSON.parse(fs.readFileSync(wsFile, 'utf-8'))
      const defId = data?.global?.defaultWorkspaceId
      const wsPath = data?.tables?.workspaces?.[defId]?.path
      if (wsPath && fs.existsSync(wsPath)) {
        return path.join(wsPath, 'downloads')
      }
    }
  } catch {}
  return path.join(process.cwd(), 'downloads')
}

let lastSessionId: string | null = null

export async function executeAgentTask(options: AgentTaskOptions): Promise<AgentTaskResult> {
  const cfg = loadConfig()
  const status = await detectDualChannel(cfg.connectionMode, cfg.port, cfg.preferredBrowser)

  if (status.activeChannel === 'none') {
    return {
      ok: false,
      channel: 'none',
      error: '雙通道皆未連線：請確認 Brave 已打開並啟用 AgentLimb 擴充功能，或已開啟 CDP 偵錯模式。',
    }
  }

  const venv = status.pythonVenv
  if (!venv || !fs.existsSync(venv)) {
    return {
      ok: false,
      channel: status.activeChannel,
      error: '未找到 Python 虛擬環境 (.venv)，請先執行一鍵初始化',
    }
  }

  const agentlimbScript = findAgentLimbScript()
  const cdpScript = findCliScript()

  const thinkingPolicy = options.thinkingPolicy || cfg.thinkingPolicy || (cfg.fallbackMode === 'strict' ? 'strict' : 'adaptive')
  const isStrict = thinkingPolicy === 'strict' || cfg.fallbackMode === 'strict' || cfg.autoFallback === false || options.noFallback

  const targetModel = options.model || cfg.defaultModel || 'gemini-3.5-flash-lite'
  const targetSite = options.site || 'aistudio'

  // 任務量級與超時研判 (自適應模式下複雜任務自動放寬至至少 300 秒)
  let baseTimeout = options.timeoutSec || cfg.timeoutSec || 180
  const isHeavyTask = options.task.length > 150 || /(?:c\+\+|cpp|rust|紅黑樹|red-black|算法|演算法|架構|從零|完整實作|生產級|完整代碼|重構)/i.test(options.task)
  if (thinkingPolicy === 'adaptive' && isHeavyTask) {
    baseTimeout = Math.max(baseTimeout, 300)
  }
  const timeoutSec = baseTimeout

  // 1. 判斷會話生命週期（同一 DSH 對話無感延續，全新話題開新聊天室）
  let isNewChat = false
  if (options.newChat !== undefined) {
    isNewChat = options.newChat
  } else if (options.sessionId && lastSessionId && options.sessionId !== lastSessionId) {
    isNewChat = true
  }
  if (options.sessionId) {
    lastSessionId = options.sessionId
  }

  // 2. 確保工作區 downloads 目錄存在
  const downloadDir = options.downloadDir || getWorkspaceDownloadDir()
  try {
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }
  } catch {}

  // 3. 通道 A: AgentLimb (零彈窗 / 免 Allow)
  if (status.activeChannel === 'agentlimb' && agentlimbScript && fs.existsSync(agentlimbScript)) {
    try {
      const args = [
        agentlimbScript,
        'task',
        options.task,
        '--model', targetModel,
        '--site', targetSite,
        '--timeout', String(timeoutSec),
        '--thinking-policy', thinkingPolicy,
        '--download-dir', downloadDir,
      ]
      if (options.thinkingTimeout) {
        args.push('--thinking-timeout', String(options.thinkingTimeout))
      }
      // 封印 Extra High：免費池強制安全降級至 high，避免 Permission Denied 與死迴圈
      let safeThinking = options.thinkingLevel || cfg.thinkingLevel || 'high'
      if (safeThinking.includes('extra') || safeThinking === 'xhigh' || safeThinking === 'max') {
        safeThinking = 'high'
      }
      args.push('--thinking-level', safeThinking)

      if (isNewChat) args.push('--new-chat')
      if (options.entry) args.push('--entry', options.entry)
      if (isStrict) {
        args.push('--no-fallback')
      }

      // 保障 Node.js 執行超時寬限（多給 30 秒，防止提早中斷 Python 自適應思考進程）
      const nodeExecTimeout = (timeoutSec + 30) * 1000
      const { stdout } = await execFileAsync(venv, args, {
        timeout: nodeExecTimeout,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
      const lines = stdout.trim().split('\n')
      const jsonStart = lines.findIndex(l => l.trim().startsWith('{'))
      if (jsonStart >= 0) {
        const parsed = JSON.parse(lines.slice(jsonStart).join('\n'))
        return {
          ok: parsed.ok,
          channel: 'agentlimb',
          model: parsed.model || targetModel,
          initialModel: parsed.initial_model || targetModel,
          output: parsed.output || '',
          files: parsed.files || [],
          fellBack: parsed.fell_back,
          fallbackChain: parsed.fallback_chain || [],
          fallbackHistory: parsed.fallback_history || '',
          error: parsed.error,
          elapsedSec: parsed.elapsed_sec,
        }
      }
      return { ok: true, channel: 'agentlimb', model: targetModel, output: stdout.trim() }
    } catch (err: any) {
      // 若 AgentLimb 偶發報錯且為 auto 模式，向下嘗試 CDP 備用通道
      if (cfg.connectionMode !== 'auto') {
        return { ok: false, channel: 'agentlimb', error: err.message || String(err) }
      }
    }
  }

  // 4. 通道 B: Playwright CDP 備用
  if (cdpScript && fs.existsSync(cdpScript)) {
    try {
      let modelArg = 'flash-lite'
      if (targetModel.includes('hydrogen')) modelArg = 'hydrogen'
      else if (targetModel.includes('argon')) modelArg = 'argon'
      else if (targetModel.includes('3.8') || targetModel.includes('flash')) modelArg = 'flash'
      else if (targetModel.includes('lite')) modelArg = 'flash-lite'
      else if (targetModel.includes('nano')) modelArg = 'nano2.1'
      else if (targetModel.includes('omni')) modelArg = 'omni1.2'

      const args = [
        cdpScript,
        'playground',
        '--model', modelArg,
        '--prompt', options.task,
        '--raw',
        '--download-dir', downloadDir,
      ]
      if (isNewChat) args.push('--new-chat')
      if (status.cdp.port) args.push('--port', String(status.cdp.port))

      const { stdout } = await execFileAsync(venv, args, {
        timeout: (timeoutSec + 30) * 1000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
      return {
        ok: true,
        channel: 'cdp',
        model: targetModel,
        output: stdout.trim(),
      }
    } catch (err: any) {
      return { ok: false, channel: 'cdp', error: err.message || String(err) }
    }
  }

  return { ok: false, channel: status.activeChannel, error: '未找到執行腳本' }
}
