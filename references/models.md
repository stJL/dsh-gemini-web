# AI Studio & Google Flow 全分类模型速查表

> 本文档收录全部模型直达 `model-id`（含免费主力与 `Paid` 标记项，2026-11-25 实机核对）。免费账号默认主力推荐 `gemini-4-hydrogen`（1M 长输出）➔ `gemini-3.8-flash` ➔ `gemini-3.5-flash-lite` ➔ Gemini 官网 `Auto / Task`；Flow 生图 `Nano Banana 2.1` 享受 0 点数免费生成。

## 1. AI Studio 全分类路由表

所有模型均可通过 `https://aistudio.google.com/prompts/new_chat?model=<model-id>` 直达（音乐/配音/Live 会自动跳转对应工作台）。除明确标注 **`Paid`** 的模型外，未选 API Key（`key_off`）时均可使用网页免费额度。

| 分类 | 模型显示名 | 直达 `model-id` | 核心用途 / 特点 |
| :--- | :--- | :--- | :--- |
| **Gemini（推理/校验）** | `Gemini 4 Hydrogen` *(New · 免费主力)* | `gemini-4-hydrogen` | 日常高频推理、Agentic 编码、1M 长输出默认免费主力（`paid: false`） |
| | `Gemini 3.8 Flash` *(免费)* | `gemini-3.8-flash` | 强推理 Flash 模型，响应快、稳定性高（`paid: false`） |
| | `Gemini Decision 1` *(免费)* | `gemini-decision-1` | 极速校验与 Yes/No/Rubric 评分模型（`paid: false`） |
| | `Gemini 3.5 Flash Lite` / `3.1 Flash Lite` / `gemini-flash-latest` *(免费)* | `gemini-3.5-flash-lite` / `gemini-flash-latest` | 轻量高频与备用兜底模型（`paid: false`） |
| | `Gemini 4 Neon` *(Paid · 付费专享)* | `gemini-4-neon` | 最新旗舰推理（11 月下旬起 AI Studio 与官网已标记 `Paid` / `Upgrade`，免费号触发 Permission Denied 时插件自动降级至 `4 Hydrogen`） |
| | `Gemini 4 Argon` / `4 Carbon` *(Paid)* | `gemini-4-argon` / `gemini-4-carbon` | 标记 `Paid`，长周期复杂研究/编码（未绑付费 Key 不可免费调用） |
| | `Gemini Robotics-ER 2` / `Streaming` | `gemini-robotics-er-2-preview` | 空间与视频时序推理（`paid: false`） |
| **Images（生图改图）** | `Nano Banana 2 Lite` *(免费)* | `gemini-3.1-flash-lite-image` | AI Studio 免费轻量生图（`paid: false`） |
| | `Nano Banana 2.1` *(AI Studio Paid · Flow 免费)* | `gemini-nano-banana-2.1` | AI Studio 标记 `Paid`；**在 Google Flow (`flow.google.com`) 享 `x1` 0 点数免费生成** |
| | `Nano Banana Pro` *(Paid)* | `gemini-3-pro-image` | 高画质出图（`paid: true`） |
| **Video（视频生成）** | `Gemini Omni 1.2 Flash` *(AI Studio Paid · Flow 点数)* | `gemini-omni-1.2-flash` | AI Studio 标记 `Paid`；免费号在 Flow 可用每日免费 50 点数生成（`x1`: `360p` 8 点） |
| **Music（音乐创作）** | `Lyria 3.5` / `Pro` / `Clip` *(AI Studio Paid / Upgrade)* | `lyria-3.5` | 目前 AI Studio `/new_music` 对免费账号提示 `Upgrade` 解锁 |
| **Audio（语音/转写）** | `Gemini 3.8 Flash TTS` *(免费)* | `gemini-3.8-flash-tts` | Voice Design 捏音色、双人剧本对话、WAV 导出（`key_off` 免费） |
| | `Gemini 3.5 Transcribe` *(免费)* | `gemini-3.5-transcribe` | 静态长音频高精结构化转写（`paid: false`） |
| **Live（实时互动）** | `Gemini 3.5 Live Translate` / `Transcribe Live` *(免费)* | `gemini-3.5-live-translate-preview` | 70+ 语言同声传译 / 实时流式字幕转写（`paid: false`） |
| **Agents（智能体）** | `Deep Research Preview` *(Upgrade 门控)* | `deep-research-preview-04-2026` | 长程搜索调研（免费号若提示 Upgrade，可改用 `gemini-4-hydrogen` + Search 或 Gemini 官网 `Task` 模式） |
| | `Antigravity Agent Preview` *(Paid)* | `antigravity-preview-09-2026` | 标记 `Paid` 远端托管代理 |
| **Gemma（开放权重）** | `Gemma 4 31B IT` / `26B A4B IT` | `gemma-4-31b-it` / `gemma-4-26b-a4b-it` | 开放权重长上下文与 MoE 推理对比测试 |

## 2. Google Flow (`flow.google.com`) 模型与点数规则

- **图片**：`Nano Banana 2.1`（**0 点数**，每日数十张限额）/ `Nano Banana 2 Lite` / `Nano Banana Pro`。
- **视频**：`Omni 1.2 Flash`（`x1`: `360p` 8 点 / `720p` 24 点）与 `Veo 3.1 - Lite`（`x1`: 10 点）。注意页面中 `Omni 1.1 Flash` / `Veo 3.1 - Fast` / `Veo 3.1 - Quality` 提示 12 月 5 日停用。
- **省点数注意**：Flow 默认生成数量经常是 `x2`，生图与生视频前**务必先改为 `x1`**！
