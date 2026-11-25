# AgentLimb 精确参数表与四大渠道一键 JS 宏（默认零重登托底通道 A）

> **通道定位与用户自选说明**：AgentLimb MCP（通道 A）**直接复用你日常 Chrome 已登录账号、无需新建浏览器目录重新登录、开箱即用最省心**，是本 Skill 的稳妥托底默认方案；缺点是受单步轮询限制，大型多员工并发工程耗时较长。**若希望提速 5~10 倍体验单命令 `wave` 并发，可向用户说明后由用户自己选择配置独立 AI Chrome Profile（需在新窗口自登一次，纯本地运行）**。
>
> **环境与防坑**：本地推荐 `AgentLimb >= v0.8.2`（配置在 `~/.gemini/config/mcp_config.json`）。在三大站点严禁截图或调 `read_page` / `form_input` / `computer` 轮询；单次 `javascript_eval` 上限 **20s**，长任务发包与提取分开。

## 1. 六个必用 MCP 工具精确参数表（禁止猜错字段名）

- `tab_new`: `{"url": "https://...", "active": false}` → 每个新员工角色必须开独立 Tab 并记下返回的 `tab.id`。
- `tab_activate`: `{"tabId": 123}` → **提取结果、滚动或点击下载前必须先调用**（防后台 Tab 休眠冻结）。
- `javascript_eval`: `{"tabId": 123, "expression": "..."}` → **参数名是 `expression`（禁止写 `script`）**！
- `wait`: `{"tabId": 123, "condition": "page_contains", "text": "Response ready.", "timeout": 30000}`（或 `"hidden"` 等 `Stop` 消失）→ **参数名是 `timeout`（禁止写 `ms`）**。
- `tab_close` / `say`: `{"tabId": 123}` / `{"text": "完成摘要"}`（结束后务必调 `say` 释放面板）。

## 2. AI Studio Playground：带 ROLE 锁发包 + 自动下载 `bundle-<role>.json` 宏

**发包宏（支持按难度调速 `minimal/low/medium/high/extra_high`，自动拉满 Output，冲突拦截）：**
```js
(async (PROMPT, LEVEL = 'medium', ROLE = 'director') => {
  if (window.__WEB_TEAM_ROLE && window.__WEB_TEAM_ROLE !== ROLE) {
    return { error: `ROLE_CONFLICT: 当前Tab已绑定 ${window.__WEB_TEAM_ROLE}，严禁混入 ${ROLE}，请调 tab_new 开新页！` };
  }
  window.__WEB_TEAM_ROLE = ROLE;
  if (!document.title.startsWith(`[ROLE:${ROLE}]`)) document.title = `[ROLE:${ROLE}] ` + document.title;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tl = document.querySelector('mat-select[aria-label="Thinking Level"]');
  if (tl && LEVEL !== 'default') {
    tl.click(); await wait(250);
    const opts = [...document.querySelectorAll('.cdk-overlay-pane mat-option')].filter(
      o => o.getAttribute('aria-disabled') !== 'true' && !/\bpaid\b/i.test(o.innerText)
    );
    const txt = o => (o.innerText || '').replace(/\s+/g, ' ').trim();
    const lv = LEVEL.toLowerCase();
    let pick = null;
    if (lv === 'max' || lv === 'extra_high') pick = opts.find(o => /extra\s*high/i.test(txt(o))) || opts.find(o => /^high$/i.test(txt(o))) || opts.at(-1);
    else if (lv === 'high') pick = opts.find(o => /^high$/i.test(txt(o))) || opts.find(o => /high/i.test(txt(o)) && !/extra/i.test(txt(o)));
    else if (lv === 'medium') pick = opts.find(o => /^medium$/i.test(txt(o))) || opts.find(o => /medium/i.test(txt(o)));
    else if (lv === 'low') pick = opts.find(o => /^low$/i.test(txt(o))) || opts.find(o => /low/i.test(txt(o)));
    else if (lv === 'minimal') pick = opts.find(o => /minimal/i.test(txt(o))) || opts.find(o => /^low$/i.test(txt(o))) || opts[0];
    if (pick) { pick.click(); await wait(200); } else { document.body.click(); await wait(150); }
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
  return { dispatched: !!runBtn, level: LEVEL, role: ROLE };
})("这里填提示词", "medium", "director")
```

