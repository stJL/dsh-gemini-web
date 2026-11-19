# 互动游戏与创意多媒体工作室编队 (`interactive_game_studio`)

> **适用场景**：Web 小游戏（HTML5 / Canvas / 卡牌 / 肉鸽 / 叙事）、视觉小说、教育互动课件、创意小工具与可玩 Demo 开发。

## 团队花名册（1 Tab = 1 员工）

| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `chief_designer` | 主策划 / 剧本与数值师 | `aistudio` (Playground) | `gemini-4-neon` | `medium` / `high` | 设计核心玩法循环、数值表、文件结构契约；纯剧情对白调 `low`/`medium` 快速产出 |
| `engine_coder` | 核心程序与状态机主程 | `gemini_task` | `gemini-4-neon` | — | 编写零构建/纯原生前端或 Python 游戏逻辑，在沙盒用 `node`/`chromium` 自测 |
| `concept_artist` | 原画美术组 | `flow` | `Nano Banana 2.1` | — | 生成立绘、场景背景、UI 图标、图集原画（`x1` 0 点数，`1K`/`2K`） |
| `sound_team` | 配乐与角色配音组 | `aistudio` (`/new_music` & `/generate-speech`) | `lyria-3.5` / `gemini-3.8-flash-tts` | — | 生成主题 BGM（MP3）与角色台词配音（WAV），全 `key_off` 免费 |
| `tech_artist` | 技术美术与音频后期 | `gemini_task` | `gemini-4-hydrogen` | — | 沙盒内用 `PIL/cv2` 抠图切图集、用 `ffmpeg/pydub` 裁切压缩音效并用 `zipfile` 打包 |

## 标准并行波次与实战契约

- **Wave 0（契约直出）**：总监（或本地强模型 `chief_designer`）拆单时直接锁定所有文件、全局变量名、`assets/` 下全部图片/音频文件名以及抠图底色约定（如纯品红 `#FF00FF`），**不单独串行等另一页写契约**。
- **Wave 1（4 独立 Tab 并发点火）**：`data_designer`（Playground `4 Neon` 产出数值/剧情 JSON 包）、`engine_coder`（Gemini Task `4 Neon` 或 Playground `4 Neon` 写核心引擎 JSON 包/ZIP，**严禁伪造 Canvas/WebAudio 代替外包**）、`concept_artist`（Flow `Nano Banana 2.1` 出真图入 `assets/`）、`sound_team`（Lyria 3.5 + 3.8 Flash TTS 出真音频入 `assets/`）**必须同时启动 4 个不同 `tab_id` 并发运行**。
- **Wave 2（Task 沙盒资产批处理）**：把 Flow 原画与 TTS/Lyria 音频发给 `tech_artist`（`Task 4 Hydrogen`），用沙盒预装 **`PIL + cv2 + ffmpeg + pydub`** 自动抠图去背景、等分切帧、规范分辨率、裁切静音片段与统一采样率，以 Python **`zipfile`** 一次性输出 `assets.zip`。
- **Wave 3（`roster audit` 门禁 + 无头自测）**：先运行 `gemini_web.py roster audit` 强制校验多角色独立 `tab_id` 与 `assets/` 真实图片/音频落盘，再传给 `engine_coder` 或专用 Task 员工用预装 **`chromium 156`** 启动局部无头运行验收，确认控制台零报错后交付。
