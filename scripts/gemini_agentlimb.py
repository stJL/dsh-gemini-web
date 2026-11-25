#!/usr/bin/env python3
"""
gemini_agentlimb.py - AgentLimb Execution Engine for Gemini Web Agent.
100% silent, zero-popup browser automation via AgentLimb Bridge (localhost:8765).
"""

import sys
import os
import time
import json
import re
from pathlib import Path

# Add scripts directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    import agentlimb_client
except ImportError:
    raise RuntimeError("未找到 agentlimb_client.py 模組")

MODEL_MAP = {
    "flash": "gemini-3.8-flash",
    "3.8-flash": "gemini-3.8-flash",
    "gemini-3.8-flash": "gemini-3.8-flash",
    "flash-lite": "gemini-3.5-flash-lite",
    "3.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite": "gemini-3.5-flash-lite",
    "hydrogen": "gemini-4-hydrogen",
    "gemini-4-hydrogen": "gemini-4-hydrogen",
    "argon": "gemini-4-argon",
    "gemini-4-argon": "gemini-4-argon",
    "neon": "gemini-4-neon",
    "gemini-4-neon": "gemini-4-neon",
    "carbon": "gemini-4-carbon",
    "gemini-4-carbon": "gemini-4-carbon",
    "decision": "gemini-decision-1",
    "gemini-decision-1": "gemini-decision-1",
    "nano": "gemini-nano-banana-2.1",
    "nano2.1": "gemini-nano-banana-2.1",
    "nano-banana": "gemini-nano-banana-2.1",
    "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
    "nano-lite": "gemini-3.1-flash-lite-image",
    "nano2-lite": "gemini-3.1-flash-lite-image",
    "flash-lite-image": "gemini-3.1-flash-lite-image",
    "gemini-3.1-flash-lite-image": "gemini-3.1-flash-lite-image",
    "nano2": "gemini-3.1-flash-image",
    "gemini-3.1-flash-image": "gemini-3.1-flash-image",
    "nano-pro": "gemini-3-pro-image",
    "gemini-3-pro-image": "gemini-3-pro-image",
    "omni": "gemini-omni-1.2-flash",
    "omni1.2": "gemini-omni-1.2-flash",
    "gemini-omni-1.2-flash": "gemini-omni-1.2-flash",
    "tts": "gemini-3.8-flash-tts",
    "flash-tts": "gemini-3.8-flash-tts",
    "gemini-3.8-flash-tts": "gemini-3.8-flash-tts",
    "tts-lite": "gemini-3.8-flash-lite-tts",
    "gemini-3.8-flash-lite-tts": "gemini-3.8-flash-lite-tts",
    "lyria": "lyria-3.5",
    "lyria-3.5": "lyria-3.5",
    "lyria-3-pro": "lyria-3-pro-preview",
    "lyria-3-pro-preview": "lyria-3-pro-preview",
    "lyria-pro": "lyria-3-pro-preview",
    "research": "deep-research-preview-04-2026",
    "deep-research-preview-04-2026": "deep-research-preview-04-2026",
}


def resolve_model_id(model_name: str) -> str:
    key = (model_name or "hydrogen").strip().lower()
    return MODEL_MAP.get(key, key)


def _wait_aistudio_hydrated(tab_id: int, timeout: float = 15.0) -> bool:
    """等待 AI Studio 輸入框與模型選擇器水合就緒，避免未水合前搶點 Run 觸發 Permission denied。"""
    if not wait_for_selector(tab_id, 'textarea[aria-label="Enter a prompt"]', timeout=timeout):
        return False
    deadline = time.time() + 6.0
    js = """(() => {
      const sel = document.querySelector('.model-selector-card, [data-test-id="model-selector"], ms-model-selector-v3');
      const txt = (sel ? sel.innerText : '') || '';
      return txt.trim().length > 0;
    })()"""
    while time.time() < deadline:
        try:
            if agentlimb_client.eval_js(js, tab_id=tab_id).get("result", {}).get("result") is True:
                time.sleep(0.6)
                return True
        except Exception:
            pass
        time.sleep(0.35)
    return True


def _get_aistudio_selected_model_text(tab_id: int) -> str:
    try:
        res = agentlimb_client.eval_js(
            """(() => {
              const sel = document.querySelector('.model-selector-card, [data-test-id="model-selector"], ms-model-selector-v3');
              return (sel ? sel.innerText : '') || '';
            })()""",
            tab_id=tab_id,
        )
        return (res.get("result", {}).get("result", "") or "").lower()
    except Exception:
        return ""


