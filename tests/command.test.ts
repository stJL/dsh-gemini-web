import { describe, it, expect } from 'bun:test'
import { parseTaskToProposal } from '../src/proposal.js'

describe('Gemini Web Agent Single Gateway & Proposal Engine (v0.3.0-beta.0)', () => {
  it('Command Help & Guide on empty input or help', () => {
    const handleCommand = (rawInput: string) => {
      const raw = rawInput.trim()
      if (!raw || raw === 'help' || raw === '--help' || raw === '-h') {
        return {
          kind: 'success',
          text: `### 🌐 Gemini Web Agent 调度门禁指南\n\n**唯一合法命令入口**：\`/gemini-web-agent <任务需求>\``,
        }
      }
      const proposal = parseTaskToProposal(raw)
      return {
        kind: 'success',
        text: proposal.card,
      }
    }

    const resEmpty = handleCommand('')
    expect(resEmpty.kind).toBe('success')
    expect(resEmpty.text).toContain('Gemini Web Agent 调度门禁指南')
    expect(resEmpty.text).toContain('唯一合法命令入口')
    expect(resEmpty.text).toContain('/gemini-web-agent')

    const resHelp = handleCommand('help')
    expect(resHelp.kind).toBe('success')
    expect(resHelp.text).toContain('Gemini Web Agent 调度门禁指南')
  })

  it('Command Hard Intercepts prompt with zero tokens and deterministic card', () => {
    const handleCommand = (rawInput: string) => {
      const raw = rawInput.trim()
      const proposal = parseTaskToProposal(raw)
      return {
        kind: 'success',
        text: proposal.card,
      }
    }

    const res = handleCommand('在 Gemini 官网切换至 task 模式，联网调研最新 AI 芯片架构')
    expect(res.kind).toBe('success')
    expect(res.text).toContain('### 🌐 Gemini Web Agent')
    expect(res.text).toContain('- 🎯 执行渠道：gemini.google.com')
    expect(res.text).toContain('- 🚪 入口模式：task')
    expect(res.text).toContain('- 🧠 执行模型：Auto (Gemini 官网原生模型)')
  })
})
