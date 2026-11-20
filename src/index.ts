import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'
import { loadConfig } from './config.js'
import { parseTaskToProposal } from './proposal.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'webServer', 'systemPrompt']

export function buildDynamicCardGuidance(): string {
  return `【🌐 Gemini Web Agent 单一门禁与先问后用铁律】
唯一合法调度指令：/gemini-web-agent（/gw 简写已永久废弃）。

【核心交互流程规范】：
当用户在对话中提到需要使用外部 Google 网页端（AI Studio / Flow / Gemini 官网）执行任务，或直接使用了 /gemini-web-agent 指令时：
1. 严禁宿主 AI 本地代劳作答！必须立即执行第 1 步先问后用（调用 gemini_preview 工具）；
2. 在聊天中原样输出 gemini_preview 返回的标准确认卡；
3. 必须立即调用交互提问工具 ask_user_question（或 ask_question），展示交互选择栏供用户点击：
   - questions: [{ id: "gemini_confirm", question: "👉 请确认是否发包执行？", options: [{ label: "(Recommended) 确认发包执行" }, { label: "调整参数" }, { label: "取消调度（本地作答）" }] }]
4. 严禁直接调用 gemini_web_agent 发包，严禁调用 subagent！等待用户点击确认！

【授权发包执行】：
当用户在交互选择栏中点击「确认发包执行」或回复「确认」/「1」后：
正式调用 gemini_web_agent 发包执行！

🚨【多轮任务循环铁律（Multi-Turn Anti-Inertia）】：
每个新任务都是一个全新独立的循环（Cycle），绝非整个聊天会话只确认一次！
即使同一对话中上一轮刚刚成功执行完毕，只要用户再次发起新的任务指令，本轮依然必须 100% 重新重置回确认流程，必须再次输出确认卡并调用提问工具！
绝对严禁因为历史上上一轮已经确认过就自作聪明跳过确认卡直接作答或偷跑发包！`
}

export function apply(ctx: any) {
  // 1. 給 Agent 注入動態提示詞段落（引導先問後用與單一門禁）
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

  // 2. 註冊 DSH 核心代理工具: gemini_preview, gemini_web_agent 與別名
  ctx.inject(['tools'], (scoped: any) => {
    try {
      // 3.1 確定性卡片預覽與生成工具 (Plan B: 徹底終結小模型排版幻覺與奪舍)
      const previewDef = {
        name: 'gemini_preview',
        get description() {
          return `【第 1 步确定性确认卡与交互选项生成器】
必须在第 1 步调用！输入用户的任务指令，100% 由代码确定性解析并生成标准的【🌐 Gemini Web Agent】确认卡与交互选项定义（彻底规避排版幻觉与阶梯错误）。
在第 1 步调用本工具获取卡片后，在聊天中原样输出卡片文本，并立即调用选择栏工具 ask_user_question 呈现确认按钮供用户点击！`
        },
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              description: '用户提出的任务指令或提示词',
            },
          },
        },
        output: {
          schema: {
            type: 'string',
            description: '确定性生成的提案卡 Markdown 文本',
          },
          render: (_args: any, value: any) => [{
            type: 'text',
            text: typeof value === 'string' ? value : (value ? JSON.stringify(value) : ''),
          }],
        },
        async execute(args: any) {
          const proposal = parseTaskToProposal(args.task, loadConfig())
          return `${proposal.card}\n\n【下一步操作指引】：请宿主 AI 立即在当前聊天窗口中原样输出上方确认卡，并调用提问工具 ask_user_question（或 ask_question）弹出交互选择按钮：\n- questions: [{"id": "gemini_confirm", "question": "👉 请确认是否发包执行？", "options": [{"label": "(Recommended) 确认发包执行"}, {"label": "调整参数"}, {"label": "取消调度（本地作答）"}]}]\n调用提问工具后立即停止本次回应，等待用户点击按钮确认！`
        },
      }

      scoped.tools.register(previewDef)
      scoped.tools.register({ ...previewDef, name: 'gemini-preview' })

      // 3.2 核心發包執行工具
      const toolDef = {
        name: 'gemini_web_agent',
        get description() {
          return `【🚨 Google 外部免费算力与多模态网关 / 核心铁律：两步走・先问后用】
【第 1 步先问后用，第 2 步授权发包】：
在使用者提出任何需求后，第 1 步必须先调用 gemini_preview 工具确定性生成【🌐 Gemini Web Agent】确认卡，并调用 ask_user_question 呈现原生按钮供用户点击，并在此停止等待！
只有当用户确认（点击按钮、回复「确认」或「1」）后，才在第 2 步正式调用本工具发包执行！

${buildDynamicCardGuidance()}

1. 🎯【用户指定模型绝对优先】：若用户指定了具体模型（如「用 Gemini 3.5 Flash Lite」、「用 Argon」），必须 100% 采用该模型，严禁擅自升级或替换！
2. 🛑【明令禁止本地擅自代劳、Subagent 劫持与本地 read 工具拦截】：严禁在本地自行编写答案，严禁调用 read、cat、bash 等本地工具预先读取文件，严禁调用 subagent 消耗付费额度！当用户要求分析本地文件或输入了 @文件 时，直接将该文件路径交由外部网页端挂载分析！
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
            action: {
              type: 'string',
              description: '执行动作：execute (默认，正式发包执行) 或 preview (仅确定性预览并返回确认卡)',
            },
            model: {
              type: 'string',
              description: '指定调度的模型别名（选填，如 hydrogen, flash, flash-lite 等）',
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
          // 若为 preview 动作，直接执行确定性解析生成确认卡
          if (args.action === 'preview') {
            const proposal = parseTaskToProposal(args.task, loadConfig())
            return proposal.card
          }

          // 自动挂载文件兜底提取：若未显式传 files，自动提取提示词中的路径或 @file
          let filesToPass = args.files
          if (!filesToPass || filesToPass.length === 0) {
            const proposal = parseTaskToProposal(args.task, loadConfig())
            if (proposal.files && proposal.files.length > 0) {
              filesToPass = proposal.files
            }
          }

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
            files: filesToPass,
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

  // 4. 機會性註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter(ctx)
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
