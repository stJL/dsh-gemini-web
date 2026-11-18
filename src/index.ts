import path from 'node:path'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask } from './bridge/agent-executor.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'commands', 'webServer']

export function apply(ctx: any) {
  // 1. 註冊 DSH 核心代理工具: gemini_web_agent
  ctx.inject(['tools'], (scoped: any) => {
    try {
      scoped.tools.register({
        name: 'gemini_web_agent',
        description: `調度外部已登入的 Chrome/Brave 瀏覽器，使用 Google AI Studio、Google Flow 與 Gemini Web 的免費額度執行任務。
能力覆蓋：
- 深度架構規劃與複雜代碼分析（Gemini 4 Argon）
- 1M 超長上下文推理與長文長代碼輸出（Gemini 4 Hydrogen / 3.8 Flash）
- 極速高通量輕量推理（Gemini 3.5 Flash Lite）
- 原生生圖與多輪改圖（Nano Banana 2.1，0 點數）
- 帶音頻視頻生成（Omni 1.2 Flash / Veo 3.1）
- 完整歌曲創作（Lyria 3.5，~3min MP3）
- 語音合成捏音色與雙人劇本配音（Gemini 3.8 Flash TTS）

【重要：Google 免費池尖峰塞車提示】
Google AI Studio 的所有免費模型在尖峰時段均可能遇到免費池塞車、Thinking 卡住或伺服器暫不可用（'Model isn't available right now'）。
若遇到此類情況，外掛支援自動降級切換至 Gemini 3.5 Flash Lite 或 3.8 Flash 快速出結果。`,
        parameters: {
          task: {
            type: 'string',
            required: true,
            description: '交由 Gemini 網頁端執行的完整任務指令、需求描述與要求',
          },
          model: {
            type: 'string',
            required: false,
            description: '指定調度的模型別名（選填，預設依外掛設定，如 flash-lite, flash, hydrogen, argon, nano2.1, omni1.2, lyria 等）',
          },
          site: {
            type: 'string',
            required: false,
            description: '目標站點：aistudio (預設), flow, 或 gemini',
          },
          thinking_level: {
            type: 'string',
            required: false,
            description: '思考等級：high (預設), extra-high, medium, 或 low',
          },
          new_chat: {
            type: 'boolean',
            required: false,
            description: '是否開啟全新對話視窗（若為 true 則重置為全新聊天室，預設為 false 延續對話）',
          },
        },
        async execute(args: any, exec?: any) {
          const sessionId = exec?.agent?.id || exec?.agent?.sessionId || exec?.sessionId
          const res = await executeAgentTask({
            task: args.task,
            model: args.model,
            site: args.site,
            thinkingLevel: args.thinking_level,
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
            notice = `\n\n> ⚠️ *提示：原選模型遭遇 Google 免費池尖峰塞車，已自動為您無縫降級至備援模型 ${res.model} 完成輸出。*\n\n`
          }
          let fileLinks = ''
          if (res.files && res.files.length > 0) {
            fileLinks = '\n\n📁 **多模態檔案落地**：\n' + res.files.map((f: string) => `- [${path.basename(f)}](file://${f})`).join('\n')
          }
          return `${notice}${res.output}${fileLinks}`
        },
      })
    } catch (e) {
      console.error('Failed to register gemini_web_agent tool:', e)
    }
  })

  // 2. 註冊便捷斜槓指令: /gemini-web (別名 /gw)
  ctx.inject(['commands'], (scoped: any) => {
    try {
      scoped.commands.register({
        name: 'gemini-web',
        alias: ['gw'],
        description: '調度 Gemini 網頁端 (AI Studio / Flow / Gemini) 執行高難度推理或多模態任務（支援 --new 開新話題）',
        input: { hint: '[--new] <任務描述>' },
        async handler(invocation: any) {
          let prompt = (invocation.rawInput ?? '').trim()
          let newChat = false
          if (prompt.startsWith('--new')) {
            newChat = true
            prompt = prompt.replace(/^--new\s*/, '').trim()
          }
          if (!prompt) {
            return {
              kind: 'error',
              text: '請輸入任務內容，例如：/gw 幫我用 4 Argon 規劃微服務架構，或 /gw --new 開新話題',
            }
          }
          const res = await executeAgentTask({ task: prompt, newChat })
          if (!res.ok) {
            return { kind: 'error', text: `執行失敗: ${res.error}` }
          }
          let fallbackNote = ''
          if (res.fellBack) {
            fallbackNote = `> ⚠️ *原模型免費池塞車，已自動切換至 ${res.model}*\n\n`
          }
          return {
            kind: 'success',
            text: `${fallbackNote}${res.output}`,
          }
        },
      })
    } catch (e) {
      console.error('Failed to register gemini-web command:', e)
    }
  })

  // 3. 機會性註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter()
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
