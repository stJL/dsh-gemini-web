import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'
import { loadConfig } from './config.js'
import {
  formatAuthorizedConfigBrief,
  parseTaskToProposal,
  ProposalOverrides,
} from './proposal.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'webServer', 'systemPrompt']

const previewedTaskMap = new Map<string, number>()

function getTaskKey(t: string): string {
  return (t || '').trim().replace(/\s+/g, ' ').slice(0, 100)
}

function buildOverridesFromArgs(args: any): ProposalOverrides | undefined {
  if (!args || typeof args !== 'object') return undefined
  const hasAny =
    args.site ||
    args.entry ||
    args.model ||
    args.thinking_level ||
    (Array.isArray(args.files) && args.files.length > 0) ||
    args.playbook ||
    (Array.isArray(args.wave_tasks) && args.wave_tasks.length > 0)
  if (!hasAny) return undefined
  return {
    site: args.site,
    entry: args.entry,
    model: args.model,
    thinkingLevel: args.thinking_level,
    files: args.files,
    playbook: args.playbook,
    waveTasks: args.wave_tasks,
  }
}

export function buildDynamicCardGuidance(): string {
  return `【🌐 Gemini Web Agent 轻量门禁与授权调度规范 (v0.4)】
唯一外部网关：/gemini-web-agent。

1. 【第 1 步・先问后用门禁】：
   当用户请求调用外部 Google 网页端（AI Studio / Flow / Lyria / Gemini 官网 / Wave 多角色编队）或输入 /gemini-web-agent 时：
   - 调用 gemini_preview（可附带结构化 site / model / entry / wave_tasks 参数）生成确认卡并获取用户 GUI 授权配置快照；
   - 原样输出确认卡文本；
   - 立即调用 ask_user_question（或原生 ask_question）呈现确认按钮并停步等待用户点击或回复；
   - 严禁未经确认直接调用 gemini_web_agent 发包。

2. 【第 2 步・确认后自由编排】：
   用户点击确认或回复「确认」/「1」后，按需查阅 SKILL.md 与 references/（director_prompt.md、models.md、agentlimb.md、playbooks/*.md），在 GUI 授权模型与安全护栏内自由组合参数（单任务或结构化 wave_tasks）调用 gemini_web_agent 执行。

3. 【多轮任务重置】：
   每个新任务独立重置门禁，不得因上一轮已确认而跳过确认卡。`
}

