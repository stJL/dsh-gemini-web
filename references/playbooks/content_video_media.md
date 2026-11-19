# 自媒体图文、短视频、播客与营销物料编队 (`content_video_media`)

> **适用场景**：小红书/公众号/B站/YouTube 图文与短视频制作、产品宣传短片、播客/有声双人对话音频、品牌海报与配音成片。

## 团队花名册（1 Tab = 1 员工）

| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `creative_director` | 内容策划与分镜导演 | `aistudio` (Playground) | `gemini-4-neon` | `low` / `medium` | 确定选题钩子、逐镜分镜脚本、口播/多角色对话台词与生图生视频 Prompt |
| `visual_artist` | 视觉摄影与视频组 | `flow` | `Nano Banana 2.1` / `Omni 1.2 Flash` | — | Flow 免费生成高清封面图与分镜插画（`x1` 0 点数 + `2K`）；动态片段走 AI Studio/Flow 视频 |
| `voice_actor` | 配音组 | `aistudio` (`/generate-speech`) | `gemini-3.8-flash-tts` | — | 按导演台词本生成单人旁白或多角色对话 WAV 音频（`key_off` 免费） |
| `music_composer` | 原创配乐组 | `aistudio` (`/new_music`) | `lyria-3.5` | — | 根据情绪/BPM 提示词生成背景音乐与片头/片尾曲 MP3（`key_off` 免费） |
| `post_editor` | 云端后期合成工程师 | `gemini_task` | `gemini-4-hydrogen` | — | 用沙盒预装 `ffmpeg` + `pydub` + `PIL` 自动剪辑混音、压制字幕水印、统一打包交付 |

## 标准并行波次与素材加工链

- **Wave 1（脚本拆单）**：`creative_director` 切 `low`/`medium` 思考等级快速出分镜表、每张图/视频的英文视觉 Prompt、TTS 剧本与配乐情绪参数。
- **Wave 2（多模态素材并行零成本生产）**：
  - `visual_artist`：Flow（`Nano Banana 2.1`, `x1`）出封面和插画，需要短视频片段优先走 AI Studio `gemini-omni-1.2-flash`（`key_off` 不耗 Flow 点数，最高 15s）；
  - `voice_actor` & `music_composer`：并发拉取配音 WAV 与配乐 MP3。
- **Wave 3（Task 沙盒自动化后期交付）**：把下载到的原图、短视频、配音 WAV 与 BGM MP3 作为附件上传给 `post_editor`（Gemini `Task`），要求其利用沙盒预装 **`ffmpeg 5.1.9`、`pydub`、`PIL/cv2`** 完成音量闪避（BGM 压低）、人声拼接、图文加字/比例裁切或视频合流，最后用 **Python `zipfile` 打包 `release_assets.zip`** 供本地 `harvest` 收割。
