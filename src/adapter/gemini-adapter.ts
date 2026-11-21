import { streamPrompt, StreamPromptOptions } from '../bridge/runner.js'

export const PROVIDER_ID = 'gemini-web'

export interface ReasoningEffortOption {
  id: string
  name: string
  description?: string
}

const EFFORT_META: Record<string, { name: string; description: string }> = {
  off: { name: 'Off', description: '關閉思考 (僅輸出最終回答)' },
  low: { name: 'Low', description: '輕量思考 (快速響應)' },
  medium: { name: 'Medium', description: '中度思考 (日常平衡)' },
  high: { name: 'High', description: '深度思考 (程式碼與架構邏輯)' },
  xhigh: { name: 'Extra High', description: '極限思考 (超長推理推演)' },
  max: { name: 'Max', description: '滿血極限思考 (最大思考深度)' },
}

export function formatEfforts(efforts?: string[]): ReasoningEffortOption[] | undefined {
  if (!efforts || efforts.length === 0) return undefined
  return efforts.map((id) => ({
    id,
    name: EFFORT_META[id]?.name ?? (id.charAt(0).toUpperCase() + id.slice(1)),
    description: EFFORT_META[id]?.description ?? `思考等級 ${id}`,
  }))
}

/**
 * 完整官方全分類模型預載目錄（覆蓋主力推理、生圖、生視頻、作曲、TTS、調研與 Gemma）
 */
export const BUILTIN_MODELS = [
  // ── 主力推理 (Reasoning & Coding) ──
  {
    id: 'gemini-4-neon',
    name: 'Gemini 4 Neon (Web)',
    description: 'AI Studio 網頁免費額度 · 4 Neon 超高性價比旗艦推理',
    contextWindow: 1048576,
    maxOutput: 65536,
    inputModalities: ['text'],
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen (Web)',
    description: 'AI Studio 網頁免費額度 · 1M 最長輸出 · 高頻推理與 Agentic 默認主力',
    contextWindow: 1048576,
    maxOutput: 65536,
    inputModalities: ['text'],
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon (Web)',
    description: 'AI Studio 網頁免費額度 · 滿血架構規劃與高難程式碼分析 · 思考拉滿',
    contextWindow: 1048576,
    maxOutput: 65536,
    inputModalities: ['text'],
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Web)',
    description: 'AI Studio 網頁免費額度 · 旗艦極速 Flash 模型',
    contextWindow: 1048576,
    maxOutput: 65536,
    inputModalities: ['text'],
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite (Web)',
    description: 'AI Studio 網頁免費額度 · 輕量級極速文字處理',
    contextWindow: 524288,
    maxOutput: 32768,
    inputModalities: ['text'],
  },
  {
    id: 'gemini-decision-1',
    name: 'Gemini Decision 1 (Web)',
    description: '極速校驗、評分與邏輯決策專用模型',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text'],
  },

  // ── 智能體與長程調研 (Agents & Deep Research) ──
  {
    id: 'deep-research-preview-04-2026',
    name: 'Deep Research Preview (Web)',
    description: 'AI Studio 網頁免費額度 · 自帶 Google Search + 深度網頁長程調研',
    contextWindow: 524288,
    maxOutput: 32768,
    inputModalities: ['text'],
  },
  {
    id: 'deep-research-max-preview-04-2026',
    name: 'Deep Research Max (Web)',
    description: 'AI Studio 網頁免費額度 · 最長程多維度深度搜索研報',
    contextWindow: 1048576,
    maxOutput: 65536,
    inputModalities: ['text'],
  },

  // ── 圖像生成與編輯 (Images) ──
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1 (Google Flow 0點數 / AI Studio)',
    description: '最新原生生圖/多輪一致改圖，Flow 每天免費數十張，支援 2K 高清重塑',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Nano Banana Pro (Web 生圖)',
    description: '高畫質細膩生圖與藝術渲染',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2 (Web 生圖)',
    description: '極速出圖與輕量視覺生成',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text', 'image'],
  },

  // ── 視頻生成 (Video) ──
  {
    id: 'gemini-omni-1.2-flash',
    name: 'Omni 1.2 Flash (Web 生視頻)',
    description: 'AI Studio 網頁免費生成最長 15s 視頻（自帶原生音訊）',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gemini-omni-1.1-flash',
    name: 'Omni 1.1 Flash (Web 生視頻)',
    description: '關鍵幀控制與場景延展視頻生成',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text', 'image'],
  },

  // ── 音樂創作 (Music) ──
  {
    id: 'lyria-3.5',
    name: 'Lyria 3.5 (Web 完整歌曲)',
    description: 'AI Studio 網頁免費生成 ~3 分鐘完整歌曲（含人聲與編曲，導出 MP3）',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'lyria-3-pro-preview',
    name: 'Lyria 3 Pro Preview (Web 複雜曲式)',
    description: '複雜多段落管弦/電子樂長篇編曲',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text'],
  },

  // ── 語音合成與轉寫 (Audio & Speech) ──
  {
    id: 'gemini-3.8-flash-tts',
    name: 'Gemini 3.8 Flash TTS (Web 語音捏音色)',
    description: 'Voice Design 雙人劇本對話、情緒標籤語音合成（導出 WAV）',
    contextWindow: 131072,
    maxOutput: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'gemini-3.5-transcribe',
    name: 'Gemini 3.5 Transcribe (Web 音訊轉寫)',
    description: '靜態長音訊高精度結構化語音轉文字',
    contextWindow: 524288,
    maxOutput: 32768,
    inputModalities: ['text'],
  },

  // ── 開放權重模型 (Gemma Open Weights) ──
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT (Web)',
    description: 'Google 最新開放權重長上下文指令調優模型',
    contextWindow: 262144,
    maxOutput: 16384,
    inputModalities: ['text'],
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B A4B IT (Web MoE)',
    description: 'MoE 稀疏架構高能效長上下文模型',
    contextWindow: 262144,
    maxOutput: 16384,
    inputModalities: ['text'],
  },
]

