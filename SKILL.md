---
name: gemini-web-agent
description: >-
  利用外部 Chrome 调度三大网页站点全模态渠道分担任务、最大化节省本地 Antigravity 配额：
  (1) aistudio.google.com 全模型免 Key 免费额度（key_off）：覆盖文本推理/1M长输出（4 Neon/4 Hydrogen/4 Argon）、生图改图（Nano Banana 2.1）、生视频（Omni 1.2 Flash/1.1 Flash）、完整歌曲（Lyria 3.5）、语音配音与剧本对话（Gemini 3.8 Flash TTS）、录音转写（3.5 Transcribe）、Live 实时对话同传（3.8 Live/3.5 Live Translate）、Deep Research 与 Build 整站应用导出；
  (2) flow.google.com 独立点数池（Nano Banana 2.1 生图 0 点数 + 2K 高清重塑、Omni 1.2 Flash / Veo 3.1 - Lite 生视频）；
  (3) gemini.google.com 对话模式、异步任务模式 (Task)、制作音乐/图片/视频、Canvas 与 Deep Research（已支持 4 Hydrogen / 4 Neon）。
  激活后先检测各端额度并按需对比本地额度，询问用户要使用的站点、模式与模型后，再优先通过 AgentLimb MCP（或备用 gemini_web.py）调度外部 Chrome。
  当用户提到“网页端 Gemini”、“Google Flow”、“Flow”、“AI Studio”、“Playground”、“Build模式”、“Lyria”、“TTS配音”、“生图”、“生视频”、“生音乐”、“利用网页版额度”、“省额度”、“任务模式”、“异步 agent”时激活。
---

# Gemini Web-Agent（三站点全模态与额度调度）

> [!IMPORTANT]
> **🚨 最高命令铁律：明令禁止本地模型擅自代劳**  
> 当使用者在对话中显式指定调用 **`gemini-web-agent`**、**`gemini_web_agent`**、**`/gw`**、**“Gemini 网页端”**、**“Google 网页”**、**“AI Studio”**、**“Google Flow”**，或指定使用 **`Hydrogen` / `Argon` / `Neon` / `Nano Banana` / `Omni` / `Lyria`** 等模型时：  
> 1. **【绝对禁令】**：本地宿主 AI（DeepSeek / Claude / GPT 等）**严禁自行在本地编写答案或擅自代劳作答**！  
> 2. **【强制委派】**：必须 100% 无条件立刻调用 `gemini_web_agent` 工具（或执行对应调度脚本），将任务完整委托给外部 Google 网页端执行！  
> 3. **【尊重意志】**：使用者之所以显式指定外部网页端，是为了利用 Google 免费额度（key_off）、1M 超大上下文或多模态能力，本地模型不得以“自己也能写代码”为由截胡！

优先通过 **AgentLimb MCP**（永久免弹窗操控已登录外部 Chrome），或备用 [gemini_web.py](scripts/gemini_web.py)，统筹调度 **`aistudio.google.com`**、**`flow.google.com`** 与 **`gemini.google.com`**（含 Jio 会员 / 部分 Pro 账号绕过本地缺 `4 Neon` / `4 Hydrogen` / `4 Argon` 与 5h 限流的“曲线救国”场景）。

---

## 0. 自动初始化、更新检查与账号安全红线

1. **未安装或缺少 `.venv` 时立即运行**（默认输出 1 行极简摘要，需完整 JSON 加 `--json`）：
   ```bash
   python scripts/setup_skill.py --auto
   python scripts/setup_skill.py --check-if-stale   # 24h 内命中缓存 10ms 返回；超时查更新；遇 update=available 经同意跑 --update
   ```
2. **【绝对红线】严禁 `taskkill` / 强杀用户正在运行的 Chrome，严禁擅自对日常 Chrome 添加 `--user-data-dir` 临时目录、改快捷方式或迁移 `User Data`**（Chrome 136+ 已禁默认目录开 `--remote-debugging-port`，强改会注销多邮箱登录与扩展或触发风控）。
3. **按 `setup_skill.py` 状态选通道**：
   - `A=ready`：首选 **`agentlimb` MCP**；
   - `A=off` 且 `B=http_ready`：用输出中的 `py` 调 `cli`（通道 B）；
   - `B=chrome_ui_approval_required`：优先装 AgentLimb（`>= v0.8.2`），坚持走 B 则先跑 `gemini_web.py daemon` 并在 Chrome 弹窗点一次允许；
   - `A=off` 且 `B=inactive`：推荐装 AgentLimb MCP（`references/agentlimb.md`），或在现有 Chrome 地址栏打开 `chrome://inspect/#remote-debugging` 开启调试。