**提取与自动打包下载 `bundle-<role>.json` 宏（先 `tab_activate` 唤醒虚拟滚动！零万字回传，带 `503/high demand` 快速纠错，再 `harvest --unpack-json` 解包）：**
```js
((ROLE = 'coder') => {
  if (document.visibilityState === 'hidden') return { ready: false, warning: 'TAB_HIDDEN_FROZEN: 请先调用 tab_activate 再提取!' };
  const errRe = /权限遭拒|permission denied|503|service is unavailable|high demand|error 14|quota|rate limit/i;
  const snack = [...document.querySelectorAll('.mat-mdc-snack-bar-container, simple-snack-bar, [role="alert"]')].map(e => (e.textContent || '').trim()).find(t => errRe.test(t));
  if (snack) return { ready: false, error: snack };
  const turns = [...document.querySelectorAll('[data-turn-role="Model"]')];
  const last = turns.at(-1); if (!last) return { ready: false };
  last.scrollIntoView();
  const tSet = new Set(last.querySelectorAll('ms-thought-chunk, mat-expansion-panel'));
  const text = [...last.querySelectorAll('ms-cmark-node')].filter(n => !tSet.has(n) && ![...tSet].some(t => t.contains(n)) && !n.parentElement?.closest('ms-cmark-node')).map(n => n.innerText.trim()).filter(Boolean).join('\n\n');
  if (!text || text === '正在思考') {
    const raw = (last.innerText || last.textContent || '').trim();
    if (errRe.test(raw)) return { ready: false, error: raw.slice(0, 300) };
    return { ready: false };
  }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      const obj = JSON.parse(text.slice(s, e + 1));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
      a.download = `bundle-${ROLE}.json`; a.click();
      return { ready: true, bundled: a.download, files: Object.keys(obj), url: location.href };
    } catch {}
  }
  return { ready: true, url: location.href, textChars: text.length, preview: text.slice(0, 600), fullTextIfShort: text.length <= 2500 ? text : '' };
})("coder")
```

## 3. Gemini Web `任务 (Task)`：角色绑定发包 + Drive / Import Code 协作

打开 `https://gemini.google.com/app` 后**务必先等 `wait(condition="visible", selector="gem-segmented-button button", timeout=15000)`**（该切换器异步延迟水合，抢在出现前点会误走普通对话导致无沙盒/无网！），确认出现后再执行（`MODEL`: `'Neon'` 或 `'Hydrogen'`；`ROLE` 冲突自动拦截）：
```js
(async (PROMPT, MODEL = 'Hydrogen', ROLE = 'worker') => {
  if (window.__WEB_TEAM_ROLE && window.__WEB_TEAM_ROLE !== ROLE) return { error: `ROLE_CONFLICT: 当前Tab已绑定 ${window.__WEB_TEAM_ROLE}，严禁混入 ${ROLE}，请调用 tab_new！` };
  window.__WEB_TEAM_ROLE = ROLE;
  if (!document.title.startsWith(`[ROLE:${ROLE}]`)) document.title = `[ROLE:${ROLE}] ` + document.title;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const taskBtn = [...document.querySelectorAll('gem-segmented-button button, button')].find(b => /^\s*(任务|Task)\s*$/i.test((b.innerText || '').trim()));
  if (taskBtn) { taskBtn.click(); await wait(700); }
  const enteredTask = taskBtn?.getAttribute('aria-pressed') === 'true';
  const mb = document.querySelector('bard-mode-menu-button button, [data-test-id="bard-mode-menu-button"]');
  if (mb) {
    mb.click(); await wait(350);
    const opt = [...document.querySelectorAll('[role="menuitemradio"], [data-test-id^="bard-mode-option"]')].find(o => new RegExp(MODEL, 'i').test(o.innerText || ''));
    if (opt) opt.click(); else document.body.click();
    await wait(350);
  }
  const box = document.querySelector('div[role="textbox"]');
  box.focus(); box.textContent = PROMPT;
  box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: PROMPT }));
  await wait(450);
  const send = document.querySelector('button[aria-label="发送"], button[aria-label*="Send" i]');
  if (send && !send.disabled) send.click();
  await wait(800);
  return { dispatched: !!send && !send.disabled, enteredTask, needsTrustedClick: (box.innerText || '').trim().length > 0, role: ROLE, model: MODEL };
})("在云端 Linux 主机完成验证并用 Python zipfile 打包输出", "Neon", "qa_tester")
```
- **若返回 `needsTrustedClick: true`**：先 `tab_activate` 再调用 `computer(action="click", selector='button[aria-label="发送"]')` 补发一次真实鼠标点击即可稳妥提交。
- **Google Drive 零中转 & 云主机联网（`gemini-spark`）**：AI Studio 对话默认存入同账号 Google Drive（URL `/prompts/<id>`），直接在 Task Prompt 里告知标题或文件名，Task 员工即可自己从 Drive 读取；如已引导用户在 `https://gemini.google.com/gemini-spark` 开启“允许远程计算机访问网络”，可放心让 Task 自行 `pip/npm install` 或调外部 API（**严禁传 API Key/机密数据**）。
- **Import Code 入口**：Gemini Web 的 `上传和工具` / `Upload & tools` (`button[aria-label="上传和工具"], button[aria-label*="Upload & tools" i]`) → `更多上传选项` / `More uploads` → `Import code` 支持输入 GitHub 仓库 URL 或点击 `Upload folder` 上传本地文件夹（本地无弹窗上传建议走通道 B `ask --folder` / `ask --github`）。
- **注意新版选择器**：刚进入 `gemini.google.com/app` 时 `bard-mode-menu-button` 可能未首屏渲染（`if (mb)` 会安全跳过，首轮发包后即恢复显示）。
- **提取产出**：先 `tab_activate`，查最后一条 `model-response` 内 `a[download], button[aria-label*="下载"], button[aria-label*="Download" i]` 触发下载，随后 `harvest --pattern "*.zip" --dest "<项目>"`。

