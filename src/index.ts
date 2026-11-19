import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'
import { loadConfig } from './config.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'webServer', 'systemPrompt']

export function buildDynamicCardGuidance(): string {
  const cfg = loadConfig()
  const isStrict = cfg.thinkingPolicy === 'strict'
  const policyLabel = isStrict ? '（严格模式）' : '（智能/定时模式）'
  const ladderStr = (!isStrict && cfg.fallbackLadder && cfg.fallbackLadder.length > 0)
    ? cfg.fallbackLadder.join(' -> ')
    : (cfg.defaultModel || 'gemini-4-hydrogen')
  const thinkingVal = cfg.thinkingLevel || 'high'

  return `【🌐 Gemini Web Agent 调度铁律与确认卡排版规范】
在调用本工具发包前，你必须在第 1 步先在聊天中输出【🌐 Gemini Web Agent】确认卡并【停止当前回应】，等待用户确认！
严禁擅自直接发包，严禁调用 ask_user_question！
确认卡必须严格以 Markdown 列表「- 」逐行呈现（严禁丢弃「- 」导致折叠合并为一行）：

【当前系统生效之确认卡配置】：
- 🎯 执行渠道：Google AI Studio（可选择：Google AI Studio / Gemini Web）
- 🚪 入口模式：chat
- 🧠 执行模型：${policyLabel}
  - ${ladderStr}
- ⚙️ 推演配置：Thinking 设为 ${thinkingVal}
- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

👉 请确认是否发包执行？
- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
- 回复 调整参数（如「改用 Flash Lite」、「改用 Argon」等）：按您的要求调整后直接发包
- 回复 「取消」：中止外部调度，改由本地作答

【核心参数化动态组装铁律】：
1. 🧠 执行模型【绝对禁止使用写死/硬编码的旧模板字符串与严禁抄袭历史对话】：
   🚨【历史惯性斩断令】：本轮输出时，严禁直接复制或参考本对话中上一轮助手输出的旧确认卡！无论上一轮输出了什么顺序，当前轮次必须 100% 严格以【当前系统生效之确认卡配置】中的最新阶梯序列为准进行重新输出！
   在智能/定时模式下，必须 100% 实时原样读取上方【当前系统生效之确认卡配置】中的实际阶梯序列：
   「- 🧠 执行模型：${policyLabel}\\n  - ${ladderStr}」
   ⚠️ 特别注意：当前用户配置的第一个节点为【${ladderStr.split(' -> ')[0]}】，无论其为模型名还是域名（如 gemini.google.com），都是用户的明确意图，绝对严禁按常理将其挪到末尾，必须完整、一字不差地逐字原样完整输出「${ladderStr}」，严禁从任何历史对话或旧文档中抄写写死的默认序列，严禁擅自缩水只输出单个模型，严禁输出未经渲染的 HTML 标签（如 <br>）！
2. 严格模式：仅当用户配置或指定严格模式时，执行模型才显示单个模型（如「- 🧠 执行模型：（严格模式）\\n  - ${cfg.defaultModel || 'gemini-4-hydrogen'}」）。
3. 渠道变化：若为多媒体生图/视频任务，渠道设为 Google Flow（flow），模型设为 gemini-nano-banana-2.1；若用户指定官网渠道，渠道设为 gemini.google.com，模型设为 Auto。
4. 用户指定模型绝对优先：若用户输入明确指定了模型（如「用 Flash Lite」），执行模型必须 100% 原样采用用户指定的模型，严禁擅自升级！
5. 挂载本地文件（条件项）：若用户需求涉及分析本地文件、日志、论文 PDF、代码文件或输入了 @文件，【绝对禁止调用本地 read、cat、bash 工具自行读取】！你必须直接在第 1 步确认卡中添加「- 📁 挂载文件：[文件名]」，并在第 2 步正式发包时将文件路径填入 files 数组参数中，全权交由外部 Google 网页端 1M 超长上下文直接吞吐！若无文件需求，则完全不输出此行。`
}

