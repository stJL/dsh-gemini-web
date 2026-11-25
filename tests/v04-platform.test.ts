import { describe, it, expect } from 'bun:test'
import {
  formatAuthorizedConfigBrief,
  parseTaskToProposal,
} from '../src/proposal.js'
import { sanitizeWaveSpec } from '../src/bridge/agent-executor.js'
import { DEFAULT_CONFIG, PluginConfig } from '../src/config.js'

describe('v0.4.0 Light-Gate & Empowered Agent Platform', () => {
  it('honors structured ProposalOverrides without regex hijacking', () => {
    // Even though the prompt contains "看板" and "联网调研", explicit overrides must win
    const res = parseTaskToProposal('帮我写一个任务看板和联网调研总结', DEFAULT_CONFIG, {
      site: 'aistudio',
      entry: 'chat',
      model: 'gemini-3.8-flash',
      thinkingLevel: 'medium',
    })

    expect(res.site).toBe('aistudio')
    expect(res.entry).toBe('chat')
    expect(res.model).toBe('gemini-3.8-flash')
    expect(res.modelTarget).toBe('gemini-3.8-flash')
    expect(res.thinkingConfig).toContain('Thinking 设为 medium')
  })

  it('supports Lyria music studio site and model resolution', () => {
    const res = parseTaskToProposal('生成一段轻快的 lo-fi 钢琴循环', DEFAULT_CONFIG, {
      site: 'lyria',
      model: 'lyria-3-pro-preview',
    })

    expect(res.site).toBe('lyria')
    expect(res.entry).toBe('music')
    expect(res.model).toBe('lyria-3-pro-preview')
    expect(res.card).toContain('Lyria')
  })

  it('formats GUI-authorized configuration brief for strong host models', () => {
    const strictCfg: PluginConfig = {
      ...DEFAULT_CONFIG,
      thinkingPolicy: 'strict',
      defaultModel: 'gemini-4-hydrogen',
      directorMode: 'external',
      directorModel: 'gemini-4-neon',
    }
    const brief = formatAuthorizedConfigBrief(strictCfg)
    expect(brief).toContain('GUI 用户授权配置快照')
    expect(brief).toContain('strict (锁定单模型: gemini-4-hydrogen)')
    expect(brief).toContain('external (gemini-4-neon)')
    expect(brief).toContain('.gemini-teams/[sessionId]/')
  })

  it('renders custom structured waveTasks in proposal card', () => {
    const res = parseTaskToProposal('构建多端音频工具', DEFAULT_CONFIG, {
      site: 'wave',
      waveTasks: [
        { role: 'architect', site: 'aistudio', model: 'gemini-4-hydrogen', prompt: 'design' },
        { role: 'composer', site: 'lyria', model: 'lyria-3-pro-preview', prompt: 'bgm' },
      ],
    })

    expect(res.site).toBe('wave')
    expect(res.entry).toBe('wave')
    expect(res.card).toContain('[architect, composer]')
    expect(res.card).toContain('`composer` ➔ `lyria` (lyria-3-pro-preview)')
  })

  it('sanitizeWaveSpec filters secrets from remote gemini_task items and fills default thinking_level', () => {
    const rawSpec = {
      project: 'demo-wave',
      tasks: [
        {
          role: 'researcher',
          site: 'gemini_task',
          files: ['/repo/README.md', '/repo/.env', '/home/user/id_rsa', '/repo/src/app.py'],
          prompt: 'check docs',
        },
        {
          role: 'coder',
          site: 'aistudio',
          model: 'gemini-4-hydrogen',
          files: ['/repo/.env', '/repo/src/app.py'],
          prompt: 'code',
        },
      ],
    }

    const clean = sanitizeWaveSpec(rawSpec, { ...DEFAULT_CONFIG, thinkingLevel: 'medium' })
    expect(clean.tasks[0].files).toEqual(['/repo/README.md', '/repo/src/app.py'])
    expect(clean.tasks[1].files).toEqual(['/repo/.env', '/repo/src/app.py'])
    expect(clean.tasks[1].thinking_level).toBe('medium')
  })

  it('ignores non-existent output filenames like index.html or board.json in preview card', () => {
    const res = parseTaskToProposal('請幫我生成極簡番茄鐘 index.html 並持久化到 nonexistent_board_999.json', DEFAULT_CONFIG, {
      site: 'aistudio',
      model: 'gemini-3.8-flash',
    })
    expect(res.files).toEqual([])
    expect(res.card).not.toContain('挂载文件')
  })
})
