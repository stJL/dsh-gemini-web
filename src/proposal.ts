import { PluginConfig, loadConfig } from './config.js'

export interface PlaybookInfo {
  slug: string
  title: string
  roles: string[]
  stages: string
}

export const PLAYBOOKS: Record<string, PlaybookInfo> = {
  web_fullstack_app: {
    slug: 'web_fullstack_app',
    title: '全栈 Web / SaaS 应用研发编队',
    roles: ['director', 'frontend_builder', 'backend_coder', 'ui_artist', 'qa_tester'],
    stages: 'Wave 0 (架构定界) -> Wave 1 (并行生产) -> Wave 2 (集成解包) -> Wave 3 (沙盒自测)',
  },
  interactive_game_studio: {
    slug: 'interactive_game_studio',
    title: '互动游戏与创意原型工作室',
    roles: ['director', 'game_designer', 'core_coder', 'ui_artist', 'audio_engineer', 'qa_tester'],
    stages: 'Wave 0 (玩法原型) -> Wave 1 (逻辑与美术并行) -> Wave 2 (音效切图) -> Wave 3 (冒烟试玩)',
  },
  data_office_automation: {
    slug: 'data_office_automation',
    title: '数据工程、报表与办公自动化工坊',
    roles: ['director', 'data_engineer', 'chart_formatter', 'doc_auditor'],
    stages: 'Wave 0 (数据契约) -> Wave 1 (清洗与作图) -> Wave 2 (文档汇总)',
  },
  content_video_media: {
    slug: 'content_video_media',
    title: '视觉创意、音视频与自媒体工坊',
    roles: ['director', 'script_writer', 'visual_artist', 'voice_actor', 'post_editor'],
    stages: 'Wave 0 (剧本策划) -> Wave 1 (生图与配音) -> Wave 2 (视频合成与包装)',
  },
  academic_deep_research: {
    slug: 'academic_deep_research',
    title: '学术研报、文献综述与深度调研编队',
    roles: ['director', 'deep_researcher', 'fact_checker', 'paper_writer'],
    stages: 'Wave 0 (提纲界定) -> Wave 1 (多源调研) -> Wave 2 (交叉核对) -> Wave 3 (综述成文)',
  },
}

export interface ProposalResult {
  site: 'aistudio' | 'flow' | 'gemini' | 'wave'
  entry: 'chat' | 'task' | 'canvas' | 'wave'
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
  playbook?: PlaybookInfo
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

  // 1.5 Wave 并发波次与虚拟工作室编队判定
  const isWave = /(?:\bwave\b|并发波次|波次引擎|波次任务|多\s*tab\s*并发|并发外包|虚拟工作室|团队花名册|花名册|\broster\b|\bplaybook\b|工作编队|研发编队|全栈编队|游戏编队|数据编队|视频编队|调研编队)/i.test(task)

  if (isWave) {
    let matchedPlaybook: PlaybookInfo | undefined = undefined
    if (/(?:全栈|web\s*应用|saas|web_fullstack|全栈编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.web_fullstack_app
    } else if (/(?:游戏|game|phaser|canvas游戏|interactive_game|游戏编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.interactive_game_studio
    } else if (/(?:数据工程|办公自动化|excel|报表|清洗|data_office|数据编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.data_office_automation
    } else if (/(?:视频|自媒体|音频|配乐|剪辑|content_video|视频编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.content_video_media
    } else if (/(?:学术|文献|综述|深度调研|研报|academic_deep|调研编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.academic_deep_research
    }
    if (!matchedPlaybook) {
      matchedPlaybook = PLAYBOOKS.web_fullstack_app
    }

    const pb = matchedPlaybook
    const channel = 'Wave 多 Tab 并发波次引擎 (Chrome Multi-Tab Cluster)'
    const actionDesc = `启动虚拟工作室「${pb.title}」并发协作`
    const modelLabel = '（多 Tab 角色矩阵）'
    const modelTarget = 'Director (4 Neon) + Task (Debian 12) + Flow (Nano Banana)'
    const thinkingConfig = '各 Tab 错峰 3.5s 派发 · 后台静默轮询 · 自动解包写入工作区'

    const filesLine = extractedFiles.length > 0 ? `- 📁 挂载文件：[${extractedFiles.join(', ')}]` : ''
    const cardLines = [
      '### 🌐 Gemini Web Agent',
      `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
      '',
      `- 🎯 执行渠道：${channel}`,
      `- 📋 启用编队：${pb.title} (${pb.slug})`,
      `- 👥 协同角色：[${pb.roles.join(', ')}]`,
    ]

    if (filesLine) {
      cardLines.push(filesLine)
    }

    cardLines.push(
      `- 🚪 入口模式：wave (多 Tab 并发外包)`,
      `- 🧠 执行模型：${modelLabel}`,
      `  - ${modelTarget}`,
      `- 🌊 规划波次：${pb.stages}`,
      `- ⚙️ 推演配置：${thinkingConfig}`,
      '- 🔄 话题隔离：各角色独立 Tab 绑定 (.web-team.json 持久化)',
      '',
      '👉 请确认是否启动 Wave 并发外包执行？',
      '- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化错峰派发多 Tab 并行执行',
      '- 回复 「花名册」：查阅当前项目团队各角色绑定的标签页与 Google Drive 状态',
      '- 回复 「取消」：中止并发外包，改由本地单模型作答'
    )

    const card = cardLines.join('\n')
    const question = '👉 请确认是否启动 Wave 并发外包执行？'
    const options = [
      '(Recommended) 确认启动 Wave 并发外包',
      '查看该编队花名册契约',
      '取消调度（本地作答）'
    ]

    return {
      site: 'wave',
      entry: 'wave',
      channel,
      actionDesc,
      modelLabel,
      modelTarget,
      model: 'wave',
      thinkingConfig,
      files: extractedFiles,
      card,
      question,
      options,
      playbook: pb,
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
  } else if (/neon/i.test(task)) {
    userSpecifiedModel = 'gemini-4-neon'
    userSpecifiedModelKey = 'gemini-4-neon'
  } else if (/argon/i.test(task)) {
    // 官方已将早期测试版 Argon 思考槽位升级合并至 Hydrogen 深度推理
    userSpecifiedModel = 'gemini-4-hydrogen'
    userSpecifiedModelKey = 'gemini-4-hydrogen'
    modelNote = '（注：Google 已将旧 Argon 槽位升级合并至 Hydrogen 深度推理，已自动为您映射）'
  } else if (/hydrogen|gemini-4/i.test(task)) {
    userSpecifiedModel = 'gemini-4-hydrogen'
    userSpecifiedModelKey = 'gemini-4-hydrogen'
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
