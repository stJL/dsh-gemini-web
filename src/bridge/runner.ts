import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { detectDualChannel, findPythonVenv, findCliScript, findAgentLimbScript } from './detector.js'
import { loadConfig } from '../config.js'

const execFileAsync = promisify(execFile)

export interface UsageResult {
  ok: boolean
  geminiPlan?: string
  geminiUsedPct?: number
  geminiResetTime?: string
  geminiWeeklyPct?: number
  flowCredits?: number
  flowResetTime?: string
  raw?: any
  error?: string
}

export async function fetchUsage(): Promise<UsageResult> {
  const cfg = loadConfig()
  const status = await detectDualChannel(cfg.connectionMode, cfg.port)
  const venv = findPythonVenv()

  if (!venv) {
    return {
      ok: false,
      error: '未找到 Python 虛擬環境 (.venv)',
    }
  }

  // 1. 若當前生效通道為 AgentLimb：調用 gemini_agentlimb.py usage --include-flow (100% 零彈窗，且探測完立刻 tab_close)
  if (status.activeChannel === 'agentlimb') {
    const alScript = findAgentLimbScript()
    if (!alScript) {
      return { ok: false, error: '未找到 AgentLimb 腳本' }
    }
    try {
      const { stdout } = await execFileAsync(venv, [alScript, 'usage', '--include-flow'], {
        timeout: 25000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
      const parsed = JSON.parse(stdout.trim())
      return {
        ok: true,
        geminiPlan: parsed.plan || 'FREE',
        geminiUsedPct: parsed.used_pct ?? 0,
        geminiResetTime: parsed.reset_time || '',
        geminiWeeklyPct: parsed.used_pct ?? 0,
        flowCredits: parsed.flow_credits ?? 1050,
        flowResetTime: parsed.flow_reset_time || '',
        raw: parsed,
      }
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || String(err),
      }
    }
  }

  // 2. 若當前為 CDP 模式：調用原作者的 gemini_web.py usage --include-flow
  if (status.activeChannel === 'cdp') {
    const cdpScript = findCliScript()
    if (!cdpScript) {
      return { ok: false, error: '未找到 gemini_web.py 腳本' }
    }
    try {
      const args = [cdpScript, 'usage', '--include-flow']
      if (status.cdp.port) args.push('--port', String(status.cdp.port))

      const { stdout } = await execFileAsync(venv, args, {
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })

      const parsed = JSON.parse(stdout.trim())
      return {
        ok: true,
        geminiPlan: parsed.plan || 'FREE',
        geminiUsedPct: parsed.current_usage?.used_pct ?? 0,
        geminiResetTime: parsed.current_usage?.reset_time || '',
        geminiWeeklyPct: parsed.weekly_usage?.used_pct ?? 0,
        flowCredits: parsed.flow?.credits ?? 1050,
        flowResetTime: parsed.flow?.reset_time || '',
        raw: parsed,
      }
    } catch (err: any) {
      return {
        ok: false,
        error: err.message || String(err),
      }
    }
  }

  return {
    ok: false,
    error: '雙通道皆未連線，無法讀取用量',
  }
}

export interface StreamPromptOptions {
  model: string
  prompt: string
  systemInstruction?: string
  thinkingLevel?: string
  freshChat?: boolean
  signal?: AbortSignal
}

export async function* streamPrompt(options: StreamPromptOptions): AsyncIterable<{ type: 'delta' | 'thought' | 'done'; text: string }> {
  const cfg = loadConfig()
  const browser = detectBrowserCdp(cfg.port, cfg.preferredBrowser)
  if (!browser.connected || !browser.pythonVenv || !browser.cliScript) {
    throw new Error(browser.error || 'Brave/Chrome 瀏覽器未連線，請先確認瀏覽器已開啟遠端偵錯 (127.0.0.1:9222)')
  }

  // 模型名稱對映至 CLI 支援的別名
  let modelArg = 'hydrogen'
  if (options.model.includes('argon')) modelArg = 'argon'
  else if (options.model.includes('flash-lite') || options.model.includes('lite')) modelArg = 'flash-lite'
  else if (options.model.includes('flash')) modelArg = 'flash'
  else if (options.model.includes('decision')) modelArg = 'decision'
  else if (options.model.includes('research')) modelArg = 'research'
  else if (options.model.includes('nano')) modelArg = 'nano2.1'
  else if (options.model.includes('omni')) modelArg = 'omni1.2'
  else modelArg = options.model

  const args = [
    browser.cliScript,
    'playground',
    '--model', modelArg,
    '--prompt', options.prompt,
    '--raw',
  ]

  if (options.freshChat) {
    args.push('--new-chat')
  }
  if (options.thinkingLevel) {
    args.push('--thinking-level', options.thinkingLevel)
  }
  if (options.systemInstruction) {
    args.push('--system', options.systemInstruction)
  }
  if (browser.port) {
    args.push('--port', String(browser.port))
  }

  const child = spawn(browser.pythonVenv, args, {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      try {
        child.kill('SIGTERM')
      } catch {}
    }, { once: true })
  }

  let fullOutput = ''
  let errorOutput = ''

  child.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString('utf-8')
  })

  // 串流讀取 stdout
  for await (const chunk of child.stdout) {
    const text = chunk.toString('utf-8')
    fullOutput += text
    yield { type: 'delta', text }
  }

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', resolve)
  })

  if (exitCode !== 0) {
    throw new Error(`Gemini 網頁端執行失敗 (code ${exitCode}): ${errorOutput || fullOutput || '未知錯誤'}`)
  }

  yield { type: 'done', text: fullOutput }
}
