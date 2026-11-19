---
name: gemini-web-agent
description: >-
  【必须最优先加载・一律先问后用】当用户提到 AI Studio, Google Flow, Gemini 网页端, 或指定 Hydrogen, Argon, Neon, Flash, Flash-Lite, Nano Banana, Omni, Lyria, TTS, 或要求并发算法、生图/生视频/长文本时，必须第一步调用本 skill！
  1. 严格遵循「一律先问后用」：第 1 步必须先在聊天中输出【🌐 Gemini Web Agent】卡片并停止回复，严禁直接调用 gemini_web_agent 工具发包，严禁调用 ask_user_question！
  2. 待用户明确确认（回复「1」或「确认」）后才在下一轮正式发包！
  3. 严格尊重用户指定的模型（如 Flash Lite、Argon），提案卡必须原样呈现，严禁擅自升级为 Hydrogen！严禁本地代劳，严禁调用 subagent。
---

# Gemini Web-Agent（三站点全模态与额度调度）

> [!IMPORTANT]
> **🚨 最高命令铁律：明令禁止本地模型擅自代劳与 Subagent 劫持**  
> 当使用者在对话中显式指定调用 **`gemini-web-agent`**、**`gemini_web_agent`**、**`/gw`**、**“Gemini 网页端”**、**“Google 网页”**、**“AI Studio”**、**“Google Flow”**，指定使用 **`Hydrogen` / `Argon` / `Neon` / `Flash` / `Flash-Lite` / `Nano Banana` / `Omni` / `Lyria`** 等模型，或提出高算力架构推演、C++/Rust/Python 高效能并发算法（如无锁队列、线程池、内存模型）等复杂编程任务时：  
> 1. **【绝对禁令】**：本地宿主 AI（DeepSeek / Claude / GPT 等）**严禁自行在本地编写答案或擅自代劳作答**！  
> 2. **【严禁 Subagent 劫持】**：**严禁调用 `subagent` 或 `list_subagent_models` 打付费 Google API 路由**！使用者的核心诉求是使用外部浏览器的【零 Token 免费池 (key_off)】，严禁偷开 subagent 消耗用户本地付费配额！
> 3. **【一律先问后用确认卡工作流 (唯一标准流程)】**：
>    - **第 1 步绝对禁令**：在接收到用户指令的第 1 步，**绝对禁止直接调用 `gemini_web_agent` 工具发包，绝对禁止调用 `ask_user_question`**！宿主 AI 必须先在文本回复中向用户呈现【🌐 Gemini Web Agent】确认卡（执行渠道 `site`、入口模式 `entry`、执行模型 `model`、推演配置 `thinking_level` 与话题隔离 `new_chat`），并**立即结束当前回显**等待用户确认；
>    - **第 2 步授权发包**：待用户明确确认（回复「确认」、「1」或调整参数）后，才在下一轮正式调用 `gemini_web_agent` 发包执行；
> 4. **🎯【严格尊重用户指定模型・严禁擅自“升级”】**：
>    - 若用户明确要求「用 Gemini 3.5 Flash Lite」、「用 Flash」、「用 Argon」等，**必须 100% 将用户指定的模型代号（如 `flash-lite`、`flash`、`argon`）写入提案卡并传入 `model` 参数**！
>    - **严禁**因为看到代码任务就自作聪明把用户的 `flash-lite` 擅自“升级”成 `hydrogen`！只有当用户**完全没有指定任何模型名称**时，才允许根据场景表格推荐默认模型。
> 5. **【0 探测开销】**：底层 Chrome 与 AgentLimb 桥接已由外挂 Daemon 背景完全托管。**发包前严禁进行任何端口扫描、进程检查、代码逆向或环境探测**！直接发包执行！
> 6. **【📦 成果交付规范】**：调用 `gemini_web_agent` 完成后，使用者在前端聊天窗口看不见 tool result 内部细节！你必须在最终回复中，将工具回传之「降级流程通知」、「落地文件超链接 (file://)」以及核心架构设计与关键实现精华完整呈现给使用者。完整源码已自动落地保存至本地工作区文件，引导用户直接点击文件链接查看，切忌全量重抄超长全量源码导致小模型 SSE 串流中断（Incomplete JSON segment at the end）！

优先通过 **AgentLimb MCP**（永久免弹窗操控已登录外部 Chrome），或备用 [gemini_web.py](scripts/gemini_web.py)，统筹调度 **`aistudio.google.com`**、**`flow.google.com`** 与 **`gemini.google.com`**。

---

## 0. 核心调度模式：一律「先问后用」（原作者规范）

> [!TIP]
> 🛡️ **先问后用模式（原作者规范・安全透明）**：
> 当用户提出需要调用外部资源的任务时，宿主 AI 先输出「🌐 Gemini Web Agent」卡片，将底层的真实参数（执行渠道、入口模式、执行模型、推演配置与话题隔离策略）透明化呈现给用户审阅。待用户确认（回复「确认」、「1」或调整参数）后，下一轮立即调用 `gemini_web_agent` 真实发包执行。无任何例外分支，小模型零理解负担！
>
> **【🚨 严禁使用 Subagent 劫持】**：
> 任何情况下严禁调用 `subagent` 或 `list_subagent_models` 呼叫付费 Google API 路由！使用者的核心诉求是使用外部浏览器的【零 Token 免费池 (key_off)】，绝不偷跑消耗本地付费配额！

- 账号安全红线：**严禁 `taskkill` / 强杀日常 Chrome**，严禁擅自改动用户 Chrome `--user-data-dir`。
- 通道优先级：首选 **AgentLimb**（`127.0.0.1:8765`），备用 **CLI 自动化**（`scripts/gemini_web.py`）。

---

## 一、 七大场景最优调度与常用主力模型

| 任务场景 | 首选渠道（URL & 模型） | 次选 / 兜底 | 额度与关键参数 |
| :--- | :--- | :--- | :--- |
| **轻量开发 / 独立原型 / 异步任务** | `gemini.google.com/app` **`任务 (Task)`（`4 Hydrogen`）**（**优先级高于 Build**，产出干净不乱加料） | Playground `gemini-4-hydrogen` / `Canvas` | 走网页主额度 |
| **日常推理 / 1M 长输出 / 代码** | `aistudio.google.com/prompts/new_chat?model=gemini-4-hydrogen` | `gemini.google.com/app`（`任务` / 对话） | **`key_off` 免费**；Thinking 设为 **`High`**（封印 Extra High），输出拉 `1048576` |
| **复杂架构 / 深度研究** | `aistudio.google.com/prompts/new_chat?model=gemini-4-neon`（或 `gemini-4-argon` / `deep-research-preview-04-2026`） | `gemini.google.com/app`（`4 Neon` / `Deep Research`；Web 端 `4 Argon` 已替换为 `4 Neon`） | AI Studio **`key_off`**；Thinking 设为 **`High`**（封印 Extra High）+ `1048576` |
| **图片生成与参考改图** | `flow.google.com`（`Nano Banana 2.1`，**0 点数**，务必改 **`x1`**，可下 `2K`） | Playground `gemini-nano-banana-2.1`（`key_off`）/ Gemini `制作图片` | Flow 每日数十张免费；参考图改图见 `references/agentlimb.md` |
| **视频生成（含原生音频）** | `aistudio.google.com/prompts/new_chat?model=gemini-omni-1.2-flash`（最高 15s） | Flow（`Omni 1.2 Flash` 8~24 点 / `Veo 3.1 - Lite` 10 点，选 `x1`） | AI Studio **`key_off` 免费不扣 Flow 点数** |
| **完整歌曲 / 配音 / 转写** | `aistudio.google.com/new_music?model=lyria-3.5` / `/generate-speech?model=gemini-3.8-flash-tts` | `gemini.google.com` `制作音乐` / `?model=gemini-3.5-transcribe` | **`key_off` 免费**（MP3 / WAV base64 直出） |
| **从零构建一整套完整工程** | `aistudio.google.com/apps`（**仅用于整套工程**，选 **`MAX` + `Gemini 4 Neon`**，其次 `Argon`，避开 `Paid`） | `gemini.google.com` **`任务 (Task)`**（局部需求用 Task） | 走 Pro 网页额度，导出 `.zip` |

> **常用直达 `model-id`**：`gemini-4-neon` · `gemini-4-hydrogen` · `gemini-4-argon` · `deep-research-preview-04-2026` · `gemini-nano-banana-2.1` · `gemini-omni-1.2-flash` · `lyria-3.5` · `gemini-3.8-flash-tts` · `gemini-3.5-transcribe`。其余小众/历史/Paid 模型速查（含 Flow 停用提示）见 [references/models.md](references/models.md)。

---

## 二、 额度巡检与「先问后用」提案规范

> **省本地 Input Token 原则**：本 Skill 脚本默认输出 1~3 行极简摘要并屏蔽思考链；长代码/报告优先用 `--out-file <路径>` 或网页单包 Blob 下载 + `harvest`，严禁回传几万字给本地 AI 重抄。

1. **多端额度检测（按需执行）**：
   - **网页端 `/usage`**：通道 A 后台开 `tab_new("https://gemini.google.com/usage", active=false)` 等 `[data-testid="current-usage"]`，读取 `[data-usage-island-root] header span`、`[data-testid="current-usage"]`、`[data-testid="weekly-usage"]` 后 `tab_close`（遇 `[role="alert"]` 限流提示即切 AI Studio `key_off`）；通道 B 运行 `gemini_web.py usage --include-flow`。
   - **Google Flow 点数**：开 `https://flow.google.com/` 点 `[aria-label="账号详情"]`，读 `[role="dialog"]` 内 `X 个 Google Flow 点数` 与重置时间后关页；通道 B 运行 `flow-usage`。
   - **本地 Antigravity 对比（仅 Antigravity 环境，Claude Code/Codex 跳过）**：使用 `setup_skill.py` 输出的 `inspect=` 路径执行 `python "<inspect路径>"`（已内置增量缓存与轻量探测；默认 3 行极简摘要，可选 `--live-only` 仅查配额、`--all-history` 扫全部历史、`--markdown` 看详表）。

2. **先问后用确认卡（Proposal Before Execution）标准范式**：
   在「先问后用」模式下（用户未明确指定直接发包时），宿主 AI 先向用户呈现如下结构化卡片，并**在此立即停止回复**，等待用户确认：

   **核心格式规范**：
   - 标题统一为 `### 🌐 Gemini Web Agent`（无括号与额外后缀）
   - 第二行保留具体任务描述反馈（例如：`检测到您欲调用外部 Google 网页端实现并发任务，相关配置如下：`）
   - **【防塌陷排版铁律】**：各项必须严格以 Markdown 无序列表符号 `- ` 开头（如 `- 🎯 ...`），严禁省略 `- ` 导致 Markdown 引擎将多行折叠合并为单行！
   - **【执行模型换行展示铁律】**：
     - 在「智能/定时模式」（默认模式）下，必须以二级列表 `  - ` 在下一行缩进展示完整阶梯序列（即 `- 🧠 执行模型：（智能/定时模式）\n  - gemini-4-hydrogen -> ...`），严禁挤在同一行，严禁擅自缩水只写单个模型，严禁输出未渲染的 HTML 标签（如 `<br>`）！
     - 仅在明确处于「严格模式」时，才输出单个锁定模型（`- 🧠 执行模型：（严格模式）\n  - gemini-4-hydrogen`）。
   - `- 🚪 入口模式：chat`（保持极简，无额外括号）
   - `- ⚙️ 推演配置：Thinking 设为 high`（按设定动态显示 high/medium，无多余冗余解释）
   - `- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）`
   - **完全不显示预估成本项**

   **全部四大情景标准模板**：

   - **情景一：Google AI Studio（智能 / 定时模式）**
     > 用户配置了备援梯队（严格根据用户 GUI 设置的 1~5 个备援模型动态展示，不强制绑定任何未选择的模型）：
     ```markdown
     ### 🌐 Gemini Web Agent
     检测到您欲调用外部 Google 网页端实现并发任务，相关配置如下：

     - 🎯 执行渠道：Google AI Studio（可选择：Google AI Studio / Gemini Web）
     - 🚪 入口模式：chat
     - 🧠 执行模型：（智能/定时模式）
       - gemini-4-neon -> gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.5-flash-lite
     - ⚙️ 推演配置：Thinking 设为 high
     - 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

     👉 请确认是否发包执行？
     - 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
     - 回复 调整参数（如「改用 Flash Lite」、「改用 Argon」等）：按您的要求调整后直接发包
     - 回复 「取消」：中止外部调度，改由本地作答
     ```

   - **情景二：Google AI Studio（严格模式）**
     > 用户选择了严格模式（锁定单模型不降级）：
     ```markdown
     ### 🌐 Gemini Web Agent
     检测到您欲调用外部 Google 网页端实现并发任务，相关配置如下：

     - 🎯 执行渠道：Google AI Studio（可选择：Google AI Studio / Gemini Web）
     - 🚪 入口模式：chat
     - 🧠 执行模型：（严格模式）
       - gemini-4-hydrogen
     - ⚙️ 推演配置：Thinking 设为 high
     - 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

     👉 请确认是否发包执行？
     - 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
     - 回复 调整参数（如「改用 Flash Lite」、「改用 Argon」等）：按您的要求调整后直接发包
     - 回复 「取消」：中止外部调度，改由本地作答
     ```

   - **情景三：Gemini 官网通道（Gemini Web）**
     > 用户指定或选择了 gemini.google.com 渠道：
     ```markdown
     ### 🌐 Gemini Web Agent
     检测到您欲调用外部 Google 网页端实现任务，相关配置如下：

     - 🎯 执行渠道：gemini.google.com（可选择：Google AI Studio / Gemini Web）
     - 🚪 入口模式：chat
     - 🧠 执行模型：Auto
     - ⚙️ 推演配置：Thinking 设为 high
     - 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

     👉 请确认是否发包执行？
     - 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
     - 回复 调整参数：按您的要求调整后直接发包
     - 回复 「取消」：中止外部调度，改由本地作答
     ```

   - **情景四：Google Flow（生图 / 视频）**
     > 图像生成、视频生成创意流：
     ```markdown
     ### 🌐 Gemini Web Agent
     检测到您欲调用外部 Google 网页端实现多媒体生成，相关配置如下：

     - 🎯 执行渠道：Google Flow（flow）
     - 🚪 入口模式：chat
     - 🧠 执行模型：gemini-nano-banana-2.1
     - ⚙️ 推演配置：将生成数量设为 x1，分辨率设为 2K
     - 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

     👉 请确认是否发包执行？
     - 回复 「确认」 或 「1」：立即调用外部 Chrome 发包生成图像或视频
     - 回复 调整参数（如「改用 Omni」、「生成 4 张」等）：按您的要求调整后直接发包
     - 回复 「取消」：中止外部调度，改由本地作答
     ```

3. **提案参数与底层工具映射表**：
   提案里的每一项均与底层 `gemini_web_agent` 的真实参数严格一一对应：
   - **目标渠道** ➔ `site` (`aistudio` / `flow` / `gemini`)
   - **入口模式** ➔ `entry` (`chat` / `task`)
   - **目标模型** ➔ `model` (`hydrogen` / `neon` / `argon` / `nano2.1` / `omni1.2` / `lyria` 等)
   - **思考等级** ➔ `thinking_level` (`high` / `medium` / `low`)
   - **思考策略** ➔ `thinking_policy` (`adaptive` / `strict` / `custom`)
   - **话题隔离** ➔ `new_chat` (`false` / `true`)
   - **实质任务** ➔ `task` (用户的具体代码编写、分析或素材生成需求)

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
      // 封印 Extra High：免费池优先选 High，其次选 Medium，绝不选 Extra High（防 403 Permission Denied 与超长假死）
      const pick = opts.find(o => /^high$/i.test(o.innerText.trim())) || opts.find(o => /medium/i.test(o.innerText.trim())) || opts.at(-1);
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

# AI Studio Playground（默认自动选 High + 1048576，封印 Extra High；支持多模态与直写文件）
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