def wait_for_selector(tab_id: int, selector: str, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    js = f"Boolean(document.querySelector({json.dumps(selector)}))"
    while time.time() < deadline:
        try:
            res = agentlimb_client.eval_js(js, tab_id=tab_id)
            if res.get("result", {}).get("result") is True:
                return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


import base64

FALLBACK_LADDER = {
    "gemini-4-carbon": ["gemini-4-neon", "gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-4-neon": ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-4-argon": ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-4-hydrogen": ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-3.8-flash": ["gemini-3.5-flash-lite"],
    "gemini-3.5-flash-lite": [],
    "gemini-decision-1": ["gemini-4-argon", "gemini-4-hydrogen", "gemini-3.8-flash"],
    "gemini-nano-banana-2.1": ["gemini-3.1-flash-lite-image", "flow"],
    "gemini-3-pro-image": ["gemini-3.1-flash-lite-image", "flow"],
    "gemini-3.1-flash-image": ["gemini-3.1-flash-lite-image", "flow"],
    "gemini-3.1-flash-lite-image": ["flow"],
}


def get_fallback_ladder(model_id: str) -> list[str]:
    """根据模型能级动态推导阶梯备援，未雨绸缪自适应未来新模型（Gemini 5 / Pro / Flash 等）"""
    mid = (model_id or "").lower()
    if mid in FALLBACK_LADDER:
        return FALLBACK_LADDER[mid]
    if any(k in mid for k in ("image", "nano")):
        return ["gemini-3.1-flash-lite-image", "flow"]
    if any(k in mid for k in ("carbon", "ultra")):
        return ["gemini-4-neon", "gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"]
    if any(k in mid for k in ("pro", "neon", "argon", "max", "reason")):
        return ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"]
    elif any(k in mid for k in ("hydrogen", "plus", "standard", "flash")):
        return ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
    return ["gemini-3.5-flash-lite"]


def _save_data_url(data_url: str, out_dir: Path, prefix: str) -> str:
    """将 data:<mime>;base64,... 解码保存到本地文件"""
    m = re.match(r"^data:([^;]+);base64,(.+)$", data_url, re.DOTALL)
    if not m:
        return ""
    mime = m.group(1).lower()
    ext_map = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
    }
    ext = ext_map.get(mime, ".bin")
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{prefix}_{int(time.time() * 1000)}{ext}"
    target.write_bytes(base64.b64decode(m.group(2)))
    return str(target.resolve())


def _fetch_blob_as_data_url(tab_id: int, blob_url: str) -> str:
    """在浏览器中讀取 blob: URL 並轉為 data URL"""
    js = f"""(async () => {{
        try {{
            const resp = await fetch({json.dumps(blob_url)});
            const blob = await resp.blob();
            return await new Promise((resolve, reject) => {{
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject('FileReader failed');
                reader.readAsDataURL(blob);
            }});
        }} catch(e) {{
            return '';
        }}
    }})()"""
    try:
        res = agentlimb_client.eval_js(js, tab_id=tab_id)
        return res.get("result", {}).get("result", "")
    except Exception:
        return ""


def _aistudio_attach_files_agentlimb(tab_id: int, files: list[str], timeout_sec: int = 60) -> list[str]:
    """在 Google AI Studio 通过 DataTransfer 注入无弹窗上传本地文件，自动处理初次许可弹窗并等待解析。"""
    if not files:
        return []
    from urllib.parse import unquote, urlparse
    valid_paths: list[Path] = []
    for f in files:
        raw = str(f).strip().strip("'\"")
        if raw.startswith("file://"):
            raw = unquote(urlparse(raw).path)
        p = Path(raw).expanduser().resolve()
        if p.is_file():
            valid_paths.append(p)
        else:
            sys.stderr.write(f"⚠️ [Gemini Web Agent] 待挂载文件不存在，跳过: {f} (解析路径: {p})\n")
    if not valid_paths:
        return []

    import mimetypes

    # 1. 自动处理可能弹出的 "Start creating with media in Google AI Studio" (Acknowledge) 协议弹窗
    dismiss_js = """(() => {
      const ackBtns = Array.from(document.querySelectorAll("button")).filter(
        b => /acknowledge/i.test((b.innerText || '').trim())
      );
      ackBtns.forEach(b => b.click());
      return { clicked: ackBtns.length };
    })()"""
    try:
        agentlimb_client.eval_js(dismiss_js, tab_id=tab_id)
    except Exception:
        pass

    attached_names: list[str] = []
    for p in valid_paths:
        fname = p.name
        try:
            content_bytes = p.read_bytes()
        except Exception as e:
            sys.stderr.write(f"⚠️ [Gemini Web Agent] 读取文件失败: {p} ({e})\n")
            continue

        b64 = base64.b64encode(content_bytes).decode("ascii")
        mime_type, _ = mimetypes.guess_type(str(p))
        if not mime_type:
            mime_type = "text/plain" if p.suffix.lower() in (
                ".md", ".txt", ".json", ".py", ".cpp", ".hpp", ".h", ".c", ".ts", ".js", ".log", ".yml", ".yaml"
            ) else "application/octet-stream"

        upload_js = f"""(async (fname, b64, mimeType) => {{
          const inp = document.querySelector("ms-add-media-button input[type=file], input.file-input");
          if (!inp) return {{ ok: false, error: "file input not found" }};

          // 自动点掉 Acknowledge 弹窗
          const ack = Array.from(document.querySelectorAll("button")).find(b => /acknowledge/i.test(b.innerText || ''));
          if (ack) {{ ack.click(); await new Promise(r => setTimeout(r, 200)); }}

          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const file = new File([bytes], fname, {{ type: mimeType }});
          const dt = new DataTransfer();
          dt.items.add(file);
          inp.files = dt.files;

          inp.dispatchEvent(new Event("change", {{ bubbles: true }}));
          inp.dispatchEvent(new Event("input", {{ bubbles: true }}));
          return {{ ok: true, name: fname, size: file.size }};
        }})({json.dumps(fname)}, {json.dumps(b64)}, {json.dumps(mime_type)})"""

        try:
            res = agentlimb_client.eval_js(upload_js, tab_id=tab_id)
            if res.get("result", {}).get("result", {}).get("ok"):
                attached_names.append(fname)
        except Exception as e:
            sys.stderr.write(f"⚠️ [Gemini Web Agent] 上传文件 {fname} 异常: {e}\n")

    if not attached_names:
        return []

    # 2. 等待网页端解析与 Tokenization 完成
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        check_js = """(() => {
          const container = document.querySelector(".prompt-box-container, ms-prompt-box, footer");
          const text = (container ? container.innerText : '') || '';
          return {
            text: text,
            isLoading: /loading/i.test(text) || /uploading/i.test(text)
          };
        })()"""
        try:
            c_res = agentlimb_client.eval_js(check_js, tab_id=tab_id).get("result", {}).get("result", {})
            c_text = c_res.get("text", "")
            is_loading = c_res.get("isLoading", False)
            all_seen = all(name in c_text for name in attached_names)
            if all_seen and not is_loading:
                break
        except Exception:
            pass
        time.sleep(0.5)

    return attached_names


def _extract_and_save_code(text: str, task: str, download_dir: str = "") -> list[str]:
    """统一提取文本中的代码块并保存到本地工作区（KISS 简洁版，杜绝截断与重复代码）"""
    if not text:
        return []
    code_text = ""
    lang = ""

    # 1. 优先尝试提取 Markdown 围栏代码块（若有多块，选取最长的主实现代码块）
    blocks = re.findall(r'```([a-zA-Z0-9_\-\+\#]+)?\s*\n(.*?)```', text, re.DOTALL)
    if blocks:
        longest_block = max(blocks, key=lambda b: len(b[1].strip()))
        lang = (longest_block[0] or "").lower().strip()
        code_text = longest_block[1]

    # 2. 若未找到 Markdown 围栏，支持 Gemini Web 网页版富文本 DOM 直出格式 (如 "Python\nimport ...")
    if not code_text:
        m_start = re.search(r'(?:^|\n)(Rust|C\+\+|Python|Go|TypeScript|JavaScript|HTML|CSS|Bash)\s*\n', text, re.IGNORECASE)
        if m_start:
            lang = m_start.group(1).lower().strip()
            code_tail = text[m_start.end():]
            code_lines = []
            for line in code_tail.split('\n'):
                stripped = line.strip()
                # 检查是否遇到了代码块外部的自然语言段落标题（注意：代码内部的 #、// 等注释行严禁误判为标题）
                is_comment = stripped.startswith(('#', '//', '/*', '*', '"""', "'''"))
                is_code_kw = any(stripped.startswith(kw) for kw in (
                    'import ', 'from ', 'def ', 'class ', 'async ', 'await ', 'if ', 'elif ', 'else:', 'try:',
                    'except ', 'finally:', 'with ', 'for ', 'while ', 'return ', 'raise ', '@', 'pass', 'break',
                    'continue', 'self.', 'logger.', 'print(', 'fn ', 'struct ', 'impl ', 'pub ', 'use ', 'const ',
                    'let ', 'package ', 'func ', 'template ', 'namespace ', 'int ', 'void ', 'auto '
                ))
                if stripped and not is_comment and not is_code_kw:
                    if re.match(r'^(?:#{1,6}\s+|[一二三四五六七八九十\d]+[、\.]\s*|生产环境|使用说明|注意事项|运行说明|总结|扩展建议|核心特性)', stripped):
                        break
                code_lines.append(line)
            code_text = '\n'.join(code_lines)

    if not code_text or len(code_text.strip()) < 30:
        return []

    ext_map = {
        "cpp": ".cpp", "c++": ".cpp", "cxx": ".cpp", "c": ".c", "h": ".h", "hpp": ".hpp",
        "python": ".py", "py": ".py", "rust": ".rs", "rs": ".rs", "go": ".go", "golang": ".go",
        "javascript": ".js", "js": ".js", "typescript": ".ts", "ts": ".ts",
        "html": ".html", "css": ".css", "sh": ".sh", "bash": ".sh", "json": ".json", "yaml": ".yaml", "yml": ".yml", "toml": ".toml"
    }
    ext = ext_map.get(lang, ".py" if "python" in task.lower() else ".txt")
    stem = "gemini_generated_code"
    tl = task.lower()
    if any(k in tl for k in ("thread", "线程池")):
        stem = "thread_pool"
    elif any(k in tl for k in ("actor", "akka", "rust")):
        stem = "actor_system"
    elif any(k in tl for k in ("queue", "无锁", "队列")):
        stem = "lock_free_queue"
    elif any(k in tl for k in ("crawler", "爬虫")):
        stem = "async_crawler"
    elif any(k in tl for k in ("tree", "红黑树")):
        stem = "red_black_tree"
    elif any(k in tl for k in ("limiter", "限流", "重试")):
        stem = "rate_limiter"

    out_p = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
    out_p.mkdir(parents=True, exist_ok=True)
    code_file = out_p / f"{stem}{ext}"
    try:
        code_file.write_text(code_text.strip(), encoding="utf-8")
        return [str(code_file.resolve())]
    except Exception as e:
        print(f"[code_save_error] {e}", file=sys.stderr)
        return []


def _run_gemini_web_task(
    task: str,
    model: str = "hydrogen",
    timeout_sec: int = 180,
    new_chat: bool = False,
    download_dir: str = "",
    keep_tab: bool = False,
    entry: str = "chat",
) -> dict:
    """在外部浏览器的 gemini.google.com/app 中执行对话（支援 TrustedHTML、零彈窗、模型切換與多輪隔離）"""
    t0 = time.time()
    tabs = agentlimb_client.get_tabs()
    target_tab = None
    for t in tabs:
        url = t.get("url", "")
        if "gemini.google.com" in url and "gemini.google.com/usage" not in url:
            target_tab = t
            break

    target_url = "https://gemini.google.com/app"
    created_tab = False
    if target_tab is None:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": target_url, "active": True})
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
        created_tab = True
    else:
        tab_id = target_tab.get("id")
        agentlimb_client.call_tool("tab_activate", {"tabId": tab_id})
        current_tab_url = target_tab.get("url", "")
        if new_chat:
            agentlimb_client.call_tool("navigate", {"tabId": tab_id, "url": target_url})
            time.sleep(0.8)

    def _execute():
        # 先檢查是否被 Google 風控重導向至 google.com/sorry 人機驗證頁（嚴禁繞過，立即回報）
        try:
            cur_u = str(agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", "") or "")
            if "google.com/sorry" in cur_u.lower() or "/sorry/index" in cur_u.lower():
                return {
                    "ok": False,
                    "site": "gemini",
                    "error": "Gemini 官网触发 Google 人机验证 (google.com/sorry)，请在可见浏览器窗口手动完成验证后重试。",
                    "captcha_blocked": True,
                }
        except Exception:
            pass

        ready = wait_for_selector(tab_id, 'div[role="textbox"]', timeout=15.0)
        if not ready:
            try:
                cur_u = str(agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", "") or "")
                if "google.com/sorry" in cur_u.lower() or "/sorry/index" in cur_u.lower():
                    return {
                        "ok": False,
                        "site": "gemini",
                        "error": "Gemini 官网触发 Google 人机验证 (google.com/sorry)，请在可见浏览器窗口手动完成验证后重试。",
                        "captcha_blocked": True,
                    }
            except Exception:
                pass
            return {"ok": False, "error": "Gemini 官网页面加载超时（未找到输入框）"}

        # 0. 若指定 entry == "task"，等待延迟水合的对话/任务分段切换器并切入「任务 (Task)」模式（免费号无 Task 按钮时 3s 快速放行）
        if (entry or "").strip().lower() == "task":
            task_switch_js = """(async () => {
              const wait = ms => new Promise(r => setTimeout(r, ms));
              const findTaskBtn = () => {
                const btns = Array.from(document.querySelectorAll('gem-segmented-button button, button'));
                return btns.find(b => {
                  const rect = b.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return false;
                  return /^\\s*(任务|任務|Task)\\s*$/i.test((b.innerText || b.textContent || '').trim());
                }) || null;
              };
              let taskBtn = null;
              for (let i = 0; i < 6; i++) {
                taskBtn = findTaskBtn();
                if (taskBtn) break;
                await wait(500);
              }
              if (!taskBtn) return { ok: false, enteredTask: false, reason: 'task_btn_not_found' };
              if ((taskBtn.getAttribute('aria-pressed') || '').toLowerCase() !== 'true') {
                taskBtn.click();
                for (let i = 0; i < 12; i++) {
                  await wait(200);
                  if ((taskBtn.getAttribute('aria-pressed') || '').toLowerCase() === 'true') break;
                }
              }
              await wait(450);
              return {
                ok: true,
                enteredTask: (taskBtn.getAttribute('aria-pressed') || '').toLowerCase() === 'true'
              };
            })()"""
            try:
                agentlimb_client.eval_js(task_switch_js, tab_id=tab_id)
            except Exception:
                pass

        # 0.5 未雨綢繆：動態能級探測與全自動解鎖選模 (完全適應未來 Gemini 5、各類會員階層與無菜单模式)
        ml = (model or "").lower()
        if any(k in ml for k in ("argon", "neon", "pro", "ultra", "complex", "code", "deeper", "reason")):
            target_intent = "reasoning"
        elif any(k in ml for k in ("hydrogen", "flash", "everyday", "balanced")):
            target_intent = "balanced"
        else:
            target_intent = "auto"

        switch_mode_js = r"""(async (intent) => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const picker = Array.from(document.querySelectorAll('button')).find(b => 
                (b.getAttribute('aria-label') || '').includes('Open mode picker') ||
                (b.getAttribute('aria-label') || '').includes('選擇模型') ||
                (b.getAttribute('aria-label') || '').includes('模式')
            );
            if (!picker) return { ok: true, activeModel: 'Auto (預設通道)', reason: 'no_picker' };

            const currentPickerLabel = (picker.getAttribute('aria-label') || '') + ' ' + (picker.innerText || '');

            // 確保菜单已開啟
            if (picker.getAttribute('aria-expanded') !== 'true') {
                picker.click();
            }

            // 等待項目加载 (最多 600ms)
            let items = [];
            for (let i = 0; i < 6; i++) {
                await wait(100);
                items = Array.from(document.querySelectorAll('[data-mode-id]'));
                if (items.length > 0) break;
            }

            if (items.length === 0) {
                if (picker.getAttribute('aria-expanded') === 'true') picker.click();
                return { ok: true, activeModel: currentPickerLabel, reason: 'no_items' };
            }

            const unlocked = [];
            for (const item of items) {
                const isLocked = Boolean(
                    item.querySelector('[data-mat-icon-name="lock"]') || 
                    (item.getAttribute('data-mode-id') || '').includes('upsell') ||
                    item.getAttribute('aria-disabled') === 'true'
                );
                const text = (item.innerText || '').trim();
                if (!isLocked && text) {
                    unlocked.push({ el: item, text: text });
                }
            }

            if (unlocked.length === 0) {
                if (picker.getAttribute('aria-expanded') === 'true') picker.click();
                return { ok: true, activeModel: currentPickerLabel, reason: 'all_locked' };
            }

            // 極簡功能定位評分：以官網角色副標題為準（拋棄版本號猜測，完全免疫 Google 命名隨意變更）
            function score(opt, idx, targetIntent) {
                let s = 0;
                const full = opt.text.toLowerCase();
                if (targetIntent === 'reasoning') {
                    if (/deeper|analysis|code|complex|ultra|pro|neon|argon/i.test(full)) s += 200;
                    else if (/everyday|hydrogen|balanced/i.test(full)) s += 50;
                    else if (/auto/i.test(full)) s += 10;
                    // 若無任何關鍵字命中，菜单越後面的項目權重越高 (Google 慣例：進階旗艦排在後方)
                    s += idx * 10;
                } else if (targetIntent === 'balanced') {
                    if (/everyday|hydrogen|balanced|flash|help/i.test(full)) s += 200;
                    else if (/auto/i.test(full)) s += 80;
                    else s += 30;
                } else {
                    if (/auto|adapt/i.test(full)) s += 200;
                    else s += 50;
                }
                return s;
            }

            unlocked.sort((a, b) => score(b, unlocked.indexOf(b), intent) - score(a, unlocked.indexOf(a), intent));
            const best = unlocked[0];
            const lines = best.text.split('\n');
            const bestModelName = (lines.length > 1 ? lines[1] : lines[0]).trim();
            const coreName = bestModelName.replace(/^\d+\s*/, '').toLowerCase();

            const bestIdx = unlocked.indexOf(best);
            // 若目前選中的模型即為最佳可用模型，关闭菜单退出
            if (currentPickerLabel.toLowerCase().includes(coreName)) {
                if (picker.getAttribute('aria-expanded') === 'true') picker.click();
                return { ok: true, switched: false, activeModel: bestModelName, score: score(best, bestIdx, intent) };
            }

            // 点击切換至最佳解鎖模型
            best.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            best.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            best.el.click();
            await wait(250);

            return { ok: true, switched: true, activeModel: bestModelName, score: score(best, bestIdx, intent) };
        })(""" + json.dumps(target_intent) + ")"

        detected_web_model = "Auto"
        try:
            p_res = agentlimb_client.eval_js(switch_mode_js, tab_id=tab_id)
            p_val = p_res.get("result", {}).get("result", {})
            if p_val.get("activeModel"):
                detected_web_model = p_val.get("activeModel")
        except Exception:
            pass

        # 1. 記錄既有回應數量
        init_res = agentlimb_client.eval_js("document.querySelectorAll('model-response').length", tab_id=tab_id)
        initial_responses = init_res.get("result", {}).get("result", 0)

        # 2. 寫入输入框 (處理 TrustedHTML 規範)
        fill_js = f"""(() => {{
          const tb = document.querySelector('div[role="textbox"]');
          if (!tb) return false;
          tb.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, {json.dumps(task)});
          tb.dispatchEvent(new Event('input', {{ bubbles: true }}));
          return true;
        }})()"""
        agentlimb_client.eval_js(fill_js, tab_id=tab_id)
        time.sleep(0.3)

        # 3. 点击发送（含残留文本补送兜底，防止后台页首次点击未触发提交）
        send_js = """(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          const findSend = () => document.querySelector('button[aria-label*="Send message" i], button[aria-label*="发送訊息" i], button[aria-label*="发送" i], button.send-button');
          const sendBtn = findSend();
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
          }
          await wait(700);
          const tb = document.querySelector('div[role="textbox"]');
          const left = tb ? (tb.innerText || tb.textContent || '').trim() : '';
          if (left.length > 0) {
            const retryBtn = findSend();
            if (retryBtn && !retryBtn.disabled) {
              retryBtn.click();
            } else if (tb) {
              tb.focus();
              tb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          }
          return Boolean(sendBtn);
        })()"""
        agentlimb_client.eval_js(send_js, tab_id=tab_id)

        # 4. 监控生成（含 503/限流 Toast 快速失败检测 + 20s 未启动快速止损）
        deadline = time.time() + timeout_sec
        start_grace_deadline = time.time() + min(25.0, float(timeout_sec))
        has_started = False
        stable_ticks = 0
        fast_fail_err = ""
        while time.time() < deadline:
            time.sleep(0.5)
            poll_js = f"""(() => {{
              const errRe = /权限遭拒|permission denied|503|service is unavailable|isn't available right now|high demand|spikes in demand|error\\s*14|quota|rate limit|resource exhausted/i;
              const toast = Array.from(document.querySelectorAll('.mat-mdc-snack-bar-container, simple-snack-bar, [role="alert"]'))
                .map(e => (e.innerText || e.textContent || '').trim())
                .find(t => t && errRe.test(t));
              const responses = Array.from(document.querySelectorAll('model-response'));
              const newResponses = responses.slice({initial_responses});
              let running = false;
              for (const b of document.querySelectorAll('button')) {{
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const txt = (b.innerText || '').toLowerCase();
                if (aria.includes('stop') || aria.includes('停止') || txt.includes('stop')) {{
                  running = true;
                  break;
                }}
              }}
              const last = newResponses.length > 0 ? newResponses[newResponses.length - 1] : null;
              const md = last ? (last.querySelector('.markdown, message-content, [data-test-id="message-content"]') || last) : null;
              const isBusy = Boolean(md && md.getAttribute('aria-busy') === 'true');
              const mdInner = md ? (md.innerText || '').trim() : '';
              const mdTc = md ? (md.textContent || '').trim() : '';
              const text = (mdInner || mdTc).trim();
              return {{
                running: running || isBusy,
                newCount: newResponses.length,
                hasContent: text.length > 0,
                textLen: text.length,
                toastError: toast || ''
              }};
            }})()"""
            p = agentlimb_client.eval_js(poll_js, tab_id=tab_id)
            res_obj = p.get("result", {}).get("result", {})
            if res_obj.get("toastError"):
                fast_fail_err = res_obj["toastError"][:240]
                break
            running = res_obj.get("running", False)
            new_count = res_obj.get("newCount", 0)
            has_content = res_obj.get("hasContent", False)

            if running or new_count > 0:
                has_started = True

            if not has_started and time.time() > start_grace_deadline:
                fast_fail_err = "Gemini 官网超过 25 秒未进入生成状态（请确认 Chrome 窗口未最小化且页面已就绪）"
                break

            if has_started and not running and has_content:
                stable_ticks += 1
                if stable_ticks >= 3:
                    break
            else:
                stable_ticks = 0

        if fast_fail_err:
            return {
                "ok": False,
                "site": "gemini",
                "model": f"gemini.google.com ({detected_web_model})",
                "fell_back": False,
                "output": "",
                "files": [],
                "error": f"Gemini 官网返回错误: {fast_fail_err}",
                "elapsed_sec": round(time.time() - t0, 2),
            }

        # 5. 提取回應（当 p.pending / reveal 动画导致 innerText 为空时，自动回退读取非代码段落与 textContent）
        extract_js = f"""(() => {{
          const responses = Array.from(document.querySelectorAll('model-response'));
          const newResponses = responses.slice({initial_responses});
          const last = newResponses.length > 0 ? newResponses[newResponses.length - 1] : (responses.length > 0 ? responses[responses.length - 1] : null);
          if (!last) return {{ text: '', images: [] }};
          const md = last.querySelector('.markdown, message-content, [data-test-id="message-content"]') || last;
          let text = (md.innerText || '').trim();
          if (!text) {{
            const ps = Array.from(md.querySelectorAll('p, li, pre')).filter(el => !el.closest('code-block'));
            text = ps.map(el => (el.textContent || '').trim()).filter(Boolean).join('\\n').trim();
            if (!text) text = (md.textContent || '').trim();
          }}
          text = text.replace(/^Gemini said\\s*/i, '').trim();

          const imgs = Array.from(last.querySelectorAll('img')).map(i => i.src).filter(s => s && !s.includes('avatar') && !s.includes('googleusercontent.com/a/'));
          return {{ text: text, images: imgs }};
        }})()"""
        ext = agentlimb_client.eval_js(extract_js, tab_id=tab_id)
        res_data = ext.get("result", {}).get("result", {})
        final_text = res_data.get("text", "")

        # 多模態下載處理
        saved_files = []
        if download_dir:
            out_path = Path(download_dir).resolve()
            for idx, img_src in enumerate(res_data.get("images", []), 1):
                data_url = img_src
                if img_src.startswith("blob:"):
                    data_url = _fetch_blob_as_data_url(tab_id, img_src)
                if data_url.startswith("data:"):
                    saved = _save_data_url(data_url, out_path, f"gemini_web_img_{idx}")
                    if saved:
                        saved_files.append(saved)

        # 自动代码检测与保存落地（官网通道防吞噬）
        if final_text:
            code_files = _extract_and_save_code(final_text, task, download_dir)
            for cf in code_files:
                if cf not in saved_files:
                    saved_files.append(cf)

        if saved_files:
            links = "\n".join([f"- [{Path(f).name}](file://{f})" for f in saved_files])
            final_text += f"\n\n🎉 生成成果已同步落地存档至本地工作区：\n{links}"

        success = bool(final_text or saved_files)
        return {
            "ok": success,
            "site": "gemini",
            "model": f"gemini.google.com ({detected_web_model})",
            "fell_back": False,
            "output": final_text,
            "files": saved_files,
            "error": "" if success else "未获取到 Gemini 回应内容",
            "elapsed_sec": round(time.time() - t0, 2),
        }

    try:
        return _execute()
    finally:
        if not keep_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


def _run_flow_task(
    task: str,
    model: str = "gemini-nano-banana-2.1",
    timeout_sec: int = 180,
    download_dir: str = "",
    keep_tab: bool = False,
) -> dict:
    """在外部浏览器的 Google Flow (flow.google.com) 画布中生成多媒體（支援 0 點數 Nano Banana 2.1）"""
    t0 = time.time()
    tabs = agentlimb_client.get_tabs()
    target_tab = None
    for t in tabs:
        url = t.get("url", "")
        if "flow.google.com" in url:
            target_tab = t
            break

    created_tab = False
    if target_tab is None:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://flow.google.com/", "active": True})
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
        created_tab = True
    else:
        tab_id = target_tab.get("id")
        agentlimb_client.call_tool("tab_activate", {"tabId": tab_id})

    def _execute():
        # 若在首頁，点击新建專案進入画布
        time.sleep(1.5)
        url_info = agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", "")
        if "/project/" not in url_info:
            agentlimb_client.eval_js("""(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b =>
                    (b.innerText || '').includes('New project') ||
                    (b.innerText || '').includes('新建项目') ||
                    (b.innerText || '').includes('新建專案')
                );
                if (btn) btn.click();
            })()""", tab_id=tab_id)
            # 等待進入專案
            deadline = time.time() + 15
            while time.time() < deadline:
                time.sleep(0.5)
                u = agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", "")
                if "/project/" in u:
                    break

        ready = wait_for_selector(tab_id, 'div.ProseMirror, div[role="textbox"]', timeout=20.0)
        if not ready:
            return {"ok": False, "error": "Google Flow 画布加载超时（未找到输入框）"}

        # 等待 Flow 工具欄與右側 Agent 面板完整水合
        time.sleep(1.5)

        # 0.2 關閉右側 Agent 欄並關閉 Flow Agent 開關，切回直出畫布模式（露出 Settings trigger）
        agentlimb_client.eval_js("""(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          for (let attempt = 0; attempt < 3; attempt++) {
            const rp = Array.from(document.querySelectorAll('button')).find(b =>
              (b.innerText || '').includes('right_panel_close') ||
              ((b.getAttribute('aria-label') || '') === 'Close' && b.getBoundingClientRect().x > 700)
            );
            if (rp) { rp.click(); await wait(500); }
            const fa = document.querySelector('button[aria-label="Flow Agent"][aria-pressed="true"], button[aria-label*="智能体"][aria-pressed="true"]');
            if (fa) { fa.click(); await wait(650); }
            const trig = document.querySelector('button.settings-trigger-button, button[aria-label="Settings trigger"], button[aria-label="设置触发器"]');
            if (trig && trig.getBoundingClientRect().width > 0) break;
            await wait(450);
          }
          return true;
        })()""", tab_id=tab_id)

        # 0.5 開啟 Settings trigger 選擇 Image + Nano Banana 2.1 + x1（0 點數免費）
        agentlimb_client.eval_js("""(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          const trig = document.querySelector('button.settings-trigger-button, button[aria-label="Settings trigger"], button[aria-label="设置触发器"]');
          if (!trig || trig.getBoundingClientRect().width <= 0) return false;
          trig.click(); await wait(400);
          const pickTxt = re => Array.from(document.querySelectorAll('.cdk-overlay-pane button, .cdk-overlay-pane [role="option"], .cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane mat-option'))
            .find(el => el.offsetParent && re.test((el.innerText || '').trim()));
          pickTxt(/^(图片|圖片|Image)$/i)?.click(); await wait(180);
          const modelBtn = Array.from(document.querySelectorAll('.cdk-overlay-pane button')).find(b => /banana|veo|omni|model/i.test(b.innerText || ''));
          if (modelBtn && !/nano\\s*banana\\s*2\\.1/i.test(modelBtn.innerText || '')) {
            modelBtn.click(); await wait(350);
            const panes = document.querySelectorAll('.cdk-overlay-pane');
            const lastPane = panes[panes.length - 1];
            const nb21 = lastPane && Array.from(lastPane.querySelectorAll('[role="menuitem"], [role="option"], button')).find(el => /nano\\s*banana\\s*2\\.1/i.test((el.innerText || '').trim()));
            if (nb21) { nb21.click(); await wait(250); }
          }
          pickTxt(/^x1$/i)?.click(); await wait(180);
          const backdrop = document.querySelector('.cdk-overlay-backdrop');
          if (backdrop) backdrop.click(); else document.body.click();
          await wait(200);
          return true;
        })()""", tab_id=tab_id)

        # 記錄生成前的媒體 URLs（僅計算已載入完成的大圖或生成的視頻，排除 gstatic 示例圖）
        collect_js = """(() => {
            const urls = [];
            for (const el of document.querySelectorAll('img, video, video source')) {
                const src = el.getAttribute('src') || el.currentSrc || el.src || '';
                if (!src) continue;
                if (src.includes('googleusercontent.com/') || src.includes('gstatic.com/aitestkitchen') || src.includes('avatar') || src.endsWith('.svg')) continue;
                if (el.tagName === 'IMG' && (!el.complete || (el.naturalWidth || 0) < 96)) continue;
                urls.push(src);
            }
            return Array.from(new Set(urls));
        })()"""
        before_urls = set(agentlimb_client.eval_js(collect_js, tab_id=tab_id).get("result", {}).get("result", []))

        # 填寫提示词（優先使用 AgentLimb form_input，保底使用 ProseMirror insertText）
        try:
            agentlimb_client.call_tool(
                "form_input",
                {"tabId": tab_id, "selector": 'div.ProseMirror, div[role="textbox"]', "value": task},
            )
        except Exception:
            fill_js = f"""(() => {{
              const tb = document.querySelector('div.ProseMirror, div[role="textbox"]');
              if (!tb) return false;
              tb.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, {json.dumps(task)});
              tb.dispatchEvent(new Event('input', {{ bubbles: true }}));
              return true;
            }})()"""
            agentlimb_client.eval_js(fill_js, tab_id=tab_id)
        time.sleep(0.5)

        # 点击開始生成：Flow 需要真實可信滑鼠點擊（computer click），純 JS .click() 會被 Angular 忽略
        ready_btn_js = """(() => {
            const winZero = (window.innerWidth === 0 || window.innerHeight === 0);
            const btns = Array.from(document.querySelectorAll('button[aria-label="Start generation"], button[aria-label="开始生成"], button[aria-label="開始生成"], button.generate-icon-button'));
            const btn = btns.find(b => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
            });
            if (!btn) return { ok: false, winZero, reason: 'not_found_or_disabled' };
            const r = btn.getBoundingClientRect();
            return { ok: true, winZero, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()"""
        btn_info = agentlimb_client.eval_js(ready_btn_js, tab_id=tab_id).get("result", {}).get("result", {})
        if btn_info and btn_info.get("winZero"):
            return {
                "ok": False,
                "error": "Chrome 浏览器窗口当前处于最小化或 0x0 不可见状态（innerWidth=0），Google Flow 需要保持窗口展开（可放在后台桌面但勿最小化）才能执行真实鼠标点击。",
            }
        if not btn_info or not btn_info.get("ok"):
            return {"ok": False, "error": "Google Flow 生成按钮未就绪或仍处于禁用状态"}

        def _click_flow_submit():
            agentlimb_client.call_tool("tab_activate", {"tabId": tab_id})
            time.sleep(0.4)
            try:
                c_res = agentlimb_client.call_tool(
                    "computer",
                    {
                        "tabId": tab_id,
                        "action": "click",
                        "selector": 'button[aria-label="Start generation"], button[aria-label="开始生成"], button[aria-label="開始生成"], button.generate-icon-button',
                    },
                )
                if c_res.get("result", {}).get("ok"):
                    return True
            except Exception:
                pass
            try:
                c_res = agentlimb_client.call_tool(
                    "computer",
                    {"tabId": tab_id, "action": "click", "x": btn_info["x"], "y": btn_info["y"]},
                )
                return bool(c_res.get("result", {}).get("ok"))
            except Exception:
                return False

        clicked_ok = _click_flow_submit()
        if clicked_ok:
            # 確認提示詞已清空送出；若仍殘留在輸入框則重試點擊一次
            time.sleep(1.5)
            still_has_prompt = agentlimb_client.eval_js(
                """(() => {
                    const tb = document.querySelector('div.ProseMirror, div[role="textbox"]');
                    const txt = (tb?.innerText || '').trim();
                    const pct = /\\b\\d{1,3}%\\b/.test(document.body.innerText || '');
                    return !pct && txt.length > 0;
                })()""",
                tab_id=tab_id,
            ).get("result", {}).get("result", False)
            if still_has_prompt:
                _click_flow_submit()

        # 监控生成新文件
        deadline = time.time() + timeout_sec
        new_urls = []
        while time.time() < deadline:
            time.sleep(1.0)
            cur_urls = agentlimb_client.eval_js(collect_js, tab_id=tab_id).get("result", {}).get("result", [])
            new_urls = [u for u in cur_urls if u not in before_urls]
            if new_urls:
                break

        if not new_urls:
            return {"ok": False, "error": f"等待 Google Flow 生成超时 ({timeout_sec} 秒)"}

        # 下載保存媒體
        saved_files = []
        out_path = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
        out_path.mkdir(parents=True, exist_ok=True)
        for idx, u in enumerate(new_urls, 1):
            data_url = u
            if u.startswith(("blob:", "http:", "https:")):
                fetched = _fetch_blob_as_data_url(tab_id, u)
                if fetched and fetched.startswith("data:"):
                    data_url = fetched
            if data_url.startswith("data:"):
                saved = _save_data_url(data_url, out_path, f"flow_nano_{idx}")
                if saved:
                    saved_files.append(saved)
            elif u.startswith("http"):
                try:
                    import urllib.request
                    target = out_path / f"flow_img_{int(time.time())}_{idx}.png"
                    urllib.request.urlretrieve(u, str(target))
                    saved_files.append(str(target.resolve()))
                except Exception:
                    pass

        return {
            "ok": bool(saved_files or new_urls),
            "model": "Nano Banana 2.1 (Google Flow · 0 點數消耗)",
            "fell_back": False,
            "output": f"已在 Google Flow (flow.google.com) 成功生成多媒體，共產出 {len(new_urls)} 個文件（Nano Banana 2.1 享 0 點數消耗）。",
            "files": saved_files,
            "error": "",
            "elapsed_sec": round(time.time() - t0, 2),
        }

    try:
        return _execute()
    finally:
        if not keep_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


_ACCOUNT_PAID_MODELS_CACHE: dict[str, Any] = {"ts": 0.0, "paid": None}


def _get_account_paid_models(force_refresh: bool = False) -> set[str]:
    """動態取得當前帳號在 AI Studio 上仍被標記為 Paid 的模型集合（快取 120 秒）。"""
    default_paid = {
        "gemini-4-neon", "gemini-4-carbon", "gemini-4-argon",
        "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-pro-latest",
        "gemini-nano-banana-2.1", "gemini-omni-1.2-flash", "genie-4",
    }
    now = time.time()
    if (
        not force_refresh
        and _ACCOUNT_PAID_MODELS_CACHE.get("paid") is not None
        and (now - float(_ACCOUNT_PAID_MODELS_CACHE.get("ts") or 0.0)) < 120.0
    ):
        return set(_ACCOUNT_PAID_MODELS_CACHE["paid"])
    try:
        discovered = discover_available_models()
        if discovered.get("status") == "ok" and isinstance(discovered.get("models"), list):
            paid_set = {m["id"].lower() for m in discovered["models"] if m.get("paid") and m.get("id")}
            _ACCOUNT_PAID_MODELS_CACHE["ts"] = now
            _ACCOUNT_PAID_MODELS_CACHE["paid"] = set(paid_set)
            return paid_set
    except Exception:
        pass
    return default_paid


def _aistudio_tune_thinking_and_dialogs(tab_id: int, thinking_level: str = "high") -> None:
    """依帳號實際解鎖狀態設定 AI Studio Thinking Level（PRO 解鎖時放行 Extra High，否則自動降回 High）並關掉干擾彈窗。"""
    tl_raw = (thinking_level or "high").strip().lower()
    if tl_raw in ("extra_high", "extra-high", "xhigh", "max"):
        desired = "extra_high"
    elif tl_raw in ("medium", "low"):
        desired = tl_raw
    else:
        desired = "high"

    tune_js = f"""(async (desiredLevel) => {{
      const wait = ms => new Promise(r => setTimeout(r, ms));
      try {{
        const tl = document.querySelector('mat-select[aria-label*="Thinking"], [aria-label*="Thinking"]');
        if (tl) {{
          const curTxt = (tl.innerText || '').toLowerCase();
          const curIsExtra = curTxt.includes('extra');
          if (curIsExtra || desiredLevel) {{
            tl.click();
            await wait(250);
            const opts = Array.from(document.querySelectorAll('.cdk-overlay-pane mat-option')).filter(
              o => o.getAttribute('aria-disabled') !== 'true' && !/\\bpaid\\b/i.test(o.innerText || '')
            );
            let target = null;
            if (desiredLevel === 'extra_high') {{
              target = opts.find(o => /extra/i.test(o.innerText || ''))
                    || opts.find(o => /^high$/i.test((o.innerText || '').trim()))
                    || opts.find(o => /high/i.test(o.innerText || '') && !/extra/i.test(o.innerText || ''));
            }} else if (desiredLevel === 'medium') {{
              target = opts.find(o => /medium/i.test(o.innerText || ''));
            }} else if (desiredLevel === 'low') {{
              target = opts.find(o => /low/i.test(o.innerText || ''));
            }} else {{
              target = opts.find(o => /^high$/i.test((o.innerText || '').trim()))
                    || opts.find(o => /high/i.test(o.innerText || '') && !/extra/i.test(o.innerText || ''))
                    || opts.find(o => /medium/i.test(o.innerText || ''))
                    || opts.find(o => !/extra/i.test(o.innerText || ''));
            }}
            if (target) {{
              target.click();
              await wait(200);
            }} else {{
              document.body.click();
              await wait(150);
            }}
          }}
        }}
        const dismissBtn = Array.from(document.querySelectorAll('button')).find(b =>
          /dismiss|close/i.test(b.innerText || '') || /close/i.test(b.getAttribute('aria-label') || '')
        );
        if (dismissBtn && dismissBtn.closest('[role="dialog"], mat-dialog-container')) {{
          dismissBtn.click();
          await wait(150);
        }}
      }} catch(e) {{}}
      return true;
    }})({json.dumps(desired)})"""
    try:
        agentlimb_client.eval_js(tune_js, tab_id=tab_id)
    except Exception:
        pass


def _run_aistudio_music_task(
    task: str,
    model: str = "lyria-3-pro-preview",
    timeout_sec: int = 180,
    download_dir: str = "",
    keep_tab: bool = False,
) -> dict:
    """在 AI Studio /new_music (Lyria) 生成音訊並儲存本機（自動偵測免費帳號付費牆）。"""
    t0 = time.time()
    eff_model = resolve_model_id(model or "lyria-3-pro-preview")
    target_url = f"https://aistudio.google.com/new_music?model={eff_model}" if eff_model.startswith("lyria") else "https://aistudio.google.com/new_music"

    nav_res = agentlimb_client.call_tool("tab_new", {"url": target_url, "active": True})
    tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
    if not tab_id:
        return {"ok": False, "site": "lyria", "error": "无法创建 AI Studio Music 标签页"}

    try:
        deadline_ready = time.time() + 18.0
        ready_state = {}
        while time.time() < deadline_ready:
            st = agentlimb_client.eval_js(
                """(() => {
                  const body = (document.body?.innerText || '').toLowerCase();
                  const paywall = /go further with ai studio|choose a google ai plan|set up api billing|upgrade to unlock/i.test(body);
                  const inp = document.querySelector('textarea[aria-label="Prompt input"], textarea[aria-label="Enter a prompt"]');
                  const emptyBtn = document.querySelector('button.empty-state__title-button');
                  return {
                    paywall,
                    hasInput: Boolean(inp && inp.getBoundingClientRect().width > 0),
                    hasEmptyBtn: Boolean(emptyBtn && emptyBtn.getBoundingClientRect().width > 0),
                    url: location.href
                  };
                })()""",
                tab_id=tab_id,
            ).get("result", {}).get("result", {})
            ready_state = st or {}
            if ready_state.get("paywall") or ready_state.get("hasInput") or ready_state.get("hasEmptyBtn"):
                break
            time.sleep(0.5)

        if ready_state.get("paywall"):
            return {
                "ok": False,
                "site": "lyria",
                "model": eff_model,
                "paid_only": True,
                "error": "AI Studio 音乐台 (Lyria) 在当前账号下已锁定为付费升级功能，跳过此步。",
                "elapsed_sec": round(time.time() - t0, 2),
            }

        if not ready_state.get("hasInput") and ready_state.get("hasEmptyBtn"):
            agentlimb_client.eval_js('document.querySelector("button.empty-state__title-button")?.click()', tab_id=tab_id)
            if not wait_for_selector(tab_id, 'textarea[aria-label="Prompt input"], textarea[aria-label="Enter a prompt"]', timeout=12.0):
                return {"ok": False, "site": "lyria", "model": eff_model, "error": "AI Studio Music 输入框未就绪"}

        before_count = agentlimb_client.eval_js(
            'Array.from(document.querySelectorAll("audio")).filter(a => Boolean(a.currentSrc || a.src)).length',
            tab_id=tab_id,
        ).get("result", {}).get("result", 0)

        agentlimb_client.call_tool(
            "form_input",
            {"tabId": tab_id, "selector": 'textarea[aria-label="Prompt input"], textarea[aria-label="Enter a prompt"]', "value": task},
        )
        time.sleep(0.3)
        agentlimb_client.eval_js('document.querySelector("button.ctrl-enter-submits")?.click()', tab_id=tab_id)

        deadline = time.time() + timeout_sec
        audio_srcs = []
        while time.time() < deadline:
            time.sleep(1.0)
            poll = agentlimb_client.eval_js(
                f"""(() => {{
                  const errText = Array.from(document.querySelectorAll('.error, mat-error, [role="alert"], mat-dialog-container, .snack-bar-container'))
                    .map(e => (e.innerText || '').trim()).filter(Boolean).join(' ').toLowerCase();
                  const body = (document.body?.innerText || '').toLowerCase();
                  const combined = errText + ' ' + body;
                  const errMatch = combined.match(/(permission denied|权限遭拒|go further with ai studio|choose a google ai plan|set up api billing|failed to generate[^\\n]*)/i);
                  const err = errMatch ? errMatch[0].slice(0, 220) : '';
                  const composing = Array.from(document.querySelectorAll('button')).some(b => /stop composing|stop|cancel/i.test(b.innerText || ''));
                  const count = Array.from(document.querySelectorAll('audio')).filter(a => Boolean(a.currentSrc || a.src)).length;
                  return {{ err, composing, count, newCount: count > {int(before_count)} }};
                }})()""",
                tab_id=tab_id,
            ).get("result", {}).get("result", {})
            if poll.get("err"):
                is_paid = any(k in poll["err"] for k in ("upgrade", "go further", "choose a google ai plan", "billing", "permission denied"))
                return {
                    "ok": False,
                    "site": "lyria",
                    "model": eff_model,
                    "paid_only": is_paid,
                    "error": f"AI Studio Music 返回错误: {poll['err']}",
                    "elapsed_sec": round(time.time() - t0, 2),
                }
            if poll.get("newCount") and not poll.get("composing"):
                all_srcs = agentlimb_client.eval_js(
                    'Array.from(document.querySelectorAll("audio")).map(a => a.currentSrc || a.src || "").filter(Boolean)',
                    tab_id=tab_id,
                    timeout=20.0,
                ).get("result", {}).get("result", [])
                audio_srcs = all_srcs[int(before_count):]
                break

        if not audio_srcs:
            return {"ok": False, "site": "lyria", "model": eff_model, "error": f"等待 AI Studio Lyria 生成超时 ({timeout_sec} 秒)"}

        saved_files = []
        out_path = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
        for idx, src in enumerate(audio_srcs, 1):
            data_url = _fetch_blob_as_data_url(tab_id, src) if src.startswith("blob:") else src
            if data_url.startswith("data:"):
                saved = _save_data_url(data_url, out_path, f"aistudio_music_{idx}")
                if saved:
                    saved_files.append(saved)

        return {
            "ok": bool(saved_files or audio_srcs),
            "site": "lyria",
            "model": eff_model,
            "fell_back": False,
            "output": f"已在 AI Studio (new_music · {eff_model}) 成功生成音訊，共產出 {len(saved_files) or len(audio_srcs)} 個音訊文件。",
            "files": saved_files,
            "error": "",
            "elapsed_sec": round(time.time() - t0, 2),
        }
    finally:
        if not keep_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


def run_agent_task(
    task: str,
    model: str = "gemini-4-hydrogen",
    site: str = "aistudio",
    entry: str = "chat",
    thinking_level: str = "high",
    thinking_policy: str = "adaptive",
    thinking_timeout: int = 0,
    auto_fallback: bool = True,
    fallback_ladder: list[str] | None = None,
    timeout_sec: int = 180,
    new_chat: bool = False,
    download_dir: str = "",
    keep_tab: bool = False,
    files: list[str] | None = None,
) -> dict:
    t0 = time.time()
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"ok": False, "error": "AgentLimb Bridge (8765) 未在线或扩展未连接"}

    # 站點分支：如果是 Google Flow
    if site.lower() in ("flow", "google_flow", "flow.google.com"):
        return _run_flow_task(
            task=task,
            model=model,
            timeout_sec=timeout_sec,
            download_dir=download_dir,
            keep_tab=keep_tab,
        )

    # 站點分支：如果是 AI Studio Lyria 音樂台
    if site.lower() in ("lyria", "music", "aistudio-music") or resolve_model_id(model).startswith("lyria"):
        return _run_aistudio_music_task(
            task=task,
            model=model,
            timeout_sec=timeout_sec,
            download_dir=download_dir,
            keep_tab=keep_tab,
        )

    # 站點分支：如果是 gemini.google.com
    if site.lower() in ("gemini", "gemini.google.com", "gemini_web", "gemini-web"):
        return _run_gemini_web_task(
            task=task,
            model=model,
            timeout_sec=timeout_sec,
            new_chat=new_chat,
            download_dir=download_dir,
            keep_tab=keep_tab,
            entry=entry,
        )

    out_path = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    tabs = agentlimb_client.get_tabs()
    target_tab = None
    for t in tabs:
        url = t.get("url", "")
        if "aistudio.google.com/prompts/" in url:
            target_tab = t
            break

    initial_model_id = resolve_model_id(model)
    target_url = f"https://aistudio.google.com/prompts/new_chat?model={initial_model_id}"

    created_tab = False
    if target_tab is None:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": target_url, "active": True})
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
        created_tab = True
    else:
        tab_id = target_tab.get("id")
        agentlimb_client.call_tool("tab_activate", {"tabId": tab_id})
        current_tab_url = target_tab.get("url", "")
        cur_model_txt = _get_aistudio_selected_model_text(tab_id) if "/prompts/" in current_tab_url else ""
        model_mismatch = bool(initial_model_id and cur_model_txt and initial_model_id.lower() not in cur_model_txt)
        # 若要求开启新对话，或當前标签页不在 /prompts/，或既有标签页模型与指定模型不符，導航至新聊天室
        if new_chat or "/prompts/" not in current_tab_url or model_mismatch:
            agentlimb_client.call_tool("navigate", {"tabId": tab_id, "url": target_url})
            time.sleep(1.2)

    def _attempt_run(current_model_id: str) -> tuple[bool, str, list[str], str]:
        # 1. 填寫任務提示词
        agentlimb_client.call_tool(
            "form_input",
            {
                "tabId": tab_id,
                "selector": 'textarea[aria-label="Enter a prompt"]',
                "value": task,
            },
        )
        time.sleep(0.3)

        # 1.2 依帳號解鎖狀態設定 Thinking Level（PRO 放行 Extra High，免費池自動退回 High）
        _aistudio_tune_thinking_and_dialogs(tab_id, thinking_level=thinking_level)

        # 1.5 記錄点击前初始 turns 數量與廣播器狀態
        init_js = """(() => {
          return {
            turns: document.querySelectorAll('ms-chat-turn').length,
            announcer: document.querySelector('.cdk-live-announcer-element')?.innerText || ''
          };
        })()"""
        init_res = agentlimb_client.eval_js(init_js, tab_id=tab_id).get("result", {}).get("result", {})
        initial_turns = init_res.get("turns", 0)
        initial_announcer = init_res.get("announcer", "")

        # 2. 点击 Run
        agentlimb_client.eval_js(
            'document.querySelector("button.ctrl-enter-submits")?.click()',
            tab_id=tab_id,
        )

        # 3. 监控輸出與完成狀態
        has_started_generating = False

        # 智能思考閾值與任務量級研判 (三大策略：adaptive, custom, strict)
        is_deep_reasoning = any(k in current_model_id.lower() for k in ["argon", "hydrogen", "neon", "carbon", "decision", "pro"])
        heavy_keywords = [
            "c++", "cpp", "rust", "红黑树", "red-black", "算法", "演算法", "架構",
            "從零", "完整實作", "生產級", "完整代碼", "重構", "design pattern",
            "compiler", "parser", "full stack", "全棧", "spring", "kernel", "btree"
        ]
        task_lower = task.lower()
        is_heavy_task = len(task) > 150 or any(kw in task_lower for kw in heavy_keywords)

        # 思考時間上限設定 (三大選項)：
        # 1. adaptive (智能自适应 - 預設)：
        #    - 深度推理模型 (Hydrogen/Argon) + 複雜架構任務：給滿 150 秒（給予模型充足空間推演 500 行邏輯）
        #    - 深度推理模型 + 一般日常任務：80 秒
        #    - 輕量模型 (Flash/Flash-Lite)：35 秒
        #    - 總超时自動寬限至至少 300 秒 (5分鐘)
        # 2. custom (自定义超时)：严格遵循指定秒数 (thinking_timeout 或 timeout_sec)
        # 3. strict (严格模式)：堅守模型絕不降级，深度模型給滿 150 秒（或自定义秒数），超时直接中斷提醒
        if thinking_policy == "custom":
            thinking_limit = float(thinking_timeout if thinking_timeout > 0 else timeout_sec)
            actual_timeout = timeout_sec
        elif thinking_policy == "strict":
            thinking_limit = float(thinking_timeout if thinking_timeout > 0 else (150.0 if (is_deep_reasoning and is_heavy_task) else (80.0 if is_deep_reasoning else 35.0)))
            actual_timeout = max(timeout_sec, 300) if is_heavy_task else timeout_sec
        else:  # adaptive (預設)
            if is_deep_reasoning:
                thinking_limit = 150.0 if is_heavy_task else 80.0
            else:
                thinking_limit = 35.0
            actual_timeout = max(timeout_sec, 300) if is_heavy_task else timeout_sec

        deadline = time.time() + actual_timeout
        stuck_threshold = time.time() + thinking_limit
        last_seen_text_len = 0
        last_seen_thought_len = 0
        prev_poll_text_len = 0
        prev_poll_thought_len = 0
        last_feedback_time = time.time()
        stable_ticks = 0
        empty_done_ticks = 0
        completed = False

        while time.time() < deadline:
            time.sleep(0.5)
            poll_js = f"""(() => {{
              let running = false;
              for (const b of document.querySelectorAll('button')) {{
                const rect = b.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;
                const txt = (b.innerText || '').trim();
                const aria = (b.getAttribute('aria-label') || '').trim();
                if (/editing/i.test(aria) || /editing/i.test(txt)) continue;
                if (/\\b(Stop|Cancel)\\b/i.test(txt) || /\\b(Stop|Cancel)\\b/i.test(aria)) {{
                  running = true;
                  break;
                }}
              }}
              const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
              // 僅檢查本次請求新增的 turns，徹底隔離歷史对话干擾
              const newTurns = turns.slice({initial_turns});
              const modelTurns = newTurns.filter(t => {{
                const container = t.querySelector('.chat-turn-container');
                const cls = (container ? container.className : t.className) || '';
                if (/\\buser\\b/i.test(cls) || t.querySelector('textarea, ms-text-chunk[data-role="user"]')) return false;
                return /\\bmodel\\b/i.test(cls) || t.innerText.includes('Model ') || Boolean(t.querySelector('.model, .model-author, [data-role="model"], ms-cmark-node, ms-code-block'));
              }});

              let hasOutput = false;
              let isThinking = false;
              let thoughtTextLen = 0;
              let totalTextLen = 0;
              let hasCode = false;
              let hasMedia = false;
              let hasError = false;

              for (const mt of modelTurns) {{
                totalTextLen += (mt.textContent || '').trim().length;
                // 严格過濾：僅將非代碼塊的折疊面板視為思考（避免誤將嵌套在代碼塊內的 mat-expansion-panel 算作思考）
                const rawThoughtPanels = Array.from(mt.querySelectorAll('mat-expansion-panel')).filter(
                  el => !el.closest('ms-code-block') && !el.querySelector('ms-code-block, pre, code')
                );
                const thoughtEls = Array.from(mt.querySelectorAll('ms-thought-chunk, .thought-container')).concat(rawThoughtPanels);
                const thoughtSet = new Set(thoughtEls);
                thoughtEls.forEach(el => {{
                  thoughtTextLen += (el.textContent || '').trim().length;
                }});

                const nonThoughtCmarks = Array.from(mt.querySelectorAll('ms-cmark-node')).filter(
                  n => !Array.from(thoughtSet).some(t => t.contains(n)) && (n.innerText || '').trim().length > 0
                );
                if (nonThoughtCmarks.length > 0) hasOutput = true;
                if (mt.querySelectorAll('img[src^="blob:"], img[src^="data:image/"], video[src^="blob:"], video source[src]').length > 0) {{
                  hasMedia = true;
                  hasOutput = true;
                }}
                if (mt.querySelectorAll('ms-code-block, pre, code').length > 0) {{
                  hasCode = true;
                  hasOutput = true;
                }}
                if (mt.querySelector('.error, mat-error') || /Thinking level is unsupported|Model error/i.test(mt.innerText || '')) {{
                  hasError = true;
                  hasOutput = true;
                }}
                const raw = (mt.innerText || '');
                const spinner = mt.querySelector('mat-spinner, mat-progress-bar, .spinner, .loading');
                if (spinner || /正在思考|Thinking/i.test(raw)) {{
                  isThinking = true;
                }}
              }}

              // 檢查页面整體 Run 按鈕是否有 Stop/Cancel 標記
              const runBtn = document.querySelector('button.ctrl-enter-submits') || Array.from(document.querySelectorAll('button')).find(b => /^Run\b/i.test((b.innerText || '').trim()));
              const runBtnTxt = (runBtn?.innerText || '').trim();
              const runBtnAria = (runBtn?.getAttribute('aria-label') || '').trim();
              const isStop = /\\b(Stop|Cancel)\\b/i.test(runBtnTxt) || /\\b(Stop|Cancel)\\b/i.test(runBtnAria);
              const spinner = document.querySelector('mat-spinner, mat-progress-bar, .spinner, .loading');
              running = running || Boolean(isStop || spinner);

              const lastModelTurn = modelTurns.length > 0 ? modelTurns[modelTurns.length - 1] : null;
              if (lastModelTurn) {{
                try {{ lastModelTurn.scrollIntoView({{ block: 'nearest', behavior: 'instant' }}); }} catch(e) {{}}
                const rawTurnText = (lastModelTurn.innerText || lastModelTurn.textContent || '').trim();
                const cleanTurnText = rawTurnText.replace(/(more_vert|thumb_up|thumb_down|edit|\\d+(\\.\\d+)?s)/g, '').trim();
                const hasDoneFooter = Boolean(lastModelTurn.querySelector('button[aria-label="Good response"], button[aria-label="Bad response"], .model-run-time-pill'));
                const vscContent = lastModelTurn.querySelector('.virtual-scroll-container .turn-content');
                const isVirtualUnmounted = Boolean(vscContent && vscContent.children.length === 0);
                if (cleanTurnText.length > 0 || (hasDoneFooter && isVirtualUnmounted)) {{
                  hasOutput = true;
                }}
              }}

              const errorEls = Array.from(document.querySelectorAll('.error, mat-error, .snack-bar-container, .mat-mdc-snack-bar-container, simple-snack-bar, [role="alert"], [data-test-id*="error"], mat-dialog-container, [role="dialog"]'));
              const errorMessages = errorEls.map(e => (e.innerText || e.textContent || '').trim()).filter(Boolean).join(' ');
              const announcer = document.querySelector('.cdk-live-announcer-element')?.innerText || '';

              return {{
                running: running,
                isThinking: isThinking,
                thoughtTextLen: thoughtTextLen,
                totalTextLen: totalTextLen,
                newTurnsCount: newTurns.length,
                hasModelTurn: modelTurns.length > 0,
                hasOutput: hasOutput,
                hasCode: hasCode,
                hasMedia: hasMedia,
                hasError: hasError,
                announcer: announcer,
                errorMessages: errorMessages,
                lastTurnText: lastModelTurn ? lastModelTurn.innerText : '',
                lastTurnFull: lastModelTurn ? lastModelTurn.textContent : ''
              }};
            }})()"""
            p = agentlimb_client.eval_js(poll_js, tab_id=tab_id)
            res_obj = p.get("result", {}).get("result", {})
            running = res_obj.get("running", False)
            is_thinking = res_obj.get("isThinking", False)
            thought_text_len = res_obj.get("thoughtTextLen", 0)
            total_text_len = res_obj.get("totalTextLen", 0)
            has_model_turn = res_obj.get("hasModelTurn", False)
            has_output = res_obj.get("hasOutput", False)
            announcer = res_obj.get("announcer", "")
            last_text = res_obj.get("lastTurnText", "")
            last_turn_full = res_obj.get("lastTurnFull", "")
            error_messages = res_obj.get("errorMessages", "")

            if running or has_model_turn:
                has_started_generating = True

            # 動態增長监控（支援 textContent 穿透折疊思考塊）：只要總文本或思考過程持續在吐字，持續刷新截止時間
            if total_text_len > last_seen_text_len + 5 or thought_text_len > last_seen_thought_len + 5:
                last_seen_text_len = total_text_len
                last_seen_thought_len = thought_text_len
                stuck_threshold = time.time() + thinking_limit

            # 即時進度反饋：長思考或生成時，每 8 秒輸出狀態日誌，避免使用者無感焦慮
            now = time.time()
            if now - last_feedback_time >= 8.0:
                last_feedback_time = now
                elapsed = int(now - t0)
                policy_tag = f"策略: {thinking_policy}/{int(thinking_limit)}s"
                if is_thinking and thought_text_len > 0:
                    sys.stderr.write(f"🧠 [Gemini Web Agent] 深度思考中... (已耗时 {elapsed}s, {policy_tag}, 思考字数 {thought_text_len})\n")
                elif is_thinking:
                    sys.stderr.write(f"🧠 [Gemini Web Agent] 深度思考中... (已耗时 {elapsed}s, {policy_tag})\n")
                elif total_text_len > 0:
                    sys.stderr.write(f"⏳ [Gemini Web Agent] 内容生成中... (已耗时 {elapsed}s, 累计字数 {total_text_len})\n")
                else:
                    sys.stderr.write(f"⏳ [Gemini Web Agent] 排队等待回应中... (已耗时 {elapsed}s, {policy_tag})\n")
                sys.stderr.flush()

            # 檢測伺服器錯誤、配額耗盡或權限拒絕（立即終止退出，絕不乾等）
            combined_err = f"{last_text} {last_turn_full} {error_messages}".lower()
            fatal_errors = [
                ("go further with ai studio", "該模型在 AI Studio 需升級 Google AI 方案或綁定付費 API Key (Paid-only)"),
                ("set up api billing", "該模型需啟用付費 API 計費 (Paid-only)"),
                ("choose a google ai plan", "該模型需升級 Google AI 付費方案 (Paid-only)"),
                ("permission denied", "当前 Google 账号无权访问 (Permission denied)"),
                ("权限遭拒", "当前 Google 账号无权访问 (权限遭拒)"),
                ("check your account permissions", "账号权限不足 (Check your account permissions)"),
                ("model isn't available", "Google 免費池該模型暫不可用"),
                ("isn't available right now", "Google 免費池該模型暫不可用 (High demand)"),
                ("please wait a minute and try again", "Google 免費池高負載限流，請稍後再試"),
                ("high demand", "Google 免費池高負載排隊 (High demand / 503)"),
                ("spikes in demand", "Google 免費池流量尖峰限流 (503)"),
                ("error 14", "Google 免費池高負載錯誤 (Error 14 / 503)"),
                ("503", "Google 服務暫時不可用 (503)"),
                ("internal error", "Google 服务器内部错误 (Internal error)"),
                ("quota exceeded", "达到免费池配额限额 (Quota exceeded)"),
                ("rate limit", "达到请求频率限制 (Rate limit)"),
                ("resource has been exhausted", "免费池资源耗尽 (Resource exhausted)"),
                ("thinking level is unsupported", "该模型不支持所选思考等级"),
                ("model error", "模型执行錯誤"),
                ("failed to generate", "生成失敗"),
                ("safety blocks", "内容触发 Google 安全策略拦截"),
                ("blocked by safety", "内容触发安全审查拦截"),
                ("service unavailable", "Google 服务器服务暂时不可用"),
                ("an error occurred", "服务器发生异常错误"),
                ("something went wrong", "Google 服務端發生未知錯誤"),
            ]
            for err_key, err_desc in fatal_errors:
                if err_key in combined_err:
                    return False, "", [], f"【立即終止】{current_model_id} {err_desc}"

            # 檢測真正卡死 (未進入生成態超過 15 秒，或思考/生成超過時限且無任何增長)
            if not has_started_generating and (time.time() - (stuck_threshold - thinking_limit)) > 15.0:
                return False, "", [], f"模型未響應或受限於帳號權限：{current_model_id} 超過 15 秒未開始生成"
            if running and time.time() > stuck_threshold:
                return False, "", [], f"免费池排队拥塞：{current_model_id} 思考或生成超過 {int(thinking_limit)} 秒無增長卡死"

            # 正常完成信號：已開始生成過，且不在 running 狀態，且已有輸出，且文本已真正停止增長
            text_still_growing = (total_text_len != prev_poll_text_len or thought_text_len != prev_poll_thought_len)
            prev_poll_text_len = total_text_len
            prev_poll_thought_len = thought_text_len
            if has_started_generating and not running and has_output and not text_still_growing:
                # 若廣播器出現新的 Response ready，或非 running 下連續 3 個 tick (1.5秒) 穩定無變動
                is_new_announcer = (announcer != initial_announcer and "response ready" in announcer.lower())
                if is_new_announcer:
                    completed = True
                    break
                stable_ticks += 1
                if stable_ticks >= 3:
                    completed = True
                    break
            else:
                stable_ticks = 0

            if has_started_generating and not running and not has_output and not text_still_growing:
                empty_done_ticks += 1
                if empty_done_ticks >= 8:
                    return False, "", [], f"{current_model_id} 已停止生成但未返回有效內容"
            else:
                empty_done_ticks = 0

        if not completed:
            return False, "", [], f"执行超时 ({actual_timeout} 秒，思考閾值 {int(thinking_limit)} 秒)"

        # 4. 提取生成結果（共用於單發與 Wave，含虛擬捲動卸載時的 Copy as markdown 兜底）
        final_text, saved_files = _aistudio_extract_turn_payload(tab_id, initial_turns, out_path)

        if final_text or saved_files:
            if not final_text and saved_files:
                final_text = f"已完成內容生成（模型: {current_model_id}），共產出 {len(saved_files)} 個多媒體檔案。"
            return True, final_text, saved_files, ""

        return False, "", [], f"执行超时 ({timeout_sec} 秒)"

    try:
        # 等待输入框與模型選擇器水合就緒
        ready = _wait_aistudio_hydrated(tab_id, timeout=15.0)
        if not ready:
            return {"ok": False, "error": "AI Studio 页面加载超时（未找到输入框）"}

        # 若有本地文件上传需求，在初次尝试前挂载到 AI Studio
        if files:
            attached_ok = _aistudio_attach_files_agentlimb(tab_id, files)
            if attached_ok:
                sys.stderr.write(f"📁 [Gemini Web Agent] 成功挂载本地文件至 AI Studio: {', '.join(attached_ok)}\n")
            else:
                sys.stderr.write(f"⚠️ [Gemini Web Agent] 本地文件挂载未能成功完成\n")
            sys.stderr.flush()

        # 初次尝试
        success, output, out_files, err = _attempt_run(initial_model_id)
        paid_only_models = _get_account_paid_models()
        # AI Studio 偶發閃現 "permission denied. Please try again"：針對當前帳號已解鎖的模型先原地重載重試一次
        if not success and initial_model_id.lower() not in paid_only_models and any(
            k in (err or "").lower() for k in ("permission denied", "权限遭拒", "please try again")
        ):
            sys.stderr.write(f"🔄 [Gemini Web Agent] {initial_model_id} 遭遇免費池瞬時權限抖動，等待 1.5s 重新水合重試...\n")
            sys.stderr.flush()
            time.sleep(1.5)
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass
            nav_retry = agentlimb_client.call_tool("tab_new", {"url": target_url, "active": True})
            tab_id = nav_retry.get("result", {}).get("tab", {}).get("id") or nav_retry.get("id") or nav_retry.get("tabId")
            _wait_aistudio_hydrated(tab_id, timeout=15.0)
            if files:
                _aistudio_attach_files_agentlimb(tab_id, files)
            success, output, out_files, err = _attempt_run(initial_model_id)
        files = out_files
        active_model = initial_model_id
        fell_back = False
        fallback_chain = [initial_model_id]

        # 若失败且启用了自动降级 (Auto-Fallback)
        # 注意：若 thinking_policy == "strict"，auto_fallback 必定为 False，绝不走入以下降级
        if not success and auto_fallback and thinking_policy != "strict":
            # 依次使用阶梯备援（支持用户自定义阶梯配置与未来模型动态推导）
            is_image_model = any(k in initial_model_id.lower() for k in ("image", "nano"))
            if fallback_ladder and len(fallback_ladder) > 0 and not is_image_model:
                raw_ladder = fallback_ladder
            elif is_image_model:
                raw_ladder = get_fallback_ladder(initial_model_id)
            else:
                raw_ladder = get_fallback_ladder(initial_model_id) + ["gemini.google.com"]

            fallback_targets = [c for c in raw_ladder if c != initial_model_id]

            for target in fallback_targets:
                target_clean = (target or "").strip()
                if not target_clean:
                    continue

                if target_clean.lower() in ("flow", "flow.google.com", "google_flow"):
                    flow_res = _run_flow_task(
                        task=task,
                        model="gemini-nano-banana-2.1",
                        timeout_sec=timeout_sec,
                        download_dir=download_dir,
                        keep_tab=keep_tab,
                    )
                    if flow_res.get("ok"):
                        success = True
                        output = flow_res.get("output", "")
                        files = flow_res.get("files", [])
                        err = ""
                        active_model = flow_res.get("model") or "flow.google.com"
                        fallback_chain.append(active_model)
                        fell_back = True
                        break
                    else:
                        fallback_chain.append("flow.google.com (失败)")
                elif target_clean.lower() in ("gemini", "gemini.google.com", "gemini_web", "gemini-web"):
                    web_res = _run_gemini_web_task(
                        task=task,
                        model=initial_model_id,
                        timeout_sec=timeout_sec,
                        new_chat=True,
                        download_dir=download_dir,
                        keep_tab=keep_tab,
                        entry=entry,
                    )
                    if web_res.get("ok"):
                        success = True
                        output = web_res.get("output", "")
                        files = web_res.get("files", [])
                        err = ""
                        active_model = "gemini.google.com"
                        fallback_chain.append(active_model)
                        fell_back = True
                        break
                    else:
                        fallback_chain.append("gemini.google.com (拥塞)")
                else:
                    fallback_chain.append(target_clean)
                    fb_url = f"https://aistudio.google.com/prompts/new_chat?model={target_clean}"
                    try:
                        agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
                    except Exception:
                        pass
                    nav_fb = agentlimb_client.call_tool("tab_new", {"url": fb_url, "active": True})
                    tab_id = nav_fb.get("result", {}).get("tab", {}).get("id") or nav_fb.get("id") or nav_fb.get("tabId")
                    _wait_aistudio_hydrated(tab_id, timeout=15.0)
                    time.sleep(1.0)
                    if files:
                        _aistudio_attach_files_agentlimb(tab_id, files)

                    fb_success, fb_output, fb_files, fb_err = _attempt_run(target_clean)
                    if fb_success:
                        success = True
                        output = fb_output
                        files = fb_files
                        err = ""
                        active_model = target_clean
                        fell_back = True
                        break

            if not success:
                err = "CONGESTION_HALT: 降级阶梯序列所有备援渠道全数高负载排队拥塞。"

        # 自动代码检测与保存落地（AI Studio 通道防吞噬）
        if success and output:
            code_files = _extract_and_save_code(output, task, download_dir)
            for cf in code_files:
                if cf not in files:
                    files.append(cf)

        # 若有多模态文件或代码落地，追加工作区超链接
        if files:
            links = "\n".join([f"- [{Path(f).name}](file://{f})" for f in files])
            output += f"\n\n🎉 生成成果已同步落地存档至本地工作区：\n{links}"

        try:
            agentlimb_client.call_tool(
                "say",
                {"text": f"✅ Gemini Web Agent 已完成调度 (模型: {active_model})" if success else f"❌ Gemini Web Agent 执行失敗: {err}"},
            )
        except Exception:
            pass

        return {
            "ok": success,
            "model": active_model,
            "initial_model": initial_model_id,
            "fell_back": fell_back,
            "fallback_chain": fallback_chain,
            "fallback_history": " ➔ ".join([f"`{m}`" for m in fallback_chain]) if fell_back else "",
            "output": output,
            "files": files,
            "error": err,
            "thinking_policy": thinking_policy,
            "elapsed_sec": round(time.time() - t0, 2),
        }
    finally:
        if not keep_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


def check_flow_usage() -> dict:
    """後台靜默開啟 https://flow.google.com/ 抓取 Google Flow 獨立點數與重置時間，讀畢立刻 tab_close"""
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"credits": None, "reset_time": None, "reset_period": None, "error": "AgentLimb 服务未启动"}
    if not st.get("activeBrowser") and not st.get("browsers", 0):
        return {"credits": None, "reset_time": None, "reset_period": None, "error": "未检测到浏览器连接"}

    tab_id = None
    try:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://flow.google.com/", "active": False}, timeout=10.0)
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
    except Exception as e:
        return {"credits": None, "reset_time": None, "reset_period": None, "error": f"打开 Flow 失败: {e}"}

    if not tab_id:
        return {"credits": None, "reset_time": None, "reset_period": None, "error": "無法開啟用量偵測标签页"}

    try:
        time.sleep(1.2)
        click_res = agentlimb_client.eval_js(
            """(() => {
                const acc = document.querySelector('[aria-label="账号详情"], [aria-label*="Account" i], [aria-label*="帳號詳情" i], [aria-label*="帳戶" i]');
                if (acc) {
                    acc.click();
                    return true;
                }
                return false;
            })()""",
            tab_id=tab_id,
            timeout=8.0,
        )

        time.sleep(0.8)

        eval_res = agentlimb_client.eval_js(
            """(() => {
                const d = document.querySelector('[role="dialog"]');
                return d ? d.innerText : '';
            })()""",
            tab_id=tab_id,
            timeout=8.0,
        )
        raw = eval_res.get("result", {}).get("result", "")
        credits_m = re.search(
            r"([\d,]+)\s*(?:個\s*Google Flow\s*點數|个\s*Google Flow\s*点数|Google Flow\s*credits?)",
            raw,
            re.IGNORECASE,
        )
        # 忠实抓取完整的重置/刷新说明语句（例如 "Credits refresh daily at 5:00 PM" 或 "Resets on Dec 15" 或 "点数将于每日 17:00 刷新"）
        reset_m = re.search(
            r"(?:Credits?\s+refresh[^\n]+|Resets?(?:\s+on)?\s+[^\n]+|点数将于[^\n]+|點數將於[^\n]+|(?:重置时间|刷新时间)[:：]\s*[^\n]+|每日\s*[\d:]+\s*(?:AM|PM)?)",
            raw,
            re.IGNORECASE,
        )

        credits = int(credits_m.group(1).replace(",", "")) if credits_m else None
        raw_reset = reset_m.group(0).strip() if reset_m else None
        if raw_reset:
            raw_reset = re.sub(
                r"\s*(?:Upgrade|Manage|Sign\s*out|升级|升級|退出|person|Visible|可见水印|Privacy|隐私权|Terms).*$",
                "",
                raw_reset,
                flags=re.IGNORECASE,
            ).strip()

        period = None
        if raw_reset:
            lower = raw_reset.lower()
            if any(w in lower for w in ["daily", "每日", "每天"]):
                period = "daily"
            elif any(w in lower for w in ["month", "每月", "每逢", "resets on"]):
                period = "monthly"

        return {"credits": credits, "reset_time": raw_reset, "reset_period": period}
    except Exception:
        return {"credits": None, "reset_time": None, "reset_period": None}
    finally:
        if tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id}, timeout=5.0)
            except Exception:
                pass