---

## 一、 七大场景最优调度与常用主力模型

| 任务场景 | 首选渠道（URL & 模型） | 次选 / 兜底 | 额度与关键参数 |
| :--- | :--- | :--- | :--- |
| **轻量开发 / 独立原型 / 异步任务** | `gemini.google.com/app` **`任务 (Task)`（`4 Hydrogen`）**（**优先级高于 Build**，产出干净不乱加料） | Playground `gemini-4-hydrogen` / `Canvas` | 走网页主额度 |
| **日常推理 / 1M 长输出 / 代码** | `aistudio.google.com/prompts/new_chat?model=gemini-4-hydrogen` | `gemini.google.com/app`（`任务` / 对话） | **`key_off` 免费**；Thinking 拉 `Extra High`，输出拉 `1048576` |
| **复杂架构 / 深度研究** | `aistudio.google.com/prompts/new_chat?model=gemini-4-neon`（或 `gemini-4-argon` / `deep-research-preview-04-2026`） | `gemini.google.com/app`（`4 Neon` / `Deep Research`；Web 端 `4 Argon` 已替换为 `4 Neon`） | AI Studio **`key_off`**；自动选非 `Paid` 最高 Thinking（`Extra High`）+ `1048576` |
| **图片生成与参考改图** | `flow.google.com`（`Nano Banana 2.1`，**0 点数**，务必改 **`x1`**，可下 `2K`） | Playground `gemini-nano-banana-2.1`（`key_off`）/ Gemini `制作图片` | Flow 每日数十张免费；参考图改图见 `references/agentlimb.md` |
| **视频生成（含原生音频）** | `aistudio.google.com/prompts/new_chat?model=gemini-omni-1.2-flash`（最高 15s） | Flow（`Omni 1.2 Flash` 8~24 点 / `Veo 3.1 - Lite` 10 点，选 `x1`） | AI Studio **`key_off` 免费不扣 Flow 点数** |
| **完整歌曲 / 配音 / 转写** | `aistudio.google.com/new_music?model=lyria-3.5` / `/generate-speech?model=gemini-3.8-flash-tts` | `gemini.google.com` `制作音乐` / `?model=gemini-3.5-transcribe` | **`key_off` 免费**（MP3 / WAV base64 直出） |
| **从零构建一整套完整工程** | `aistudio.google.com/apps`（**仅用于整套工程**，选 **`MAX` + `Gemini 4 Neon`**，其次 `Argon`，避开 `Paid`） | `gemini.google.com` **`任务 (Task)`**（局部需求用 Task） | 走 Pro 网页额度，导出 `.zip` |

> **常用直达 `model-id`**：`gemini-4-neon` · `gemini-4-hydrogen` · `gemini-4-argon` · `deep-research-preview-04-2026` · `gemini-nano-banana-2.1` · `gemini-omni-1.2-flash` · `lyria-3.5` · `gemini-3.8-flash-tts` · `gemini-3.5-transcribe`。其余小众/历史/Paid 模型速查（含 Flow 停用提示）见 [references/models.md](references/models.md)。

---

## 二、 额度巡检与先问后用工作流

> **省本地 Input Token 原则**：本 Skill 脚本默认输出 1~3 行极简摘要并屏蔽思考链 `thoughts`（程序解析再加 `--json`）；长代码/报告优先用 `--out-file <路径>` 或网页单包 Blob 下载 + `harvest`，严禁回传几万字给本地 AI 重抄。

1. **多端额度检测**：
   - **网页端 `/usage`**：通道 A 后台开 `tab_new("https://gemini.google.com/usage", active=false)` 等 `[data-testid="current-usage"]`，读取 `[data-usage-island-root] header span`、`[data-testid="current-usage"]`、`[data-testid="weekly-usage"]` 后 `tab_close`（遇 `[role="alert"]` 限流提示即切 AI Studio `key_off`）；通道 B 运行 `gemini_web.py usage --include-flow`。
   - **Google Flow 点数**：开 `https://flow.google.com/` 点 `[aria-label="账号详情"]`，读 `[role="dialog"]` 内 `X 个 Google Flow 点数` 与重置时间后关页；通道 B 运行 `flow-usage`。
   - **本地 Antigravity 对比（仅 Antigravity 环境，Claude Code/Codex 跳过）**：使用 `setup_skill.py` 输出的 `inspect=` 路径执行 `python "<inspect路径>"`（已内置增量缓存与轻量探测；默认 3 行极简摘要，可选 `--live-only` 仅查配额、`--all-history` 扫全部历史、`--markdown` 看详表）。