## 4. Google Flow (`flow.google.com`)：一键 `x1` 生图（0 点数）+ 下载宏

开 `https://flow.google.com/` 建新项目后执行（**每图换新 prompt 后依次或分 Tab 触发，严禁同一轮触发 4 张**）：
```js
(async (PROMPT, ASPECT = '16:9', ROLE = 'artist') => {
  if (window.__WEB_TEAM_ROLE && window.__WEB_TEAM_ROLE !== ROLE) return { error: `ROLE_CONFLICT: 已有角色 ${window.__WEB_TEAM_ROLE}` };
  window.__WEB_TEAM_ROLE = ROLE;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const trig = document.querySelector('button[aria-label="设置触发器"], button[aria-label*="Settings" i]');
  if (trig) {
    trig.click(); await wait(350);
    const pickTxt = re => [...document.querySelectorAll('button, [role="option"], [role="menuitem"], mat-option')].find(el => el.offsetParent && re.test((el.innerText || '').trim()));
    pickTxt(/^(图片|Image)$/i)?.click(); await wait(200);
    pickTxt(/Nano Banana 2\.1/i)?.click(); await wait(200);
    pickTxt(new RegExp(ASPECT.replace('/', '\\/')))?.click(); await wait(200);
    pickTxt(/^x1$/i)?.click(); await wait(200);
    document.body.click(); await wait(200);
  }
  const ed = document.querySelector('div.ProseMirror');
  if (!ed) return { dispatched: false, reason: 'no editor' };
  ed.focus(); ed.textContent = PROMPT;
  ed.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: PROMPT }));
  await wait(350);
  const go = document.querySelector('button[aria-label="开始生成"], button[aria-label*="Generate" i]');
  if (go && !go.disabled) go.click();
  return { dispatched: !!go && !go.disabled, role: ROLE };
})("charcoal sketch apocalyptic bunker shelter interior, 2d game background", "16:9", "artist")
```
出图后先 `tab_activate`，点击第一张结果卡片上的下载按钮（或取 `img.src` 用 `<a download="art_1.png">` 下载）后用 `harvest --pattern "*.png,*.jpg" --dest "<项目>/assets"` 归档。

## 5. AI Studio 专项音频台（Lyria 3.5 配乐 & 3.8 Flash TTS 配音）一键发包与直下

- **Lyria 3.5 (`/new_music?model=lyria-3.5`) 发包宏**：点击 `button.empty-state__title-button` → 写入 `textarea[aria-label="Prompt input"]` + `InputEvent` → 等 `300ms` 点 `button.ctrl-enter-submits`。
- **3.8 Flash TTS (`/generate-speech?model=gemini-3.8-flash-tts`) 发包宏**：点击 `mat-card.create-dialog-card` → 按需点 `button.voice-chip` → 写入 `textarea[aria-label="Speech block text"]` + `InputEvent` → 点 `button.ctrl-enter-submits`。
- **通用音频直下宏（等生成完成后 `tab_activate` 再执行，1 次只下 1 首避免拦截）**：
  ```js
  ((FNAME = 'bgm.mp3') => {
    const src = [...document.querySelectorAll('audio[src^="data:audio/"]')].at(-1)?.src;
    if (!src) return { ready: false };
    const a = document.createElement('a'); a.href = src; a.download = FNAME; a.click();
    return { ready: true, downloaded: FNAME };
  })("bgm.mp3")
  ```
  下载后执行 `harvest --pattern "*.mp3,*.wav" --dest "<项目>/assets"` 直接移入项目 `assets/` 目录。

## 6. AI Studio 无弹窗传文件模板 & 版本排查

- **DataTransfer 上传**：读文件 Base64 后注入 `ms-add-media-button input[type="file"], input.file-input`（`new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], '设定.md')` 赋值 `inp.files = dt.files` 并派发 `change`）。
- **版本排查**：推荐使用 **AgentLimb `>= v0.8.2`**（修复 `v0.8.1` 的 `/health` 404 内存累积；旧版排查见 [Issue #1](https://github.com/582835293/gemini-web-agent/issues/1)），或直接切换高速通道 B（独立 `Gemini AI Chrome` + `gemini_web.py wave`）。