def check_gemini_usage(include_flow: bool = True) -> dict:
    """後台靜默開啟 https://gemini.google.com/usage 抓取用量，並依需求讀取 Google Flow，依原作者鐵律讀取後立刻 tab_close"""
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"status": "error", "error": "AgentLimb 服务未连接"}
    if not st.get("activeBrowser") and not st.get("browsers", 0):
        return {"status": "error", "error": "AgentLimb 已就绪，但未检测到浏览器连接 (请打开 Chrome / Edge / Brave 浏览器)"}

    tab_id = None
    try:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://gemini.google.com/usage", "active": False}, timeout=10.0)
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
    except Exception as e:
        return {"status": "error", "error": f"打开用量标签页失败 (浏览器可能未响应或已关闭): {e}"}

    if not tab_id:
        return {"status": "error", "error": "無法開啟用量偵測标签页"}

    gemini_result = {}
    try:
        def _is_sorry_url() -> bool:
            try:
                u = str(agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", "") or "").lower()
                return "google.com/sorry" in u or "/sorry/index" in u
            except Exception:
                return False

        ready = False if _is_sorry_url() else wait_for_selector(tab_id, '[data-testid="current-usage"], [data-usage-island-root]', timeout=15.0)
        if _is_sorry_url():
            gemini_result = {
                "status": "error",
                "captcha_blocked": True,
                "error": "Gemini 官网触发 Google 人机验证 (google.com/sorry)，请在可见浏览器窗口手动完成验证后重试。",
            }
        elif not ready:
            gemini_result = {"status": "error", "error": "用量页面加载超时"}
        else:
            eval_res = agentlimb_client.eval_js(
                """(() => {
                    const root = document.querySelector('[data-usage-island-root]');
                    const cur = document.querySelector('[data-testid="current-usage"]');
                    const wk = document.querySelector('[data-testid="weekly-usage"]');
                    const plan = root?.querySelector('header span')?.innerText?.trim() || null;
                    return {
                        plan,
                        current_text: cur?.innerText || '',
                        weekly_text: wk?.innerText || '',
                    };
                })()""",
                tab_id=tab_id,
                timeout=8.0,
            )
            raw = eval_res.get("result", {}).get("result", {})
            cur_pct = None
            if raw.get("current_text"):
                m = re.search(r"(\d+(?:\.\d+)?)\s*%", raw["current_text"])
                if m:
                    cur_pct = float(m.group(1))
            reset_time = None
            if raw.get("current_text"):
                m = re.search(r"(?:重置時間[:：]\s*|Resets?\s+)([^\n|]+)", raw["current_text"], re.I)
                if m:
                    reset_time = m.group(1).strip()

            detected_plan = raw.get("plan")
            if not detected_plan:
                detected_plan = "FREE"

            gemini_result = {
                "status": "ok",
                "plan": detected_plan,
                "used_pct": cur_pct,
                "reset_time": reset_time,
            }
    finally:
        if tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id}, timeout=5.0)
            except Exception:
                pass

    # 循序执行：Gemini 标签页关闭後，再開啟 Flow 标签页探測，避免雙标签页競爭
    flow_info = {"credits": None, "reset_time": None, "reset_period": None}
    if include_flow:
        flow_info = check_flow_usage()

    gemini_result["flow_credits"] = flow_info.get("credits")
    gemini_result["flow_reset_time"] = flow_info.get("reset_time")
    gemini_result["flow_reset_period"] = flow_info.get("reset_period")
    return gemini_result