function extractCleanText(content: any): string {
  if (!content) return ''
  if (typeof content === 'string') {
    const trimmed = content.trim()
    // 解開 DSH 可能傳遞的字串化 JSON 陣列，如 '[{"type":"text","text":"..."}]'
    if (trimmed.startsWith('[{') && trimmed.endsWith('}]')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return extractCleanText(parsed)
        }
      } catch {}
    }
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (!part) return ''
        if (typeof part === 'string') return part
        if (typeof part === 'object') {
          if (part.text) return String(part.text)
          if (part.type === 'text' && part.text) return String(part.text)
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof content === 'object') {
    if (content.text) return String(content.text)
  }
  return String(content)
}

function stripSyntheticMetadata(text: string): string {
  if (!text) return ''
  let cleaned = text
  // 移除 DSH 每開新對話第一輪自動注入的環境時間取樣字串
  cleaned = cleaned.replace(/Time sampled while preparing turn[\s\S]*?Elapsed since the preceding model-visible message:[^\n]*\n*/gi, '')
  cleaned = cleaned.replace(/Browser time zone for this request:[^\n]*\n*/gi, '')
  cleaned = cleaned.replace(/Elapsed since the preceding model-visible message:[^\n]*\n*/gi, '')
  return cleaned.trim()
}

function isSyntheticDshMessage(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (trimmed.startsWith('[model changed:') && trimmed.endsWith(']')) return true
  if (trimmed.includes('assistant turns above this point were generated by')) return true
  if (trimmed.includes('Time sampled while preparing turn') && trimmed.includes('Browser time zone for this request')) {
    const stripped = stripSyntheticMetadata(trimmed)
    if (!stripped) return true
  }
  if (trimmed.startsWith('Time sampled while preparing turn') && !stripSyntheticMetadata(trimmed)) return true
  return false
}

function isTitleGenerationPrompt(text: string): boolean {
  if (!text) return false
  return /Generate the session title from this JSON array/i.test(text)
    || /Generate a title for this conversation/i.test(text)
    || /Generate a concise title/i.test(text)
    || /Create a short title for/i.test(text)
}

