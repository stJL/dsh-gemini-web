import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'webServer']

export function apply(ctx: any) {
  // 1. 註冊 DSH 核心代理工具: gemini_web_agent 與 gemini-web-agent
  ctx.inject(['tools'], (scoped: any) => {
    try {
      const toolDef = {
        name: 'gemini_web_agent',
        description: `【🚨 Google 外部免費算力與多模態網關 / 嚴格先問後用規範】
【🚨 致命調用前置條件 - 嚴禁擅自提前發包】：
本工具嚴格遵循原作者「一律先問後用」規範。在使用者提出任何需求後，你【絕對禁止】在第 1 步直接調用本工具！
你必須在第 1 步先在聊天中輸出【Gemini Web Agent 調度提案卡】（列出推薦渠道 site、入口 entry、模型 model、思考等級 thinking_level、話題隔離 new_chat 與 0 成本預算），並在此【停止當前回應】，等待使用者確認！
只有當使用者回覆「確認」、「1」，或使用者的提問指令中明確包含直通標籤（如「[免確認]」、「直接發包」）時，才允許在下一輪調用本工具！
1. 🛑【明令禁止本地擅自代勞】：嚴禁在本地自行編寫答案或擅自代勞作答！
2. 🛑【嚴禁 Subagent 劫持】：嚴禁調用 subagent 或 list_subagent_models 打付費 Google API 路由！使用者的核心訴求是使用外部瀏覽器的【零 Token 免費池 (key_off)】！
3. 📦【調用完成後的展示義務】：調用完成後，必須完整呈現降級流程通知、落地檔案超連結以及核心架構說明與程式碼！`,
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              description: '交由 Gemini 網頁端執行的完整任務指令、需求描述與要求',
            },
            model: {
              type: 'string',
              description: '指定調度的模型別名（選填，如 hydrogen, argon, flash, flash-lite, nano2.1, omni1.2, lyria 等）',
            },
            site: {
              type: 'string',
              description: '目標站點：aistudio (預設，代碼與長文本), flow (生圖生視頻，Nano 2.1 享 0 點數), 或 gemini (官網對話與 task 模式)',
            },
            entry: {
              type: 'string',
              description: '入口模式：chat (預設對話), task (Gemini 官網任務與畫布模式)',
            },
            thinking_level: {
              type: 'string',
              description: '思考等級：high (預設穩定), medium, 或 low。注意：extra-high 已封印，避免免費池引發 Permission Denied 錯誤',
            },
            thinking_policy: {
              type: 'string',
              description: '思考閾值策略：adaptive (智慧自適應，預設), custom (自定義超時), strict (嚴格模式不降級)',
            },
            timeout_sec: {
              type: 'number',
              description: '任務超時限制秒數 (自定義模式下生效，如 240)',
            },
            new_chat: {
              type: 'boolean',
              description: '是否開啟全新對話視窗（若為 true 則重置為全新聊天室，預設為 false 延續對話）',
            },
          },
        },
        output: {
          schema: {
            type: 'string',
            description: 'Gemini 網頁端執行產出成果',
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
          })
          if (!res.ok) {
            if (res.error?.includes('CONGESTION_HALT')) {
              return `⚠️ 【Google 免費池壅塞警報】\n${res.error}\n\n💡 建議：目前 Google AI Studio 免費池處於高負載排隊狀態。您可以稍候幾分鐘後重試，或者切換為本地 DeepSeek 模型繼續進行。`
            }
            return `❌ Gemini Web Agent 調度失敗: ${res.error || '未知錯誤'}`
          }
          let notice = ''
          if (res.fellBack) {
            const initial = res.initialModel || '初始模型'
            const current = res.model || '備援模型'
            const pathDisplay = res.fallbackHistory || `\`${initial}\` ➔ 尖峰塞車 ➔ \`${current}\``
            notice = `> 🔄 **【模型與渠道降級調度流程通知】**\n> - 原選模型/渠道：\`${initial}\`（遭遇 Google AI Studio 免費池尖峰塞車）\n> - 階梯調度路徑：${pathDisplay}\n> - 最終交付渠道與模型：\`${current}\`（推演與代碼生成成功）\n\n`
          } else if (res.site === 'gemini' || args.site === 'gemini') {
            notice = `> 🌐 **【執行渠道通知】**：本次任務已由 **Gemini 官網通道 (gemini.google.com)** 順利執行完成。\n\n`
          }
          let fileLinks = ''
          if (res.files && res.files.length > 0) {
            fileLinks = '📁 **成果檔案已落地存檔至本地工作區**：\n' + res.files.map((f: string) => `- [${path.basename(f)}](file://${f})`).join('\n') + '\n\n'
          }
          const instructionHeader = `【🚨 系統核心指令：請宿主 AI 在最終回覆中務必完整呈現：
1. 🔄【模型降級調度流程通知】（若有降級）；
2. 📁【落地檔案存檔連結】（引導使用者點擊開啟本地工作區完整源碼）；
3. 💻【核心架構說明與關鍵程式碼精華】（展示核心類別、重要演算法實作與註釋，嚴禁僅回覆一句話摘要）！】\n\n`
          return `${instructionHeader}${notice}${fileLinks}${res.output}`
        },
      }

      scoped.tools.register(toolDef)
      scoped.tools.register({ ...toolDef, name: 'gemini-web-agent' })
    } catch (e) {
      console.error('Failed to register gemini_web_agent tool:', e)
    }
  })

  // 2. 機會性註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter()
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