def discover_available_models() -> dict:
    """動態探索 AI Studio 當前帳號所有可用模型（自動識別 New / Paid 標記）"""
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"status": "error", "error": "AgentLimb 服务未连接"}
    if not st.get("activeBrowser") and not st.get("browsers", 0):
        return {"status": "error", "error": "未检测到浏览器连接"}

    tabs = agentlimb_client.get_tabs()
    target_tab = None
    created_tab = False
    for t in tabs:
        url = t.get("url", "")
        if "aistudio.google.com/prompts/" in url:
            target_tab = t
            break

    tab_id = None
    if target_tab is not None:
        tab_id = target_tab.get("id")
    else:
        try:
            nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://aistudio.google.com/prompts/new_chat", "active": False}, timeout=10.0)
            tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
            created_tab = True
        except Exception as e:
            return {"status": "error", "error": f"打开 AI Studio 失败: {e}"}

    if not tab_id:
        return {"status": "error", "error": "无法创建或定位 AI Studio 标签页"}

    try:
        ready = wait_for_selector(tab_id, ".model-selector-card", timeout=12.0)
        if not ready:
            return {"status": "error", "error": "未找到模型選擇按鈕"}

        # 點開模型菜单
        agentlimb_client.eval_js('document.querySelector(".model-selector-card")?.click()', tab_id=tab_id)
        time.sleep(0.4)

        js = """(() => {
          const overlay = document.querySelector('.cdk-overlay-pane');
          if (!overlay) return [];
          const rows = Array.from(overlay.querySelectorAll('.row-header-text'));
          return rows.map(r => {
            const title = r.querySelector('.model-title-text')?.innerText?.trim() || '';
            const subtitle = r.querySelector('.model-subtitle')?.innerText?.trim() || '';
            const isPaid = Boolean(r.querySelector('.paid') || r.innerText.includes('Paid'));
            const isNew = Boolean(r.querySelector('.new') || r.innerText.includes('New'));
            return {
              id: subtitle,
              name: title,
              paid: isPaid,
              new: isNew
            };
          }).filter(m => m.id && m.name);
        })()"""

        eval_res = agentlimb_client.eval_js(js, tab_id=tab_id)
        models = eval_res.get("result", {}).get("result", [])

        # 关闭彈窗
        agentlimb_client.eval_js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))", tab_id=tab_id)

        return {
            "status": "ok",
            "models": models,
        }
    finally:
        # 如果是臨時建立的标签页，讀取完畢立刻关闭，不留垃圾标签页
        if created_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