2. **先问后用**：先汇报各端余额，通过提问工具（`ask_question` / `AskUserQuestion`）确认**入口与模型**（高优推荐 Gemini `任务 Task 4 Hydrogen`、Playground、多模态、Flow 或 Build）及**是否同意执行**，未获授权禁止发包（用户明确指定则直接跑）。

---

## 三、 极速调用外部 Chrome（禁止派 `browser` 子代理）

### 通道 A（首选）：AgentLimb MCP

**必守 4 条实战铁律**：
1. **默认复用原对话标签页**：先 `tabs_context` 查找已有 `/prompts/...` 或 `/app/...` 复用，仅开新话题才建新页。
2. **防后台冻结与防超时**：`javascript_eval` 有 **20s 上限**（发送与提取分两步，中间用 `wait`）；提取任何结果或点击下载前**务必先 `tab_activate(tabId)`** 并滚动到底，避免后台 Tab 休眠。
3. **无弹窗上传与防多文件下载拦截**：严禁点击弹出 Windows 文件窗；同页多文件禁止连触发 `<a download>`（会被 Chrome 拦截），改打成一个 JSON Blob 下载再用 `gemini_web.py harvest --unpack-json` 落盘。
4. **AI Studio 等待完成防踩坑**：思考期可能短时无 `Stop` 按钮，必须同时满足 `.cdk-live-announcer-element` 含 `"Response ready."`、无可见 `Stop`、且最后一条非 thought `ms-cmark-node` 非空且非 `"正在思考"`。

**1. AI Studio 通用工作台（`/prompts/new_chat?model=<id>`）即用 JS 模板：**
- **① 发包 JS（拉满最高非 Paid Thinking + `1048576` 输出 + 填 Prompt 点 Run）**（注：填框等待 `250ms` 后再点 Run）：
  ```js
  (async (PROMPT) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const tl = document.querySelector('mat-select[aria-label="Thinking Level"]');
    if (tl) {
      tl.click(); await wait(250);
      const opts = [...document.querySelectorAll('.cdk-overlay-pane mat-option')].filter(
        o => o.getAttribute('aria-disabled') !== 'true' && !/\bpaid\b/i.test(o.innerText)
      );
      const pick = opts.find(o => /extra\s*high/i.test(o.innerText)) || opts.find(o => /^high$/i.test(o.innerText.trim())) || opts.at(-1);
      if (pick) { pick.click(); await wait(200); }
    }
    let out = document.querySelector('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]');
    if (!out || out.getBoundingClientRect().height <= 0) {
      [...document.querySelectorAll('button, mat-expansion-panel-header')].find(e => /advanced\s*settings/i.test(e.innerText))?.click();
      await wait(250);
      out = document.querySelector('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]');
    }
    if (out && out.max && out.value !== out.max) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(out, out.max);
      ['input', 'change', 'blur'].forEach(ev => out.dispatchEvent(new Event(ev, { bubbles: true })));
    }
    const ta = document.querySelector('textarea[aria-label="Enter a prompt"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, PROMPT);
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: PROMPT }));
    await wait(250);
    const runBtn = [...document.querySelectorAll('button')].find(b => !b.classList.contains('rerun-button') && !b.disabled && /^Run\b/i.test((b.innerText || '').trim()));
    runBtn?.click();
    return { dispatched: !!runBtn };
  })("这里填提示词")
  ```
- **② 提取最终正文 JS（必须先 `tab_activate`；排除 `ms-thought-chunk`；长文只返回字符数或直接 Blob 下载）**：
  ```js
  (() => {
    const turns = [...document.querySelectorAll('[data-turn-role="Model"]')];
    const last = turns.at(-1); if (!last) return { ready: false };
    last.scrollIntoView();
    const tSet = new Set(last.querySelectorAll('ms-thought-chunk, mat-expansion-panel'));
    const text = [...last.querySelectorAll('ms-cmark-node')].filter(n => !tSet.has(n) && ![...tSet].some(t => t.contains(n)) && !n.parentElement?.closest('ms-cmark-node')).map(n => n.innerText.trim()).filter(Boolean).join('\n\n');
    const imgs = [...last.querySelectorAll('img[src^="blob:"]')].filter(i => i.naturalWidth > 200).map(i => i.src);
    const vids = [...last.querySelectorAll('video[src^="blob:"]')].map(v => v.src);
    return { ready: (!!text && text !== '正在思考') || imgs.length > 0 || vids.length > 0, text, imgs, vids };
  })()
  ```
- **③ 无弹窗传附件**：本地命令行转 Base64 后注入 `ms-add-media-button input[type="file"], input.file-input`（`DataTransfer` 模板见 `references/agentlimb.md`），或用通道 B `attach --file`。长系统设定写 `.system-instructions-card`。

