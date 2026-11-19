import path from 'node:path'
import fs from 'node:fs'
import { createApiRouter } from './transport/router.js'
import { executeAgentTask, getWorkspaceDownloadDir } from './bridge/agent-executor.js'

export const name = 'dsh-gemini-web'
export const inject = ['tools', 'commands', 'webServer']

export function apply(ctx: any) {
  // 1. 註冊 DSH 核心代理工具: gemini_web_agent
  ctx.inject(['tools'], (scoped: any) => {
    try {
      scoped.tools.register({
        name: 'gemini_web_agent',
        description: `調度外部已登入的 Chrome/Brave/Edge 瀏覽器，使用 Google AI Studio、Google Flow 與 Gemini Web 的免費額度執行任務。

【能力覆蓋】
- 深度架構規劃與複雜代碼分析（Gemini 4 Argon / Hydrogen）
- 1M~2M 超長上下文推理與長文長代碼輸出（Gemini 4 Hydrogen / 3.8 Flash）
- 極速高通量輕量推理（Gemini 3.5 Flash Lite）
- 原生 2K 高清生圖與改圖（Google Flow Nano Banana 2.1，0 點數特權）
- 帶音頻視頻生成（Google Flow Omni 1.2 Flash / Veo 3.1）
- 完整歌曲創作（Lyria 3.5，~3min MP3）
- 語音合成捏音色與雙人劇本配音（Gemini 3.8 Flash TTS）
- 即時聯網檢索、結構化圖表與行程畫布規劃（Gemini 官網 Task / Canvas 模式）

【🚨 最高優先級調用鐵律 (STRICT MANDATORY POLICY)】
1. 🛑【明令禁止本地擅自代勞】：當使用者在提示詞中明確提到「gemini_web_agent」、「gemini-web」、「gw」、「Gemini 網頁端」、「Google 網頁」、「AI Studio」、「Google Flow」或指定了相關模型（Hydrogen, Argon, Neon, Flash, Nano Banana, Omni, Lyria, TTS 等）時，本地 AI 模型（DeepSeek / Claude / GPT）**絕對嚴格禁止在本地自行編寫答案或擅自代勞！必須 100% 無條件立刻調用本工具委派給 Google 網頁端執行**！
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

  // 2. 註冊便捷斜槓指令: /gemini-web 與 /gw
  // 重要相容性修復：DSH 的 @deepseek-ai/dsh-commands 底層僅按 name 索引，完全不解析 alias！
  // 必須將 "gemini-web" 與 "gw" 分別註冊為獨立的頂級命令，徹底防止 /gw 被當成普通文字穿透。
  ctx.inject(['commands'], (scoped: any) => {
    try {
      const commandHandler = async (invocation: any) => {
        let raw = (invocation.rawInput ?? '').trim()
        let newChat = false
        if (raw.startsWith('--new')) {
          newChat = true
          raw = raw.replace(/^--new\s*/, '').trim()
        }
        if (!raw) {
          return {
            kind: 'error',
            text: '請輸入任務內容，例如：/gw 幫我用 4 Hydrogen 寫快速排序，或 /gw --new 開新話題',
          }
        }

        // 解析提示詞中的模型與站點意圖（支援命令行旗標與自然語言關鍵字提取）
        let model: string | undefined = undefined
        let site: 'aistudio' | 'flow' | 'gemini' | undefined = undefined

        // 1. 旗標匹配 (--model, --site, --thinking)
        const modelMatch = raw.match(/--model\s+([^\s]+)/i)
        if (modelMatch) {
          model = modelMatch[1]
          raw = raw.replace(/--model\s+[^\s]+/i, '').trim()
        }
        const siteMatch = raw.match(/--site\s+([^\s]+)/i)
        if (siteMatch) {
          site = siteMatch[1] as any
          raw = raw.replace(/--site\s+[^\s]+/i, '').trim()
        }
        let thinkingLevel: string | undefined = undefined
        const thinkingMatch = raw.match(/--thinking(?:-level)?\s+([^\s]+)/i)
        if (thinkingMatch) {
          thinkingLevel = thinkingMatch[1].toLowerCase()
          if (thinkingLevel.includes('extra') || thinkingLevel === 'xhigh' || thinkingLevel === 'max') {
            thinkingLevel = 'high' // 封印 Extra High
          }
          raw = raw.replace(/--thinking(?:-level)?\s+[^\s]+/i, '').trim()
        }

        let thinkingPolicy: 'adaptive' | 'custom' | 'strict' | undefined = undefined
        const policyMatch = raw.match(/--(?:thinking-)?policy\s+([^\s]+)/i)
        if (policyMatch) {
          const p = policyMatch[1].toLowerCase()
          if (p === 'adaptive' || p === 'custom' || p === 'strict') thinkingPolicy = p
          raw = raw.replace(/--(?:thinking-)?policy\s+[^\s]+/i, '').trim()
        }

        let timeoutSec: number | undefined = undefined
        const timeoutMatch = raw.match(/--timeout\s+(\d+)/i)
        if (timeoutMatch) {
          timeoutSec = parseInt(timeoutMatch[1], 10)
          raw = raw.replace(/--timeout\s+\d+/i, '').trim()
        }

        let noFallback = false
        if (/--(?:no-fallback|strict)\b/i.test(raw)) {
          noFallback = true
          thinkingPolicy = 'strict'
          raw = raw.replace(/--(?:no-fallback|strict)\b/i, '').trim()
        }

        // 2. 自然語言意圖提取 (防止用戶說了 "用 Gemini 4 Hydrogen" 卻被誤送給預設模型)
        if (!model) {
          if (/hydrogen/i.test(raw)) model = 'gemini-4-hydrogen'
          else if (/argon/i.test(raw)) model = 'gemini-4-argon'
          else if (/flash-lite|3\.5 flash/i.test(raw)) model = 'gemini-3.5-flash-lite'
          else if (/flash/i.test(raw)) model = 'gemini-3.8-flash'
          else if (/nano|banana/i.test(raw)) { model = 'gemini-nano-banana-2.1'; site = site || 'flow' }
          else if (/omni/i.test(raw)) { model = 'gemini-omni-1.2-flash'; site = site || 'flow' }
          else if (/lyria/i.test(raw)) model = 'lyria-3.5'
        }
        if (!site) {
          if (/flow\.google|google flow|\bflow\b/i.test(raw)) site = 'flow'
          else if (/gemini\.google|gemini 官網/i.test(raw)) site = 'gemini'
        }

        // 清理提示詞中指定模型口吻，避免 Google 網頁端模型誤以為用戶要用 "Gemini 4 Hydrogen" 這種「程式語言」來寫代碼
        const cleanTask = raw.replace(/(?:請|幫我)?(?:使用|用)\s*(?:Gemini\s*4\s*)?(?:Hydrogen|Argon|Flash|Flash\s*Lite)\s*(?:來|去)?/gi, '請').trim() || raw

        const res = await executeAgentTask({
          task: cleanTask,
          model,
          site,
          thinkingLevel,
          thinkingPolicy,
          timeoutSec,
          noFallback,
          newChat,
        })
        if (!res.ok) {
          return { kind: 'error', text: `執行失敗: ${res.error}` }
        }

        // 自動落地輸出檔案至工作區 downloads/ 目錄，確保長代碼永久留存
        const timestamp = Math.floor(Date.now() / 1000)
        let savedFileNote = ''
        try {
          const downloadDir = getWorkspaceDownloadDir()
          if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })
          const out = res.output || ''
          const isCpp = out.includes('```cpp') || out.includes('```c++')
          const isPy = out.includes('```py')
          const isJs = out.includes('```js') || out.includes('```ts')
          const ext = isCpp ? 'cpp' : (isPy ? 'py' : (isJs ? 'ts' : 'md'))
          const fileName = `gw_output_${timestamp}.${ext}`
          const filePath = path.join(downloadDir, fileName)
          fs.writeFileSync(filePath, out, 'utf-8')
          savedFileNote = `\n\n📁 本地落地檔案：[${fileName}](file://${filePath})`
        } catch {}

        let fallbackNote = ''
        if (res.fellBack) {
          fallbackNote = `> ⚠️ *原模型免費池塞車，已自動切換至 ${res.model}*\n\n`
        }

        const modelDisplay = res.model || model || 'Gemini'
        const headerSummary = `✅ [${modelDisplay}] 任務執行成功（點擊卡片展開完整內容${savedFileNote ? '，已落地至工作區 downloads/' : ''}）\n\n`

        return {
          kind: 'success',
          text: `${headerSummary}${fallbackNote}${res.output}${savedFileNote}`,
        }
      }

      // 僅註冊精簡指令 /gw，避免與全名指令重複佔用斜槓選單
      scoped.commands.register({
        name: 'gw',
        description: '調度 Gemini 網頁端 (AI Studio / Flow / Gemini) 執行高難度推理或多模態任務（支援 --new 開新話題）',
        input: { hint: '[--new] [--model <model>] [--site <site>] <任務描述>' },
        handler: commandHandler,
      })
    } catch (e) {
      console.error('Failed to register gw command:', e)
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
