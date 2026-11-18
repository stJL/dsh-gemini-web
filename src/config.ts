import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface PluginConfig {
  connectionMode: 'auto' | 'agentlimb' | 'cdp'
  defaultModel: string
  autoFallback: boolean
  fallbackMode: 'ladder' | 'strict'
  thinkingLevel: string
  timeoutSec: number
  port: number
  preferredBrowser: string
  flowCount: number
}

export const DEFAULT_CONFIG: PluginConfig = {
  connectionMode: 'auto',
  defaultModel: 'gemini-3.5-flash-lite',
  autoFallback: true,
  fallbackMode: 'ladder',
  thinkingLevel: 'high',
  timeoutSec: 180,
  port: 9222,
  preferredBrowser: 'auto',
  flowCount: 1,
}

export function getConfigPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  if (fs.existsSync(path.resolve(__dirname, 'package.json'))) {
    return path.resolve(__dirname, 'config.json')
  }
  return path.resolve(__dirname, '../../config.json')
}

export function loadConfig(): PluginConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf-8')) }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(cfg: Partial<PluginConfig>): PluginConfig {
  const merged = { ...loadConfig(), ...cfg }
  try {
    const p = getConfigPath()
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8')
  } catch {}
  return merged
}
