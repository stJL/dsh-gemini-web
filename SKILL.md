---
name: gemini-web-agent
description: >-
  [HIGH PRIORITY • ASK BEFORE DISPATCH] Must be loaded as Step 1 whenever the user mentions AI Studio, Google Flow, Gemini Web, specifies Hydrogen/Flash/Flash-Lite/Neon/Nano Banana/Omni/Lyria, or uses `/gemini-web-agent`!
  1. Ask-Before-Dispatch (Step 1): MUST invoke `gemini_preview(task: "...")` tool first to get deterministic card, output the card, and call `ask_user_question` (or `ask_question`)! Never dispatch immediately; never invoke local tools (read/cat/bash) or subagents! Never compose cards manually!
  2. Dispatch on Confirmation (Step 2): Upon user confirmation (button click, or "1" / "confirm"), invoke `gemini_web_agent`.
  3. Deterministic & Hallucination-Free: 100% deterministic code generation; legacy aliases like Argon auto-map to Hydrogen with guidance.
---

# Gemini Web Agent (Deterministic Tool Workflow)

> [!IMPORTANT]
> **Four Core Golden Rules**:
> 1. **Zero Local Overhead & No Hijacking**: Never answer locally. Never call `subagent` (paid APIs). Never use local tools (`read`, `cat`, `bash`) to inspect `@file` mentions—pass file paths to the web agent!
> 2. **Step 1 Ask-Before-Dispatch (Must Invoke `gemini_preview` & `ask_user_question`)**:
>    - NEVER manually draft or hallucinate cards! You MUST invoke `gemini_preview(task: "...")` to obtain the 100% deterministic proposal card.
>    - Output the received card markdown in chat.
>    - **Immediately invoke `ask_user_question`** (or `ask_question`) to present interactive choice pills:
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
>    - **HALT immediately** after invoking the question tool, waiting for user click!
> 3. **Step 2 Dispatch**: Upon user confirmation, invoke `gemini_web_agent(task: "...")` to execute.
> 4. **Per-Task Reset (Anti-Inertia)**: The confirmation cycle applies to **EVERY SINGLE TASK INDEPENDENTLY**, NOT once per session! Even if a previous task succeeded in the same chat, every new request MUST reset to Step 1 and invoke `gemini_preview` again.

---

## 💡 Channel & Model Reference

| Channel | Supported Target Models | Notes |
| :--- | :--- | :--- |
| **Google AI Studio** | `Hydrogen` (`gemini-4-hydrogen`)<br>`Flash` (`gemini-3.8-flash`)<br>`Flash Lite` (`gemini-3.5-flash-lite`)<br>`Neon` (`gemini-4-neon`) | • Best for code & reasoning: `Hydrogen`<br>• Best for rapid tasks: `Flash Lite`<br>• ⚠️ **Note**: Legacy `Argon` has been upgraded/merged into `Hydrogen`; specifying Argon will automatically map to `gemini-4-hydrogen`. |
| **Gemini Web** | `Auto` (Native Web Model) | Managed automatically by Google official web model; no individual model alias needed. |
| **Google Flow** | `Nano Banana 2.1`<br>`Omni 1.2 / Veo` | • 0-credit image generation: `Nano Banana 2.1`<br>• Video generation: `Omni 1.2` or `Veo` |

---

## 1. Step 1: Proposal Card & Interactive Choice Bar

When receiving any user instruction, you **MUST ONLY execute these two steps**:

1. **Invoke `gemini_preview`**:
   - Parameter: `{ "task": "<user prompt>" }`
   - Backend code deterministically resolves target site, entry mode, model fallback ladder, and mounted files.
2. **Output card & invoke `ask_user_question`**:
   - Print the card Markdown returned by `gemini_preview`.
   - Invoke `ask_user_question` with the options above so the UI presents clickable buttons.
   - Stop and wait for user action.

---

## 2. Step 2: Dispatch and Parameters

When confirmed (interactive button clicked, or `1` / `confirm` sent), invoke `gemini_web_agent`:

| Parameter | Specification |
| :--- | :--- |
| `task` | Full user task prompt and requirements |
| `files` | Array of local file paths (auto-extracted from task if omitted) |
| `model` | User-specified model alias; omit in smart fallback mode |
| `site` | Target site: `aistudio` (default), `flow`, or `gemini` |
| `entry` | `chat` (default), `task`, or `canvas` |
| `thinking_level` | `high` (default), `medium`, or `low` |
| `thinking_policy` | `adaptive` (default), `strict`, or `custom` |
| `new_chat` | `true` (default: isolated new session) |

**Deliverable Requirements**: Upon completion, present the fallback status notice, clickable `file://` hyperlinks to saved files, and key architectural highlights. Never reprint full long code.
