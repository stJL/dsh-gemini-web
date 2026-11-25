---
name: gemini-web-agent
description: >-
  【轻量门禁・先问后用】当用户提到 AI Studio, Google Flow, Lyria, Gemini 网页端, Wave, 编队, Playbook, 虚拟工作室, 指定 Hydrogen/Flash/Flash-Lite/Neon/Nano Banana/Omni/Lyria, 或输入 `/gemini-web-agent` 时加载！
  1. 第 1 步门禁：调用 `gemini_preview`（可附带结构化 `site`/`model`/`entry`/`wave_tasks`），输出确认卡并立即调用 `ask_question` / `ask_user_question` 等待授权。
  2. 第 2 步授权编排：确认后按需查阅 `references/` 文档，在用户 GUI 授权的模型与安全护栏内自由调用 `gemini_web_agent` 执行。
---

# Gemini Web Agent（v0.4 轻量门禁与多 Agent 算力平台）

## 核心契约

1. **先问后用门禁（每个独立任务重置）**：
   - 优先调用 `gemini_preview(task, ...)` 生成确认卡，并获取当前用户在 **GUI 中授权的配置快照（`~/.dsh/gemini-web-config.json`）**。
   - 原样输出确认卡 Markdown，立即调用提问工具（原生 `ask_question` 或 MCP `ask_user_question`）弹出按钮，停步等待用户确认。
2. **授权后由主 AI 自由编排（遵守 GUI 授权与安全底线）**：
   - 用户确认后，按需查阅 `references/` 目录中的规格手册来规划复杂任务、Wave 多角色矩阵、Lyria 音乐生成或 Gemini `Task` 沙盒。
   - 严格遵守用户在 GUI 设定的 `fallbackLadder` / `strict` 模式、`thinkingLevel` 与安全护栏（不绕过 `Paid` 过滤，不向 `gemini-spark` 传入 `.env` / 私钥）。
   - 分析本地文件时直接通过 `files` 传入路径由网页端 1M 上下文挂载分析，无需把超长日志全文重抄进本地对话。
3. **交付规范**：
   - 回复中保留降级通知（若有）与可点击的 `file:///` 落地文件绝对路径，无需全量重抄已落盘的超长源码。

---

## 渠道与模型速查

| 站点 (`site`) | 支持模型与入口 | 说明 |
| :--- | :--- | :--- |
| **`aistudio`** | `gemini-4-hydrogen`（默认，`argon` 自动映射至此）<br>`gemini-3.8-flash`、`gemini-3.5-flash-lite`<br>`gemini-4-neon`（PRO 解锁） | 1M 上下文与免弹窗文件挂载；免费号封印 `Extra High`，PRO 号自动解锁。 |
| **`gemini`** | `Auto`（`entry: "chat"` 或 `"task"`） | 5 小时滚动池；`task` 运行于 Debian 12 沙盒（多文件打包用 Python `zipfile`；联网时禁传密钥）。 |
| **`flow`** | `Nano Banana 2.1`（画布 0 扣点）<br>`Omni 1.2 / Veo`（`entry: "canvas"`） | 免费 50 点/日或 PRO 月池；底部画布生图 0 点数消耗。 |
| **`lyria`** | `lyria-3.5`、`lyria-3-pro-preview`（`entry: "music"`） | PRO 账号解锁 AI Studio 音乐台生成（自动保存本地 `.mp3`）。 |
| **`wave`** | 结构化 `wave_tasks` 数组或 Playbook | 多 Tab 1-Tab-1-Role 错峰并发；产出隔离保存至 `.gemini-teams/<sessionId>/` 审查后合并。 |

---

## 第 1 步：确认门禁与交互按钮

调用 `gemini_preview` 传入 `task`（可附带已知的 `site`、`entry`、`model`、`thinking_level`、`files`、`playbook`、`wave_tasks`），输出确认卡后立即调用提问工具：

- **原生 `ask_question`**：
  `{ "questions": [{ "question": "👉 请确认是否发包执行？", "options": ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"] }] }`
- **MCP `ask_user_question`**：
  `{ "questions": [{ "id": "gemini_confirm", "question": "👉 请确认是否发包执行？", "options": [{ "label": "(Recommended) 确认发包执行" }, { "label": "调整参数" }, { "label": "取消调度（本地作答）" }] }] }`

---

## 第 2 步：查阅手册与调用 `gemini_web_agent`

确认通过后，按需查阅 `references/` 下的机读规范：
- `references/director_prompt.md`：Debian 12 沙盒边界、`zipfile` 打包规范、`gemini-spark` 密钥红线。
- `references/models.md`：完整 `model-id` 与 `Paid` / PRO 解锁标记。
- `references/agentlimb.md`：通道 A 浏览器桥接与选择器规范。
- `references/playbooks/*.md`：5 套官方编队模板及 `custom_squad.md.example`（定制新编队须经确认卡同意后方可写入）。

随后可直接传入单任务参数（`task`, `site`, `entry`, `model`, `thinking_level`, `thinking_policy`, `files`, `new_chat`, `confirmed: true`）或结构化多角色 Wave 参数（`site: "wave"`, `project`, `wave_tasks: [{ role, site, model, prompt, out_file, unpack_json_dir, thinking_level, files }]`, `resume`, `confirmed: true`）调用 `gemini_web_agent`。
