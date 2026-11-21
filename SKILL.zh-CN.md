---
name: gemini-web-agent
description: >-
  【必须最优先加载・一律先问后用】当用户提到 AI Studio, Google Flow, Gemini 网页端, Wave, 编队, Playbook, 虚拟工作室, 开发Web工具, 任务看板, 指定 Hydrogen/Flash/Flash-Lite/Neon/Nano Banana/Omni/Lyria, 或输入 `/gemini-web-agent` 时必须调用！
  1. 单一门禁铁律：唯一合法指令为 `/gemini-web-agent`。
  2. 先问后用（调用 gemini_preview 与 ask_user_question）：无论用户带命令或日常聊天，宿主 AI 严禁本地直接作答，必须调用 `gemini_preview` 获取确定性提案卡，并立即调用 `ask_user_question` 弹出交互选择栏供用户点击，严禁擅自发包或本地代劳！
  3. 确认后发包：待用户在选择栏点击确认或回复「1」/「确认」后，调用 `gemini_web_agent` 正式发包。
---

# Gemini Web Agent（确定性工具流与单一门禁架构）

> [!IMPORTANT]
> **四大核心调度铁律**：
> 1. **唯一合法命令门禁**：外部 Google 算力调度的唯一合法指令是 `/gemini-web-agent`。
> 2. **零本地开销与严禁代劳**：严禁本地直接作答，严禁调用 `subagent`（消耗付费 API），严禁使用本地 `read`/`cat`/`bash` 预读取 `@文件`——直接将文件路径交由外部网页端解析！
> 3. **第 1 步先问后用（必须调用 `gemini_preview` 与 `ask_user_question`）**：
>    - 严禁自行脑补排版确认卡！必须调用 `gemini_preview(task: "...")` 获得 100% 确定性解析的提案卡；
>    - 在聊天中原样输出卡片 Markdown；
>    - **必须立即调用交互提问工具 `ask_user_question`** 弹出交互选项胶囊：
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
>    - **调用完提问工具后立即停步**，等待用户点击确认！
> 4. **多轮任务循环重置（抗历史惯性）**：确认流程是针对【每一个独立任务】的循环，绝非整场对话只出现一次！每轮新任务都必须执行确认流程，绝不可跳过确认直接作答！

---

## 💡 渠道与受支持模型速查

| 渠道 | 支持指定之模型代号 | 说明 |
| :--- | :--- | :--- |
| **Google AI Studio** | `Hydrogen` (`gemini-4-hydrogen`)<br>`Flash` (`gemini-3.8-flash`)<br>`Flash Lite` (`gemini-3.5-flash-lite`)<br>`Neon` (`gemini-4-neon`) | • 深度推理与长文本首选 `Hydrogen`；<br>• 日常极速首选 `Flash Lite`；<br>• ⚠️ **提示**：旧版实验代号 `Argon` 已被 Google 官方升级合并入 `Hydrogen`，若指定 Argon 将自动映射为 Hydrogen。 |
| **Gemini 官网** | `Auto` (官方原生模型) | 官网由 Google 原生大模型自动作答与联网增强，无需且无法指定单独模型代号。 |
| **Wave 虚拟外包工作室** | `Wave 并发引擎`<br>`5 套官方研发编队` | • 多 Tab 错峰并发派单，1 Tab 1 员工持久绑定<br>• 架构定界 ➔ 并行研发 ➔ Debian 12 沙盒单测 ➔ 成果自动解包 |
| **Google Flow** | `Nano Banana 2.1`<br>`Omni 1.2 / Veo` | • 生图默认享受 0 扣点特权 (`Nano Banana 2.1`)；<br>• 视频生成请指定 `Omni 1.2` 或 `Veo`。 |

---

## 一、 第 1 步：生成提案并弹出交互选择栏

收到用户任务指令后，**必须且只能执行以下两步**：

1. **调用 `gemini_preview` 工具**：
   - 传入参数：`{ "task": "用户的原始完整指令" }`
   - `gemini_preview` 将由后端代码 100% 确定性解析目标渠道、入口模式、模型阶梯与挂载文件，杜绝任何模型幻觉！
2. **在聊天中输出卡片，并立即调用 `ask_user_question`**：
   - 原样输出 `gemini_preview` 返回的卡片 Markdown；
   - 立即调用 `ask_user_question`（参数同下方模板），聊天界面将自动弹出可点击的选择按钮：
     ```json
     {
       "questions": [
         {
           "id": "gemini_confirm",
           "question": "👉 请确认是否发包执行？",
           "options": [
             { "label": "(Recommended) 确认发包执行" },
             { "label": "调整参数" },
             { "label": "取消调度（本地作答）" }
           ]
         }
       ]
     }
     ```
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