export class GeminiWebAdapter {
  private dynamicModels = new Map<string, any>()

  constructor() {
    for (const m of BUILTIN_MODELS) {
      this.dynamicModels.set(m.id, m)
    }
  }

  providerInfo(provider: string) {
    return {
      id: provider,
      name: 'Gemini 網頁端 (Brave / Chrome)',
      description: '全模態免費配額池：文字推理、1M長輸出、Nano生圖、Omni生視頻、Lyria音樂、TTS配音',
    }
  }

  /**
   * 重試策略（DSH 內核必選契約）
   */
  providerRetryPolicy(_provider?: string) {
    return {
      mode: 'normal',
      maxRetries: 2,
      retryableCodes: ['TIMEOUT', 'PROCESS_EXIT', 'INVALID_OUTPUT', 'RATE_LIMIT', 'NETWORK', 'OVERLOADED', 'EMPTY_RESPONSE', 'SERVER', 'TRANSPORT'],
      initialDelayMs: 1000,
      maxDelayMs: 15000,
      jitterRatio: 0.1,
    }
  }

  /**
   * 圖片請求計費中繼資料
   */
  imageRequestPricing(_provider?: string, _model?: string) {
    return {
      pricingModel: 'free',
      pricePerUnit: 0,
    }
  }

  /**
   * 列出當前可用模型清單（內建 + 動態發現）
   */
  async listModels(provider: string) {
    return Array.from(this.dynamicModels.values()).map((m) => ({
      provider,
      id: m.id,
      name: m.name,
      description: m.description,
      inputModalities: m.inputModalities,
    }))
  }

  /**
   * 動態解析模型（【關鍵：絕不硬編碼死！】）
   * 即使 Google 推出全新未見過之模型（如 gemini-4.5、gemini-5、veo-4 等），
   * 只要傳入型號，系統會自動動態建立中繼資料，直接透傳至網頁端開啟調用！
   */
  async resolveModel(provider: string, modelId: string) {
    const rawId = modelId.replace(/^web\//, '').trim()
    const entry = this.dynamicModels.get(rawId)

    if (entry) {
      const formattedEfforts = formatEfforts(entry.efforts)
      return {
        provider,
        id: modelId,
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        inputModalities: entry.inputModalities,
        context: { contextWindow: entry.contextWindow },
        defaultMaxTokens: entry.maxOutput,
        ...(formattedEfforts
          ? {
              reasoning: {
                efforts: formattedEfforts,
                ...(entry.defaultEffort ? { defaultEffort: entry.defaultEffort } : {}),
              },
            }
          : {}),
      }
    }

    // ── 動態透傳機制 (Zero Hardcoding Fallback) ──
    // 未知的新模型：動態登錄並分配滿血預設值 (1M 上下文，最高思考等級)
    const dynamicEfforts = formatEfforts(['low', 'medium', 'high', 'xhigh'])!
    const dynamicEntry = {
      id: rawId,
      name: `${rawId} (動態感知)`,
      description: 'Google 網頁端動態新增模型 · 自動分配 1M 上下文',
      contextWindow: 1048576,
      maxOutput: 65536,
      inputModalities: ['text', 'image'],
      efforts: ['low', 'medium', 'high'],
      defaultEffort: 'high',
    }
    this.dynamicModels.set(rawId, dynamicEntry)

    return {
      provider,
      id: modelId,
      name: dynamicEntry.name,
      description: dynamicEntry.description,
      inputModalities: dynamicEntry.inputModalities,
      context: { contextWindow: dynamicEntry.contextWindow },
      defaultMaxTokens: dynamicEntry.maxOutput,
      reasoning: {
        efforts: dynamicEfforts,
        defaultEffort: dynamicEntry.defaultEffort,
      },
    }
  }

  async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    if (signal?.aborted) throw signal.reason ?? new Error('ABORTED')
    return {
      model: await this.resolveModel(provider, model),
      stream: (options: any) => this.stream({ ...options, signal: options.signal ?? signal }),
    }
  }

