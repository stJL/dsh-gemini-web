import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { detectDualChannel, findAgentLimbScript, findCliScript, findPythonVenv, getPluginDir } from './detector.js'
import { PluginConfig, loadConfig } from '../config.js'
import { parseTaskToProposal, WaveTaskInput } from '../proposal.js'

const execFileAsync = promisify(execFile)

export interface AgentTaskOptions {
  task: string
  model?: string
  site?: 'aistudio' | 'flow' | 'gemini' | 'wave' | 'lyria'
  entry?: 'chat' | 'task' | 'wave' | 'canvas' | 'music'
  thinkingLevel?: string
  thinkingPolicy?: 'adaptive' | 'custom' | 'strict'
  thinkingTimeout?: number
  fallbackLadder?: string[]
  noFallback?: boolean
  timeoutSec?: number
  sessionId?: string
  newChat?: boolean
  downloadDir?: string
  files?: string[]
  resume?: boolean
  waveTasks?: WaveTaskInput[]
  waveProject?: string
}

export interface AgentTaskResult {
  ok: boolean
  channel: 'agentlimb' | 'cdp' | 'none'
  site?: string
  model?: string
  initialModel?: string
  output?: string
  files?: string[]
  fellBack?: boolean
  fallbackChain?: string[]
  fallbackHistory?: string
  error?: string
  elapsedSec?: number
  waveDir?: string
  rosterFile?: string
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

export function getWorkspaceRoot(): string {
  return path.dirname(getWorkspaceDownloadDir())
}

export function sanitizeSessionId(sessionId?: string): string {
  const cleaned = (sessionId || 'default').trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)
  return cleaned || 'default'
}

export function getSessionTeamDir(sessionId?: string): string {
  return path.join(getWorkspaceRoot(), '.gemini-teams', sanitizeSessionId(sessionId))
}

export function getSessionRosterFile(sessionId?: string): string {
  return path.join(getSessionTeamDir(sessionId), 'roster.json')
}

export function getOrCreateSessionWaveDir(sessionId?: string, resume = false): string {
  const teamDir = getSessionTeamDir(sessionId)
  fs.mkdirSync(teamDir, { recursive: true })
  if (resume) {
    try {
      const existing = fs.readdirSync(teamDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('wave_'))
        .map((d) => d.name)
        .sort()
        .reverse()
      if (existing.length > 0) {
        return path.join(teamDir, existing[0])
      }
    } catch {}
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const waveDir = path.join(teamDir, `wave_${stamp}`)
  fs.mkdirSync(waveDir, { recursive: true })
  return waveDir
}

export function isSensitiveSecretFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase()
  if (base === '.env' || base.startsWith('.env.')) return true
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) return true
  if (/^(id_rsa|id_ed25519|id_ecdsa|\.netrc|\.npmrc|\.pypirc)/.test(base)) return true
  if (/(credential|secret|private[_-]?key|service[_-]?account).*\.json$/i.test(base)) return true
  return false
}

export function openLocalDirectory(dirPath: string): { ok: boolean; path: string; error?: string } {
  const resolved = path.resolve(dirPath)
  try {
    fs.mkdirSync(resolved, { recursive: true })
    const cleanEnv: NodeJS.ProcessEnv = { ...process.env }
    delete cleanEnv.ELECTRON_RUN_AS_NODE
    if (process.platform === 'linux') {
      // Strip Electron/AppImage library overrides so xdg-open / dolphin / nautilus launch cleanly
      delete cleanEnv.LD_LIBRARY_PATH
      delete cleanEnv.LD_PRELOAD
      delete cleanEnv.QT_PLUGIN_PATH
      delete cleanEnv.QML2_IMPORT_PATH
      delete cleanEnv.GIO_LAUNCHED_DESKTOP_FILE
      const child = spawn('xdg-open', [resolved], { detached: true, stdio: 'ignore', env: cleanEnv })
      child.on('error', () => {})
      child.unref()
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [resolved], { detached: true, stdio: 'ignore', env: cleanEnv })
      child.on('error', () => {})
      child.unref()
    } else {
      const child = spawn('explorer.exe', [resolved], { detached: true, stdio: 'ignore', env: cleanEnv })
      child.on('error', () => {})
      child.unref()
    }
    return { ok: true, path: resolved }
  } catch (err: any) {
    return { ok: false, path: resolved, error: err?.message || String(err) }
  }
}

