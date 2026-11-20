---
name: gemini-web-agent
description: >-
  【必须最优先加载・一律先问后用】当用户提到 AI Studio, Google Flow, Gemini 网页端, 指定 Hydrogen/Flash/Flash-Lite/Neon/Nano Banana/Omni/Lyria, 或输入 `/gemini-web-agent` 时必须调用！
  1. 先问后用（第 1 步）：必须首先调用 `gemini_preview(task: "...")` 生成确定性确认卡，在聊天中原样输出该卡片，并立即调用 `ask_user_question` 弹出交互选择按钮！严禁擅自直接发包，严禁本地代劳，严禁自己脑补手写卡片！
  2. 确认后发包（第 2 步）：待用户在选择栏点击确认或回复「1」/「确认」后，调用 `gemini_web_agent` 正式发包。
  3. 确定性与零幻觉：卡片 100% 由代码确定性生成，旧版代号（如 Argon）自动映射升级至 Hydrogen，彻底消除小模型阶梯与排版幻觉。
---

# Gemini Web Agent（确定性双工具工作流）

> [!IMPORTANT]
> **四大核心调度铁律**：
> 1. **零本地开销与严禁代劳**：严禁本地直接作答，严禁调用 `subagent`（消耗付费 API），严禁使用本地 `read`/`cat`/`bash` 预读取 `@文件`——直接将文件路径交由外部网页端解析！
> 2. **第 1 步先问后用：必须调用 `gemini_preview` 与 `ask_user_question`**：
>    - 严禁自行手写拼装卡片！必须首先调用工具 `gemini_preview(task: "...")`；
>    - 将 `gemini_preview` 返回的标准确认卡原样输出到聊天中；
>    - **必须立即调用交互提问工具 `ask_user_question`**（或 `ask_question`）展示选择栏供用户直接点击：
>      ```json
>      {
>        "questions": [
>          {
>            "id": "gemini_confirm",
>            "question": "👉 请确认是否发包执行？",
>            "options": [
>              { "label": "(Recommended) 确认发包执行" },
>              { "label": "调整参数" },
>              { "label": "取消调度（本地作答）" }
>            ]
>          }
>        ]
>      }
>      ```
>    - 调用提问工具后**立即停止回复**，等待用户在选择栏中点击！
> 3. **第 2 步授权发包**：用户点击确认后，调用 `gemini_web_agent(task: "...")` 发包执行。
> 4. **多轮任务循环重置**：每个新任务都是一个全新独立的循环，每轮新任务都必须执行第 1 步！

---

## 💡 渠道与受支持模型速查

| 渠道 | 支持指定之模型代号 | 说明 |
| :--- | :--- | :--- |
| **Google AI Studio** | `Hydrogen` (`gemini-4-hydrogen`)<br>`Flash` (`gemini-3.8-flash`)<br>`Flash Lite` (`gemini-3.5-flash-lite`)<br>`Neon` (`gemini-4-neon`) | • 深度推理与长文本首选 `Hydrogen`；<br>• 日常极速首选 `Flash Lite`；<br>• ⚠️ **提示**：旧版实验代号 `Argon` 已被 Google 官方升级合并入 `Hydrogen`，若指定 Argon 将自动映射为 Hydrogen。 |
| **Gemini 官网** | `Auto` (官方原生模型) | 官网由 Google 原生大模型自动作答与联网增强，无需且无法指定单独模型代号。 |
| **Google Flow** | `Nano Banana 2.1`<br>`Omni 1.2 / Veo` | • 生图默认享受 0 扣点特权 (`Nano Banana 2.1`)；<br>• 视频生成请指定 `Omni 1.2` 或 `Veo`。 |

---

## 一、 第 1 步：生成提案并弹出交互选择栏

收到用户任务指令后，**必须且只能执行以下两步**：

1. **调用 `gemini_preview` 工具**：
   - 传入参数：`{ "task": "用户的原始完整指令" }`
   - `gemini_preview` 将由后端代码 100% 确定性解析目标渠道、入口模式、模型阶梯与挂载文件，杜绝任何模型幻觉！
2. **在聊天中输出卡片，并立即调用 `ask_user_question`**：
   - 原样输出 `gemini_preview` 返回的卡片 Markdown；
   - 立即调用 `ask_user_question`（参数同上方模板），聊天界面将自动弹出可点击的选择按钮；
   - 结束当前轮次回显，等待用户点击！

---

## 二、 第 2 步：授权发包与工具参数

当用户确认（点击选择栏「确认发包执行」或回复 `1` / `确认`）后，正式调用 `gemini_web_agent`：

| 工具参数 | 说明与传参规范 |
| :--- | :--- |
| `task` | 用户的完整需求提示词与任务描述 |
| `files` | 待上传的本地文件路径数组（若留空，插件将自动从 task 中提取兜底） |
| `model` | 用户指定的具体模型别名；智能降级模式下留空 |
| `site` | 目标渠道：`aistudio`（默认）、`flow` 或 `gemini` |
| `entry` | `chat`（默认）、`task` 或 `canvas` |
| `thinking_level` | `high`（默认）、`medium` 或 `low` |
| `thinking_policy` | `adaptive`（默认）、`strict` 或 `custom` |
| `new_chat` | `true`（默认开启独立新会话） |

**交付规范**：调用完成后，在最终回复中呈现降级通知、可点击的 `file://` 落地文件超链接以及核心架构说明，切忌全量重抄超长代码。