  async *stream(options: any): AsyncIterable<any> {
    const messages = options.messages || []
    let systemText = ''

    // 1. 整理 System 指令
    for (const msg of messages) {
      if (msg.role === 'system') {
        const txt = extractCleanText(msg.content)
        if (txt && !isSyntheticDshMessage(txt)) {
          systemText += (systemText ? '\n\n' : '') + txt
        }
      }
    }

    // 2. 篩選真實使用者對話（排除 DSH 內部合成訊息，如 [model changed: ...] 標籤與時間戳記取樣）
    const userMessages = messages.filter((m: any) => {
      if (m.role === 'system') return false
      const raw = extractCleanText(m.content)
      const txt = stripSyntheticMetadata(raw)
      return Boolean(txt) && !isSyntheticDshMessage(raw)
    })

    let promptText = ''
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1]
      promptText = stripSyntheticMetadata(extractCleanText(lastUser.content))
    } else if (messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const raw = extractCleanText(messages[i].content)
        const txt = stripSyntheticMetadata(raw)
        if (txt && !isSyntheticDshMessage(raw)) {
          promptText = txt
          break
        }
      }
    }

    // 判斷是否為 DSH 開啟新對話的第一輪（尚無任何助理回覆紀錄）
    const isFirstTurn = !messages.some((m: any) => m.role === 'assistant')

    // 3. 處理 DSH 標題生成請求（本地秒回，不污染 AI Studio 網頁對話紀錄）
    if (isTitleGenerationPrompt(promptText)) {
      let title = '新對話'
      try {
        const match = promptText.match(/"text"\s*:\s*"([^"]+)"/) || promptText.match(/\["([^"]+)"\]/)
        if (match && match[1]) {
          const rawCandidate = match[1].trim()
          if (!isSyntheticDshMessage(rawCandidate) && !isTitleGenerationPrompt(rawCandidate)) {
            title = rawCandidate.slice(0, 16).trim()
          }
        }
      } catch {}
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: title }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: title } }
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }

    // 4. 若經過濾後無有效使用者訊息（例如單純切換模型時的標記通知），靜默結束，不發送請求
    if (!promptText || isSyntheticDshMessage(promptText)) {
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }

    const modelId = options.model?.id || options.model || 'gemini-4-hydrogen'
    let thinkingLevel = 'high'
    if (options.reasoningEffort === 'max' || options.reasoningEffort === 'xhigh') thinkingLevel = 'max'
    else if (options.reasoningEffort === 'low') thinkingLevel = 'low'
    else if (options.reasoningEffort === 'medium') thinkingLevel = 'medium'

    const streamOpts: StreamPromptOptions = {
      model: modelId,
      prompt: promptText,
      systemInstruction: systemText,
      thinkingLevel,
      freshChat: isFirstTurn,
      signal: options.signal,
    }

    let fullAnswer = ''
    let blockIndex = 0

    // 開啟文字區塊
    yield { type: 'block-start', index: blockIndex, blockType: 'text' }

    try {
      for await (const chunk of streamPrompt(streamOpts)) {
        if (chunk.type === 'delta') {
          fullAnswer += chunk.text
          yield { type: 'text-delta', index: blockIndex, text: chunk.text }
        }
      }
    } catch (err: any) {
      yield {
        type: 'block-end',
        index: blockIndex,
        block: { type: 'text', text: fullAnswer },
      }
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: { message: err.message || 'Stream error', code: 'STREAM_FAILED' },
        },
      }
      return
    }

    // 關閉文字區塊
    yield {
      type: 'block-end',
      index: blockIndex,
      block: { type: 'text', text: fullAnswer },
    }

    // 計算安全整數 Token（遵守不相交法則）
    const approxInput = Math.max(1, Math.round(promptText.length / 3))
    const approxOutput = Math.max(1, Math.round(fullAnswer.length / 3))
    const total = approxInput + approxOutput

    yield {
      type: 'usage',
      usage: {
        inputTokens: approxInput,
        outputTokens: approxOutput,
        totalTokens: total,
      },
    }

    yield {
      type: 'finish',
      reason: { kind: 'stop' },
    }
  }
}
