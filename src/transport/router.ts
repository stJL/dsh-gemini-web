import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { detectDualChannel, detectAgentLimb, findPythonVenv, findAgentLimbScript } from '../bridge/detector.js'
import { fetchUsage } from '../bridge/runner.js'
import {
  executeAgentTask,
  getRoster,
  clearRoster,
  auditRoster,
  getPlaybooks,
  getPlaybookDetail,
  addPlaybook,
  executeWave,
  listSessionDeliveries,
  mergeSessionDeliveries,
  openLocalDirectory,
  getPlaybooksDirectory,
  getOrCreateSessionWaveDir,
  getSessionRosterFile,
  runDoctor,
} from '../bridge/agent-executor.js'
import { loadConfig, saveConfig, type PluginConfig } from '../config.js'
import { PLAYBOOKS } from '../proposal.js'

const execFileAsync = promisify(execFile)

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

export function createApiRouter(ctx?: any) {
  let cachedUsage: any = null
  let lastUsageTime = 0

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const marker = '/api/gemini-web'
    const markerAt = url.pathname.indexOf(marker)
    const routePath = url.pathname.slice(markerAt >= 0 ? markerAt + marker.length : 0).replace(/\/+$/, '') || '/'
    const method = String(req.method ?? 'GET').toUpperCase()

    const send = (status: number, data: any) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      })
      res.end(JSON.stringify(data))
    }

    try {
      if (routePath === '/status' && method === 'GET') {
        const cfg = loadConfig()
        const dual = await detectDualChannel(cfg.connectionMode, cfg.port)
        return send(200, {
          ok: true,
          dual,
          cdp: dual.cdp,
          agentlimb: dual.agentlimb,
          activeChannel: dual.activeChannel,
          cachedUsage,
          config: cfg,
        })
      }

      if (routePath === '/config' && method === 'GET') {
        return send(200, { ok: true, config: loadConfig() })
      }

      if (routePath === '/config' && method === 'POST') {
        const body = await readBody(req)
        const updated = saveConfig(body)
        try { ctx?.emit?.('gemini-web/config-updated') } catch {}
        return send(200, { ok: true, config: updated })
      }

      if (routePath === '/test-agentlimb' && method === 'POST') {
        const al = await detectAgentLimb()
        if (!al.ready) {
          return send(400, { ok: false, error: 'AgentLimb 未在线，请确认 Brave 中 AgentLimb 扩展功能與 Bridge 已啟動。' })
        }
        try {
          const resp = await fetch(`http://127.0.0.1:${al.port}/api/tool`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              tool: 'say',
              arguments: { text: '🎉 來自 DeepSeek Harness 雙通道面板測試：AgentLimb 连接正常！零弹窗调度就緒。' },
              timeoutMs: 5000,
            }),
          })
          const data = (await resp.json()) as any
          return send(200, { ok: true, data })
        } catch (err: any) {
          return send(500, { ok: false, error: err.message || String(err) })
        }
      }

      if (routePath === '/clear-cache' && method === 'POST') {
        cachedUsage = null
        lastUsageTime = 0
        return send(200, { ok: true, message: '缓存已清除' })
      }

      if (routePath === '/open-url' && method === 'POST') {
        const body = await readBody(req)
        const targetUrl = body.url || 'https://accounts.google.com'
        if (process.platform === 'linux') {
          spawn('xdg-open', [targetUrl], { detached: true, stdio: 'ignore' }).unref()
        } else if (process.platform === 'darwin') {
          spawn('open', [targetUrl], { detached: true, stdio: 'ignore' }).unref()
        } else {
          spawn('cmd.exe', ['/c', 'start', targetUrl], { detached: true, stdio: 'ignore' }).unref()
        }
        return send(200, { ok: true, url: targetUrl })
      }

      if (routePath === '/usage' && method === 'GET') {
        const force = url.searchParams.get('force') === '1'
        const now = Date.now()
        if (!force && cachedUsage && now - lastUsageTime < 10000) {
          return send(200, cachedUsage)
        }
        const usage = await fetchUsage()
        if (usage.ok) {
          cachedUsage = usage
          lastUsageTime = now
        }
        return send(200, usage)
      }

      if (routePath === '/models' && method === 'GET') {
        const venv = findPythonVenv()
        const alScript = findAgentLimbScript()
        let discovered: any[] = []
        if (venv && alScript) {
          try {
            const { stdout } = await execFileAsync(venv, [alScript, 'models'], {
              timeout: 15000,
              env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            })
            const parsed = JSON.parse(stdout.trim())
            if (parsed.status === 'ok' && Array.isArray(parsed.models) && parsed.models.length > 0) {
              discovered = parsed.models
            }
          } catch {}
        }
        if (discovered.length === 0) {
          discovered = [
            { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', new: true, paid: false },
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', new: false, paid: false },
            { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', new: false, paid: false },
            { id: 'gemini-4-neon', name: 'Gemini 4 Neon', new: true, paid: true },
            { id: 'gemini-4-argon', name: 'Gemini 4 Argon', new: false, paid: true },
            { id: 'gemini-nano-banana-2.1', name: 'Nano Banana 2.1', new: true, paid: true },
            { id: 'gemini-omni-1.2-flash', name: 'Gemini Omni 1.2 Flash', new: true, paid: true },
          ]
        }
        if (!discovered.some((m: any) => m.id === 'gemini.google.com')) {
          discovered.push({ id: 'gemini.google.com', name: 'gemini.google.com', new: false, paid: false })
        }
        return send(200, { ok: true, models: discovered })
      }

      if (routePath === '/execute' && method === 'POST') {
        const body = await readBody(req)
        const task = body.task || '請用一句話打招呼'
        const result = await executeAgentTask({ task, model: body.model })
        return send(200, result)
      }

      if (routePath === '/roster' && method === 'GET') {
        const sessionId = url.searchParams.get('sessionId') || undefined
        const roster = await getRoster(undefined, sessionId)
        return send(200, roster)
      }

      if (routePath === '/roster/clear' && method === 'POST') {
        const body = await readBody(req)
        const result = await clearRoster(undefined, body.sessionId || url.searchParams.get('sessionId') || undefined)
        return send(200, result)
      }

      if (routePath === '/roster/audit' && method === 'POST') {
        const body = await readBody(req)
        const result = await auditRoster(body.projectDir, undefined, body.sessionId || undefined)
        return send(200, result)
      }

      if (routePath === '/playbooks' && method === 'GET') {
        const pb = await getPlaybooks()
        const diskList: any[] = pb.ok && Array.isArray(pb.data?.playbooks) ? pb.data.playbooks : []
        const officialSlugs = new Set(Object.keys(PLAYBOOKS))
        const customPlaybooks = diskList
          .filter((item) => item?.name && !officialSlugs.has(item.name))
          .map((item) => ({ ...item, isCustom: true }))
        return send(200, {
          ok: true,
          playbooks: diskList.length > 0 ? diskList : Object.values(PLAYBOOKS),
          customPlaybooks,
        })
      }

      if (routePath === '/playbooks' && method === 'POST') {
        const body = await readBody(req)
        const result = await addPlaybook(body)
        return send(result.ok ? 200 : 400, result)
      }

      if (routePath.startsWith('/playbook/') && method === 'GET') {
        const pbName = decodeURIComponent(routePath.replace('/playbook/', ''))
        const detail = await getPlaybookDetail(pbName)
        return send(200, detail)
      }

      if (routePath === '/wave' && method === 'POST') {
        const body = await readBody(req)
        const sessionId = body.sessionId || undefined
        const resume = Boolean(body.resume)
        const waveDir = body.projectDir || getOrCreateSessionWaveDir(sessionId, resume)
        const rosterFile = body.rosterFile || getSessionRosterFile(sessionId)
        const result = await executeWave(body.spec || body.tasks, {
          projectDir: waveDir,
          rosterFile,
          timeoutSec: body.timeoutSec,
          resume,
        })
        return send(200, { ...result, waveDir, rosterFile })
      }

      if (routePath === '/deliveries' && method === 'GET') {
        const sessionId = url.searchParams.get('sessionId') || undefined
        return send(200, listSessionDeliveries(sessionId))
      }

      if (routePath === '/deliveries/merge' && method === 'POST') {
        const body = await readBody(req)
        return send(200, mergeSessionDeliveries(body.sessionId, body.waveName))
      }

      if (routePath === '/open-dir' && method === 'POST') {
        const body = await readBody(req)
        if (body.target === 'playbooks') {
          return send(200, openLocalDirectory(getPlaybooksDirectory()))
        }
        if (body.target === 'deliveries') {
          const deliveries = listSessionDeliveries(body.sessionId)
          const wave = body.waveName ? deliveries.waves.find((w) => w.name === body.waveName) : deliveries.waves[0]
          return send(200, openLocalDirectory(wave ? wave.path : deliveries.teamDir))
        }
        return send(400, { ok: false, error: 'Unsupported directory target' })
      }

      if (routePath === '/doctor' && method === 'GET') {
        return send(200, await runDoctor())
      }

      return send(404, { error: 'Not found' })
    } catch (err: any) {
      return send(500, { error: err.message || String(err) })
    }
  }
}
