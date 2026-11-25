import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginConfig, loadConfig } from './config.js'

export interface PlaybookInfo {
  slug: string
  title: string
  roles: string[]
  stages: string
}

export interface WaveTaskInput {
  role: string
  site?: string
  model?: string
  prompt?: string
  out_file?: string
  unpack_json_dir?: string
  thinking_level?: string
  files?: string[]
}

export interface ProposalOverrides {
  site?: 'aistudio' | 'flow' | 'gemini' | 'wave' | 'lyria'
  entry?: 'chat' | 'task' | 'canvas' | 'wave' | 'music'
  model?: string
  thinkingLevel?: string
  files?: string[]
  playbook?: string
  waveTasks?: WaveTaskInput[]
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
  site: 'aistudio' | 'flow' | 'gemini' | 'wave' | 'lyria'
  entry: 'chat' | 'task' | 'canvas' | 'wave' | 'music'
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

function resolvePlaybooksDir(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      path.resolve(here, 'references', 'playbooks'),
      path.resolve(here, '..', 'references', 'playbooks'),
    ]
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir
    }
  } catch {}
  return null
}

function parseCustomPlaybookFile(dir: string, file: string): PlaybookInfo {
  const slug = file.slice(0, -3)
  const content = fs.readFileSync(path.join(dir, file), 'utf-8')
  const titleLine = content.split('\n').find((l) => l.trim().startsWith('# '))
  const rawTitle = titleLine ? titleLine.trim().slice(2).trim() : slug
  const cleanTitle = rawTitle.replace(/\s*\(`[^`]+`\)\s*$/, '').trim()
  const roles: string[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^\|\s*`([a-zA-Z0-9_-]+)`\s*\|/)
    if (m && m[1] !== 'role') roles.push(m[1])
  }
  return {
    slug,
    title: cleanTitle || slug,
    roles: roles.length > 0 ? roles : ['director', 'coder'],
    stages: `自定义编队契约 (references/playbooks/${file})`,
  }
}

function findCustomPlaybook(query: string): PlaybookInfo | undefined {
  const dir = resolvePlaybooksDir()
  if (!dir) return undefined
  try {
    const lower = query.toLowerCase()
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      const slug = file.slice(0, -3)
      if (PLAYBOOKS[slug]) continue
      const parsed = parseCustomPlaybookFile(dir, file)
      if (lower.includes(slug.toLowerCase()) || (parsed.title && lower.includes(parsed.title.toLowerCase()))) {
        return parsed
      }
    }
  } catch {}
  return undefined
}

function extractFilesFromTask(task: string, explicitFiles?: string[]): string[] {
  const files: string[] = Array.isArray(explicitFiles)
    ? explicitFiles.map((f) => String(f).trim()).filter(Boolean)
    : []

  const pushUnique = (f: string) => {
    if (f && !files.includes(f)) files.push(f)
  }

  const atRegex = /@([a-zA-Z0-9_\-\.\/]+)/g
  let match: RegExpExecArray | null
  while ((match = atRegex.exec(task)) !== null) {
    pushUnique(match[1].trim())
  }

  const fileRegex = /\b(?:(?:\.?\.?\/)?[a-zA-Z0-9_\-]+\/)*[a-zA-Z0-9_\-]+\.(?:ts|tsx|js|jsx|py|json|md|txt|pdf|png|jpg|jpeg|gif|webp|csv|log|yaml|yml|rs|go|cpp|c|h|java|html|css|sh)\b/gi
  while ((match = fileRegex.exec(task)) !== null) {
    const f = match[0].trim()
    if (!f.includes('google.com')) pushUnique(f)
  }

  return files
}

function resolveModelToken(raw: string): { model: string; key: string; note?: string } {
  const lower = raw.trim().toLowerCase()
  if (/lyria[- ]?3\.5|lyria[- ]?3[- ]?pro|lyria/i.test(lower)) {
    const id = /pro/i.test(lower) ? 'lyria-3-pro-preview' : 'lyria-3.5'
    return { model: id, key: id }
  }
  if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite/i.test(lower)) {
    return { model: 'gemini-3.5-flash-lite', key: 'gemini-3.5-flash-lite' }
  }
  if (/3\.8[- ]?flash|\bflash\b/i.test(lower) && !/flash[- ]?lite/i.test(lower)) {
    return { model: 'gemini-3.8-flash', key: 'gemini-3.8-flash' }
  }
  if (/neon/i.test(lower)) {
    return { model: 'gemini-4-neon', key: 'gemini-4-neon' }
  }
  if (/argon/i.test(lower)) {
    return {
      model: 'gemini-4-hydrogen',
      key: 'gemini-4-hydrogen',
      note: '（注：Google 已将旧 Argon 槽位升级合并至 Hydrogen 深度推理，已自动为您映射）',
    }
  }
  if (/hydrogen|gemini-4/i.test(lower)) {
    return { model: 'gemini-4-hydrogen', key: 'gemini-4-hydrogen' }
  }
  if (/nano\s*banana/i.test(lower)) {
    return { model: 'Nano Banana 2.1', key: 'nano-banana' }
  }
  if (/veo|omni/i.test(lower)) {
    return { model: 'Omni 1.2 / Veo', key: 'omni' }
  }
  return { model: raw.trim(), key: raw.trim() }
}

function matchHeuristicPlaybook(task: string): PlaybookInfo {
  if (/(?:全栈|web\s*应用|saas|web_fullstack|全栈编队|看板|web\s*工具)/i.test(task)) {
    return PLAYBOOKS.web_fullstack_app
  }
  if (/(?:游戏|game|phaser|canvas游戏|interactive_game|游戏编队)/i.test(task)) {
    return PLAYBOOKS.interactive_game_studio
  }
  if (/(?:数据工程|办公自动化|excel|报表|清洗|data_office|数据编队)/i.test(task)) {
    return PLAYBOOKS.data_office_automation
  }
  if (/(?:视频|自媒体|音频|配乐|剪辑|content_video|视频编队)/i.test(task)) {
    return PLAYBOOKS.content_video_media
  }
  if (/(?:学术|文献|综述|深度调研|研报|academic_deep|调研编队)/i.test(task)) {
    return PLAYBOOKS.academic_deep_research
  }
  return findCustomPlaybook(task) || PLAYBOOKS.web_fullstack_app
}

/**
 * Format the user's GUI-authorized configuration (`~/.dsh/gemini-web-config.json`)
 * so strong host models know exact permitted ladders, policies, and channels.
 */
export function formatAuthorizedConfigBrief(cfg: PluginConfig): string {
  const ladder = cfg.fallbackLadder?.length
    ? cfg.fallbackLadder.join(' -> ')
    : cfg.defaultModel || 'gemini-4-hydrogen'
  const fallbackMode = cfg.thinkingPolicy === 'strict' || cfg.fallbackMode === 'strict' || cfg.autoFallback === false
    ? `strict (锁定单模型: ${cfg.defaultModel || 'gemini-4-hydrogen'})`
    : `${cfg.thinkingPolicy || 'adaptive'} (授权阶梯: ${ladder})`
  return [
    '【GUI 用户授权配置快照 (~/.dsh/gemini-web-config.json)】',
    `- 连接通道: ${cfg.connectionMode || 'auto'} (首选 AgentLimb 免弹窗 -> CDP 备援)`,
    `- 策略与模型阶梯: ${fallbackMode}`,
    `- 默认思考等级: ${cfg.thinkingLevel || 'high'} · 超时上限: ${cfg.timeoutSec || 180}s`,
    `- 总监模式: ${cfg.directorMode === 'external' ? `external (${cfg.directorModel || 'gemini-4-hydrogen'})` : 'local (本地宿主 AI 统筹)'}`,
    '- 安全护栏 (代码层强制): 严禁绕过 Paid 过滤、gemini-spark 任务自动剔除密钥文件、Wave 产出隔离至 .gemini-teams/[sessionId]/',
  ].join('\n')
}

function buildWaveProposal(
  task: string,
  cfg: PluginConfig,
  extractedFiles: string[],
  overrides?: ProposalOverrides
): ProposalResult {
  const explicitPb = overrides?.playbook
    ? (PLAYBOOKS[overrides.playbook] || findCustomPlaybook(overrides.playbook))
    : undefined
  const pb = explicitPb || matchHeuristicPlaybook(task)
  const customTasks = Array.isArray(overrides?.waveTasks) && overrides.waveTasks.length > 0
    ? overrides.waveTasks
    : undefined

  const channel = 'Wave 多 Tab 并发波次引擎 (Chrome Multi-Tab Cluster)'
  const actionDesc = customTasks
    ? `启动自定义多角色 Wave 编队 (${customTasks.length} 个子任务)`
    : `启动虚拟工作室「${pb.title}」并发协作`
  const rolesList = customTasks
    ? customTasks.map((t) => t.role || 'worker')
    : pb.roles
  const directorMode = cfg.directorMode === 'external'
    ? `外包给外部 AI Studio (${cfg.directorModel || 'gemini-4-hydrogen'})`
    : '本地模型掌舵 (推荐 · 保持全局上下文)'
  const thinkingConfig = '各 Tab 错峰 3.5s 派发 · 后台静默轮询 · 自动解包写入会话隔离区'

  const filesLine = extractedFiles.length > 0 ? `- 📁 挂载文件：[${extractedFiles.join(', ')}]` : ''
  const matrixLines = customTasks
    ? customTasks.map((t) => `  - \`${t.role}\` ➔ \`${t.site || 'aistudio'}\` (${t.model || cfg.defaultModel || 'gemini-4-hydrogen'})`)
    : [
        '  - 📐 架构定界：Google AI Studio (Gemini 4 Hydrogen / Neon 深度长文本)',
        '  - 🛠️ 研发与自测：Gemini 官网代码沙盒 (云端容器运行测试，无需本地装环境)',
        '  - 🎨 视觉素材：Google Flow (Nano Banana 2.1 享受 0 扣点特权)',
      ]

  const cardLines = [
    '### 🌐 Gemini Web Agent',
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    '',
    `- 🎯 执行渠道：${channel}`,
    `- 📋 启用编队：${pb.title} (${pb.slug})`,
    `- 🧭 总监模式：${directorMode}`,
    `- 👥 协同角色：[${rolesList.join(', ')}]`,
  ]
  if (filesLine) cardLines.push(filesLine)
  cardLines.push(
    '- 🚪 入口模式：wave (多 Tab 并发外包)',
    '- 🧠 协同矩阵：多 Tab 专属工种',
    ...matrixLines,
    `- 🌊 规划波次：${pb.stages}`,
    `- ⚙️ 推演配置：${thinkingConfig}`,
    '- 🔄 话题隔离：会话级独立花名册与交付沙盒 (.gemini-teams/[sessionId]/)',
    '- 🔐 安全提醒：若在 gemini-spark 开启云端联网，请勿向 Task 传入 API Key 或敏感凭据',
    '',
    '👉 请确认是否启动 Wave 并发外包执行？',
    '- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化错峰派发多 Tab 并行执行',
    '- 回复 「花名册」：查阅当前会话团队各角色绑定的标签页状态',
    '- 回复 「取消」：中止并发外包，改由本地单模型作答'
  )

  return {
    site: 'wave',
    entry: 'wave',
    channel,
    actionDesc,
    modelLabel: '（多 Tab 角色矩阵）',
    modelTarget: '架构定界 (AI Studio Hydrogen / Neon) + 研发沙盒 (Gemini 官网云端运行) + 视觉资产 (Flow 零点数特权)',
    model: 'wave',
    thinkingConfig,
    files: extractedFiles,
    card: cardLines.join('\n'),
    question: '👉 请确认是否启动 Wave 并发外包执行？',
    options: [
      '(Recommended) 确认启动 Wave 并发外包',
      '查看该编队花名册契约',
      '取消调度（本地作答）',
    ],
    playbook: pb,
  }
}

