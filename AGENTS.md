# Repository Guardrails (`dsh-gemini-web` — `v0.4.x` Architectural Consensus)

> **Before modifying architecture or proposing new features**, read [docs/V0.4_ARCHITECTURE_NOTES.md](docs/V0.4_ARCHITECTURE_NOTES.md).

## Core Consensus ("Light Gate + Empowered DSH Agent Platform")
**只守最基本的安全門禁 + 把上游變成給 DSH 主 AI 自由調度的獨立多 Agent 算力平台。**

- **Do NOT fight upstream (`@582835293/gemini-web-agent`)**: Let `scripts/gemini_web.py` and `scripts/gemini_agentlimb.py` serve as the underlying execution engine. Expose capabilities cleanly rather than rewriting or hardcoding regex overrides around every new upstream feature.
- **Keep the safety & UX core intact**:
  1. Ask-Before-Dispatch confirmation gate (`previewedTaskMap` / `confirmed` + interactive question buttons)
  2. GUI 1–5 fallback ladder, strict mode, and free-tier `Paid` / `--fallback-model none` protection
  3. Dual-channel routing (AgentLimb multi-port `revoked` skip -> CDP fallback)
  4. Long-code file-link delivery (`downloads/` + `file:///`) to avoid SSE truncation
  5. DSH GUI panel, Live Quota, and Chat-Room Slots (`client.js`, `src/transport/router.ts`)
  6. Session isolation (`.gemini-teams/<sessionId>/`), secret file filtering (`isSensitiveSecretFile`), `google.com/sorry` CAPTCHA fast-fail, and `scripts/sync_upstream.py`
- **Carve away regex bloat**: Do not add new heavy intent-guessing regexes in `src/proposal.ts`; move intent routing and Wave orchestration toward strong-model reading of `SKILL.md` + `references/` + injected GUI config (`~/.dsh/gemini-web-config.json`).

## Brake Check (When to Remind the User to Slow Down)
If a new idea or request would:
- Re-introduce complex hardcoded intent regexes, custom DSLs, or rigid prompt micro-management in TypeScript;
- Build a brand-new standalone orchestration framework that competes with upstream instead of passing structured specs/tools to `gemini_web.py` / `gemini_agentlimb.py`;
- Add extra GUI toggles or heavy UI flows that duplicate what the host AI can already decide from `SKILL.md` + `references/`;
- Bypass the confirmation gate, paid-model safety lock, or secret-file filter:

**Pause and explicitly warn the user** against the `v0.4.x` consensus before writing code.