**2. 专项工作台核心选择器：**
- **音乐（`/new_music?model=lyria-3.5`）**：零状态点 `button.empty-state__title-button` → 写 `textarea[aria-label="Prompt input"]` 等 `250ms` → 点 `button.ctrl-enter-submits` → 等 `Stop composing` 消失后取 `audio[src^="data:audio/"]` 或点 `button.download-button[aria-label="Download"]`。
- **配音（`/generate-speech?model=gemini-3.8-flash-tts`）**：零状态点 `mat-card.create-dialog-card` → 选 `button.voice-chip` → 写 `textarea[aria-label="Speech block text"]` 等 `250ms` → 点 `button.ctrl-enter-submits` → 取 `audio[src^="data:audio/"]`。
- **Build（`/apps`，仅整套工程）**：选 **`MAX`** + Settings 切 **`Gemini 4 Neon`**（其次 `Argon`）→ 填 `div[aria-label="Describe an app and let Gemini do the rest"]` 点 `button[aria-label="Send"]` → `?showCode=true&showAssistant=true` 点 `button[aria-label="Export options"]` 下载 `.zip` 后用 `harvest` 移入工程。
- **Flow（`flow.google.com`）**：关右侧栏或点灭 `智能体` → 点 `button[aria-label="设置触发器"]` 选媒体/比例/模型（`Nano Banana 2.1` / `Omni 1.2 Flash` / `Veo 3.1 - Lite`）并将数量改为 **`x1`** → 填 `div.ProseMirror[aria-label="您希望创作什么？"]` 点 `button[aria-label="开始生成"]` → `.tile-row` `button[aria-label="更多选项"]` → `下载`（`1K`/`2K`）。
- **Gemini（`gemini.google.com/app`）**：切 `<gem-segmented-button>`（`对话` / `任务`）及 `bard-mode-menu-button`（`4 Hydrogen` / **`4 Neon`** / `4 Carbon` / `自动`）→ **严禁设 `innerHTML`**（`TrustedHTML`），用 `textContent` + `InputEvent('insertText')` 写入 `div[role="textbox"]` 点 `button[aria-label="发送"]`。注意网页端拦截合成 `DataTransfer`，大附件切 AI Studio 或调 `gemini_web.py --file`。

**收尾与释放**：通道 A 调用 `agentlimb:say` 释放 Chrome 侧边栏运行状态（避免界⾯悬挂“正在操作”）；通道 B 已内置 `5000ms` CDP 快速失败、正向 DOM 防抖状态机与 `10 分钟` 空闲自动退出，避免后台挂起与孤儿进程。

---

### 通道 B（CLI 备用）：Playwright CDP 脚本（支持三站 + `harvest` + 自动复用）

> `ask` 默认已设为高优 **`task`** 模式（传 `--tool` 或 `--thinking` 时自动切 `chat`）；`ask` / `playground` 默认**复用当前会话**并保留原模型，开全新会话传 `--new-chat`。用 `setup_skill.py` 输出里的 `py` 和 `cli` 执行（完整参数查 `--help`）：

```powershell
# 额度巡检（默认精简 1 行）
& $py $cli usage --include-flow

# Gemini 高优异步 Task（默认 entry=task）& 回收结果直接落盘
& $py $cli ask --model hydrogen --file "需求.pdf" --prompt "轻量原型/调研任务" --async-send
& $py $cli fetch --out-file "result.md"

# AI Studio Playground（默认自动拉满 Extra High + 1048576；支持多模态与直写文件）
& $py $cli playground --model hydrogen --system-file "设定.md" --file "参考.pdf" --prompt "写正文" --out-file "out.md" --new-chat
& $py $cli playground --model research --prompt "深度调研" --out-file "research.md" --new-chat
& $py $cli playground --model lyria --prompt "warm cozy solo piano, 100bpm" --download-dir "./out"
& $py $cli playground --model tts --prompt "你好，欢迎光临！" --download-dir "./out"

# Google Flow（默认 x1 省点数）& AI Studio Build 整套工程（默认 MAX + Neon）
& $py $cli flow --media image --model "Nano Banana 2.1" --aspect 16:9 --resolution 2K --prompt "提示词" --download-dir "./out"
& $py $cli build --mode max --model neon --framework React --prompt "整套全栈需求" --download-dir "./out" --extract

# 通道 A 下载收割与 JSON 包自动拆包（不经本地 AI 上下文）
& $py $cli harvest --pattern "bundle*.json" --unpack-json --dest "./out"
```
