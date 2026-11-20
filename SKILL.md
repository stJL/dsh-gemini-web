---
name: gemini-web-agent
description: >-
  [HIGH PRIORITY • ASK BEFORE DISPATCH] Must be loaded as Step 1 whenever the user mentions AI Studio, Google Flow, Gemini Web, specifies Hydrogen/Argon/Neon/Flash/Flash-Lite/Nano Banana/Omni/Lyria, or uses `/gemini-web-agent`!
  1. Ask-Before-Dispatch: In Step 1, output the [🌐 Gemini Web Agent] proposal card and STOP. Never dispatch immediately; never invoke local tools (read/cat/bash) or subagents!
  2. Dispatch on Confirmation: In Step 2, upon user confirmation ("1" or "confirm"), invoke `gemini_web_agent`.
  3. Dynamic Parameterization: Respect user-specified models; dynamically mirror the active system fallback ladder.
---

# Gemini Web Agent (KISS Edition)

> [!IMPORTANT]
> **Four Core Golden Rules**:
> 1. **Zero Local Overhead & No Hijacking**: Never answer locally. Never call `subagent` (paid APIs). Never use local tools (`read`, `cat`, `bash`) to inspect `@file` mentions—pass file paths to the web agent!
> 2. **Ask-Before-Dispatch (Step 1)**: Output the structured proposal card and **HALT immediately**. Wait for user confirmation (`1` or `confirm`).
> 3. **Per-Task Reset (Anti-Inertia)**: The confirmation cycle applies to **EVERY SINGLE TASK INDEPENDENTLY**, NOT once per session! Even if a previous task succeeded in the same chat, every new request MUST reset to Step 1 and output the card again. Never bypass the card!
> 4. **Dynamic Parameterization**: 100% respect user-specified models without unauthorized "upgrades". For adaptive ladders, **dynamically mirror the active system sequence** (`【当前系统生效之确认卡配置】`)—never hardcode!

---

## 1. Universal Parameterized Proposal Card

In Step 1, dynamically assemble and output the following card, then **STOP**:

```markdown
### 🌐 Gemini Web Agent
检测到您欲调用外部 Google 网页端{action_description}，相关配置如下：

- 🎯 执行渠道：{execution_channel}
- 📁 挂载文件：[{mounted_files}]
- 🚪 入口模式：{entry_mode}
- 🧠 执行模型：{model_mode_label}
  - {model_ladder_or_target}
- ⚙️ 推演配置：{thinking_config}
- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

👉 请确认是否发包执行？
- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
- 回复 调整参数（如「改用 Flash Lite」、「改用 Argon」等）：按您的要求调整后直接发包
- 回复 「取消」：中止外部调度，改由本地作答
```
*(If the conversation is in English, you may output equivalent English labels: `Target Site:`, `Mounted Files:`, `Entry Mode:`, `Model Ladder:`, `Thinking Config:`, `Isolation:`).*

---

## 2. Parameter Resolution Matrix

Resolve each card field dynamically. **Never copy-paste hardcoded static strings**:

| Field | Placeholder | Dynamic Resolution Rules |
| :--- | :--- | :--- |
| **Action Desc** | `{action_description}` | • Local files involved ➔ `分析本地文件`<br>• Media generation ➔ `实现多媒体生成`<br>• General coding/reasoning ➔ `实现任务` or `实现并发任务` |
| **Channel (`site`)** | `{execution_channel}` | • Image/video ➔ `Google Flow（flow）`<br>• Gemini Web or web research ➔ `gemini.google.com（可选择：Google AI Studio / Gemini Web）`<br>• Default (coding, reasoning, files) ➔ `Google AI Studio（可选择：Google AI Studio / Gemini Web）` |
| **Mounted Files (`files`)** | `- 📁 挂载文件：[...]` | • **CONDITIONAL**: Render ONLY if local files, logs, or `@file` are referenced (e.g. `[src/index.ts]`).<br>• **OMIT ENTIRE LINE** if no files are involved (never output empty `[]`). |
| **Entry Mode (`entry`)** | `{entry_mode}` | • Web task/canvas ➔ `task`<br>• Default ➔ `chat` |
| **Model Ladder (`model`)** | `{model_mode_label}`<br>`{model_ladder_or_target}` | **Channel-specific routing**:<br>1. **Gemini Web (`gemini.google.com`)**: Output `Auto (Gemini Web Native Model)`. Never output AI Studio fallback ladders!<br>2. **Google Flow (`flow`)**: Output `Nano Banana 2.1 (2K Canvas Generation)` or `Omni 1.2 / Veo (Video)`<br>3. **Google AI Studio**: Follow user-specified model, strict mode, or adaptive ladder (`{CURRENT_DYNAMIC_LADDER}`) verbatim. |
| **Thinking Config** | `{thinking_config}` | • **Gemini Web** ➔ `Web Search Grounding (Task Mode)` or `Standard Chat Mode` (no Thinking level)<br>• **Flow images** ➔ `将生成数量设为 x1，分辨率设为 2K`<br>• **AI Studio default** ➔ `Thinking 设为 {current_thinking_level}` (from system prompt, e.g. `high`) |

---

## 3. Step 2 Dispatch & Tool Parameters

When confirmed, invoke `gemini_web_agent`:

| Tool Argument | Description & Source |
| :--- | :--- |
| `task` | User's full prompt and task description |
| `files` | Array of file paths (pass only when files are attached, e.g. `["path/to/file.ext"]`) |
| `model` | User-specified model alias, or empty in adaptive mode |
| `site` | Target channel: `aistudio` (default), `flow`, or `gemini` |
| `entry` | `chat` (default) or `task` |
| `thinking_level` | `high` (default), `medium`, or `low` |
| `thinking_policy` | `adaptive` (default), `strict`, or `custom` |
| `new_chat` | `true` (default) |

**Output Delivery**: Present fallback notifications, clickable `file://` links, and key architectural highlights. Never recopy entire massive code files.