export function apply(ctx: any) {
  // 1. 給 Agent 注入動態提示詞段落（含當前 GUI 配置的階梯序列）
  ctx.inject(['systemPrompt'], (scoped: any) => {
    let disposeSection: any = null
    const syncPrompt = () => {
      if (disposeSection) {
        try { disposeSection() } catch {}
        disposeSection = null
      }
      try {
        if (scoped.systemPrompt?.section) {
          disposeSection = scoped.systemPrompt.section({
            name: 'gemini-web:card-guidance',
            order: 600,
            text: buildDynamicCardGuidance(),
          })
        }
      } catch (err) {
        console.warn('[dsh-gemini-web] systemPrompt registration warning:', err)
      }
    }
    syncPrompt()
    ctx.on('gemini-web/config-updated', syncPrompt)
  })

  // 2. 註冊 DSH 核心代理工具: gemini_web_agent 與 gemini-web-agent
  ctx.inject(['tools'], (scoped: any) => {
    try {
      const toolDef = {
        name: 'gemini_web_agent',
        get description() {
          return `【🚨 Google 外部免费算力与多模态网关 / 唯一铁律：一律先问后用】
【🚨 致命调用前置条件 - 第 1 步绝对禁止直接调用发包】：
本工具严格遵循「一律先问后用」规范，无任何例外！
在使用者提出任何需求后，你【第 1 步绝对禁止直接调用本工具发包，绝对禁止调用 ask_user_question】！
你必须在第 1 步先在聊天中输出【🌐 Gemini Web Agent】确认卡，并在此【停止当前回应】，等待用户确认！
只有当用户在下一轮明确回复「确认」、「1」或给予明确发包授权时，才正式调用本工具发包！

${buildDynamicCardGuidance()}

1. 🎯【用户指定模型绝对优先】：若用户指定了具体模型（如「用 Gemini 3.5 Flash Lite」、「用 Argon」），确认卡与发包必须 100% 采用该模型，严禁擅自升级或替换！只有用户完全未指定时才采用系统默认阶梯。
2. 🛑【明令禁止本地擅自代劳、Subagent 劫持与本地 read 工具拦截】：严禁在本地自行编写答案，严禁调用 read、cat、bash 等本地工具预先读取文件，严禁调用 subagent 消耗付费额度！当用户要求分析本地文件或输入了 @文件 时，直接将该文件路径放入确认卡并交给外部网页端挂载分析！
3. 📦【调用完成后的展示义务】：调用完成后，必须完整呈现降级流程通知、落地文件超链接以及核心架构说明与代码！`
        },
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              description: '交由 Gemini 网页端执行的完整任务指令、需求描述与要求',
            },
            model: {
              type: 'string',
              description: '指定调度的模型别名（选填，如 hydrogen, argon, flash, flash-lite 等）。注意：在第 1 步确认卡中，智能/定时模式下必须完整输出降级阶梯序列，严禁只写单个模型！',
            },
            site: {
              type: 'string',
              description: '目标站点：aistudio (默认，代码与长文本), flow (生图生视频，Nano 2.1 享 0 点数), 或 gemini (官网对话与 task 模式)',
            },
            entry: {
              type: 'string',
              description: '入口模式：chat (默认对话), task (Gemini 官网任务与画布模式)',
            },
            thinking_level: {
              type: 'string',
              description: '思考等级：high (默认稳定), medium, 或 low。注意：extra-high 已封印，避免免费池引发 Permission Denied 错误',
            },
            thinking_policy: {
              type: 'string',
              description: '思考阈值策略：adaptive (自适应，默认), custom (自定义超时), strict (严格模式不降级)',
            },
            timeout_sec: {
              type: 'number',
              description: '任务超时限制秒数 (自定义模式下生效，如 240)',
            },
            new_chat: {
              type: 'boolean',
              description: '是否开启全新对话窗口（若为 true 则重置为全新聊天室，默认为 false 延续对话）',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: '待上传至 Google 网页端分析的本地文件、图片、日志或论文 PDF 绝对/相对路径列表（选填，支持多文件）',
            },
          },
        },
        output: {
          schema: {
            type: 'string',
            description: 'Gemini 网页端执行产出成果',
          },
          render: (_args: any, value: any) => [{
            type: 'text',
            text: typeof value === 'string' ? value : (value ? JSON.stringify(value) : ''),
          }],
        },
        async execute(args: any, exec?: any) {
          const sessionId = exec?.agent?.id || exec?.agent?.sessionId || exec?.sessionId
          const res = await executeAgentTask({
            task: args.task,
            model: args.model,
            site: args.site,
            entry: args.entry,
            thinkingLevel: args.thinking_level,
            thinkingPolicy: args.thinking_policy,
            timeoutSec: args.timeout_sec,
            newChat: args.new_chat,
            sessionId: sessionId,
            files: args.files,
          })
          if (!res.ok) {
            if (res.error?.includes('CONGESTION_HALT')) {
              return `⚠️ 【Google 免费池排队拥塞警报】\n${res.error}\n\n💡 建议：目前 Google AI Studio 免费池处于高负载排队状态。您可以稍候几分钟后重试，或者切换为本地模型继续进行。`
            }
            return `❌ Gemini Web Agent 调度失败: ${res.error || '未知错误'}`
          }
          let notice = ''
          if (res.fellBack) {
            const initial = res.initialModel || '初始模型'
            const current = res.model || '备援模型'
            const pathDisplay = res.fallbackHistory || `\`${initial}\` ➔ 尖峰拥塞 ➔ \`${current}\``
            notice = `> 🔄 **【模型与渠道降级调度流程通知】**\n> - 原选模型/渠道：\`${initial}\`（遭遇 Google AI Studio 免费池尖峰排队）\n> - 调度路径：${pathDisplay}\n> - 最终交付渠道与模型：\`${current}\`（推演与生成成功）\n\n`
          } else if (res.site === 'gemini' || args.site === 'gemini') {
            notice = `> 🌐 **【执行渠道通知】**：本次任务已由 **Gemini 官网通道 (gemini.google.com)** 顺利执行完成。\n\n`
          } else if (res.site === 'flow' || args.site === 'flow') {
            notice = `> 🎨 **【执行渠道通知】**：本次任务已由 **Google Flow (flow.google.com)** 顺利生成完成。\n\n`
          }
          let fileLinks = ''
          if (res.files && res.files.length > 0) {
            const linkItems = res.files.map((f: string) => {
              const base = path.basename(f)
              const fileUrl = `file://${f}`
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(base)
              if (isImg) {
                return `- [📁 ${base}](${fileUrl})\n\n  ![${base}](${fileUrl})`
              }
              return `- [📁 ${base}](${fileUrl})`
            })
            fileLinks = '📁 **成果文件已落地存档至本地工作区**：\n' + linkItems.join('\n') + '\n\n'
          }
          const instructionHeader = `【系统核心指令：请宿主 AI 在最终回复中务必完整呈现：
1. 🔄【模型降级调度流程通知】（若有降级）；
2. 📁【落地文件存档链接与图片预览】（必须原样保留 file:/// 绝对路径，严禁改为相对路径 downloads/，否则前端无法预览）；
3. 💻【核心架构说明与实现精华】（展示关键设计思路、核心类与使用方法。完整源码已落盘至上方工作区文件，引导用户直接点击文件链接查看完整源码，无需在回复中全量重抄超长代码，防止 SSE 串流中断）！】\n\n`

          let displayOutput = res.output || ''
          // 若有落地代码文件且内容超长（> 2500 字符），智能截取前半部分核心精华 + 引导提示，防止小模型因重抄超万字而遭遇 Google API SSE 串流中断 (Incomplete JSON segment at the end)
          if (res.files && res.files.length > 0 && displayOutput.length > 2500) {
            displayOutput = displayOutput.slice(0, 2200) + '\n\n...\n> 💡 **完整实现与全部代码已完整落盘至上方工作区文件**，请直接点击上方 `file:///` 链接查看完整源码与测试用例。'
          }
          return `${instructionHeader}${notice}${fileLinks}${displayOutput}`
        },
      }

      scoped.tools.register(toolDef)
      scoped.tools.register({ ...toolDef, name: 'gemini-web-agent' })
    } catch (e) {
      console.error('Failed to register gemini_web_agent tool:', e)
    }
  })

  // 3. 機會性註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter(ctx)
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
