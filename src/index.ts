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
1. 🛑【明令禁止本地擅自代勞與 Subagent 劫持】：
   - 當使用者在提示詞中明確提到「gemini_web_agent」、「gemini-web-agent」、「gemini-web」、「gw」、「Gemini 網頁端」、「Google 網頁」、「AI Studio」、「Google Flow」、指定相關模型（Hydrogen, Argon, Neon, Flash, Nano Banana, Omni, Lyria, TTS 等），或提出需要高算力架構推演、C++/Rust/Python 高效能演算法（如無鎖佇列、線程池、記憶體模型）等複雜編程任務時：
   - **嚴禁在本地自行編寫答案或擅自代勞**！
   - **嚴禁調用 subagent 或 list_subagent_models 打付費 Google API 路由**！使用者的核心訴求是使用外部瀏覽器的【零 Token 免費池 (key_off)】，嚴禁偷開 subagent 消耗用戶本地付費配額！
2. 💡【使用動機覆蓋】：使用者指定使用本工具，即代表其有「節省本地 Token 配額」、「使用 Google 免費層級 (key_off)」、「利用 1M 超大上下文」或「需要多模態落地」之明確意圖，本地模型不得以「自己也能回答」為由攔截，必須嚴格服從用戶意志！
3. 🛡️【先問後用提案工作流 (原作者規範)】：
   - 當處於「先問後用模式」且用戶未附帶直通標籤時，宿主 AI 可先輸出調度提案（包含推薦渠道 site、入口 entry、模型 model、思考等級 thinking_level、話題隔離 new_chat 與 0 成本預算），待用戶確認後（回覆「確認」、「1」或調整參數）立即發包調用本工具；
   - ⚡【例外直通（原作者規定：明確指定則直接跑）】：若用戶指令中包含「/gw」、「[免確認]」、「直接發包」、「立即執行」等直通意圖，或設定為極速直通模式時，無需二次確認，第一時間直接呼叫本工具！
4. 📦【結果如實傳遞】：調用完成後，將網頁端回傳之成果（含代碼與落地檔案超連結）完整呈現給使用者，嚴禁擅自吞噬或覆蓋。`,
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

  // 2. 機會性註冊 WebServer 路由 (供設定面板 API 調用)
  ctx.inject(['webServer'], (scoped: any) => {
    const router = createApiRouter()
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/gemini-web', handler: router }),
      'gemini-web: api routes'
    )
  })
}
