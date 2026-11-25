---
name: gemini-web-agent
description: >-
  [ASK-BEFORE-DISPATCH GATE] Load when the user mentions AI Studio, Google Flow, Lyria, Gemini Web, Wave, Playbook, Virtual Studio, specifies Hydrogen/Flash/Flash-Lite/Neon/Nano Banana/Omni/Lyria, or uses `/gemini-web-agent`.
  1. Step 1 Gate: Invoke `gemini_preview` (optionally with structured `site`/`model`/`entry`/`wave_tasks`), print the card, and immediately invoke `ask_question` / `ask_user_question`.
  2. Step 2 Empowered Dispatch: After confirmation, consult `references/` as needed and invoke `gemini_web_agent` within the user's GUI-authorized models and safety guardrails.
---

# Gemini Web Agent (v0.4 Light-Gate & Multi-Agent Platform)

## Core Contract

1. **Ask-Before-Dispatch Gate (Every Independent Task)**:
   - Call `gemini_preview(task, ...)` first to render the confirmation card and obtain the user's **GUI-authorized configuration snapshot** (`~/.dsh/gemini-web-config.json`).
   - Output the confirmation card verbatim and immediately call `ask_question` (options as string array) or `ask_user_question` (`{ id: "gemini_confirm", options: [{ label }] }`), then stop and wait for user approval.
2. **Post-Confirmation Orchestration (Host AI Freedom Within GUI Guardrails)**:
   - Once approved, consult the manuals in `references/` when planning multi-site workflows, `Wave` role matrices, `Lyria` music generation, or `Gemini Task` sandboxes.
   - Respect the user's GUI-authorized `fallbackLadder` / `strict` mode, `thinkingLevel`, and safety locks (never bypass `Paid` checks or pass `.env` / private keys to `gemini-spark` tasks).
   - For local file analysis (`@file` or file paths), pass paths via `files` directly to the web agent rather than copying huge logs into local context.
3. **Deliverable Hygiene**:
   - Present fallback notices (if any) and clickable `file:///` links to saved deliverables. Do not reprint thousands of lines of already-saved source code.

---

## Channel & Model Quick Reference

| Site (`site`) | Supported Models & Entries | Notes |
| :--- | :--- | :--- |
| **`aistudio`** | `gemini-4-hydrogen` (default, `argon` maps here)<br>`gemini-3.8-flash`, `gemini-3.5-flash-lite`<br>`gemini-4-neon` (PRO unlocked) | 1M context, local file attachment; `Extra High` locked on free tier, unlocked on PRO. |
| **`gemini`** | `Auto` (`entry: "chat"` or `"task"`) | 5h rolling pool; `task` runs on Debian 12 sandbox (`zipfile`, no `zip` CLI; no secrets when `gemini-spark` net is on). |
| **`flow`** | `Nano Banana 2.1` (0-credit canvas)<br>`Omni 1.2 / Veo` (`entry: "canvas"`) | Free 50/day or PRO monthly pool; bottom canvas image generation uses 0 credits. |
| **`lyria`** | `lyria-3.5`, `lyria-3-pro-preview` (`entry: "music"`) | PRO AI Studio Music Studio audio generation (saved locally as `.mp3`). |
| **`wave`** | Structured `wave_tasks` array or Playbook | Multi-tab 1-Tab-1-Role concurrency; outputs isolate in `.gemini-teams/<sessionId>/` until merged. |

---

## Step 1: Confirmation Card & Question Tool

Call `gemini_preview` with `task` (and optional `site`, `entry`, `model`, `thinking_level`, `files`, `playbook`, `wave_tasks`), display the returned card, and invoke the question tool:

- **Native `ask_question`**:
  `{ "questions": [{ "question": "👉 请确认是否发包执行？", "options": ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"] }] }`
- **MCP `ask_user_question`**:
  `{ "questions": [{ "id": "gemini_confirm", "question": "👉 请确认是否发包执行？", "options": [{ "label": "(Recommended) 确认发包执行" }, { "label": "调整参数" }, { "label": "取消调度（本地作答）" }] }] }`

---

## Step 2: Reference Manuals & `gemini_web_agent` Dispatch

After user confirmation, inspect relevant references before building complex dispatches:
- `references/director_prompt.md`: Debian 12 sandbox specs, `zipfile` packaging rule, `gemini-spark` secret rules.
- `references/models.md`: Full model IDs and `Paid` / PRO unlock flags.
- `references/agentlimb.md`: Channel A browser bridge & selector rules.
- `references/playbooks/*.md`: 5 official squad templates + `custom_squad.md.example` (never run `playbook add` without user confirmation).

Pass single-task arguments (`task`, `site`, `entry`, `model`, `thinking_level`, `thinking_policy`, `files`, `new_chat`, `confirmed: true`) or structured `Wave` plans (`site: "wave"`, `project`, `wave_tasks: [{ role, site, model, prompt, out_file, unpack_json_dir, thinking_level, files }]`, `resume`, `confirmed: true`) directly to `gemini_web_agent`.