export function apply(ctx: any) {
  // 1. 注入輕量門禁引導段落
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
      const previewDef = {
        name: 'gemini_preview',
        get description() {
          return `【第 1 步确认门禁与 GUI 授权配置生成器】
调用后返回【🌐 Gemini Web Agent】确认卡与当前用户在 GUI 中授权的模型阶梯/策略快照。
强模型可直接传入 site / entry / model / wave_tasks 等结构化参数，避免关键词猜测；输出确认卡后请立即调用提问工具并等待用户授权。`
        },
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              description: '用户提出的任务指令或提示词',
            },
            site: {
              type: 'string',
              description: '可选：显式指定站点 (aistudio / flow / gemini / lyria / wave)',
            },
            entry: {
              type: 'string',
              description: '可选：入口模式 (chat / task / canvas / music / wave)',
            },
            model: {
              type: 'string',
              description: '可选：用户或主 AI 规划的目标模型别名',
            },
            thinking_level: {
              type: 'string',
              description: '可选：思考等级 (high / medium / low / extra_high)',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: '可选：待挂载的本地文件路径列表',
            },
            playbook: {
              type: 'string',
              description: '可选：指定编队模板 slug（位于 references/playbooks/）',
            },
            wave_tasks: {
              type: 'array',
              items: { type: 'object' },
              description: '可选：结构化 Wave 子任务矩阵 [{role, site, model, prompt, ...}]',
            },
          },
        },
        output: {
          schema: {
            type: 'string',
            description: '提案卡 Markdown 与 GUI 授权配置快照',
          },
          render: (_args: any, value: any) => [{
            type: 'text',
            text: typeof value === 'string' ? value : (value ? JSON.stringify(value) : ''),
          }],
        },
        async execute(args: any) {
          const cfg = loadConfig()
          const overrides = buildOverridesFromArgs(args)
          const proposal = parseTaskToProposal(args.task, cfg, overrides)
          const key = getTaskKey(args.task)
          previewedTaskMap.set(key, Date.now())
          const qText = proposal.question || '👉 请确认是否发包执行？'
          const rawOptions = proposal.options || ['(Recommended) 确认发包执行', '调整参数', '取消调度（本地作答）']
          const authBrief = formatAuthorizedConfigBrief(cfg)
          return `${proposal.card}\n\n${authBrief}\n\n【下一步操作指引】：原样输出上方确认卡后，立即调用提问工具等待用户确认：\n- 原生 ask_question：ask_question(questions: [{"question": "${qText}", "options": ${JSON.stringify(rawOptions)}}])\n- MCP ask_user_question：ask_user_question(questions: [{"id": "gemini_confirm", "question": "${qText}", "options": ${JSON.stringify(rawOptions.map((opt: string) => ({ label: opt })))}}])\n确认通过后，可按需查阅 SKILL.md 与 references/ 目录，并在上述 GUI 授权范围内调用 gemini_web_agent 执行。`
        },
      }

      scoped.tools.register(previewDef)
      scoped.tools.register({ ...previewDef, name: 'gemini-preview' })

      const toolDef = {
        name: 'gemini_web_agent',
        get description() {
          return `【🌐 Google 外部算力与多 Agent 执行网关 (v0.4)】
须在 gemini_preview + 用户确认后调用（未确认请求将被门禁拦截）。
支持单任务（aistudio / flow / lyria / gemini）及结构化多角色并发（site: "wave" + wave_tasks）。
受代码层护栏保护：遵守 GUI 模型阶梯与 Paid 过滤、gemini-spark 敏感文件剔除、.gemini-teams/ 会话隔离及 file:/// 本地落盘交付。`
        },
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              description: '交由 Gemini 网页端执行的任务指令与要求',
            },
            action: {
              type: 'string',
              description: '执行动作：execute (默认) 或 preview (仅预览确认卡)',
            },
            model: {
              type: 'string',
              description: '指定模型别名（如 hydrogen, flash, flash-lite, neon, nano-banana, lyria-3.5）',
            },
            site: {
              type: 'string',
              description: '目标站点：aistudio (默认), flow, lyria, gemini, 或 wave',
            },
            entry: {
              type: 'string',
              description: '入口模式：chat (默认), task, canvas, music, 或 wave',
            },
            thinking_level: {
              type: 'string',
              description: '思考等级：high (默认), medium, low, extra_high (PRO 账号可用)',
            },
            thinking_policy: {
              type: 'string',
              description: '思考策略：adaptive (默认), custom, strict',
            },
            timeout_sec: {
              type: 'number',
              description: '任务超时秒数（选填）',
            },
            new_chat: {
              type: 'boolean',
              description: '是否开启全新对话窗口（默认 false 延续会话）',
            },
            confirmed: {
              type: 'boolean',
              description: '是否已在聊天室获得用户确认（须为 true 才放行；未授权时将被门禁拦截）',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: '待挂载至网页端分析的本地文件路径列表（选填）',
            },
            resume: {
              type: 'boolean',
              description: 'Wave 断点续传：跳过当前会话花名册中已完成的角色',
            },
            project: {
              type: 'string',
              description: '可选：Wave 编队项目名称',
            },
            wave_tasks: {
              type: 'array',
              items: { type: 'object' },
              description: '可选：由主 AI 自由编排的 Wave 子任务数组 [{role, site, model, prompt, out_file, unpack_json_dir, thinking_level, files}]',
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
          const cfg = loadConfig()
          const overrides = buildOverridesFromArgs(args)

          if (args.action === 'preview') {
            const proposal = parseTaskToProposal(args.task, cfg, overrides)
            previewedTaskMap.set(getTaskKey(args.task), Date.now())
            return `${proposal.card}\n\n${formatAuthorizedConfigBrief(cfg)}`
          }

          const key = getTaskKey(args.task)
          const isExplicitConfirmed = args.confirmed === true || args.action === 'execute_confirmed'
          const hasBeenPreviewed = previewedTaskMap.has(key) && (Date.now() - (previewedTaskMap.get(key) || 0) < 10 * 60 * 1000)

          if (!isExplicitConfirmed && !hasBeenPreviewed && cfg.dispatchMode !== 'fast_track') {
            previewedTaskMap.set(key, Date.now())
            const proposal = parseTaskToProposal(args.task, cfg, overrides)
            const qText = proposal.question || '👉 请确认是否发包执行？'
            const rawOptions = proposal.options || ['(Recommended) 确认发包执行', '调整参数', '取消调度（本地作答）']
            return `${proposal.card}\n\n${formatAuthorizedConfigBrief(cfg)}\n\n🛑【安全门禁拦截】尚未向用户展示确认卡并取得授权，本次未向外部发包。请原样输出确认卡并调用提问工具（ask_question / ask_user_question）等待确认。`
          }

          previewedTaskMap.delete(key)

          let filesToPass = args.files
          if (!filesToPass || filesToPass.length === 0) {
            const proposal = parseTaskToProposal(args.task, cfg, overrides)
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
            sessionId,
            files: filesToPass,
            resume: Boolean(args.resume),
            waveTasks: Array.isArray(args.wave_tasks) ? args.wave_tasks : undefined,
            waveProject: args.project,
          })

          if (!res.ok) {
            if (res.error?.includes('CONGESTION_HALT')) {
              return `⚠️ 【Google 免费池排队拥塞警报】\n${res.error}\n\n💡 建议：目前 Google AI Studio 免费池处于高负载排队状态，可稍候重试或切换本地模型。`
            }
            return `❌ Gemini Web Agent 调度失败: ${res.error || '未知错误'}`
          }

          let notice = ''
          if (res.fellBack) {
            const initial = res.initialModel || '初始模型'
            const current = res.model || '备援模型'
            const pathDisplay = res.fallbackHistory || `\`${initial}\` ➔ 尖峰拥塞 ➔ \`${current}\``
            notice = `> 🔄 **【模型与渠道降级调度流程通知】**\n> - 原选模型/渠道：\`${initial}\`\n> - 调度路径：${pathDisplay}\n> - 最终交付渠道与模型：\`${current}\`\n\n`
          } else if (res.site === 'wave' || args.site === 'wave' || (Array.isArray(args.wave_tasks) && args.wave_tasks.length > 0)) {
            const waveLocation = res.waveDir ? `\n> - 📁 会话隔离交付目录：\`${res.waveDir}\`（可在面板确认后一键合并至项目）` : ''
            notice = `> 👥 **【Wave 虚拟外包工作室通知】**：本次波次已由 **Wave 并发波次引擎** 执行并解包完成。${waveLocation}\n\n`
          } else if (res.site === 'gemini' || args.site === 'gemini') {
            notice = `> 🌐 **【执行渠道通知】**：本次任务已由 **Gemini 官网通道 (gemini.google.com)** 执行完成。\n\n`
          } else if (res.site === 'flow' || args.site === 'flow') {
            notice = `> 🎨 **【执行渠道通知】**：本次任务已由 **Google Flow (flow.google.com)** 生成完成。\n\n`
          } else if (res.site === 'lyria' || args.site === 'lyria') {
            notice = `> 🎵 **【执行渠道通知】**：本次任务已由 **Google AI Studio Lyria 音乐台** 生成完成。\n\n`
          }

          let fileLinks = ''
          if (res.files && res.files.length > 0) {
            const linkItems = res.files.map((f: string) => {
              const base = path.basename(f)
              const fileUrl = `file://${f}`
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(base)
              return isImg
                ? `- [📁 ${base}](${fileUrl})\n\n  ![${base}](${fileUrl})`
                : `- [📁 ${base}](${fileUrl})`
            })
            fileLinks = '📁 **成果文件已落地存档至本地工作区**：\n' + linkItems.join('\n') + '\n\n'
          }

          const instructionHeader = `【交付提示：请在最终回复中保留降级通知（若有）与 file:/// 落地文件绝对路径链接；若完整源码已存盘，展示关键架构说明并引导点击文件链接即可，无需全量重抄超长代码以防 SSE 截断。】\n\n`

          let displayOutput = res.output || ''
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

  // 3. 註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter(ctx)
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
