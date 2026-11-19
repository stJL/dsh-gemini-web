import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export interface PluginConfig {
  connectionMode: 'auto' | 'agentlimb' | 'cdp'
  defaultModel: string
  autoFallback: boolean
  fallbackMode: 'ladder' | 'strict'
  fallbackLadder: string[]
  thinkingPolicy: 'adaptive' | 'custom' | 'strict'
  thinkingLevel: string
  timeoutSec: number
  port: number
  preferredBrowser: string
  flowCount: number
  dispatchMode: 'ask_first' | 'fast_track'
}

export const DEFAULT_CONFIG: PluginConfig = {
  connectionMode: 'auto',
  defaultModel: 'gemini-3.5-flash-lite',
  autoFallback: true,
  fallbackMode: 'ladder',
  fallbackLadder: [
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini.google.com',
  ],
  thinkingPolicy: 'adaptive',
  thinkingLevel: 'high',
  timeoutSec: 180,
  port: 9222,
  preferredBrowser: 'auto',
  flowCount: 1,
  dispatchMode: 'ask_first',
}

export function getConfigPath(): string {
  // 優先使用用戶家目录下的全局持久化路徑 (~/.dsh/gemini-web-config.json)
  // 杜絕因工作區切換、npm/bun 打包目录變化或 symlink 導致配置遺失
  try {
    const dshDir = path.join(os.homedir(), '.dsh')
    if (!fs.existsSync(dshDir)) fs.mkdirSync(dshDir, { recursive: true })
    return path.join(dshDir, 'gemini-web-config.json')
  } catch {}

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(__dirname, 'config.json')
}

export function loadConfig(): PluginConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf-8')) }
    }
    // 遷移檢查：若舊位置 default-workspace/config.json 存在，讀取舊配置
    const legacyPath = path.resolve(os.homedir(), 'Documents/deepseek-harness/default-workspace/config.json')
    if (fs.existsSync(legacyPath)) {
      const data = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...data }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(cfg: Partial<PluginConfig>): PluginConfig {
  const merged = { ...loadConfig(), ...cfg }
  try {
    const p = getConfigPath()
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save config:', err)
  }
  return merged
}
