import { describe, it, expect } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { detectAgentLimb } from '../src/bridge/detector.js'
import {
  sanitizeSessionId,
  getSessionRosterFile,
  isSensitiveSecretFile,
  getOrCreateSessionWaveDir,
  listSessionDeliveries,
  mergeSessionDeliveries,
  sanitizePlaybookSlug,
  buildPlaybookMarkdown,
  getRoster,
  clearRoster,
} from '../src/bridge/agent-executor.js'
import { parseTaskToProposal } from '../src/proposal.js'
import { DEFAULT_CONFIG } from '../src/config.js'

describe('v0.3.0-beta.1 Session Isolation, Secret Guardrails & Director Config', () => {
  it('sanitizes sessionId and isolates roster paths', () => {
    expect(sanitizeSessionId('session-abc/123..xyz')).toBe('session-abc_123..xyz')
    expect(sanitizeSessionId('')).toBe('default')

    const r1 = getSessionRosterFile('chat-A')
    const r2 = getSessionRosterFile('chat-B')
    expect(r1).not.toBe(r2)
    expect(r1).toContain(path.join('.gemini-teams', 'chat-A', 'roster.json'))
    expect(r2).toContain(path.join('.gemini-teams', 'chat-B', 'roster.json'))
  })

  it('blocks obvious secret files while allowing source and markdown files', () => {
    expect(isSensitiveSecretFile('/repo/.env')).toBe(true)
    expect(isSensitiveSecretFile('/repo/.env.production')).toBe(true)
    expect(isSensitiveSecretFile('/home/user/server.key')).toBe(true)
    expect(isSensitiveSecretFile('/home/user/cert.pem')).toBe(true)
    expect(isSensitiveSecretFile('/home/user/id_rsa')).toBe(true)
    expect(isSensitiveSecretFile('/repo/google-credentials.json')).toBe(true)

    expect(isSensitiveSecretFile('/repo/src/index.ts')).toBe(false)
    expect(isSensitiveSecretFile('/repo/README.md')).toBe(false)
    expect(isSensitiveSecretFile('/repo/package.json')).toBe(false)
  })

  it('renders external director model and gemini-spark security warning in proposal card', () => {
    const extCfg = {
      ...DEFAULT_CONFIG,
      directorMode: 'external' as const,
      directorModel: 'gemini-4-hydrogen',
    }
    const waveProposal = parseTaskToProposal('启动 Wave 全栈编队开发看板', extCfg)
    expect(waveProposal.card).toContain('外包给外部 AI Studio (gemini-4-hydrogen)')
    expect(waveProposal.card).toContain('.gemini-teams/[sessionId]/')
    expect(waveProposal.card).toContain('gemini-spark')

    const taskProposal = parseTaskToProposal('在 Gemini 官网切换至 task 模式跑数据清洗', DEFAULT_CONFIG)
    expect(taskProposal.card).toContain('gemini-spark')
    expect(taskProposal.card).not.toContain('gemini-4-hydrogen')
  })

  it('creates isolated wave directories, reuses latest on resume, and merges cleanly', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh_gw_test_'))
    const sid = `test-sess-${Date.now()}`
    const waveDir = getOrCreateSessionWaveDir(sid, false)
    expect(fs.existsSync(waveDir)).toBe(true)

    // Resume should reuse the existing wave directory
    const resumedDir = getOrCreateSessionWaveDir(sid, true)
    expect(resumedDir).toBe(waveDir)

    // Write a deliverable file inside waveDir
    const sub = path.join(waveDir, 'src_demo')
    fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(path.join(sub, 'hello.txt'), 'world', 'utf-8')

    const deliveries = listSessionDeliveries(sid)
    expect(deliveries.waves.length).toBeGreaterThanOrEqual(1)
    expect(deliveries.waves[0].files.some((f) => f.relPath === path.join('src_demo', 'hello.txt'))).toBe(true)

    // Cleanup temporary test artifacts
    fs.rmSync(path.dirname(waveDir), { recursive: true, force: true })
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('sanitizes custom playbook slug and builds valid playbook markdown', () => {
    expect(sanitizePlaybookSlug('my-ecom_team')).toBe('my-ecom_team')
    expect(sanitizePlaybookSlug('跨境电商')).toMatch(/^custom_squad_/)

    const md = buildPlaybookMarkdown({
      slug: 'my_ecom',
      title: '跨境电商选品工坊',
      scenarios: '多语言商品调研与海报设计',
      roles: [
        { role: 'director', label: '策划总监', siteModel: 'aistudio:gemini-4-hydrogen', duty: '拆分需求' },
        { role: 'ui_artist', label: '海报画师', siteModel: 'flow:nano2.1', duty: '生成海报' },
      ],
    })
    expect(md).toContain('# 跨境电商选品工坊 (`my_ecom`)')
    expect(md).toContain('| `director` | 策划总监 | `aistudio` (Playground) | `gemini-4-hydrogen` |')
    expect(md).toContain('| `ui_artist` | 海报画师 | `flow` | `Nano Banana 2.1` |')

    const pbDir = path.resolve(import.meta.dir, '..', 'references', 'playbooks')
    const tmpSlug = `test_custom_squad_${Date.now()}`
    const tmpMdPath = path.join(pbDir, `${tmpSlug}.md`)
    try {
      fs.writeFileSync(tmpMdPath, md.replace('my_ecom', tmpSlug).replace('my_ecom', tmpSlug), 'utf-8')
      const customProposal = parseTaskToProposal(`/gemini-web-agent 启动 ${tmpSlug} 编队：调研新品`, DEFAULT_CONFIG)
      expect(customProposal.site).toBe('wave')
      expect(customProposal.playbook?.slug).toBe(tmpSlug)
      expect(customProposal.playbook?.roles).toEqual(['director', 'ui_artist'])
      expect(customProposal.card).toContain(`(${tmpSlug})`)
    } finally {
      if (fs.existsSync(tmpMdPath)) fs.unlinkSync(tmpMdPath)
    }
  })

  it('calls gemini_web.py roster list and clear with --file for isolated sessions', async () => {
    const sid = `test-roster-${Date.now()}`
    const teamDir = path.dirname(getSessionRosterFile(sid))
    try {
      const listed = await getRoster(undefined, sid)
      expect(listed.ok).toBe(true)
      expect(listed.file).toContain(path.join('.gemini-teams', sid, 'roster.json'))

      const cleared = await clearRoster(undefined, sid)
      expect(cleared.ok).toBe(true)
    } finally {
      if (fs.existsSync(teamDir)) fs.rmSync(teamDir, { recursive: true, force: true })
    }
  })

  it('detectAgentLimb skips revoked bridge port and selects ready authorized port', async () => {
    const startMock = (payload: any) =>
      new Promise<{ server: http.Server; port: number }>((resolve) => {
        const server = http.createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        })
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any
          resolve({ server, port: addr.port })
        })
      })

    const revoked = await startMock({
      ok: true,
      browsers: 1,
      browserList: [{ id: 'Profile-1', label: 'Profile-1', authorized: false, active: false }],
      paired: false,
      authorized: false,
      activeBrowser: false,
      denied: 'revoked',
      stage: 'awaiting_authorization',
    })
    const ready = await startMock({
      ok: true,
      browsers: 1,
      browserList: [{ id: 'Profile-1', label: 'Profile-1', authorized: true, active: true }],
      paired: true,
      authorized: true,
      activeBrowser: true,
      denied: null,
      stage: 'ready',
    })

    try {
      const st = await detectAgentLimb([revoked.port, ready.port], false)
      expect(st.ready).toBe(true)
      expect(st.port).toBe(ready.port)
      expect(st.stage).toBe('ready')

      const onlyRevoked = await detectAgentLimb([revoked.port], false)
      expect(onlyRevoked.ready).toBe(false)
      expect(onlyRevoked.stage).toBe('awaiting_authorization')
    } finally {
      revoked.server.close()
      ready.server.close()
    }
  })
})
