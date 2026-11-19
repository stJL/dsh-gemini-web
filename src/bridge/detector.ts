import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export interface BrowserInstance {
  name: string
  port: number
  wsUrl: string
  activePortFile: string
}

export interface BrowserStatus {
  connected: boolean
  browserType: string
  port: number | null
  wsUrl: string | null
  activePortFile: string | null
  pythonVenv: string | null
  cliScript: string | null
  multipleInstances?: boolean
  instances?: BrowserInstance[]
  error?: string
}

export function getEffectiveHome(): string {
  try {
    const userInfo = os.userInfo?.()
    if (userInfo?.homedir && fs.existsSync(userInfo.homedir)) {
      return userInfo.homedir
    }
  } catch {}
  const rawHome = os.homedir()
  if (rawHome.includes('.dsh/agy-accounts') || rawHome.includes('.dsh/profiles')) {
    const match = rawHome.match(/^(\/home\/[^/]+)/)
    if (match && fs.existsSync(match[1])) {
      return match[1]
    }
  }
  return rawHome
}

export function getPluginDir(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url)
    let dir = path.dirname(currentFile)
    for (let i = 0; i < 4; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir
      }
      dir = path.dirname(dir)
    }
  } catch {}
  return path.resolve(process.cwd())
}

export function findPythonVenv(): string | null {
  const pluginDir = getPluginDir()
  const home = getEffectiveHome()
  const isWin = process.platform === 'win32'
  const binName = isWin ? 'Scripts/python.exe' : 'bin/python'
  const venvPaths = [
    path.join(pluginDir, '.venv', binName),
    path.join(home, '.dsh', 'gemini-web-agent', '.venv', binName),
    path.join(home, '.dsh', 'skills', 'gemini-web-agent', '.venv', binName),
    path.join(home, '.gemini', 'config', 'skills', 'gemini-web-agent', '.venv', binName),
  ]
  for (const p of venvPaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

export function findCliScript(): string | null {
  const pluginDir = getPluginDir()
  const home = getEffectiveHome()
  const scriptPaths = [
    path.join(pluginDir, 'scripts', 'gemini_web.py'),
    path.join(home, '.dsh', 'gemini-web-agent', 'scripts', 'gemini_web.py'),
    path.join(home, '.dsh', 'skills', 'gemini-web-agent', 'scripts', 'gemini_web.py'),
    path.join(home, '.gemini', 'config', 'skills', 'gemini-web-agent', 'scripts', 'gemini_web.py'),
  ]
  for (const p of scriptPaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

export function findAgentLimbScript(): string | null {
  const pluginDir = getPluginDir()
  const home = getEffectiveHome()
  const scriptPaths = [
    path.join(pluginDir, 'scripts', 'gemini_agentlimb.py'),
    path.join(home, '.dsh', 'gemini-web-agent', 'scripts', 'gemini_agentlimb.py'),
    path.join(home, '.dsh', 'skills', 'gemini-web-agent', 'scripts', 'gemini_agentlimb.py'),
    path.join(home, '.gemini', 'config', 'skills', 'gemini-web-agent', 'scripts', 'gemini_agentlimb.py'),
  ]
  for (const p of scriptPaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * 全域掃描本機所有 Chromium 家族瀏覽器的 DevToolsActivePort。
 * 自動過濾 IDE 內建進程 (如 Antigravity / Cursor / Code / DeepSeek / Electron)。
 */
export function scanChromiumCdpInstances(): BrowserInstance[] {
  const home = getEffectiveHome()
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')

  const candidates: { name: string; file: string }[] = []
  const ignorePatterns = [/antigravity/i, /cursor/i, /code/i, /deepseek/i, /electron/i, /dsh/i]

  const isBrowserPath = (filePath: string) => {
    return !ignorePatterns.some((pattern) => pattern.test(filePath))
  }

  const prettyName = (dirPath: string) => {
    const norm = dirPath.replace(/\\/g, '/')
    if (/brave/i.test(norm)) return 'Brave Browser'
    if (/google[/-]chrome|chrome/i.test(norm)) return 'Google Chrome'
    if (/edge/i.test(norm)) return 'Microsoft Edge'
    if (/vivaldi/i.test(norm)) return 'Vivaldi'
    if (/opera/i.test(norm)) return 'Opera'
    if (/chromium/i.test(norm)) return 'Chromium'
    if (/360/i.test(norm)) return '360 Browser'
    if (/qq/i.test(norm)) return 'QQ Browser'
    const parts = dirPath.split(path.sep).filter(Boolean)
    return parts[parts.length - 1] || 'Chromium Browser'
  }

  if (isWin) {
    try {
      if (fs.existsSync(localAppData)) {
        const topDirs = fs.readdirSync(localAppData, { withFileTypes: true })
        for (const dirent of topDirs) {
          if (dirent.isDirectory()) {
            const p1 = path.join(localAppData, dirent.name, 'User Data', 'DevToolsActivePort')
            if (fs.existsSync(p1) && isBrowserPath(p1)) {
              candidates.push({ name: prettyName(dirent.name), file: p1 })
            }
            // 某些瀏覽器路徑有二級目錄 (如 BraveSoftware\Brave-Browser)
            try {
              const subDir = path.join(localAppData, dirent.name)
              for (const sub of fs.readdirSync(subDir, { withFileTypes: true })) {
                if (sub.isDirectory()) {
                  const p2 = path.join(subDir, sub.name, 'User Data', 'DevToolsActivePort')
                  if (fs.existsSync(p2) && isBrowserPath(p2)) {
                    candidates.push({ name: prettyName(path.join(dirent.name, sub.name)), file: p2 })
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  } else if (isMac) {
    const appSupport = path.join(home, 'Library', 'Application Support')
    try {
      if (fs.existsSync(appSupport)) {
        for (const dirent of fs.readdirSync(appSupport, { withFileTypes: true })) {
          if (dirent.isDirectory()) {
            const dirPath = path.join(appSupport, dirent.name)
            for (const sub of [
              path.join(dirPath, 'DevToolsActivePort'),
              path.join(dirPath, 'User Data', 'DevToolsActivePort')
            ]) {
              if (fs.existsSync(sub) && isBrowserPath(sub)) {
                candidates.push({ name: prettyName(dirent.name), file: sub })
              }
            }
          }
        }
      }
    } catch {}
  } else {
    // Linux: 遍歷 ~/.config 搜尋所有具有 DevToolsActivePort 的 Chromium 瀏覽器
    const configDir = path.join(home, '.config')
    try {
      if (fs.existsSync(configDir)) {
        for (const dirent of fs.readdirSync(configDir, { withFileTypes: true })) {
          if (dirent.isDirectory()) {
            const dirPath = path.join(configDir, dirent.name)
            const p1 = path.join(dirPath, 'DevToolsActivePort')
            if (fs.existsSync(p1) && isBrowserPath(p1)) {
              candidates.push({ name: prettyName(dirPath), file: p1 })
            }
            try {
              for (const sub of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (sub.isDirectory()) {
                  const p2 = path.join(dirPath, sub.name, 'DevToolsActivePort')
                  if (fs.existsSync(p2) && isBrowserPath(p2)) {
                    candidates.push({ name: prettyName(path.join(dirPath, sub.name)), file: p2 })
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  const detected: BrowserInstance[] = []
  for (const item of candidates) {
    try {
      const raw = fs.readFileSync(item.file, 'utf8')
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length >= 2) {
        const port = parseInt(lines[0], 10)
        const guid = lines[1]
        const wsUrl = `ws://127.0.0.1:${port}${guid}`
        if (!detected.some((d) => d.port === port)) {
          detected.push({
            name: item.name,
            port,
            wsUrl,
            activePortFile: item.file,
          })
        }
      }
    } catch {}
  }

  return detected
}

export function detectBrowserCdp(portOverride?: number): BrowserStatus {
  const venv = findPythonVenv()
  const cli = findCliScript()
  const instances = scanChromiumCdpInstances()

  if (instances.length > 1) {
    const selected = portOverride
      ? (instances.find((i) => i.port === portOverride) || instances[0])
      : instances[0]
    return {
      connected: true,
      browserType: selected.name,
      port: selected.port,
      wsUrl: selected.wsUrl,
      activePortFile: selected.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: true,
      instances,
      error: `偵測到 ${instances.length} 個開啟遠端偵錯的瀏覽器實例（${instances.map((i) => `${i.name}:${i.port}`).join('、')}）。建議關閉多餘實例以避免衝突，或在下方指定埠號。`,
    }
  }

  if (instances.length === 1) {
    const item = instances[0]
    return {
      connected: true,
      browserType: item.name,
      port: portOverride || item.port,
      wsUrl: item.wsUrl,
      activePortFile: item.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: false,
      instances,
    }
  }

  if (portOverride) {
    return {
      connected: true,
      browserType: `CDP 指定端口 (${portOverride})`,
      port: portOverride,
      wsUrl: `http://127.0.0.1:${portOverride}`,
      activePortFile: null,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: false,
      instances: [],
    }
  }

  return {
    connected: false,
    browserType: 'None',
    port: null,
    wsUrl: null,
    activePortFile: null,
    pythonVenv: venv,
    cliScript: cli,
    multipleInstances: false,
    instances: [],
    error: '未偵測到開啟遠端偵錯的 Chromium 瀏覽器',
  }
}

export function trySpawnAgentLimbBridge(): boolean {
  try {
    const home = getEffectiveHome()
    const nodeCandidates = [
      process.execPath,
      path.join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node'),
      '/usr/bin/node',
    ]
    let nodeBin = ''
    for (const n of nodeCandidates) {
      if (fs.existsSync(n)) { nodeBin = n; break }
    }

    const scriptCandidates = [
      path.join(home, '.agentlimb', 'bin', 'agentlimb.mjs'),
      path.join(home, 'Downloads', 'agentlimb-chrome', 'bin', 'agentlimb.mjs'),
    ]
    let cliScript = ''
    for (const s of scriptCandidates) {
      if (fs.existsSync(s)) { cliScript = s; break }
    }

    if (nodeBin && cliScript) {
      const child = spawn(nodeBin, [cliScript, 'bridge'], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      return true
    }
  } catch {}
  return false
}

export interface AgentLimbStatus {
  ready: boolean
  port: number
  version?: string
  browsers?: number
  activeProfile?: string
  paired?: boolean
  stage?: string
  error?: string
}

export async function detectAgentLimb(ports: number[] = [8765, 8766, 8767, 8768], autoSpawn: boolean = true): Promise<AgentLimbStatus> {
  const probe = async () => {
    for (const port of ports) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(600),
        })
        if (res.ok) {
          const data = (await res.json()) as any
          if (data.ok) {
            const profile = data.browserList?.[0]?.label || data.browserList?.[0]?.id || 'Profile'
            return {
              ready: true,
              port,
              version: data.version || '0.8.2',
              browsers: data.browsers || 1,
              activeProfile: profile,
              paired: Boolean(data.paired),
              stage: data.stage || 'ready',
            }
          }
        }
      } catch {}
    }
    return null
  }

  let status = await probe()
  if (status) return status

  // 若尚未在線且允許自動喚醒，在後台拉起 Bridge 再探測一次
  if (autoSpawn) {
    if (trySpawnAgentLimbBridge()) {
      await new Promise((r) => setTimeout(r, 600))
      status = await probe()
      if (status) return status
    }
  }

  return {
    ready: false,
    port: 8765,
    error: 'AgentLimb 本地 Bridge 未在線或擴充功能未連線',
  }
}

export interface DualChannelReport {
  activeChannel: 'agentlimb' | 'cdp' | 'none'
  mode: 'auto' | 'agentlimb' | 'cdp'
  agentlimb: AgentLimbStatus
  cdp: BrowserStatus
  pythonVenv: string | null
  cliScript: string | null
}

/**
 * 依序智慧探測：
 * 1. 若手動指定 cdp：僅測 CDP
 * 2. 若為 auto 或 agentlimb：先測 AgentLimb
 *    👉 若 AgentLimb 成功連通，立即返回，【完全不碰、不喚醒、不探測 CDP】，實現 100% 零彈窗！
 * 3. 僅當 AgentLimb 不通且模式為 auto 時，才向下探測 CDP 備用通道
 */
export async function detectDualChannel(cfgMode?: string, cfgPort?: number): Promise<DualChannelReport> {
  const mode = (cfgMode as any) || 'auto'
  const venv = findPythonVenv()
  const cli = findCliScript()

  // 1. 強制手動指定走 CDP 模式
  if (mode === 'cdp') {
    const cdp = detectBrowserCdp(cfgPort)
    return {
      activeChannel: cdp.connected ? 'cdp' : 'none',
      mode: 'cdp',
      agentlimb: { ready: false, port: 8765, error: '使用者手動選擇僅走 CDP 模式' },
      cdp,
      pythonVenv: venv,
      cliScript: cli,
    }
  }

  // 2. 優先探測 AgentLimb (先看有沒有 AgentLimb)
  const agentlimb = await detectAgentLimb()
  if (agentlimb.ready) {
    // AgentLimb 通了！完全不測 CDP，零彈窗保護中！
    return {
      activeChannel: 'agentlimb',
      mode,
      agentlimb,
      cdp: {
        connected: false,
        browserType: 'None',
        port: null,
        wsUrl: null,
        activePortFile: null,
        pythonVenv: venv,
        cliScript: cli,
        error: 'AgentLimb 已連線，CDP 備用通道完全休眠 (零彈窗保護)',
      },
      pythonVenv: venv,
      cliScript: cli,
    }
  }

  // 3. 只有在 auto 模式且 AgentLimb 不通時，才召喚 CDP 備用
  if (mode === 'auto') {
    const cdp = detectBrowserCdp(cfgPort)
    return {
      activeChannel: cdp.connected ? 'cdp' : 'none',
      mode: 'auto',
      agentlimb,
      cdp,
      pythonVenv: venv,
      cliScript: cli,
    }
  }

  // 4. 強制 AgentLimb 但未連線
  return {
    activeChannel: 'none',
    mode: 'agentlimb',
    agentlimb,
    cdp: {
      connected: false,
      browserType: 'None',
      port: null,
      wsUrl: null,
      activePortFile: null,
      pythonVenv: venv,
      cliScript: cli,
      error: '強制 AgentLimb 模式，不啟用 CDP 備用通道',
    },
    pythonVenv: venv,
    cliScript: cli,
  }
}