export function listSessionDeliveries(sessionId?: string): {
  ok: boolean
  sessionId: string
  teamDir: string
  rosterFile: string
  waves: Array<{ name: string; path: string; files: Array<{ relPath: string; absPath: string; size: number }> }>
} {
  const sid = sanitizeSessionId(sessionId)
  const teamDir = getSessionTeamDir(sid)
  const rosterFile = getSessionRosterFile(sid)
  const waves: Array<{ name: string; path: string; files: Array<{ relPath: string; absPath: string; size: number }> }> = []

  if (!fs.existsSync(teamDir)) {
    return { ok: true, sessionId: sid, teamDir, rosterFile, waves }
  }

  const walkFiles = (root: string, dir: string, acc: Array<{ relPath: string; absPath: string; size: number }>) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walkFiles(root, full, acc)
      } else if (ent.isFile() && ent.name !== 'roster.json' && ent.name !== '.web-team.json') {
        try {
          const st = fs.statSync(full)
          acc.push({ relPath: path.relative(root, full), absPath: full, size: st.size })
        } catch {}
      }
    }
  }

  try {
    const waveDirs = fs.readdirSync(teamDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('wave_'))
      .map((d) => d.name)
      .sort()
      .reverse()
    for (const w of waveDirs) {
      const wPath = path.join(teamDir, w)
      const files: Array<{ relPath: string; absPath: string; size: number }> = []
      walkFiles(wPath, wPath, files)
      waves.push({ name: w, path: wPath, files })
    }
  } catch {}

  return { ok: true, sessionId: sid, teamDir, rosterFile, waves }
}