def _import_gemini_web():
    """按需匯入同目錄 gemini_web 共用花名冊、路徑解析與 JSON 解包邏輯。"""
    if "playwright" not in sys.modules:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            from unittest.mock import MagicMock
            pw_mod = MagicMock()
            sys.modules["playwright"] = pw_mod
            sys.modules["playwright.sync_api"] = pw_mod.sync_api
    import gemini_web as gw
    return gw


def _aistudio_extract_turn_payload(tab_id: int, initial_turns: int, out_path: Path | None) -> tuple[str, list[str]]:
    """從 AI Studio 當前標籤頁提取新增模型回覆文本與媒體文件（含最小化/虛擬捲動卸載時的 Copy as markdown 兜底）。"""
    extract_js = f"""(() => {{
      const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
      const newTurns = turns.slice({initial_turns});
      const modelTurns = (newTurns.length > 0 ? newTurns : turns).filter(t => {{
        const container = t.querySelector('.chat-turn-container');
        const cls = (container ? container.className : t.className) || '';
        if (/\\buser\\b/i.test(cls) || t.querySelector('textarea, ms-text-chunk[data-role="user"]')) return false;
        return /\\bmodel\\b/i.test(cls) || t.innerText.includes('Model ') || Boolean(t.querySelector('.model, .model-author, [data-role="model"], ms-cmark-node, ms-code-block'));
      }});
      if (modelTurns.length > 0) {{
        const lastTurn = modelTurns[modelTurns.length - 1];
        try {{ lastTurn.scrollIntoView({{ behavior: 'instant', block: 'end' }}); }} catch(e) {{}}
        const scroller = document.querySelector('ms-chat, .chat-container, cdk-virtual-scroll-viewport, .scrollable-container');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }}
      const sep = String.fromCharCode(10) + String.fromCharCode(10);
      const nl = String.fromCharCode(10);
      let turnTexts = [], imgs = [], audios = [], videos = [];
      for (const mt of modelTurns) {{
        const rawThoughtPanels = Array.from(mt.querySelectorAll('mat-expansion-panel')).filter(
          el => !el.closest('ms-code-block') && !el.querySelector('ms-code-block, pre, code')
        );
        const thoughtSet = new Set(Array.from(mt.querySelectorAll('ms-thought-chunk, .thought-container')).concat(rawThoughtPanels));
        const cmarkNodes = Array.from(mt.querySelectorAll('ms-cmark-node')).filter(
          el => !Array.from(thoughtSet).some(t => t.contains(el)) && !el.parentElement.closest('ms-cmark-node')
        );
        if (cmarkNodes.length > 0) {{
          const tText = cmarkNodes.map(el => {{
            if (el.querySelectorAll('ms-code-block').length > 0) {{
              const clone = el.cloneNode(true);
              clone.querySelectorAll('ms-code-block').forEach(cb => {{
                const lang = cb.getAttribute('data-test-language') || '';
                const codeText = cb.querySelector('code')?.textContent || '';
                const mdBlock = document.createTextNode(nl + '```' + lang + nl + codeText.trim() + nl + '```' + nl);
                if (cb.parentNode) cb.parentNode.replaceChild(mdBlock, cb);
              }});
              return (clone.textContent || '').trim();
            }}
            return (el.textContent || el.innerText || '').trim();
          }}).filter(Boolean).join(sep);
          if (tText) turnTexts.push(tText);
        }} else {{
          const codeBlocks = Array.from(mt.querySelectorAll('ms-code-block')).filter(el => !Array.from(thoughtSet).some(t => t.contains(el)));
          if (codeBlocks.length > 0) {{
            turnTexts.push(codeBlocks.map(cb => '```' + (cb.getAttribute('data-test-language') || '') + nl + (cb.querySelector('code')?.textContent || '').trim() + nl + '```').join(sep));
          }}
        }}
        Array.from(mt.querySelectorAll('img')).forEach(i => {{ if (i.src && !i.src.includes('avatar') && !i.src.includes('googleusercontent.com/a/')) imgs.push(i.src); }});
        Array.from(mt.querySelectorAll('audio, audio source')).forEach(a => {{ const s = a.src || a.getAttribute('src'); if (s) audios.push(s); }});
        Array.from(mt.querySelectorAll('video, video source')).forEach(v => {{ const s = v.src || v.getAttribute('src'); if (s) videos.push(s); }});
      }}
      return {{ text: turnTexts.join(sep), images: Array.from(new Set(imgs)), audios: Array.from(new Set(audios)), videos: Array.from(new Set(videos)) }};
    }})()"""
    res_data = agentlimb_client.eval_js(extract_js, tab_id=tab_id).get("result", {}).get("result", {})
    final_text = res_data.get("text", "")

    # 若瀏覽器最小化/虛擬捲動導致 DOM 未掛載 turn-content，透過 more_vert -> Copy as markdown 非破壞性攔截取出完整輸出
    if not final_text:
        copy_js = f"""(async () => {{
          const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
          const newTurns = turns.slice({initial_turns});
          const modelTurns = (newTurns.length > 0 ? newTurns : turns).filter(t => {{
            const container = t.querySelector('.chat-turn-container');
            const cls = (container ? container.className : t.className) || '';
            if (/\\buser\\b/i.test(cls) || t.querySelector('textarea, ms-text-chunk[data-role="user"]')) return false;
            return /\\bmodel\\b/i.test(cls) || Boolean(t.querySelector('button[aria-label="Open options"], button[aria-label="Good response"]'));
          }});
          const mt = modelTurns.length > 0 ? modelTurns[modelTurns.length - 1] : null;
          const mbtn = mt ? mt.querySelector('button[aria-label="Open options"]') : null;
          if (!mbtn) return '';
          let captured = '';
          const origWT = navigator.clipboard && Clipboard.prototype.writeText;
          const origExec = document.execCommand.bind(document);
          if (origWT) {{
            Clipboard.prototype.writeText = async function(txt) {{ captured = txt || ''; return Promise.resolve(); }};
          }}
          document.execCommand = function(cmd, ...args) {{
            if (cmd === 'copy') {{
              const ae = document.activeElement;
              const sel = window.getSelection()?.toString() || '';
              captured = (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && ae.value) ? ae.value : sel;
              return true;
            }}
            return origExec(cmd, ...args);
          }};
          try {{
            mbtn.click();
            await new Promise(r => setTimeout(r, 250));
            const items = Array.from(document.querySelectorAll('.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button'));
            const target = items.find(b => /copy as markdown/i.test(b.innerText || '')) || items.find(b => /copy as text/i.test(b.innerText || ''));
            if (target) {{
              target.click();
              await new Promise(r => setTimeout(r, 250));
            }} else {{
              document.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Escape', bubbles: true }}));
            }}
          }} finally {{
            if (origWT) Clipboard.prototype.writeText = origWT;
            document.execCommand = origExec;
          }}
          return (captured || '').trim();
        }})()"""
        try:
            copied = agentlimb_client.eval_js(copy_js, tab_id=tab_id).get("result", {}).get("result", "")
            if copied:
                final_text = copied
        except Exception:
            pass

    saved_files: list[str] = []
    if out_path:
        media_groups = [
            (res_data.get("images", []), "gemini_img"),
            (res_data.get("audios", []), "gemini_audio"),
            (res_data.get("videos", []), "gemini_video"),
        ]
        for urls, prefix in media_groups:
            for idx, media_src in enumerate(urls, 1):
                du = _fetch_blob_as_data_url(tab_id, media_src) if media_src.startswith("blob:") else media_src
                if du.startswith("data:"):
                    saved = _save_data_url(du, out_path, f"{prefix}_{idx}")
                    if saved:
                        saved_files.append(saved)
    return final_text, saved_files


