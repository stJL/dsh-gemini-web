import { PluginConfig, loadConfig } from './config.js'

export interface ProposalResult {
  site: 'aistudio' | 'flow' | 'gemini'
  entry: 'chat' | 'task' | 'canvas'
  channel: string
  actionDesc: string
  modelLabel: string
  modelTarget: string
  model?: string
  thinkingConfig: string
  files: string[]
  card: string
  question: string
  options: string[]
}

/**
 * 确定性任务提示词解析器与确认卡拼装器
 * 摆脱小模型长文本注意力衰减与推理幻觉，百分之百确定性输出规范确认卡
 */
export function parseTaskToProposal(task: string, config?: PluginConfig): ProposalResult {
  const cfg = config || loadConfig()

  // 1. 挂载文件扫描与提取（支持 @file 或常见源码/数据/文档文件路径，剔除域名）
  const extractedFiles: string[] = []
  const atRegex = /@([a-zA-Z0-9_\-\.\/]+)/g
  let match: RegExpExecArray | null
  while ((match = atRegex.exec(task)) !== null) {
    const f = match[1].trim()
    if (f && !extractedFiles.includes(f)) {
      extractedFiles.push(f)
    }
  }

  const fileRegex = /\b(?:(?:\.?\.?\/)?[a-zA-Z0-9_\-]+\/)*[a-zA-Z0-9_\-]+\.(?:ts|tsx|js|jsx|py|json|md|txt|pdf|png|jpg|jpeg|gif|webp|csv|log|yaml|yml|rs|go|cpp|c|h|java|html|css|sh)\b/gi
  while ((match = fileRegex.exec(task)) !== null) {
    const f = match[0].trim()
    if (f && !f.includes('google.com') && !extractedFiles.includes(f)) {
      extractedFiles.push(f)
    }
  }

  // 2. 执行渠道与入口模式判定（显式指定 AI Studio 具有最高优先级，防止被「联网调研」关键字劫持到官网）
  const isAiStudio = /(?:google\s*ai\s*studio|ai\s*studio|aistudio)/i.test(task)
  const isFlow = /(?:google\s*flow|flow\.google\.com|\bflow\b|nano\s*banana|veo|omni\s*1\.2|生图|画一张|生成图片|生成图|做视频|生成视频)/i.test(task)
  const isGeminiWeb = /(?:gemini(?:\.google\.com)?\s*官网|gemini\s*web|gemini\s*网页|task\s*模式|task模式)/i.test(task) || (!isAiStudio && /联网调研/i.test(task))

  let site: 'aistudio' | 'flow' | 'gemini' = 'aistudio'
  if (isAiStudio) {
    site = 'aistudio'
  } else if (isFlow) {
    site = 'flow'
  } else if (isGeminiWeb) {
    site = 'gemini'
  }

  let entry: 'chat' | 'task' | 'canvas' = 'chat'
  if (site === 'flow') {
    entry = 'canvas'
  } else if (site === 'gemini') {
    if (/(?:task\s*模式|task模式|联网调研|\btask\b)/i.test(task)) {
      entry = 'task'
    } else {
      entry = 'chat'
    }
  }

  // 3. 渠道名称与动作描述
  let channel = 'Google AI Studio（可选择：Google AI Studio / Gemini Web）'
  if (site === 'gemini') {
    channel = 'gemini.google.com（可选择：Google AI Studio / Gemini Web）'
  } else if (site === 'flow') {
    channel = 'Google Flow (flow.google.com)'
  }

  let actionDesc = '实现任务'
  if (extractedFiles.length > 0) {
    actionDesc = '分析本地文件'
  } else if (site === 'flow') {
    actionDesc = '实现多媒体生成'
  } else if (site === 'gemini' && entry === 'task') {
    actionDesc = '进行联网调研与深度探索'
  } else if (site === 'aistudio' && /联网调研/i.test(task)) {
    actionDesc = '进行联网调研与深度探索'
  }

  // 4. 用户显式指定模型判定
  let userSpecifiedModel: string | undefined
  let userSpecifiedModelKey: string | undefined
  let modelNote = ''

  if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite/i.test(task)) {
    userSpecifiedModel = 'gemini-3.5-flash-lite'
    userSpecifiedModelKey = 'gemini-3.5-flash-lite'
  } else if (/3\.8[- ]?flash|\bflash\b/i.test(task) && !/flash[- ]?lite/i.test(task)) {
    userSpecifiedModel = 'gemini-3.8-flash'
    userSpecifiedModelKey = 'gemini-3.8-flash'
  } else if (/hydrogen|gemini-4/i.test(task)) {
    userSpecifiedModel = 'gemini-4-hydrogen'
    userSpecifiedModelKey = 'gemini-4-hydrogen'
  } else if (/argon/i.test(task)) {
    // 官方已将早期测试版 Argon 思考槽位升级合并至 Hydrogen 深度推理
    userSpecifiedModel = 'gemini-4-hydrogen'
    userSpecifiedModelKey = 'gemini-4-hydrogen'
    modelNote = '（注：Google 已将旧 Argon 槽位升级合并至 Hydrogen 深度推理，已自动为您映射）'
  } else if (/neon/i.test(task)) {
    userSpecifiedModel = 'gemini-4-neon'
    userSpecifiedModelKey = 'neon'
  } else if (/nano\s*banana/i.test(task)) {
    userSpecifiedModel = 'Nano Banana 2.1'
    userSpecifiedModelKey = 'nano-banana'
  } else if (/veo|omni/i.test(task)) {
    userSpecifiedModel = 'Omni 1.2 / Veo'
    userSpecifiedModelKey = 'omni'
  }

  // 5. 模型展示标签与实际目标组装（按三场景分流，严禁跨渠道污染）
  let modelLabel = ''
  let modelTarget = ''
  let finalModel: string | undefined = undefined

  if (site === 'flow') {
    if (userSpecifiedModelKey === 'omni') {
      modelLabel = 'Omni 1.2 / Veo (视频生成)'
      modelTarget = 'Omni 1.2 / Veo'
      finalModel = 'omni'
    } else {
      modelLabel = 'Nano Banana 2.1 (2K 高清生图)'
      modelTarget = 'Nano Banana 2.1'
      finalModel = 'nano-banana'
    }
  } else if (site === 'gemini') {
    modelLabel = 'Auto (Gemini 官网原生模型)'
    modelTarget = 'Google 官方原生模型'
  } else if (userSpecifiedModel) {
    modelLabel = '（用户指定）'
    modelTarget = userSpecifiedModel
    finalModel = userSpecifiedModelKey
  } else {
    // aistudio default
    const isStrict = cfg.thinkingPolicy === 'strict'
    if (isStrict) {
      modelLabel = '（严格模式）'
      modelTarget = cfg.defaultModel || 'gemini-4-hydrogen'
      finalModel = cfg.defaultModel
    } else {
      modelLabel = '（智能/降级模式）'
      const ladder = cfg.fallbackLadder && cfg.fallbackLadder.length > 0
        ? cfg.fallbackLadder
        : [cfg.defaultModel || 'gemini-4-hydrogen']
      modelTarget = ladder.join(' -> ')
    }
  }

  // 6. 推演配置装配
  let thinkingConfig = ''
  if (site === 'gemini') {
    thinkingConfig = entry === 'task' ? '联网搜索增强 (Task 联网模式)' : '官网标准对话模式'
  } else if (site === 'flow') {
    thinkingConfig = '生成数量设为 x1，分辨率设为 2K'
  } else {
    const level = cfg.thinkingLevel || 'high'
    thinkingConfig = /联网调研/i.test(task) ? `Thinking 设为 ${level} (联网搜索增强)` : `Thinking 设为 ${level}`
  }

  // 7. 格式化构建 Markdown 确认卡
  const filesLine = extractedFiles.length > 0 ? `- 📁 挂载文件：[${extractedFiles.join(', ')}]` : ''

  const cardLines = [
    '### 🌐 Gemini Web Agent',
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    '',
    `- 🎯 执行渠道：${channel}`,
  ]

  if (filesLine) {
    cardLines.push(filesLine)
  }

  cardLines.push(
    `- 🚪 入口模式：${entry}`,
    `- 🧠 执行模型：${modelLabel}`,
    `  - ${modelTarget}${modelNote ? ` ${modelNote}` : ''}`,
    `- ⚙️ 推演配置：${thinkingConfig}`,
    '- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）',
    '',
    '👉 请确认是否发包执行？',
    '- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行',
    '- 回复 调整参数（如「改用 Flash Lite」、「改用 Hydrogen」等）：按您的要求调整后直接发包',
    '- 回复 「取消」：中止外部调度，改由本地作答'
  )

  const card = cardLines.join('\n')

  // 8. 交互式选择按钮定义（供 ask_user_question / ask_question 使用）
  const question = '👉 请确认是否发包执行？'
  const options = [
    '(Recommended) 确认发包执行',
    '调整参数',
    '取消调度（本地作答）'
  ]

  return {
    site,
    entry,
    channel,
    actionDesc,
    modelLabel,
    modelTarget,
    model: finalModel,
    thinkingConfig,
    files: extractedFiles,
    card,
    question,
    options,
  }
}