export function mergeSessionDeliveries(sessionId?: string, waveName?: string): {
  ok: boolean
  mergedFiles: string[]
  targetRoot: string
  sourceDir?: string
  error?: string
} {
  const list = listSessionDeliveries(sessionId)
  const targetRoot = getWorkspaceRoot()
  const wave = waveName
    ? list.waves.find((w) => w.name === waveName && !waveName.includes('..') && !waveName.includes('/') && !waveName.includes('\\'))
    : list.waves[0]

  if (!wave) {
    return { ok: false, mergedFiles: [], targetRoot, error: '未找到可合并的 Wave 交付目录' }
  }

  const mergedFiles: string[] = []
  for (const f of wave.files) {
    const dest = path.resolve(targetRoot, f.relPath)
    if (!dest.startsWith(path.resolve(targetRoot) + path.sep)) {
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(f.absPath, dest)
    mergedFiles.push(dest)
  }

  return { ok: true, mergedFiles, targetRoot, sourceDir: wave.path }
}

export function sanitizeWaveSpec(waveSpec: any, cfg: PluginConfig): any {
  const defaultThinking = cfg.thinkingLevel || 'high'
  const tasks = Array.isArray(waveSpec?.tasks) ? waveSpec.tasks : (Array.isArray(waveSpec) ? waveSpec : [])
  const sanitizedTasks = tasks.map((t: any) => {
    const taskCopy = { ...t }
    const siteLower = String(taskCopy.site || 'aistudio').toLowerCase()
    const isRemoteShared = siteLower.includes('gemini') || siteLower === 'task'
    if (Array.isArray(taskCopy.files) && isRemoteShared) {
      taskCopy.files = taskCopy.files.filter((f: string) => !isSensitiveSecretFile(String(f)))
    }
    if (!taskCopy.thinking_level && (siteLower === 'aistudio' || !taskCopy.site)) {
      taskCopy.thinking_level = defaultThinking
    }
    return taskCopy
  })
  return Array.isArray(waveSpec)
    ? { project: 'dsh-wave', tasks: sanitizedTasks }
    : { ...waveSpec, tasks: sanitizedTasks }
}

let lastSessionId: string | null = null

export async function executeAgentTask(options: AgentTaskOptions): Promise<AgentTaskResult> {
  const cfg = loadConfig()
  const status = await detectDualChannel(cfg.connectionMode, cfg.port)
  const canAutoStartB = Boolean(status.aiChromeConfigured && cfg.connectionMode !== 'agentlimb')

  if (status.activeChannel === 'none' && !canAutoStartB) {
    return {
      ok: false,
      channel: 'none',
      error: '雙通道皆未连接：请确认浏览器已打開並啟用 AgentLimb 扩展功能，或已開啟 CDP 偵錯模式。',
    }
  }

  const venv = status.pythonVenv
  if (!venv || !fs.existsSync(venv)) {
    return {
      ok: false,
      channel: status.activeChannel,
      error: '未找到 Python 虛擬環境 (.venv)，請先执行一鍵初始化',
    }
  }

  const agentlimbScript = findAgentLimbScript()
  const cdpScript = findCliScript()

  const thinkingPolicy = options.thinkingPolicy || cfg.thinkingPolicy || (cfg.fallbackMode === 'strict' ? 'strict' : 'adaptive')
  const isStrict = thinkingPolicy === 'strict' || cfg.fallbackMode === 'strict' || cfg.autoFallback === false || options.noFallback

  const targetModel = options.model || cfg.defaultModel || 'gemini-4-hydrogen'
  let targetSite = options.site || 'aistudio'
  if (targetModel === 'gemini.google.com' || targetModel === 'gemini') {
    targetSite = 'gemini'
  }

  // Wave 虚拟工作室直通分支（强制会话级隔离：.gemini-teams/[sessionId]/）
  if (targetSite === 'wave' || options.entry === 'wave' || (Array.isArray(options.waveTasks) && options.waveTasks.length > 0)) {
    let waveSpec: any = null
    if (Array.isArray(options.waveTasks) && options.waveTasks.length > 0) {
      waveSpec = {
        project: options.waveProject || 'dsh-wave',
        tasks: options.waveTasks,
      }
    } else {
      try {
        const trimmed = options.task.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          waveSpec = JSON.parse(trimmed)
        }
      } catch {}
    }

    if (!waveSpec) {
      const proposal = parseTaskToProposal(options.task, cfg)
      const pbSlug = proposal.playbook?.slug || 'web_fullstack_app'
      const roles = proposal.playbook?.roles || ['director', 'coder']
      const leadRole = roles[0] || 'director'
      const workerRole = roles[1] || 'coder'
      const isMedia = pbSlug === 'content_video_media'
      const tasks: any[] = [
        {
          role: leadRole,
          site: 'aistudio',
          model: 'gemini-4-hydrogen',
          thinking_level: cfg.thinkingLevel || 'high',
          out_file: 'plan.md',
          prompt: `你是「${proposal.playbook?.title || pbSlug}」的架构总监 (${leadRole})。请针对以下需求输出简洁明确的模块设计与文件清单（Markdown）：\n\n${options.task}`,
        },
        {
          role: workerRole,
          site: isMedia ? 'flow' : 'aistudio',
          model: isMedia ? 'Nano Banana 2.1' : 'gemini-3.8-flash',
          ...(isMedia
            ? { prompt: options.task }
            : {
                unpack_json_dir: '.',
                out_file: 'deliverable_raw.txt',
                prompt: `你是「${proposal.playbook?.title || pbSlug}」的核心执行员 (${workerRole})。请直接针对以下需求产出可运行的交付物，并严格只输出一个 JSON 对象，键为相对文件名（如 "README.md", "app.py" 或 "index.html"），值为完整文件内容字符串：\n\n${options.task}`,
              }),
        },
      ]
      waveSpec = { project: pbSlug, tasks }
    }

    if (waveSpec) {
      waveSpec = sanitizeWaveSpec(waveSpec, cfg)
      const waveDir = getOrCreateSessionWaveDir(options.sessionId, Boolean(options.resume))
      const rosterFile = getSessionRosterFile(options.sessionId)
      const res = await executeWave(waveSpec, {
        projectDir: waveDir,
        rosterFile,
        timeoutSec: options.timeoutSec || 360,
        port: status.cdp.connected ? (status.cdp.port || undefined) : undefined,
        resume: Boolean(options.resume),
      })
      if (!res.ok) {
        return { ok: false, channel: res.channel || 'none', site: 'wave', error: res.error, waveDir, rosterFile }
      }
      const deliveredFiles: string[] = []
      const resultsArr = Array.isArray(res.data?.results) ? res.data.results : []
      for (const r of resultsArr) {
        if (r?.saved_text_file && fs.existsSync(r.saved_text_file)) deliveredFiles.push(r.saved_text_file)
        if (Array.isArray(r?.unpacked_files)) {
          for (const uf of r.unpacked_files) {
            if (typeof uf === 'string' && fs.existsSync(uf)) deliveredFiles.push(uf)
          }
        }
        if (Array.isArray(r?.saved_files)) {
          for (const sf of r.saved_files) {
            if (typeof sf === 'string' && fs.existsSync(sf)) deliveredFiles.push(sf)
          }
        }
        if (Array.isArray(r?.downloaded_files)) {
          for (const df of r.downloaded_files) {
            if (typeof df === 'string' && fs.existsSync(df)) deliveredFiles.push(df)
          }
        }
      }
      return {
        ok: true,
        channel: res.channel || (res.data?.channel === 'agentlimb' ? 'agentlimb' : 'cdp'),
        site: 'wave',
        model: 'wave-engine',
        files: Array.from(new Set(deliveredFiles)),
        waveDir,
        rosterFile,
        output: typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2),
      }
    }
  }

  // 任務量級與超时研判 (自适应模式下複雜任務自動放寬至至少 300 秒)
  let baseTimeout = options.timeoutSec || cfg.timeoutSec || 180
  const isHeavyTask = options.task.length > 150 || /(?:c\+\+|cpp|rust|紅黑樹|red-black|算法|演算法|架構|從零|完整實作|生產級|完整代碼|重構)/i.test(options.task)
  if (thinkingPolicy === 'adaptive' && isHeavyTask) {
    baseTimeout = Math.max(baseTimeout, 300)
  }
  const timeoutSec = baseTimeout

  // 1. 判斷会话生命週期（同一 DSH 对话無感延續，全新话题开启新聊天室）
  let isNewChat = false
  if (options.newChat !== undefined) {
    isNewChat = options.newChat
  } else if (options.sessionId && lastSessionId && options.sessionId !== lastSessionId) {
    isNewChat = true
  }
  if (options.sessionId) {
    lastSessionId = options.sessionId
  }

  // 2. 確保工作區 downloads 目录存在
  const downloadDir = options.downloadDir || getWorkspaceDownloadDir()
  try {
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }
  } catch {}

  // 解析并验证待上传的本地文件路径（支持 file://、~、相对路径、@ 语法，及提示词拖拽文件自动萃取）
  const cleanAndResolvePath = (raw: string): string | null => {
    if (!raw || typeof raw !== 'string') return null
    let f = raw.trim().replace(/^['"‘“@]|['"’”]$/g, '').trim()
    if (f.startsWith('file://')) {
      try {
        f = fileURLToPath(f)
      } catch {
        f = f.replace(/^file:\/\//, '')
      }
    }
    if (f.startsWith('~')) {
      f = path.join(os.homedir(), f.slice(1))
    }

    // 候选路径尝试清单：绝对路径、当前 CWD、工作区根目录
    const candidates = [
      path.isAbsolute(f) ? f : null,
      path.resolve(process.cwd(), f),
      path.resolve(path.dirname(downloadDir), f),
    ].filter(Boolean) as string[]

    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          return c
        }
      } catch {}
    }
    return null
  }

  const resolvedFiles: string[] = []
  if (options.files && Array.isArray(options.files)) {
    for (const f of options.files) {
      const resolved = cleanAndResolvePath(f)
      if (resolved && !resolvedFiles.includes(resolved)) {
        resolvedFiles.push(resolved)
      } else {
        console.warn(`[dsh-gemini-web] Upload file does not exist, skipped: ${f}`)
      }
    }
  }

  // 拖拽智能容错兜底：若 options.files 未传，自动从提示词 task 中提取已存在的本地文件路径（含 @文件名 语法）
  if (resolvedFiles.length === 0 && options.task) {
    const fileMatches = options.task.match(/(?:file:\/\/[^\s"'`\(\)\[\]]+|@?[\w\-./\\]+\.[a-zA-Z0-9]{1,8})/g)
    if (fileMatches) {
      for (const m of fileMatches) {
        const resolved = cleanAndResolvePath(m)
        if (resolved && !resolvedFiles.includes(resolved)) {
          resolvedFiles.push(resolved)
          console.log(`[dsh-gemini-web] Auto-detected local file from prompt: ${resolved}`)
        }
      }
    }
  }

  // 安全护栏：发往 Gemini Task 或 Wave 远端主机时自动过滤疑似密钥/凭证文件，严防共用主机泄露
  const skippedSecrets: string[] = []
  const isRemoteSharedHost = (targetSite === 'gemini' && options.entry === 'task') || targetSite === 'wave'
  const safeFiles = isRemoteSharedHost
    ? resolvedFiles.filter((f) => {
        if (isSensitiveSecretFile(f)) {
          skippedSecrets.push(path.basename(f))
          return false
        }
        return true
      })
    : resolvedFiles

  if (skippedSecrets.length > 0) {
    console.warn(`[dsh-gemini-web] Security guardrail skipped sensitive file(s) for remote Task: ${skippedSecrets.join(', ')}`)
  }

  // 3. 通道 A: AgentLimb (零弹窗 / 免 Allow)
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
      // 保留顯式 Extra High（由底層依帳號是否解鎖動態決定：PRO 可用，免費池自動安全退回 High）
      let safeThinking = options.thinkingLevel || cfg.thinkingLevel || 'high'
      if (safeThinking === 'xhigh' || safeThinking === 'max') {
        safeThinking = 'extra_high'
      }
      args.push('--thinking-level', safeThinking)

      if (isNewChat) args.push('--new-chat')
      if (options.entry) args.push('--entry', options.entry)
      if (safeFiles.length > 0) {
        for (const f of safeFiles) {
          args.push('--file', f)
        }
      }
      if (isStrict) {
        args.push('--no-fallback')
      } else {
        const isMediaModel = /(?:image|nano|tts|lyria|omni|veo)/i.test(targetModel)
        const ladder = options.fallbackLadder || (isMediaModel ? undefined : cfg.fallbackLadder)
        if (Array.isArray(ladder) && ladder.length > 0) {
          args.push('--fallback-ladder', ladder.join(','))
        }
      }

      // 保障 Node.js 执行超时寬限（多給 30 秒，防止提早中斷 Python 自适应思考進程）
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
          site: parsed.site || targetSite,
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
      // 仅在 CDP 已就绪或已配置独立 AI Chrome 时才降级到通道 B，避免用无 CDP 错误掩盖真实通道 A 超时/错误
      const canUseCdp = Boolean(status.cdp.connected || status.aiChromeConfigured)
      if (cfg.connectionMode !== 'auto' || !canUseCdp) {
        const detail = err?.stderr ? String(err.stderr).trim().split('\n').slice(-3).join(' | ') : ''
        return {
          ok: false,
          channel: 'agentlimb',
          error: detail ? `${err.message || String(err)} (${detail})` : (err.message || String(err)),
        }
      }
    }
  }

  // 4. 通道 B: Playwright CDP 備用（含 B_autostart；顯式 --fallback-model none 防止越權切去 4 Neon）
  if (cdpScript && fs.existsSync(cdpScript)) {
    try {
      let args: string[] = []
      if (targetSite === 'gemini') {
        args = [
          cdpScript,
          'ask',
          '--entry', options.entry === 'task' ? 'task' : 'chat',
          '--prompt', options.task,
          '--raw',
        ]
        if (isNewChat) args.push('--new-tab')
      } else if (targetSite === 'flow') {
        const flowMedia = targetModel.includes('omni') || targetModel.includes('veo') ? 'video' : 'image'
        args = [
          cdpScript,
          'flow',
          '--media', flowMedia,
          '--prompt', options.task,
          '--download-dir', downloadDir,
        ]
      } else {
        let modelArg = 'flash-lite'
        if (targetModel.includes('hydrogen')) modelArg = 'hydrogen'
        else if (targetModel.includes('argon')) modelArg = 'argon'
        else if (targetModel.includes('neon')) modelArg = 'neon'
        else if (targetModel.includes('3.8') || targetModel.includes('flash')) modelArg = 'flash'
        else if (targetModel.includes('lite')) modelArg = 'flash-lite'
        else if (targetModel.includes('nano')) modelArg = 'nano2.1'
        else if (targetModel.includes('omni')) modelArg = 'omni1.2'

        args = [
          cdpScript,
          'playground',
          '--model', modelArg,
          '--fallback-model', 'none',
          '--prompt', options.task,
          '--raw',
          '--download-dir', downloadDir,
        ]
        if (isNewChat) args.push('--new-chat')
      }

      if (status.cdp.connected && status.cdp.port) {
        args.push('--port', String(status.cdp.port))
      }
      if (safeFiles.length > 0 && targetSite !== 'flow') {
        for (const f of safeFiles) {
          args.push('--file', f)
        }
      }

      const { stdout } = await execFileAsync(venv, args, {
        timeout: (timeoutSec + 30) * 1000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
      return {
        ok: true,
        channel: 'cdp',
        site: targetSite,
        model: targetModel,
        output: stdout.trim(),
      }
    } catch (err: any) {
      return { ok: false, channel: 'cdp', error: err.message || String(err) }
    }
  }

  return { ok: false, channel: status.activeChannel, error: '未找到执行脚本' }
}

export interface RosterResult {
  ok: boolean
  file?: string
  project?: string
  count?: number
  roster?: Record<string, any>
  error?: string
}

export async function getRoster(rosterFile?: string, sessionId?: string): Promise<RosterResult> {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile('default'))
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript || !fs.existsSync(venv) || !fs.existsSync(cdpScript)) {
    try {
      const p = path.resolve(targetRoster)
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
        return { ok: true, file: p, project: data.project || '', count: Object.keys(data.roster || {}).length, roster: data.roster || {} }
      }
      return { ok: true, file: p, project: '', count: 0, roster: {} }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  try {
    const { stdout } = await execFileAsync(venv, [cdpScript, 'roster', 'list', '--file', targetRoster, '--json'], {
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const parsed = JSON.parse(stdout.trim())
    return {
      ok: true,
      file: parsed.file,
      project: parsed.project,
      count: parsed.count,
      roster: parsed.roster,
    }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export async function clearRoster(rosterFile?: string, sessionId?: string): Promise<{ ok: boolean; error?: string }> {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile('default'))
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript || !fs.existsSync(venv) || !fs.existsSync(cdpScript)) {
    try {
      const p = path.resolve(targetRoster)
      if (fs.existsSync(p)) {
        fs.writeFileSync(p, JSON.stringify({ project: '', updated_at: new Date().toISOString(), roster: {} }, null, 2), 'utf-8')
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  try {
    await execFileAsync(venv, [cdpScript, 'roster', 'clear', '--file', targetRoster, '--json'], {
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export async function auditRoster(projectDir?: string, rosterFile?: string, sessionId?: string): Promise<any> {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile('default'))
  const deliveries = listSessionDeliveries(sessionId)
  const targetProjectDir = projectDir || deliveries.waves[0]?.path || getWorkspaceRoot()
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript) {
    return { ok: false, error: '未找到 Python 执行环境' }
  }
  try {
    const { stdout } = await execFileAsync(venv, [cdpScript, 'roster', 'audit', '--project-dir', targetProjectDir, '--file', targetRoster, '--json'], {
      timeout: 20000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    try {
      return { ok: true, data: JSON.parse(stdout.trim()) }
    } catch {
      return { ok: true, data: stdout.trim() }
    }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export async function getPlaybooks(): Promise<any> {
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript) {
    return { ok: false, error: '未找到 Python 执行环境' }
  }
  try {
    const { stdout } = await execFileAsync(venv, [cdpScript, 'playbook', 'list', '--json'], {
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return { ok: true, data: JSON.parse(stdout.trim()) }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export async function getPlaybookDetail(name: string): Promise<any> {
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript) {
    return { ok: false, error: '未找到 Python 执行环境' }
  }
  try {
    const { stdout } = await execFileAsync(venv, [cdpScript, 'playbook', 'show', '--name', name, '--json'], {
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return { ok: true, data: JSON.parse(stdout.trim()) }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export async function runDoctor(): Promise<any> {
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript) {
    return { ok: false, error: '未找到 Python 执行环境' }
  }
  try {
    const { stdout } = await execFileAsync(venv, [cdpScript, 'doctor', '--skip-flow', '--json'], {
      timeout: 25000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return { ok: true, data: JSON.parse(stdout.trim()) }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function getPlaybooksDirectory(): string {
  return path.join(getPluginDir(), 'references', 'playbooks')
}

export interface CustomPlaybookRoleInput {
  role: string
  label: string
  siteModel: string
  duty: string
}

export function sanitizePlaybookSlug(rawName?: string): string {
  const cleaned = (rawName || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  if (cleaned && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return cleaned.slice(0, 48)
  }
  return `custom_squad_${Date.now().toString(36)}`
}

export function buildPlaybookMarkdown(input: {
  slug: string
  title: string
  scenarios: string
  roles: CustomPlaybookRoleInput[]
}): string {
  const modelDisplayMap: Record<string, { site: string; model: string; thinking: string }> = {
    'aistudio:gemini-4-hydrogen': { site: '`aistudio` (Playground)', model: '`gemini-4-hydrogen`', thinking: '`high`' },
    'aistudio:gemini-3.8-flash': { site: '`aistudio` (Playground)', model: '`gemini-3.8-flash`', thinking: '`high`' },
    'aistudio:gemini-4-neon': { site: '`aistudio` (Playground)', model: '`gemini-4-neon`', thinking: '`high`' },
    'gemini_task:gemini-4-hydrogen': { site: '`gemini_task`', model: '`gemini-4-hydrogen`', thinking: '—' },
    'gemini_task:gemini-4-neon': { site: '`gemini_task`', model: '`gemini-4-neon`', thinking: '—' },
    'flow:nano2.1': { site: '`flow`', model: '`Nano Banana 2.1`', thinking: '—' },
    'flow:omni1.2': { site: '`flow`', model: '`Omni 1.2 Flash`', thinking: '—' },
  }

  const rows = input.roles.map((r) => {
    const spec = modelDisplayMap[r.siteModel] || modelDisplayMap['aistudio:gemini-4-hydrogen']
    return `| \`${r.role}\` | ${r.label} | ${spec.site} | ${spec.model} | ${spec.thinking} | ${r.duty} |`
  })

  return [
    `# ${input.title} (\`${input.slug}\`)`,
    '',
    `> **适用场景**：${input.scenarios || '自定义多角色协同工作流'}`,
    '',
    '## 团队花名册（1 Tab = 1 员工）',
    '',
    '| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...rows,
    '',
    '## 标准并行波次（Wave Execution）',
    '',
    '- **Wave 0（架构定界）**：梳理目标边界、输出文件清单与接口契约。',
    '- **Wave 1（多 Tab 并行生产）**：各选定角色在独立标签页同步执行并解包至会话隔离区。',
    '- **Wave 2（本地审查合并）**：确认产物完整性后一键合并至当前工程目录。',
    '',
  ].join('\n')
}

export async function addPlaybook(input: {
  name?: string
  title: string
  scenarios?: string
  roles: CustomPlaybookRoleInput[]
}): Promise<any> {
  const title = (input.title || '').trim()
  if (!title) {
    return { ok: false, error: '请填写编队名称' }
  }
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    return { ok: false, error: '请至少勾选 1 名协同员工角色' }
  }
  const slug = sanitizePlaybookSlug(input.name || title)
  const scenarios = (input.scenarios || '自定义多角色协同编队').trim()
  const md = buildPlaybookMarkdown({ slug, title, scenarios, roles: input.roles })

  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  if (!venv || !cdpScript) {
    const pbDir = getPlaybooksDirectory()
    fs.mkdirSync(pbDir, { recursive: true })
    const dest = path.join(pbDir, `${slug}.md`)
    fs.writeFileSync(dest, md, 'utf-8')
    return { ok: true, data: { name: slug, title, scenarios, path: dest } }
  }

  const tmpFile = path.join(os.tmpdir(), `dsh_pb_${slug}_${Date.now()}.md`)
  fs.writeFileSync(tmpFile, md, 'utf-8')
  try {
    const { stdout } = await execFileAsync(
      venv,
      [cdpScript, 'playbook', 'add', '--name', slug, '--title', title, '--scenarios', scenarios, '--from-file', tmpFile, '--json'],
      {
        timeout: 15000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      }
    )
    return { ok: true, data: JSON.parse(stdout.trim()) }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  } finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
  }
}

export async function executeWave(
  specPathOrObj: string | any,
  options: { projectDir?: string; rosterFile?: string; timeoutSec?: number; port?: number; resume?: boolean } = {}
): Promise<any> {
  const venv = findPythonVenv()
  const cdpScript = findCliScript()
  const alScript = findAgentLimbScript()
  if (!venv || (!cdpScript && !alScript)) {
    return { ok: false, error: '未找到 Python 执行环境' }
  }
  const cfg = loadConfig()
  const status = await detectDualChannel(cfg.connectionMode, cfg.port)
  let specPath = ''
  let tmpSpec = false
  if (typeof specPathOrObj === 'string' && specPathOrObj.endsWith('.json')) {
    specPath = path.resolve(specPathOrObj)
  } else {
    tmpSpec = true
    const tmpFile = path.join(os.tmpdir(), `dsh_wave_${Date.now()}.json`)
    fs.writeFileSync(tmpFile, JSON.stringify(specPathOrObj, null, 2), 'utf-8')
    specPath = tmpFile
  }

  const runWaveScript = async (scriptPath: string, withPort: boolean) => {
    const args = [scriptPath, 'wave', '--spec', specPath, '--json']
    if (options.projectDir) args.push('--project-dir', options.projectDir)
    if (options.rosterFile) args.push('--roster-file', options.rosterFile)
    if (options.timeoutSec) args.push('--timeout', String(options.timeoutSec))
    if (withPort && options.port) args.push('--port', String(options.port))
    if (options.resume) args.push('--resume')

    const { stdout } = await execFileAsync(venv, args, {
      timeout: ((options.timeoutSec || 360) + 30) * 1000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const lines = stdout.trim().split('\n')
    const jsonStart = lines.findIndex((l) => l.trim().startsWith('{'))
    const jsonText = jsonStart >= 0 ? lines.slice(jsonStart).join('\n') : stdout.trim()
    try {
      return JSON.parse(jsonText)
    } catch {
      return stdout.trim()
    }
  }

  try {
    const preferAgentLimb =
      Boolean(alScript && fs.existsSync(alScript) && status.agentlimb.ready) &&
      (cfg.connectionMode === 'agentlimb' || (!status.cdp.connected && !status.aiChromeConfigured))

    if (preferAgentLimb && alScript) {
      const data = await runWaveScript(alScript, false)
      return { ok: true, channel: 'agentlimb', data }
    }

      const canUseCdp = Boolean(status.cdp.connected || status.aiChromeConfigured)
      if (cdpScript && fs.existsSync(cdpScript) && (cfg.connectionMode === 'cdp' || canUseCdp)) {
        try {
          const data = await runWaveScript(cdpScript, true)
          return { ok: true, channel: 'cdp', data }
        } catch (cdpErr: any) {
          if (cfg.connectionMode === 'auto' && alScript && fs.existsSync(alScript) && status.agentlimb.ready) {
            const data = await runWaveScript(alScript, false)
            return { ok: true, channel: 'agentlimb', data }
          }
          throw cdpErr
        }
      }

    if (alScript && fs.existsSync(alScript)) {
      const data = await runWaveScript(alScript, false)
      return { ok: true, channel: 'agentlimb', data }
    }

    return { ok: false, error: '未找到 Wave 执行脚本' }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  } finally {
    if (tmpSpec && fs.existsSync(specPath)) {
      try { fs.unlinkSync(specPath) } catch {}
    }
  }
}