/**
 * 确定性任务提示词解析器与确认卡拼装器
 * v0.4: 若调用方（强模型）传入结构化 overrides，优先尊重结构化参数而不被关键字正则覆盖；
 *       若未传 overrides，保留轻量启发式兜底以兼容旧版纯文本单入口调用。
 */
export function parseTaskToProposal(
  task: string,
  config?: PluginConfig,
  overrides?: ProposalOverrides
): ProposalResult {
  const cfg = config || loadConfig()
  const extractedFiles = extractFilesFromTask(task, overrides?.files)

  // 1. Wave 判定：优先尊重显式 overrides (site/entry/waveTasks/playbook)，否则回退轻量正则
  const hasExplicitNonWaveSite = Boolean(overrides?.site && overrides.site !== 'wave')
  const explicitWave = Boolean(
    overrides?.site === 'wave' ||
    overrides?.entry === 'wave' ||
    overrides?.playbook ||
    (overrides?.waveTasks && overrides.waveTasks.length > 0)
  )
  const heuristicWave = !hasExplicitNonWaveSite && /(?:\bwave\b|并发波次|波次引擎|波次任务|多\s*tab\s*并发|并发外包|虚拟工作室|团队花名册|花名册|\broster\b|\bplaybook\b|工作编队|研发编队|全栈编队|游戏编队|数据编队|视频编队|调研编队|编队|外包团队|全栈开发|任务看板|看板\s*web|web\s*工具)/i.test(task)

  if (explicitWave || heuristicWave) {
    return buildWaveProposal(task, cfg, extractedFiles, overrides)
  }

  // 2. 站点与入口判定：显式 overrides > 启发式关键词
  let site: 'aistudio' | 'flow' | 'gemini' | 'lyria' = 'aistudio'
  if (overrides?.site && overrides.site !== 'wave') {
    site = overrides.site
  } else {
    const isAiStudio = /(?:google\s*ai\s*studio|ai\s*studio|aistudio)/i.test(task)
    const isLyria = /(?:\blyria\b|lyria[- ]?3)/i.test(task)
    const isFlow = /(?:google\s*flow|flow\.google\.com|\bflow\b|nano\s*banana|veo|omni\s*1\.2|生图|画一张|生成图片|生成图|做视频|生成视频)/i.test(task)
    const isGeminiWeb = /(?:gemini(?:\.google\.com)?\s*官网|gemini\s*web|gemini\s*网页|task\s*模式|task模式)/i.test(task) || (!isAiStudio && /联网调研/i.test(task))
    if (isLyria) site = 'lyria'
    else if (isAiStudio) site = 'aistudio'
    else if (isFlow) site = 'flow'
    else if (isGeminiWeb) site = 'gemini'
  }

  let entry: 'chat' | 'task' | 'canvas' | 'music' = 'chat'
  if (overrides?.entry && overrides.entry !== 'wave') {
    entry = overrides.entry
  } else if (site === 'flow') {
    entry = 'canvas'
  } else if (site === 'lyria') {
    entry = 'music'
  } else if (site === 'gemini') {
    entry = /(?:task\s*模式|task模式|联网调研|\btask\b)/i.test(task) ? 'task' : 'chat'
  }

  // 3. 渠道名称与动作描述
  const channelMap: Record<'aistudio' | 'flow' | 'gemini' | 'lyria', string> = {
    aistudio: 'Google AI Studio（可选择：Google AI Studio / Gemini Web）',
    gemini: 'gemini.google.com（可选择：Google AI Studio / Gemini Web）',
    flow: 'Google Flow (flow.google.com)',
    lyria: 'Google AI Studio Lyria 音乐台 (aistudio.google.com/new_music)',
  }
  const channel = channelMap[site]

  let actionDesc = '实现任务'
  if (extractedFiles.length > 0) actionDesc = '分析本地文件'
  else if (site === 'flow') actionDesc = '实现多媒体生成'
  else if (site === 'lyria') actionDesc = '生成 AI 音乐音频'
  else if (site === 'gemini' && entry === 'task') actionDesc = '进行联网调研与深度探索'
  else if (site === 'aistudio' && /联网调研/i.test(task)) actionDesc = '进行联网调研与深度探索'

  // 4. 模型判定：显式 overrides.model > 任务文本显式点名 > GUI 策略默认值
  let specified: { model: string; key: string; note?: string } | undefined
  if (overrides?.model) {
    specified = resolveModelToken(overrides.model)
  } else if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite|3\.8[- ]?flash|\bflash\b|neon|argon|hydrogen|gemini-4|nano\s*banana|veo|omni|lyria/i.test(task)) {
    specified = resolveModelToken(task)
  }

  let modelLabel = ''
  let modelTarget = ''
  let finalModel: string | undefined = undefined
  const modelNote = specified?.note || ''

  if (site === 'flow') {
    if (specified?.key === 'omni') {
      modelLabel = 'Omni 1.2 / Veo (视频生成)'
      modelTarget = 'Omni 1.2 / Veo'
      finalModel = 'omni'
    } else {
      modelLabel = 'Nano Banana 2.1 (2K 高清生图)'
      modelTarget = 'Nano Banana 2.1'
      finalModel = 'nano-banana'
    }
  } else if (site === 'lyria') {
    modelLabel = '（音乐生成）'
    modelTarget = specified?.model || 'lyria-3-pro-preview'
    finalModel = modelTarget
  } else if (site === 'gemini') {
    modelLabel = 'Auto (Gemini 官网原生模型)'
    modelTarget = 'Google 官方原生模型'
  } else if (specified) {
    modelLabel = '（用户指定）'
    modelTarget = specified.model
    finalModel = specified.key
  } else if (cfg.thinkingPolicy === 'strict') {
    modelLabel = '（严格模式）'
    modelTarget = cfg.defaultModel || 'gemini-4-hydrogen'
    finalModel = cfg.defaultModel
  } else {
    modelLabel = '（智能/降级模式）'
    const ladder = cfg.fallbackLadder?.length
      ? cfg.fallbackLadder
      : [cfg.defaultModel || 'gemini-4-hydrogen']
    modelTarget = ladder.join(' -> ')
  }

  // 5. 推演配置装配
  let thinkingConfig = ''
  if (site === 'gemini') {
    thinkingConfig = entry === 'task' ? '联网搜索增强 (Task 联网模式)' : '官网标准对话模式'
  } else if (site === 'flow') {
    thinkingConfig = '生成数量设为 x1，分辨率设为 2K'
  } else if (site === 'lyria') {
    thinkingConfig = '生成音乐并自动保存 .mp3 至本地工作区'
  } else {
    const level = overrides?.thinkingLevel || cfg.thinkingLevel || 'high'
    thinkingConfig = /联网调研/i.test(task) ? `Thinking 设为 ${level} (联网搜索增强)` : `Thinking 设为 ${level}`
  }

  // 6. 构建确认卡 Markdown
  const cardLines = [
    '### 🌐 Gemini Web Agent',
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    '',
    `- 🎯 执行渠道：${channel}`,
  ]
  if (extractedFiles.length > 0) {
    cardLines.push(`- 📁 挂载文件：[${extractedFiles.join(', ')}]`)
  }
  cardLines.push(
    `- 🚪 入口模式：${entry}`,
    `- 🧠 执行模型：${modelLabel}`,
    `  - ${modelTarget}${modelNote ? ` ${modelNote}` : ''}`,
    `- ⚙️ 推演配置：${thinkingConfig}`,
    '- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）',
    ...(site === 'gemini' && entry === 'task'
      ? ['- 🔐 安全提醒：若已开启 gemini-spark 云端联网，严禁向 Task 传入 API Key 或敏感凭据']
      : []),
    '',
    '👉 请确认是否发包执行？',
    '- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行',
    '- 回复 调整参数（如「改用 Flash Lite」、「改用 Hydrogen」等）：按您的要求调整后直接发包',
    '- 回复 「取消」：中止外部调度，改由本地作答'
  )

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
    card: cardLines.join('\n'),
    question: '👉 请确认是否发包执行？',
    options: [
      '(Recommended) 确认发包执行',
      '调整参数',
      '取消调度（本地作答）',
    ],
  }
}
