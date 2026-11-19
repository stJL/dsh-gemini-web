import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'commands', 'webServer']

export function apply(ctx: any) {
  // 1. 註冊 DSH 核心代理工具: gemini_web_agent 與 gemini-web-agent
  ctx.inject(['tools'], (scoped: any) => {
    try {
      const toolDef = {
        name: 'gemini_web_agent',
        description: `【Gemini Web Agent 主模型調度窗口 / Primary Web Model Gateway】
調度外部已登入的 Chrome/Brave/Edge 瀏覽器，使用 Google AI Studio、Google Flow 與 Gemini Web 的免費額度執行任務。

【能力覆蓋】
- 深度架構規劃與複雜代碼分析（Gemini 4 Argon / Hydrogen，具備 150 秒推演空間）
- 1M~2M 超長上下文推理與長文長代碼輸出（Gemini 4 Hydrogen / 3.8 Flash）
- 極速高通量輕量推理（Gemini 3.5 Flash Lite）
- 原生 2K 高清生圖與改圖（Google Flow Nano Banana 2.1，0 點數特權）
- 帶音頻視頻生成（Google Flow Omni 1.2 Flash / Veo 3.1）
- 完整歌曲創作（Lyria 3.5，~3min MP3）
- 語音合成捏音色與雙人劇本配音（Gemini 3.8 Flash TTS）
- 即時聯網檢索、結構化圖表與行程畫布規劃（Gemini 官網 Task / Canvas 模式）

【🚨 最高優先級調用鐵律 (STRICT MANDATORY POLICY)】
1. 🛑【明令禁止本地擅自代勞】：當使用者在提示詞中明確提到「gemini_web_agent」、「gemini-web-agent」、「gemini-web」、「gw」、「Gemini 網頁端」、「Google 網頁」、「AI Studio」、「Google Flow」或指定了相關模型（Hydrogen, Argon, Neon, Flash, Nano Banana, Omni, Lyria, TTS 等）時，本地 AI 模型（DeepSeek / Claude / GPT）**絕對嚴格禁止在本地自行編寫答案或擅自代勞！必須 100% 無條件立刻調用本工具委派給 Google 網頁端執行**！
2. 💡【使用動機覆蓋】：使用者指定使用本工具，即代表其有「節省本地 Token 配額」、「使用 Google 免費層級 (key_off)」、「利用 1M 超大上下文」或「需要多模態落地」之明確意圖，本地模型不得以「自己也能回答」為由攔截，必須嚴格服從用戶意志調用本工具！
3. ⚡【極速直通，嚴禁前置思考與環境探測】：底層瀏覽器連線、AgentLimb 轉發與進程狀態已由外掛背景 Daemon 100% 全自動託管。本地模型在收到任務後，**嚴禁在調用前執行端口掃描、進程檢查、環境排錯、額度巡檢或長篇推理**，第一步直接呼叫本工具，0 思考開銷立刻交差！
4. 📦【結果如實傳遞】：調用完成後，將網頁端回傳之成果（含代碼與落地檔案超連結）完整呈現給使用者，嚴禁擅自吞噬或覆蓋。`,
        parameters: {
          task: {
            type: 'string',
            required: true,
            description: '交由 Gemini 網頁端執行的完整任務指令、需求描述與要求',
          },
          model: {
            type: 'string',
            required: false,
            description: '指定調度的模型別名（選填，如 hydrogen, argon, flash, flash-lite, nano2.1, omni1.2, lyria 等）',
          },
          site: {
            type: 'string',
            required: false,
            description: '目標站點：aistudio (預設，代碼與長文本), flow (生圖生視頻，Nano 2.1 享 0 點數), 或 gemini (官網對話與 task 模式)',
          },
          entry: {
            type: 'string',
            required: false,
            description: '入口模式：chat (預設對話), task (Gemini 官網任務與畫布模式)',
          },
          thinking_level: {
            type: 'string',
            required: false,
            description: '思考等級：high (預設穩定), medium, 或 low。注意：extra-high 已封印，避免免費池引發 Permission Denied 錯誤',
          },
          thinking_policy: {
            type: 'string',
            required: false,
            description: '思考閾值策略：adaptive (智慧自適應，預設), custom (自定義超時), strict (嚴格模式不降級)',
          },
          timeout_sec: {
            type: 'number',
            required: false,
            description: '任務超時限制秒數 (自定義模式下生效，如 240)',
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
            notice = `\n\n> ⚠️ *提示：原選模型遭遇 Google 免費池尖峰塞車，已自動為您無縫降級至備援模型 ${res.model} 完成輸出。*\n\n`
          }
          let fileLinks = ''
          if (res.files && res.files.length > 0) {
            fileLinks = '\n\n📁 **多模態檔案落地**：\n' + res.files.map((f: string) => `- [${path.basename(f)}](file://${f})`).join('\n')
          }
          return `${notice}${res.output}${fileLinks}`
        },
      }

      scoped.tools.register(toolDef)
      scoped.tools.register({ ...toolDef, name: 'gemini-web-agent' })
    } catch (e) {
      console.error('Failed to register gemini_web_agent tool:', e)
    }
  })

  // 2. 封印斜槓指令: 統一引導至聊天室主窗口，徹底消除單向 CLI 與聊天室的割裂感
  ctx.inject(['commands'], (scoped: any) => {
    try {
      const sealedHandler = async () => {
        return {
          kind: 'info',
          text:
            '💡【/gw 斜槓指令已封印・全面統一回歸聊天室對話】\n\n' +
            '為提供完整的實時思考可視化、代碼高亮與多輪連續追問體驗，原先單向的 `/gw` 斜槓指令已正式封印！\n\n' +
            '👉 **推薦主模型呼叫窗口**：\n' +
            '請直接在當前（或左側「+ 新對話」）聊天室中，**不要加斜槓**，直接向 AI 發送需求即可，例如：\n' +
            '• *「請幫我用 Gemini 4 Hydrogen 寫 C++20 紅黑樹」*\n' +
            '• *「請調用 gemini-web-agent 幫我設計分散式系統」*\n' +
            '• *「請用 Google Flow 生成一張賽博龐克高科技能量核心圖片」*\n\n' +
            '宿主 AI 會直接在聊天室內調用 `gemini-web-agent`，並將完整推演過程與程式碼即時打印在對話框中！',
        }
      }

      scoped.commands.register({
        name: 'gw',
        description: '【已封印】Gemini Web Agent 已統一升級為聊天室自然語言調用窗口',
        handler: sealedHandler,
      })
      scoped.commands.register({
        name: 'gemini-web',
        description: '【已封印】Gemini Web Agent 已統一升級為聊天室自然語言調用窗口',
        handler: sealedHandler,
      })
    } catch (e) {
      console.error('Failed to register sealed gw command:', e)
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