def execute_wave_agentlimb(
    tasks: list[dict],
    roster_file: str = ".web-team.json",
    project: str = "",
    project_dir: str = ".",
    timeout_sec: int = 360,
    stagger_sec: float = 2.0,
    resume: bool = False,
    keep_tabs: bool = False,
) -> dict:
    """通道 A（AgentLimb）多 Tab 並發波次引擎：免獨立 AI Chrome，自動識別付費牆並降級免費主力模型。"""
    t0 = time.time()
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("wave 任务列表 tasks 不能为空。")

    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        raise RuntimeError("AgentLimb Bridge (8765) 未在线或扩展未连接")

    gw = _import_gemini_web()
    base_dir = Path(project_dir or ".").expanduser().resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    roster_path = gw._resolve_task_path(roster_file or ".web-team.json", base_dir)

    seen_roles: set[str] = set()
    for idx, t in enumerate(tasks):
        if not isinstance(t, dict):
            raise ValueError(f"wave 第 {idx + 1} 项任务必须是 JSON 对象。")
        r_name = str(t.get("role") or f"worker_{idx + 1}").strip()
        if r_name in seen_roles:
            raise ValueError(f"wave 中存在重复角色 '{r_name}'，同一波次内每个角色只能出现一次。")
        seen_roles.add(r_name)

    # 動態探測當前帳號解鎖狀態（PRO 帳號自動放行 Neon/Argon/Carbon，免費號自動降級）
    paid_models = _get_account_paid_models()

    pending: list[dict] = []
    results: list[dict] = []

    for idx, raw_task in enumerate(tasks):
        task = dict(raw_task)
        role = str(task.get("role") or f"worker_{idx + 1}").strip()
        site = str(task.get("site") or "aistudio").strip().lower()
        req_model = str(task.get("model") or "").strip()
        prompt = str(task.get("prompt") or "")
        prompt_file = str(task.get("prompt_file") or "").strip()
        if not prompt and prompt_file:
            prompt = Path(gw._resolve_task_path(prompt_file, base_dir)).read_text(encoding="utf-8")

        out_file_resolved = gw._resolve_task_path(str(task.get("out_file") or ""), base_dir)
        unpack_dir_resolved = gw._resolve_task_path(str(task.get("unpack_json_dir") or ""), base_dir)
        existing_role = gw._roster_lookup_role(roster_path, role)
        if resume and gw._is_wave_task_resumable_done(existing_role, out_file_resolved, unpack_dir_resolved):
            results.append({
                "role": role,
                "site": existing_role.get("site") or site,
                "status": "ok",
                "resumed_skipped": True,
                "url": existing_role.get("url") or "",
                "saved_text_file": out_file_resolved or None,
                "elapsed_sec": 0.0,
            })
            continue

        if not prompt:
            results.append({"role": role, "site": site, "status": "error", "error": "缺少 prompt 或 prompt_file"})
            continue

        files_resolved = [gw._resolve_task_path(f, base_dir) for f in (task.get("files") or []) if str(f).strip()]
        dl_dir = gw._resolve_task_path(str(task.get("download_dir") or ""), base_dir) or str(base_dir)
        thinking_level = str(task.get("thinking_level") or "high").strip().lower()
        if thinking_level in ("extra_high", "extra-high", "xhigh", "max"):
            thinking_level = "extra_high"

        if site in ("lyria", "music", "aistudio-music"):
            try:
                music_res = _run_aistudio_music_task(
                    task=prompt,
                    model=req_model or "lyria-3-pro-preview",
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    download_dir=dl_dir,
                    keep_tab=keep_tabs,
                )
                if not music_res.get("ok"):
                    gw.execute_roster(
                        action="set", roster_file=roster_path, role=role, site="lyria",
                        model=str(music_res.get("model") or "lyria-3-pro-preview"), status="failed", project=project,
                    )
                    results.append({
                        "role": role,
                        "site": "lyria",
                        "status": "error",
                        "paid_only": bool(music_res.get("paid_only")),
                        "error": music_res.get("error") or "AI Studio Lyria 执行失败",
                    })
                else:
                    gw.execute_roster(
                        action="set", roster_file=roster_path, role=role, site="lyria",
                        model=str(music_res.get("model") or "lyria-3-pro-preview"), status="done", project=project,
                    )
                    results.append({
                        "role": role,
                        "site": "lyria",
                        "status": "ok",
                        "model": music_res.get("model"),
                        "saved_files": music_res.get("files", []),
                        "elapsed_sec": music_res.get("elapsed_sec", 0.0),
                    })
            except Exception as exc:
                gw.execute_roster(action="set", roster_file=roster_path, role=role, site="lyria", model="lyria-3-pro-preview", status="failed", project=project)
                results.append({"role": role, "site": "lyria", "status": "error", "error": str(exc)})
            continue

        # 通道 A 將 build 映射為 AI Studio 免費主力模型輸出（同樣支援 unpack_json_dir 寫入電腦）
        eff_site = "aistudio" if site in ("build", "playground") else site

        if eff_site == "aistudio":
            eff_model = resolve_model_id(req_model or "gemini-4-hydrogen")
            downgraded_from = ""
            if eff_model.lower() in paid_models and "paid" not in req_model.lower():
                downgraded_from = eff_model
                eff_model = "gemini-4-hydrogen"

            target_url = f"https://aistudio.google.com/prompts/new_chat?model={eff_model}"
            try:
                nav = agentlimb_client.call_tool("tab_new", {"url": target_url, "active": True})
                tab_id = nav.get("result", {}).get("tab", {}).get("id") or nav.get("id") or nav.get("tabId")
                if not tab_id or not _wait_aistudio_hydrated(tab_id, timeout=15.0):
                    raise RuntimeError("AI Studio 页面加载超时")
                if files_resolved:
                    _aistudio_attach_files_agentlimb(tab_id, files_resolved)
                agentlimb_client.call_tool(
                    "form_input",
                    {"tabId": tab_id, "selector": 'textarea[aria-label="Enter a prompt"]', "value": prompt},
                )
                time.sleep(0.3)
                _aistudio_tune_thinking_and_dialogs(tab_id, thinking_level)
                init_res = agentlimb_client.eval_js(
                    "({turns: document.querySelectorAll('ms-chat-turn').length, announcer: document.querySelector('.cdk-live-announcer-element')?.innerText || ''})",
                    tab_id=tab_id,
                ).get("result", {}).get("result", {})
                agentlimb_client.eval_js('document.querySelector("button.ctrl-enter-submits")?.click()', tab_id=tab_id)
                cur_url = agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", target_url)
                gw.execute_roster(
                    action="set", roster_file=roster_path, role=role,
                    title=str(task.get("title") or task.get("role_title") or ""),
                    site=site, model=eff_model, thinking_level=thinking_level,
                    tab_id=str(tab_id), url=str(cur_url),
                    duty=str(task.get("duty") or ""), status="running", project=project,
                )
                pending.append({
                    "role": role, "site": site, "entry": "aistudio", "model": eff_model,
                    "downgraded_from": downgraded_from, "tab_id": tab_id, "url": str(cur_url),
                    "prompt": prompt, "files": files_resolved,
                    "before_turns": init_res.get("turns", 0), "initial_announcer": init_res.get("announcer", ""),
                    "out_file": out_file_resolved, "unpack_json_dir": unpack_dir_resolved, "download_dir": dl_dir,
                    "started_at": time.time(), "has_started": False, "stable_ticks": 0,
                    "prev_len": 0, "retry_count": 0,
                })
            except Exception as exc:
                gw.execute_roster(action="set", roster_file=roster_path, role=role, site=site, model=eff_model, status="failed", project=project)
                results.append({"role": role, "site": site, "status": "error", "error": str(exc)})

        elif eff_site in ("gemini_task", "gemini", "gemini_chat", "task", "chat"):
            eff_entry = "chat" if eff_site in ("gemini_chat", "chat") else str(task.get("entry") or "task")
            try:
                web_res = _run_gemini_web_task(
                    task=prompt, model=req_model or "hydrogen",
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    new_chat=True, download_dir=dl_dir, keep_tab=keep_tabs, entry=eff_entry,
                )
                if not web_res.get("ok"):
                    raise RuntimeError(web_res.get("error") or "Gemini Web 执行失败")
                text_body = web_res.get("output", "") or ""
                rec: dict = {
                    "role": role, "site": site, "entry": eff_entry, "status": "ok",
                    "model": web_res.get("model", "gemini.google.com"),
                    "saved_files": web_res.get("files", []),
                    "text_chars": len(text_body),
                    "elapsed_sec": web_res.get("elapsed_sec", 0.0),
                }
                if out_file_resolved:
                    p_out = Path(out_file_resolved)
                    p_out.parent.mkdir(parents=True, exist_ok=True)
                    p_out.write_text(text_body, encoding="utf-8")
                    rec["saved_text_file"] = str(p_out)
                if unpack_dir_resolved:
                    rec["unpacked_files"] = gw._unpack_json_from_text(text_body, unpack_dir_resolved)
                gw.execute_roster(
                    action="set", roster_file=roster_path, role=role,
                    site=site, model=str(rec["model"]), status="done", project=project,
                )
                results.append(rec)
            except Exception as exc:
                gw.execute_roster(action="set", roster_file=roster_path, role=role, site=site, model=req_model or "Auto", status="failed", project=project)
                results.append({"role": role, "site": site, "status": "error", "error": str(exc)})

        elif eff_site == "flow":
            try:
                flow_res = _run_flow_task(
                    task=prompt, model=req_model or "gemini-nano-banana-2.1",
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    download_dir=dl_dir, keep_tab=keep_tabs,
                )
                if not flow_res.get("ok"):
                    raise RuntimeError(flow_res.get("error") or "Google Flow 执行失败")
                gw.execute_roster(
                    action="set", roster_file=roster_path, role=role,
                    site="flow", model=str(flow_res.get("model") or "Nano Banana 2.1"), status="done", project=project,
                )
                results.append({
                    "role": role, "site": "flow", "status": "ok",
                    "model": flow_res.get("model"), "saved_files": flow_res.get("files", []),
                    "elapsed_sec": flow_res.get("elapsed_sec", 0.0),
                })
            except Exception as exc:
                gw.execute_roster(action="set", roster_file=roster_path, role=role, site="flow", model="Nano Banana 2.1", status="failed", project=project)
                results.append({"role": role, "site": "flow", "status": "error", "error": str(exc)})
        else:
            results.append({"role": role, "site": site, "status": "error", "error": f"wave 暂不支持的站点类型: {site}"})

        if idx < len(tasks) - 1 and stagger_sec > 0 and eff_site == "aistudio":
            time.sleep(float(stagger_sec))

    # 輪詢所有 AI Studio 並發分頁
    deadline = time.time() + max(30, int(timeout_sec))
    while pending and time.time() < deadline:
        still_pending: list[dict] = []
        for item in pending:
            tab_id = item["tab_id"]
            role = item["role"]
            try:
                agentlimb_client.call_tool("tab_activate", {"tabId": tab_id})
                poll_js = f"""(() => {{
                  let running = false;
                  for (const b of document.querySelectorAll('button')) {{
                    const r = b.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0) continue;
                    const txt = (b.innerText || '').trim();
                    const aria = (b.getAttribute('aria-label') || '').trim();
                    if (/editing/i.test(aria) || /editing/i.test(txt)) continue;
                    if (/\\b(Stop|Cancel)\\b/i.test(txt) || /\\b(Stop|Cancel)\\b/i.test(aria)) {{ running = true; break; }}
                  }}
                  const spinner = document.querySelector('mat-spinner, mat-progress-bar, .spinner, .loading');
                  running = running || Boolean(spinner);
                  const turns = Array.from(document.querySelectorAll('ms-chat-turn')).slice({item['before_turns']});
                  const modelTurns = turns.filter(t => {{
                    const c = t.querySelector('.chat-turn-container');
                    const cls = (c ? c.className : t.className) || '';
                    if (/\\buser\\b/i.test(cls) || t.querySelector('textarea')) return false;
                    return /\\bmodel\\b/i.test(cls) || t.innerText.includes('Model ') || Boolean(t.querySelector('ms-cmark-node, ms-code-block, img[src^="data:image/"], img[src^="blob:"]'));
                  }});
                  let totalLen = 0;
                  modelTurns.forEach(mt => {{ totalLen += (mt.textContent || '').trim().length; }});
                  const errTxt = Array.from(document.querySelectorAll('.error, mat-error, .snack-bar-container, .mat-mdc-snack-bar-container, [role="alert"]'))
                    .map(e => (e.innerText || '').trim()).filter(Boolean).join(' ') + ' ' + modelTurns.map(m => m.innerText || '').join(' ');
                  const hasMedia = modelTurns.some(mt => mt.querySelectorAll('img[src^="blob:"], img[src^="data:image/"], video[src^="blob:"], video source[src]').length > 0);
                  const hasDoneFooter = modelTurns.some(mt => Boolean(mt.querySelector('button[aria-label="Good response"], button[aria-label="Bad response"], .model-run-time-pill')));
                  const hasOutput = hasMedia || hasDoneFooter || modelTurns.some(mt => (mt.textContent || '').replace(/(more_vert|thumb_up|thumb_down|edit)/g, '').trim().length > 0);
                  const announcer = document.querySelector('.cdk-live-announcer-element')?.innerText || '';
                  return {{ running, hasModelTurn: modelTurns.length > 0, hasOutput, totalLen, errTxt: errTxt.toLowerCase(), announcer }};
                }})()"""
                st_res = agentlimb_client.eval_js(poll_js, tab_id=tab_id).get("result", {}).get("result", {})
                running = st_res.get("running", False)
                has_output = st_res.get("hasOutput", False)
                total_len = st_res.get("totalLen", 0)
                err_txt = st_res.get("errTxt", "")
                if running or st_res.get("hasModelTurn"):
                    item["has_started"] = True

                # 若 AI Studio 免費池偶發 Permission denied 或擁塞，自動原地重試或降級下一階免費模型
                if any(k in err_txt for k in ("permission denied", "权限遭拒", "high demand", "503", "isn't available right now", "failed to generate")):
                    ladder = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"]
                    if item["retry_count"] == 0 and item["model"] in ladder:
                        next_model = item["model"]
                    else:
                        next_model = next((m for m in ladder if m != item["model"]), "")
                    if next_model and item["retry_count"] < 2:
                        item["retry_count"] += 1
                        item["model"] = next_model
                        item["has_started"] = False
                        item["stable_ticks"] = 0
                        item["prev_len"] = 0
                        fb_url = f"https://aistudio.google.com/prompts/new_chat?model={next_model}"
                        agentlimb_client.call_tool("navigate", {"tabId": tab_id, "url": fb_url})
                        _wait_aistudio_hydrated(tab_id, timeout=15.0)
                        if item["files"]:
                            _aistudio_attach_files_agentlimb(tab_id, item["files"])
                        agentlimb_client.call_tool(
                            "form_input",
                            {"tabId": tab_id, "selector": 'textarea[aria-label="Enter a prompt"]', "value": item["prompt"]},
                        )
                        time.sleep(0.3)
                        init_res = agentlimb_client.eval_js(
                            "({turns: document.querySelectorAll('ms-chat-turn').length, announcer: document.querySelector('.cdk-live-announcer-element')?.innerText || ''})",
                            tab_id=tab_id,
                        ).get("result", {}).get("result", {})
                        item["before_turns"] = init_res.get("turns", 0)
                        agentlimb_client.eval_js('document.querySelector("button.ctrl-enter-submits")?.click()', tab_id=tab_id)
                        still_pending.append(item)
                        continue
                    raise RuntimeError(f"AI Studio 返回错误: {err_txt[:180]}")

                if item["has_started"] and not running and has_output and total_len == item["prev_len"]:
                    item["stable_ticks"] += 1
                else:
                    item["stable_ticks"] = 0
                item["prev_len"] = total_len

                if item["stable_ticks"] < 2:
                    still_pending.append(item)
                    continue

                text_body, saved_files = _aistudio_extract_turn_payload(tab_id, item["before_turns"], Path(item["download_dir"]))
                final_url = agentlimb_client.eval_js("location.href", tab_id=tab_id).get("result", {}).get("result", item["url"])
                rec = {
                    "role": role,
                    "site": item["site"],
                    "entry": "aistudio-agentlimb",
                    "status": "ok",
                    "model": item["model"],
                    "downgraded_from": item["downgraded_from"] or None,
                    "url": str(final_url),
                    "text_chars": len(text_body),
                    "saved_files": saved_files,
                    "elapsed_sec": round(time.time() - item["started_at"], 2),
                }
                if item["out_file"]:
                    p_out = Path(item["out_file"])
                    p_out.parent.mkdir(parents=True, exist_ok=True)
                    p_out.write_text(text_body, encoding="utf-8")
                    rec["saved_text_file"] = str(p_out)
                if item["unpack_json_dir"]:
                    try:
                        rec["unpacked_files"] = gw._unpack_json_from_text(text_body, item["unpack_json_dir"])
                    except Exception:
                        rec["unpacked_files"] = _extract_and_save_code(text_body, item["prompt"], item["unpack_json_dir"])
                if not item["out_file"] and not rec.get("unpacked_files"):
                    rec["text_preview"] = text_body[:600]
                gw.execute_roster(
                    action="set", roster_file=roster_path, role=role,
                    site=item["site"], model=item["model"], tab_id=str(tab_id),
                    url=str(final_url), status="done", project=project,
                )
                results.append(rec)
                if not keep_tabs:
                    try:
                        agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
                    except Exception:
                        pass
            except Exception as exc:
                gw.execute_roster(action="set", roster_file=roster_path, role=role, status="failed", project=project)
                results.append({"role": role, "site": item["site"], "status": "error", "error": str(exc)})
                if not keep_tabs:
                    try:
                        agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
                    except Exception:
                        pass
        pending = still_pending
        if pending:
            time.sleep(0.8)

    for item in pending:
        gw.execute_roster(action="set", roster_file=roster_path, role=item["role"], status="failed", project=project)
        results.append({"role": item["role"], "site": item["site"], "status": "error", "error": f"波次轮询超时 ({timeout_sec}s)"})
        if not keep_tabs:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": item["tab_id"]})
            except Exception:
                pass

    all_ok = all(r.get("status") == "ok" for r in results)
    return {
        "status": "ok" if all_ok else "partial",
        "channel": "agentlimb",
        "project_dir": str(base_dir),
        "roster_file": str(roster_path),
        "results": results,
        "elapsed_sec": round(time.time() - t0, 2),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Gemini AgentLimb Runner")
    subparsers = parser.add_subparsers(dest="cmd")

    p_usage = subparsers.add_parser("usage", help="檢測用量")
    p_usage.add_argument("--include-flow", action="store_true", default=True, help="同時檢測 Flow 點數 (預設啟用)")
    p_usage.add_argument("--no-flow", action="store_true", help="跳過 Flow 檢測")
    p_usage.add_argument("--port", type=int, default=8765)

    p_models = subparsers.add_parser("models", help="動態探索可用模型")

    p_wave = subparsers.add_parser("wave", help="通道 A 多 Tab 並發波次執行")
    p_wave.add_argument("--spec", required=True, help="Wave JSON 規格文件路徑")
    p_wave.add_argument("--project-dir", default=".")
    p_wave.add_argument("--roster-file", default=".web-team.json")
    p_wave.add_argument("--project", default="")
    p_wave.add_argument("--timeout", type=int, default=360)
    p_wave.add_argument("--stagger", type=float, default=2.0)
    p_wave.add_argument("--resume", action="store_true")
    p_wave.add_argument("--keep-tabs", action="store_true")
    p_wave.add_argument("--json", action="store_true", dest="as_json")

    p_task = subparsers.add_parser("task", help="执行 Agent 任務")
    p_task.add_argument("task_prompt", nargs="*", help="任務提示词")
    p_task.add_argument("--prompt", default="", help="任務提示词 (可選，或直接傳入 positional 參數)")
    p_task.add_argument("--model", default="gemini-4-hydrogen")
    p_task.add_argument("--site", default="aistudio")
    p_task.add_argument("--entry", default="chat", help="入口模式：chat 或 task")
    p_task.add_argument("--thinking-level", default="high")
    p_task.add_argument("--thinking-policy", choices=["adaptive", "custom", "strict"], default="adaptive", help="思考閾值策略：adaptive(智能自适应), custom(自定义超时), strict(严格模式不降级)")
    p_task.add_argument("--thinking-timeout", type=int, default=0, help="自定义思考超时秒数 (0 表示由 policy 決定)")
    p_task.add_argument("--timeout", type=int, default=180)
    p_task.add_argument("--new-chat", action="store_true", help="开启新对话")
    p_task.add_argument("--no-fallback", action="store_true", help="关闭阶梯降级 (严格模式)")
    p_task.add_argument("--fallback-ladder", default="", help="自定义降级阶梯序列 (逗號分隔或JSON列表，最多5級)")
    p_task.add_argument("--download-dir", default="", help="多模態下載目錄")
    p_task.add_argument("--keep-tab", action="store_true", help="执行完畢後保留浏览器标签页不关闭")
    p_task.add_argument("--file", dest="files", action="append", default=[], help="待上傳的本機檔案路徑（可多次傳入）")

    # 如果傳入了 usage 子命令
    if len(sys.argv) > 1 and sys.argv[1] == "usage":
        args, _ = parser.parse_known_args()
        include_flow = True
        if getattr(args, "no_flow", False):
            include_flow = False
        res = check_gemini_usage(include_flow=include_flow)
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    # 如果傳入了 models 子命令
    if len(sys.argv) > 1 and sys.argv[1] == "models":
        res = discover_available_models()
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    # 如果傳入了 wave 子命令
    if len(sys.argv) > 1 and sys.argv[1] == "wave":
        args = parser.parse_args()
        spec_raw = json.loads(Path(args.spec).expanduser().resolve().read_text(encoding="utf-8"))
        spec_tasks = spec_raw["tasks"] if isinstance(spec_raw, dict) and "tasks" in spec_raw else spec_raw
        spec_project = args.project or (spec_raw.get("project", "") if isinstance(spec_raw, dict) else "")
        res = execute_wave_agentlimb(
            tasks=spec_tasks,
            roster_file=args.roster_file,
            project=spec_project,
            project_dir=args.project_dir,
            timeout_sec=args.timeout,
            stagger_sec=args.stagger,
            resume=args.resume,
            keep_tabs=args.keep_tabs,
        )
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    # 彈性相容：如果使用者直接傳入參數或旗標 (如 --model 或直接寫提示词) 而未帶 task，自動補上 task
    if len(sys.argv) > 1 and sys.argv[1] not in ("usage", "models", "wave", "task", "-h", "--help"):
        sys.argv.insert(1, "task")

    # 执行 task 子命令
    if len(sys.argv) > 1 and sys.argv[1] == "task":
        args = parser.parse_args()
        prompt = args.prompt or (" ".join(args.task_prompt) if args.task_prompt else "請用简体中文用一句話介紹你自己")
        fallback_ladder = None
        if getattr(args, "fallback_ladder", ""):
            fl_raw = args.fallback_ladder.strip()
            if fl_raw.startswith("["):
                try:
                    fallback_ladder = json.loads(fl_raw)
                except Exception:
                    fallback_ladder = [x.strip() for x in fl_raw.strip("[]").split(",") if x.strip()]
            else:
                fallback_ladder = [x.strip() for x in fl_raw.split(",") if x.strip()]
        res = run_agent_task(
            prompt,
            model=args.model,
            site=args.site,
            entry=args.entry,
            thinking_level=args.thinking_level,
            thinking_policy=args.thinking_policy,
            thinking_timeout=args.thinking_timeout,
            auto_fallback=not args.no_fallback and args.thinking_policy != "strict",
            fallback_ladder=fallback_ladder,
            timeout_sec=args.timeout,
            new_chat=args.new_chat,
            download_dir=args.download_dir,
            keep_tab=args.keep_tab,
            files=getattr(args, "files", []) or [],
        )
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    # 預設：直接把所有參數當作任務提示词
    task_input = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "請用简体中文用一句話介紹你自己"
    res = run_agent_task(task_input)
    print(json.dumps(res, ensure_ascii=False))
