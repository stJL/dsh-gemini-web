# AI Studio & Google Flow 全分类模型速查表

> 本文档收录全部模型直达 `model-id`（含小众与 `Paid` 标记项，2026-11-19 实时核对）。日常主力模型（`gemini-4-neon` / `gemini-4-hydrogen` / `gemini-4-argon` / `gemini-nano-banana-2.1` / `gemini-omni-1.2-flash` / `lyria-3.5` / `gemini-3.8-flash-tts` / `deep-research-preview-04-2026`）已内置于主 `SKILL.md`。

## 1. AI Studio 全分类路由表

所有模型均可通过 `https://aistudio.google.com/prompts/new_chat?model=<model-id>` 直达（音乐/配音/Live 会自动跳转对应工作台）。除明确标注 **`Paid`** 的模型外，未选 API Key（`key_off`）时均可使用网页免费额度。

| 分类 | 模型显示名 | 直达 `model-id` | 核心用途 / 特点 |
| :--- | :--- | :--- | :--- |
| **Gemini（推理/校验）** | `Gemini 4 Neon` *(New)* | `gemini-4-neon` | 最新旗舰推理（11 月 19 日发布，未标 `Paid`，Thinking 支持 `Extra High`、输出 `1048576`；Web 端与 Build 同步上线并替换原 Web 端 Argon） |
| | `Gemini 4 Hydrogen` *(New)* | `gemini-4-hydrogen` | 日常高频推理、Agentic 编码、1M 长输出默认主力 |
| | `Gemini 4 Argon` | `gemini-4-argon` | 深度思考、复杂架构规划（Web 端已由 4 Neon 替代，Playground & Build 仍保留） |
| | `Gemini 4 Carbon` *(Paid)* | `gemini-4-carbon` | 标记 `Paid`，长周期复杂研究/编码（未绑付费 Key 不可免费调用） |
| | `Gemini 3.8 Flash` | `gemini-3.8-flash` | 强推理 Flash 模型 |
| | `Gemini Decision 1` | `gemini-decision-1` | 极速校验与 Yes/No/Rubric 评分模型 |
| | `Gemini 3.5 Flash Lite` / `3.1 Flash Lite` / `3.1 Pro Preview` / `3.6 Flash` / `3 Flash Preview` | `gemini-3.5-flash-lite` / `gemini-pro-latest` 等 | 常规轻量或上一代多模态推理（含 `gemini-flash-latest`、`gemini-flash-lite-latest` 别名） |
| | `Gemini Robotics-ER 2` / `Streaming` | `gemini-robotics-er-2-preview` | 空间与视频时序推理 |
| **Images（生图改图）** | `Nano Banana 2.1` | `gemini-nano-banana-2.1` | 最新原生生图/多轮一致改图，支持 Search & Image Search 接地 |
| | `Nano Banana Pro` / `2` / `2 Lite` / `Nano Banana` | `gemini-3-pro-image` / `gemini-3.1-flash-image` / `gemini-3.1-flash-lite-image` / `gemini-2.5-flash-image` | 高画质或轻量批量出图 |
| **Video（视频生成）** | `Gemini Omni 1.2 Flash` | `gemini-omni-1.2-flash` | 文/图/视频生成最高 15s 带原生音频视频（可调比例/时长/360p/24fps） |
| | `Gemini Omni 1.1 Flash` | `gemini-omni-1.1-flash` | 关键帧控制与场景延展至 30s |
| **Music（音乐创作）** | `Lyria 3.5` | `lyria-3.5` | 完整歌曲生成（Text / Composer 模式，人声与编曲，~3min MP3） |
| | `Lyria 3 Pro Preview` / `Clip Preview` | `lyria-3-pro-preview` / `lyria-3-clip-preview` | 复杂曲式编排 / 短音乐片段 |
| **Audio（语音/转写）** | `Gemini 3.8 Flash TTS` / `3.8 Flash Lite TTS` | `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` | Voice Design 捏音色、双人剧本对话、语音情绪标签（WAV 导出） |
| | `Gemini 3.1 Flash TTS` / `2.5 Pro/Flash TTS` | `gemini-3.1-flash-tts-preview` 等 | 多说话人高表现力 TTS |
| | `Gemini 3.5 Transcribe` | `gemini-3.5-transcribe` | 静态长音频高精结构化转写 |
| **Live（实时互动）** | `Gemini 3.8 Live` / `Extended Thinking` | `gemini-3.8-live` / `gemini-3.8-live-extended-thinking` | 超低延迟语音/屏幕共享/摄像头实时对话 |
| | `Gemini 3.5 Live Translate` / `3.5 Transcribe Live` / `3.1 Flash Live` | `gemini-3.5-live-translate-preview` 等 | 70+ 语言同声传译 / 实时流式字幕转写 |
| **Agents（智能体）** | `Deep Research Preview` / `Max` | `deep-research-preview-04-2026` / `deep-research-max-preview-04-2026` | 异步长程搜索调研与深度综合报告（Google Search + URL context） |
| | `Antigravity Agent Preview` *(Paid)* | `antigravity-preview-09-2026` | 标记 `Paid` 远端托管代理 |
| **Gemma（开放权重）** | `Gemma 4 31B IT` / `26B A4B IT` | `gemma-4-31b-it` / `gemma-4-26b-a4b-it` | 开放权重长上下文与 MoE 推理对比测试 |

## 2. Google Flow (`flow.google.com`) 模型与点数规则

- **图片**：`Nano Banana 2.1`（**0 点数**，每日数十张限额）/ `Nano Banana 2 Lite` / `Nano Banana Pro`。
- **视频**：`Omni 1.2 Flash`（`x1`: `360p` 8 点 / `720p` 24 点）与 `Veo 3.1 - Lite`（`x1`: 10 点）。注意页面中 `Omni 1.1 Flash` / `Veo 3.1 - Fast` / `Veo 3.1 - Quality` 提示 12 月 5 日停用。
- **省点数注意**：Flow 默认生成数量经常是 `x2`，生图与生视频前**务必先改为 `x1`**！
