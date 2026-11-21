import { describe, it, expect } from 'bun:test'
import { parseTaskToProposal } from '../src/proposal.js'
import { PluginConfig } from '../src/config.js'

const mockConfig: PluginConfig = {
  connectionMode: 'auto',
  defaultModel: 'gemini-4-hydrogen',
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

describe('Deterministic Proposal Parser (Plan B)', () => {
  it('Scenario 1: Gemini 官网 task 模式与联网调研', () => {
    const prompt = '/gemini-web-agent 在 Gemini 官网切换至 task 模式，联网调研最新 AI 芯片架构进展并做成对比表格'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('gemini')
    expect(res.entry).toBe('task')
    expect(res.channel).toContain('gemini.google.com')
    expect(res.modelLabel).toBe('Auto (Gemini 官网原生模型)')
    expect(res.modelTarget).toBe('Google 官方原生模型')
    expect(res.thinkingConfig).toBe('联网搜索增强 (Task 联网模式)')
    expect(res.card).toContain('### 🌐 Gemini Web Agent')
    expect(res.card).toContain('- 🎯 执行渠道：gemini.google.com')
    expect(res.card).toContain('- 🚪 入口模式：task')
    expect(res.card).toContain('- 🧠 执行模型：Auto (Gemini 官网原生模型)')
    expect(res.card).toContain('  - Google 官方原生模型')
    expect(res.card).toContain('- ⚙️ 推演配置：联网搜索增强 (Task 联网模式)')
    expect(res.card).not.toContain('gemini-4-hydrogen')
    expect(res.card).not.toContain('- 📁 挂载文件：')
    expect(res.options).toContain('(Recommended) 确认发包执行')
  })

  it('Scenario 2: Gemini 官网常规日常对话 (chat 模式)', () => {
    const prompt = '在 Gemini 官网帮我写一首现代诗'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('gemini')
    expect(res.entry).toBe('chat')
    expect(res.thinkingConfig).toBe('官网标准对话模式')
  })

  it('Scenario 3: Google Flow 图像/多媒体生成', () => {
    const prompt = '用 Nano Banana 在 Google Flow 画一只赛博朋克猫咪'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('flow')
    expect(res.entry).toBe('canvas')
    expect(res.channel).toBe('Google Flow (flow.google.com)')
    expect(res.modelLabel).toContain('Nano Banana 2.1')
    expect(res.thinkingConfig).toBe('生成数量设为 x1，分辨率设为 2K')
    expect(res.card).toContain('Google Flow (flow.google.com)')
    expect(res.card).not.toContain('gemini-4-hydrogen')
  })

  it('Scenario 4: AI Studio 用户显式指定模型 (Flash Lite)', () => {
    const prompt = '用 Flash Lite 优化这套高并发排序算法'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('aistudio')
    expect(res.entry).toBe('chat')
    expect(res.modelLabel).toBe('（用户指定）')
    expect(res.modelTarget).toBe('gemini-3.5-flash-lite')
    expect(res.model).toBe('gemini-3.5-flash-lite')
    expect(res.thinkingConfig).toBe('Thinking 设为 high')
  })

  it('Scenario 5: AI Studio 用户显式指定旧代号 (Argon 自动映射为 Hydrogen 并友好提示)', () => {
    const prompt = '请用 Argon 深度推演分布式系统中的 Raft 共识算法'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('aistudio')
    expect(res.modelLabel).toBe('（用户指定）')
    expect(res.modelTarget).toBe('gemini-4-hydrogen')
    expect(res.model).toBe('gemini-4-hydrogen')
    expect(res.card).toContain('Hydrogen 深度推理')
    expect(res.card).not.toContain('gemini-thinking')
  })

  it('Scenario 6: AI Studio 默认智能模式实时镜像降级阶梯', () => {
    const prompt = '请实现一个高性能无锁环形缓冲区'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('aistudio')
    expect(res.entry).toBe('chat')
    expect(res.modelLabel).toBe('（智能/降级模式）')
    expect(res.modelTarget).toBe('gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.5-flash-lite -> gemini.google.com')
    expect(res.card).toContain('gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.5-flash-lite -> gemini.google.com')
  })

  it('Scenario 7: AI Studio 严格模式单模型锁定', () => {
    const strictConfig: PluginConfig = {
      ...mockConfig,
      thinkingPolicy: 'strict',
      defaultModel: 'gemini-3.8-flash',
    }
    const prompt = '请实现分布式雪花算法'
    const res = parseTaskToProposal(prompt, strictConfig)

    expect(res.modelLabel).toBe('（严格模式）')
    expect(res.modelTarget).toBe('gemini-3.8-flash')
  })

  it('Scenario 8: 挂载本地文件 (@文件与文件路径自动提取)', () => {
    const prompt = '分析 @src/index.ts 与 tests/test_core.py 的实现差异并提出重构方案'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.files).toContain('src/index.ts')
    expect(res.files).toContain('tests/test_core.py')
    expect(res.actionDesc).toBe('分析本地文件')
    expect(res.card).toContain('- 📁 挂载文件：[src/index.ts, tests/test_core.py]')
  })

  it('Scenario 9: AI Studio 显式指定渠道同时包含联网调研指令 (优先级锁定 AI Studio)', () => {
    const prompt = '/gemini-web-agent 在 Google AI Studio，联网调研最新 AI 芯片架构进展并做成对比表格'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('aistudio')
    expect(res.entry).toBe('chat')
    expect(res.channel).toBe('Google AI Studio（可选择：Google AI Studio / Gemini Web）')
    expect(res.modelLabel).toBe('（智能/降级模式）')
    expect(res.modelTarget).toContain('gemini-4-hydrogen')
    expect(res.thinkingConfig).toContain('Thinking 设为 high')
    expect(res.card).toContain('Google AI Studio')
    expect(res.card).not.toContain('Auto (Gemini 官网原生模型)')
  })

  it('Scenario 10: AI Studio 用户显式指定新模型 (Gemini 4 Neon)', () => {
    const prompt = '用 Gemini 4 Neon 分析微服务架构的流量调度'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('aistudio')
    expect(res.entry).toBe('chat')
    expect(res.modelLabel).toBe('（用户指定）')
    expect(res.modelTarget).toBe('gemini-4-neon')
    expect(res.model).toBe('gemini-4-neon')
    expect(res.thinkingConfig).toBe('Thinking 设为 high')
  })

  it('Scenario 11: Wave 虚拟软件工作室与并发编队判定 (全栈 Web 编队)', () => {
    const prompt = '启动 Wave 并发波次，用全栈编队开发一套任务管理看板'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('wave')
    expect(res.entry).toBe('wave')
    expect(res.channel).toContain('Wave 多 Tab 并发波次引擎')
    expect(res.playbook?.slug).toBe('web_fullstack_app')
    expect(res.card).toContain('全栈 Web / SaaS 应用研发编队')
    expect(res.card).toContain('Wave 0 (架构定界) -> Wave 1 (并行生产)')
    expect(res.options).toContain('(Recommended) 确认启动 Wave 并发外包')
  })

  it('Scenario 12: 用户简要输入「开发任务看板Web工具」自动匹配全栈编队', () => {
    const prompt = '开发任务看板Web工具'
    const res = parseTaskToProposal(prompt, mockConfig)

    expect(res.site).toBe('wave')
    expect(res.entry).toBe('wave')
    expect(res.playbook?.slug).toBe('web_fullstack_app')
    expect(res.card).toContain('全栈 Web / SaaS 应用研发编队')
    expect(res.options).toContain('(Recommended) 确认启动 Wave 并发外包')
  })
})
