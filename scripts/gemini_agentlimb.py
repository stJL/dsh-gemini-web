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
    "nano": "gemini-nano-banana-2.1",
    "nano2.1": "gemini-nano-banana-2.1",
    "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
    "omni": "gemini-omni-1.2-flash",
    "omni1.2": "gemini-omni-1.2-flash",
    "gemini-omni-1.2-flash": "gemini-omni-1.2-flash",
    "lyria": "lyria-3.5",
    "lyria-3.5": "lyria-3.5",
}


def resolve_model_id(model_name: str) -> str:
    key = (model_name or "flash").strip().lower()
    return MODEL_MAP.get(key, key)


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
    "gemini-4-neon": ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-4-argon": ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-4-hydrogen": ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    "gemini-3.8-flash": ["gemini-3.5-flash-lite"],
    "gemini-3.5-flash-lite": [],
    "gemini-decision-1": ["gemini-4-argon", "gemini-4-hydrogen", "gemini-3.8-flash"],
}


def _save_data_url(data_url: str, out_dir: Path, prefix: str) -> str:
    """將 data:<mime>;base64,... 解碼保存到本地文件"""
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
    """在瀏覽器中讀取 blob: URL 並轉為 data URL"""
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


def _run_gemini_web_task(
    task: str,
    model: str = "hydrogen",
    timeout_sec: int = 180,
    new_chat: bool = False,
    download_dir: str = "",
    keep_tab: bool = False,
    entry: str = "chat",
) -> dict:
    """在外部瀏覽器的 gemini.google.com/app 中執行對話（支援 TrustedHTML、零彈窗、模型切換與多輪隔離）"""
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

    def _execute():
        ready = wait_for_selector(tab_id, 'div[role="textbox"]', timeout=15.0)
        if not ready:
            return {"ok": False, "error": "Gemini 官網頁面載入逾時（未找到輸入框）"}

        # 0. 未雨綢繆：動態能級探測與全自動解鎖選模 (完全適應未來 Gemini 5、各類會員階層與無選單模式)
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

            // 確保選單已開啟
            if (picker.getAttribute('aria-expanded') !== 'true') {
                picker.click();
            }

            // 等待項目載入 (最多 600ms)
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

            // 智能評分器 (Scorer)：版本號權重 (5 > 4 > 3) + 能級語意權重
            function score(opt, targetIntent) {
                let s = 0;
                const full = opt.text.toLowerCase();
                const verMatch = full.match(/\b(\d+)\b/);
                if (verMatch) {
                    s += parseInt(verMatch[1], 10) * 100;
                }
                if (targetIntent === 'reasoning') {
                    if (/deeper|analysis|neon|argon|ultra|pro|code|complex/i.test(full)) s += 150;
                    else if (/everyday|hydrogen|balanced/i.test(full)) s += 50;
                    else if (/auto/i.test(full)) s += 10;
                } else if (targetIntent === 'balanced') {
                    if (/everyday|hydrogen|balanced|flash/i.test(full)) s += 150;
                    else if (/auto/i.test(full)) s += 80;
                    else if (/deeper|neon/i.test(full)) s += 40;
                } else {
                    if (/auto/i.test(full)) s += 150;
                    else if (/everyday|hydrogen/i.test(full)) s += 80;
                    else s += 40;
                }
                return s;
            }

            unlocked.sort((a, b) => score(b, intent) - score(a, intent));
            const best = unlocked[0];
            const lines = best.text.split('\n');
            const bestModelName = (lines.length > 1 ? lines[1] : lines[0]).trim();
            const coreName = bestModelName.replace(/^\d+\s*/, '').toLowerCase();

            // 若目前選中的模型即為最佳可用模型，關閉選單退出
            if (currentPickerLabel.toLowerCase().includes(coreName)) {
                if (picker.getAttribute('aria-expanded') === 'true') picker.click();
                return { ok: true, switched: false, activeModel: bestModelName, score: score(best, intent) };
            }

            // 點擊切換至最佳解鎖模型
            best.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            best.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            best.el.click();
            await wait(250);

            return { ok: true, switched: true, activeModel: bestModelName, score: score(best, intent) };
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

        # 2. 寫入輸入框 (處理 TrustedHTML 規範)
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

        # 3. 點擊傳送
        send_js = """(() => {
          const sendBtn = document.querySelector('button[aria-label*="Send message" i], button[aria-label*="傳送訊息" i], button[aria-label*="发送" i], button.send-button');
          if (sendBtn) {
            sendBtn.click();
            return true;
          }
          return false;
        })()"""
        agentlimb_client.eval_js(send_js, tab_id=tab_id)

        # 4. 監控生成
        deadline = time.time() + timeout_sec
        has_started = False
        stable_ticks = 0
        while time.time() < deadline:
            time.sleep(0.5)
            poll_js = f"""(() => {{
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
              const text = last ? (last.innerText || '').trim() : '';
              return {{
                running: running,
                newCount: newResponses.length,
                hasContent: text.length > 0,
                textLen: text.length
              }};
            }})()"""
            p = agentlimb_client.eval_js(poll_js, tab_id=tab_id)
            res_obj = p.get("result", {}).get("result", {})
            running = res_obj.get("running", False)
            new_count = res_obj.get("newCount", 0)
            has_content = res_obj.get("hasContent", False)

            if running or new_count > 0:
                has_started = True

            if has_started and not running and has_content:
                stable_ticks += 1
                if stable_ticks >= 3:
                    break
            else:
                stable_ticks = 0

        # 5. 擷取回應
        extract_js = f"""(() => {{
          const responses = Array.from(document.querySelectorAll('model-response'));
          const newResponses = responses.slice({initial_responses});
          const last = newResponses.length > 0 ? newResponses[newResponses.length - 1] : (responses.length > 0 ? responses[responses.length - 1] : null);
          if (!last) return {{ text: '', images: [] }};
          const md = last.querySelector('.markdown, message-content, [data-test-id="message-content"]') || last;
          let text = (md.innerText || '').trim();
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

        # 自動代碼檢測與保存落地（官網通道防吞噬）
        if final_text:
            code_text = ""
            lang = ""
            code_block_match = re.search(r'```([a-zA-Z0-9_\-\+\#]+)?\s*\n(.*?)```', final_text, re.DOTALL)
            if code_block_match:
                lang = (code_block_match.group(1) or "").lower().strip()
                code_text = code_block_match.group(2)
            else:
                # 檢測 gemini.google.com 網頁端特有的代碼標題格式 (例如 "Rust\nuse ...", "C++\n#include ...", "Python\nimport ...")
                alt_match = re.search(r'(?:^|\n)(Rust|C\+\+|Python|Go|TypeScript|JavaScript|HTML|CSS|TOML|JSON)\s*\n(.*?)(?=\n\s*(?:[A-Z][a-z]+|#{1,6}\s+|[\u4e00-\u9fa5]{2,})|\Z)', final_text, re.DOTALL)
                if alt_match:
                    lang = alt_match.group(1).lower().strip()
                    code_text = alt_match.group(2)

            if code_text:
                ext_map = {
                    "cpp": ".cpp", "c++": ".cpp", "cxx": ".cpp", "c": ".c", "h": ".h", "hpp": ".hpp",
                    "python": ".py", "py": ".py",
                    "rust": ".rs", "rs": ".rs",
                    "go": ".go", "golang": ".go",
                    "javascript": ".js", "js": ".js", "typescript": ".ts", "ts": ".ts",
                    "html": ".html", "css": ".css", "sh": ".sh", "bash": ".sh",
                    "json": ".json", "yaml": ".yaml", "yml": ".yml", "toml": ".toml"
                }
                ext = ext_map.get(lang, ".txt")
                stem = "gemini_generated_code"
                tl = task.lower()
                if "thread" in tl or "線程池" in task or "线程池" in task:
                    stem = "thread_pool"
                elif "actor" in tl or "akka" in tl or "rust" in tl:
                    stem = "actor_system"
                elif "queue" in tl or "無鎖" in task or "佇列" in task or "队列" in task:
                    stem = "lock_free_queue"
                elif "crawler" in tl or "爬蟲" in task or "爬虫" in task:
                    stem = "async_crawler"
                elif "tree" in tl or "紅黑樹" in task or "红黑树" in task:
                    stem = "red_black_tree"

                out_p = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
                out_p.mkdir(parents=True, exist_ok=True)
                code_file_path = out_p / f"{stem}{ext}"
                try:
                    with open(code_file_path, "w", encoding="utf-8") as cf:
                        cf.write(code_text)
                    if str(code_file_path) not in saved_files:
                        saved_files.append(str(code_file_path))
                except Exception as e:
                    print(f"[code_save_error] {e}", file=sys.stderr)

        if saved_files:
            links = "\n".join([f"- [{Path(f).name}](file://{f})" for f in saved_files])
            final_text += f"\n\n🎉 生成成果已同步落地存檔至本地工作區：\n{links}"

        success = bool(final_text or saved_files)
        return {
            "ok": success,
            "site": "gemini",
            "model": f"gemini.google.com ({detected_web_model})",
            "fell_back": False,
            "output": final_text,
            "files": saved_files,
            "error": "" if success else "未獲取到 Gemini 回應內容",
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
    """在外部瀏覽器的 Google Flow (flow.google.com) 畫布中生成多媒體（支援 0 點數 Nano Banana 2.1）"""
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
        # 若在首頁，點擊新建專案進入畫布
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
            return {"ok": False, "error": "Google Flow 畫布載入逾時（未找到輸入框）"}

        # 記錄生成前的媒體 URLs
        collect_js = """(() => {
            const urls = [];
            for (const el of document.querySelectorAll('img[src*="flow-content.google"], img[src*="/asb/"], img[src^="blob:"], video[src*="flow-content.google"], video[src*="/asb/"]')) {
                const src = el.getAttribute('src') || el.currentSrc || '';
                if (src && el.naturalWidth !== 0) urls.push(src);
            }
            return Array.from(new Set(urls));
        })()"""
        before_urls = set(agentlimb_client.eval_js(collect_js, tab_id=tab_id).get("result", {}).get("result", []))

        # 填寫提示詞 (TrustedHTML 兼容)
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
        time.sleep(0.3)

        # 點擊開始生成
        click_js = """(() => {
            const btn = document.querySelector('button[aria-label*="生成" i], button[aria-label*="Generate" i], button.generate-icon-button, button.mat-mdc-tooltip-trigger:has(.material-symbols-outlined)');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        })()"""
        agentlimb_client.eval_js(click_js, tab_id=tab_id)

        # 監控生成新檔案
        deadline = time.time() + timeout_sec
        new_urls = []
        while time.time() < deadline:
            time.sleep(1.0)
            cur_urls = agentlimb_client.eval_js(collect_js, tab_id=tab_id).get("result", {}).get("result", [])
            new_urls = [u for u in cur_urls if u not in before_urls]
            if new_urls:
                break

        if not new_urls:
            return {"ok": False, "error": f"等待 Google Flow 生成超時 ({timeout_sec} 秒)"}

        # 下載保存媒體
        saved_files = []
        out_path = Path(download_dir).resolve() if download_dir else (Path.cwd() / "downloads").resolve()
        out_path.mkdir(parents=True, exist_ok=True)
        for idx, u in enumerate(new_urls, 1):
            data_url = u
            if u.startswith("blob:"):
                data_url = _fetch_blob_as_data_url(tab_id, u)
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
            "output": f"已在 Google Flow (flow.google.com) 成功生成多媒體，共產出 {len(new_urls)} 個檔案（Nano Banana 2.1 享 0 點數消耗）。",
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


def run_agent_task(
    task: str,
    model: str = "gemini-3.8-flash",
    site: str = "aistudio",
    entry: str = "chat",
    thinking_level: str = "high",
    thinking_policy: str = "adaptive",
    thinking_timeout: int = 0,
    auto_fallback: bool = True,
    timeout_sec: int = 180,
    new_chat: bool = False,
    download_dir: str = "",
    keep_tab: bool = False,
) -> dict:
    t0 = time.time()
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"ok": False, "error": "AgentLimb Bridge (8765) 未在線或擴充功能未連線"}

    # 站點分支：如果是 Google Flow
    if site.lower() in ("flow", "google_flow", "flow.google.com"):
        return _run_flow_task(
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
        if "aistudio.google.com" in url:
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
        # 若要求開新對話，或當前分頁不在 /prompts/，導航至新聊天室
        if new_chat or "/prompts/" not in current_tab_url:
            agentlimb_client.call_tool("navigate", {"tabId": tab_id, "url": target_url})

    def _attempt_run(current_model_id: str) -> tuple[bool, str, list[str], str]:
        # 1. 填寫任務提示詞
        agentlimb_client.call_tool(
            "form_input",
            {
                "tabId": tab_id,
                "selector": 'textarea[aria-label="Enter a prompt"]',
                "value": task,
            },
        )
        time.sleep(0.3)

        # 1.2 封印 Extra High：檢測並確保 Thinking Level 不超過 High，避免免費池 Permission Denied 與分鐘級假死
        safe_thinking = "high"
        if thinking_level and thinking_level.lower() in ("medium", "low"):
            safe_thinking = thinking_level.lower()

        tune_js = f"""(async (desiredLevel) => {{
          const wait = ms => new Promise(r => setTimeout(r, ms));
          try {{
            // 檢查並調試 Thinking Level 下拉選單
            const tl = document.querySelector('mat-select[aria-label*="Thinking"], [aria-label*="Thinking"]');
            if (tl) {{
              const curTxt = (tl.innerText || '').toLowerCase();
              if (curTxt.includes('extra') || desiredLevel) {{
                tl.click();
                await wait(250);
                const opts = Array.from(document.querySelectorAll('.cdk-overlay-pane mat-option')).filter(
                  o => o.getAttribute('aria-disabled') !== 'true' && !/\\bpaid\\b/i.test(o.innerText || '')
                );
                // 嚴格封印 Extra High：優先選擇 High，其次 Medium，絕不選 Extra High
                let target = null;
                if (desiredLevel === 'medium') {{
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
            // 自動關閉任何干擾彈窗（如 Link a paid API key）
            const dismissBtn = Array.from(document.querySelectorAll('button')).find(b => 
              /dismiss|close/i.test(b.innerText || '') || /close/i.test(b.getAttribute('aria-label') || '')
            );
            if (dismissBtn && dismissBtn.closest('[role="dialog"], mat-dialog-container')) {{
              dismissBtn.click();
              await wait(150);
            }}
          }} catch(e) {{}}
          return true;
        }})('{safe_thinking}')"""
        agentlimb_client.eval_js(tune_js, tab_id=tab_id)

        # 1.5 記錄點擊前初始 turns 數量與廣播器狀態
        init_js = """(() => {
          return {
            turns: document.querySelectorAll('ms-chat-turn').length,
            announcer: document.querySelector('.cdk-live-announcer-element')?.innerText || ''
          };
        })()"""
        init_res = agentlimb_client.eval_js(init_js, tab_id=tab_id).get("result", {}).get("result", {})
        initial_turns = init_res.get("turns", 0)
        initial_announcer = init_res.get("announcer", "")

        # 2. 點擊 Run
        agentlimb_client.eval_js(
            'document.querySelector("button.ctrl-enter-submits")?.click()',
            tab_id=tab_id,
        )

        # 3. 監控輸出與完成狀態
        has_started_generating = False

        # 智慧思考閾值與任務量級研判 (三大策略：adaptive, custom, strict)
        is_deep_reasoning = any(k in current_model_id.lower() for k in ["argon", "hydrogen", "decision"])
        heavy_keywords = [
            "c++", "cpp", "rust", "紅黑樹", "red-black", "算法", "演算法", "架構",
            "從零", "完整實作", "生產級", "完整代碼", "重構", "design pattern",
            "compiler", "parser", "full stack", "全棧", "spring", "kernel", "btree"
        ]
        task_lower = task.lower()
        is_heavy_task = len(task) > 150 or any(kw in task_lower for kw in heavy_keywords)

        # 思考時間上限設定 (三大選項)：
        # 1. adaptive (智慧自適應 - 預設)：
        #    - 深度推理模型 (Hydrogen/Argon) + 複雜架構任務：給滿 150 秒（給予模型充足空間推演 500 行邏輯）
        #    - 深度推理模型 + 一般日常任務：80 秒
        #    - 輕量模型 (Flash/Flash-Lite)：35 秒
        #    - 總逾時自動寬限至至少 300 秒 (5分鐘)
        # 2. custom (自定義超時)：嚴格遵循指定秒數 (thinking_timeout 或 timeout_sec)
        # 3. strict (嚴格模式)：堅守模型絕不降級，深度模型給滿 150 秒（或自定義秒數），逾時直接中斷提醒
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
        last_feedback_time = time.time()
        stable_ticks = 0
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
              // 僅檢查本次請求新增的 turns，徹底隔離歷史對話干擾
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
                // 嚴格過濾：僅將非代碼塊的折疊面板視為思考（避免誤將嵌套在代碼塊內的 mat-expansion-panel 算作思考）
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
                if (mt.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length > 0) {{
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

              // 檢查頁面整體 Run 按鈕是否有 Stop/Cancel 標記
              const runBtn = document.querySelector('button.ctrl-enter-submits');
              const runBtnTxt = (runBtn?.innerText || '').trim();
              const runBtnAria = (runBtn?.getAttribute('aria-label') || '').trim();
              if (/\\b(Stop|Cancel)\\b/i.test(runBtnTxt) || /\\b(Stop|Cancel)\\b/i.test(runBtnAria)) {{
                running = true;
              }}

              // 如果尚未產生任何輸出，且有思考或轉圈中，判定為 running
              if (!hasOutput && (isThinking || modelTurns.length > 0)) {{
                running = true;
              }}

              const errorEls = Array.from(document.querySelectorAll('.error, mat-error, .snack-bar-container, [data-test-id*="error"]'));
              const errorMessages = errorEls.map(e => (e.innerText || '').trim()).filter(Boolean).join(' ');
              const announcer = document.querySelector('.cdk-live-announcer-element')?.innerText || '';
              const lastModelTurn = modelTurns.length > 0 ? modelTurns[modelTurns.length - 1] : null;

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

            # 動態增長監控（支援 textContent 穿透折疊思考塊）：只要總文本或思考過程持續在吐字，持續刷新截止時間
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
                    sys.stderr.write(f"🧠 [Gemini Web Agent] 深度思考中... (已耗時 {elapsed}s, {policy_tag}, 思考字數 {thought_text_len})\n")
                elif is_thinking:
                    sys.stderr.write(f"🧠 [Gemini Web Agent] 深度思考中... (已耗時 {elapsed}s, {policy_tag})\n")
                elif total_text_len > 0:
                    sys.stderr.write(f"⏳ [Gemini Web Agent] 內容生成中... (已耗時 {elapsed}s, 累計字數 {total_text_len})\n")
                else:
                    sys.stderr.write(f"⏳ [Gemini Web Agent] 排隊等待回應中... (已耗時 {elapsed}s, {policy_tag})\n")
                sys.stderr.flush()

            # 檢測伺服器錯誤、配額耗盡或權限拒絕（立即終止退出，絕不乾等）
            combined_err = f"{last_text} {last_turn_full} {error_messages}".lower()
            fatal_errors = [
                ("permission denied", "當前 Google 帳號無權存取 (Permission denied)"),
                ("check your account permissions", "帳號權限不足 (Check your account permissions)"),
                ("model isn't available", "Google 免費池該模型暫不可用"),
                ("internal error", "Google 伺服器內部錯誤 (Internal error)"),
                ("quota exceeded", "達到免費池配額限額 (Quota exceeded)"),
                ("rate limit", "達到請求頻率限制 (Rate limit)"),
                ("resource has been exhausted", "免費池資源耗盡 (Resource exhausted)"),
                ("thinking level is unsupported", "該模型不支援所選思考等級"),
                ("model error", "模型執行錯誤"),
                ("failed to generate", "生成失敗"),
                ("safety blocks", "內容觸發 Google 安全策略攔截"),
                ("blocked by safety", "內容觸發安全審查攔截"),
                ("service unavailable", "Google 伺服器服務暫時不可用"),
                ("an error occurred", "伺服器發生異常錯誤"),
                ("something went wrong", "Google 服務端發生未知錯誤"),
            ]
            for err_key, err_desc in fatal_errors:
                if err_key in combined_err:
                    return False, "", [], f"【立即終止】{current_model_id} {err_desc}"

            # 檢測真正卡死 (思考或生成狀態超過時限且文本與思考皆完全無任何增長)
            if running and time.time() > stuck_threshold:
                return False, "", [], f"免費池排隊塞車：{current_model_id} 思考或生成超過 {int(thinking_limit)} 秒無增長卡死"

            # 正常完成信號：已開始生成過，且不在 running 狀態，且已有輸出
            if has_started_generating and not running and has_output:
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

        if not completed:
            return False, "", [], f"執行逾時 ({actual_timeout} 秒，思考閾值 {int(thinking_limit)} 秒)"

        # 4. 擷取生成結果（強制滾動以喚醒 Angular 虛擬滾動 Virtual Scrolling）
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
            lastTurn.scrollIntoView({{ behavior: 'instant', block: 'end' }});
            const scroller = document.querySelector('ms-chat, .chat-container, cdk-virtual-scroll-viewport, .scrollable-container');
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
          }}

          const sep = String.fromCharCode(10) + String.fromCharCode(10);
          const nl = String.fromCharCode(10);
          let turnTexts = [];
          let imgs = [];
          let audios = [];
          let videos = [];

          for (const mt of modelTurns) {{
            // 排除純思考容器
            const rawThoughtPanels = Array.from(mt.querySelectorAll('mat-expansion-panel')).filter(
              el => !el.closest('ms-code-block') && !el.querySelector('ms-code-block, pre, code')
            );
            const thoughtEls = Array.from(mt.querySelectorAll('ms-thought-chunk, .thought-container')).concat(rawThoughtPanels);
            const thoughtSet = new Set(thoughtEls);

            const cmarkNodes = Array.from(mt.querySelectorAll('ms-cmark-node')).filter(
              el => !Array.from(thoughtSet).some(t => t.contains(el)) && !el.parentElement.closest('ms-cmark-node')
            );

            if (cmarkNodes.length > 0) {{
              const tText = cmarkNodes.map(el => {{
                const codeBlocks = Array.from(el.querySelectorAll('ms-code-block'));
                if (codeBlocks.length > 0) {{
                  const clone = el.cloneNode(true);
                  clone.querySelectorAll('ms-code-block').forEach(cb => {{
                    const lang = cb.getAttribute('data-test-language') || '';
                    const codeEl = cb.querySelector('code');
                    // 使用 textContent 讀取原始代碼記憶體樹，徹底防止 Chromium 離屏/detached DOM 布局排版截斷
                    const codeText = codeEl ? (codeEl.textContent || '') : '';
                    const mdBlock = document.createTextNode(nl + '```' + lang + nl + codeText.trim() + nl + '```' + nl);
                    if (cb.parentNode) cb.parentNode.replaceChild(mdBlock, cb);
                  }});
                  return (clone.textContent || '').trim();
                }}
                return (el.textContent || el.innerText || '').trim();
              }}).filter(Boolean).join(sep);
              if (tText) turnTexts.push(tText);
            }} else {{
              // 若無獨立 cmark，但有代碼塊
              const codeBlocks = Array.from(mt.querySelectorAll('ms-code-block')).filter(
                el => !Array.from(thoughtSet).some(t => t.contains(el))
              );
              if (codeBlocks.length > 0) {{
                const cTexts = codeBlocks.map(cb => {{
                  const lang = cb.getAttribute('data-test-language') || '';
                  const codeEl = cb.querySelector('code');
                  const codeText = codeEl ? (codeEl.textContent || '') : '';
                  return '```' + lang + nl + codeText.trim() + nl + '```';
                }});
                turnTexts.push(cTexts.join(sep));
              }}
            }}

            Array.from(mt.querySelectorAll('img')).forEach(i => {{
              if (i.src && !i.src.includes('avatar') && !i.src.includes('googleusercontent.com/a/')) {{
                imgs.push(i.src);
              }}
            }});
            Array.from(mt.querySelectorAll('audio, audio source')).forEach(a => {{
              const s = a.src || a.getAttribute('src');
              if (s) audios.push(s);
            }});
            Array.from(mt.querySelectorAll('video, video source')).forEach(v => {{
              const s = v.src || v.getAttribute('src');
              if (s) videos.push(s);
            }});
          }}

          return {{
            text: turnTexts.join(sep),
            images: Array.from(new Set(imgs)),
            audios: Array.from(new Set(audios)),
            videos: Array.from(new Set(videos))
          }};
        }})()"""
        ext = agentlimb_client.eval_js(extract_js, tab_id=tab_id)
        res_data = ext.get("result", {}).get("result", {})
        final_text = res_data.get("text", "")

        saved_files = []
        if out_path:
            # 處理圖片
            for idx, img_src in enumerate(res_data.get("images", []), 1):
                data_url = img_src
                if img_src.startswith("blob:"):
                    data_url = _fetch_blob_as_data_url(tab_id, img_src)
                if data_url.startswith("data:"):
                    saved = _save_data_url(data_url, out_path, f"gemini_img_{idx}")
                    if saved:
                        saved_files.append(saved)
            # 處理音訊
            for idx, audio_src in enumerate(res_data.get("audios", []), 1):
                data_url = audio_src
                if audio_src.startswith("blob:"):
                    data_url = _fetch_blob_as_data_url(tab_id, audio_src)
                if data_url.startswith("data:"):
                    saved = _save_data_url(data_url, out_path, f"gemini_audio_{idx}")
                    if saved:
                        saved_files.append(saved)
            # 處理視頻
            for idx, video_src in enumerate(res_data.get("videos", []), 1):
                data_url = video_src
                if video_src.startswith("blob:"):
                    data_url = _fetch_blob_as_data_url(tab_id, video_src)
                if data_url.startswith("data:"):
                    saved = _save_data_url(data_url, out_path, f"gemini_video_{idx}")
                    if saved:
                        saved_files.append(saved)

        if final_text or saved_files:
            return True, final_text, saved_files, ""

        return False, "", [], f"執行逾時 ({timeout_sec} 秒)"

    try:
        # 等待輸入框就緒
        ready = wait_for_selector(tab_id, 'textarea[aria-label="Enter a prompt"]', timeout=15.0)
        if not ready:
            return {"ok": False, "error": "AI Studio 頁面載入逾時（未找到輸入框）"}

        # 初次嘗試
        success, output, files, err = _attempt_run(initial_model_id)
        active_model = initial_model_id
        fell_back = False
        fallback_chain = [initial_model_id]

        # 若失敗且啟用了自動降級 (Auto-Fallback)
        # 注意：若 thinking_policy == "strict"，auto_fallback 必定為 False，絕不走入以下階梯
        if not success and auto_fallback and thinking_policy != "strict":
            # 依序使用階梯備援模型
            ladder = FALLBACK_LADDER.get(initial_model_id, ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"])
            fallback_targets = [c for c in ladder if c != initial_model_id]

            for target in fallback_targets:
                fallback_chain.append(target)
                fb_url = f"https://aistudio.google.com/prompts/new_chat?model={target}"
                agentlimb_client.call_tool("navigate", {"tabId": tab_id, "url": fb_url})
                wait_for_selector(tab_id, 'textarea[aria-label="Enter a prompt"]', timeout=15.0)

                fb_success, fb_output, fb_files, fb_err = _attempt_run(target)
                if fb_success:
                    success = True
                    output = fb_output
                    files = fb_files
                    err = ""
                    active_model = target
                    fell_back = True
                    break

            if not success:
                # 終極備援：跨站點無縫降級至 gemini.google.com 官網免費通道
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
                    active_model = web_res.get("model", "gemini.google.com (官網通道)")
                    fallback_chain.append(active_model)
                    fell_back = True
                else:
                    err = "CONGESTION_HALT: Google AI Studio 與 Gemini 官網免費池全數高負載壅塞。"

        # 自動代碼檢測與保存落地（防吞噬雙重保險）
        if success and output:
            code_block_match = re.search(r'```([a-zA-Z0-9_\-\+\#]+)?\s*\n(.*?)```', output, re.DOTALL)
            if code_block_match:
                lang = (code_block_match.group(1) or "").lower().strip()
                code_text = code_block_match.group(2)
                ext_map = {
                    "cpp": ".cpp", "c++": ".cpp", "cxx": ".cpp", "c": ".c", "h": ".h", "hpp": ".hpp",
                    "python": ".py", "py": ".py",
                    "rust": ".rs", "rs": ".rs",
                    "go": ".go", "golang": ".go",
                    "javascript": ".js", "js": ".js", "typescript": ".ts", "ts": ".ts",
                    "html": ".html", "css": ".css", "sh": ".sh", "bash": ".sh",
                    "json": ".json", "yaml": ".yaml", "yml": ".yml"
                }
                ext = ext_map.get(lang, ".txt")
                stem = "gemini_generated_code"
                tl = task.lower()
                if "thread" in tl or "線程池" in task or "线程池" in task:
                    stem = "thread_pool"
                elif "queue" in tl or "無鎖" in task or "佇列" in task or "队列" in task:
                    stem = "lock_free_queue"
                elif "crawler" in tl or "爬蟲" in task or "爬虫" in task:
                    stem = "async_crawler"
                elif "tree" in tl or "紅黑樹" in task or "红黑树" in task:
                    stem = "red_black_tree"
                elif "actor" in tl or "akka" in tl:
                    stem = "actor_system"

                try:
                    code_file_path = out_path / f"{stem}{ext}"
                    with open(code_file_path, "w", encoding="utf-8") as cf:
                        cf.write(code_text)
                    if str(code_file_path) not in files:
                        files.append(str(code_file_path))
                except Exception as e:
                    print(f"[code_save_error] {e}", file=sys.stderr)

        # 若有多模態檔案或代碼落地，追加工作區超連結
        if files:
            links = "\n".join([f"- [{Path(f).name}](file://{f})" for f in files])
            output += f"\n\n🎉 生成成果已同步落地存檔至本地工作區：\n{links}"

        try:
            agentlimb_client.call_tool(
                "say",
                {"text": f"✅ Gemini Web Agent 已完成調度 (模型: {active_model})" if success else f"❌ Gemini Web Agent 執行失敗: {err}"},
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
    nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://flow.google.com/", "active": False})
    tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
    if not tab_id:
        return {"credits": None, "reset_time": None}

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
        )

        time.sleep(0.8)

        eval_res = agentlimb_client.eval_js(
            """(() => {
                const d = document.querySelector('[role="dialog"]');
                return d ? d.innerText : '';
            })()""",
            tab_id=tab_id,
        )
        raw = eval_res.get("result", {}).get("result", "")
        credits_m = re.search(
            r"([\d,]+)\s*(?:個\s*Google Flow\s*點數|个\s*Google Flow\s*点数|Google Flow\s*credits?)",
            raw,
            re.IGNORECASE,
        )
        reset_m = re.search(r"Resets?(?:\s+on)?\s+([^\n]+)", raw, re.IGNORECASE)

        credits = int(credits_m.group(1).replace(",", "")) if credits_m else None
        reset_time = (
            reset_m.group(1).replace("Upgrade", "").replace("升級", "").replace("升级", "").strip()
            if reset_m
            else None
        )
        return {"credits": credits, "reset_time": reset_time}
    except Exception:
        return {"credits": None, "reset_time": None}
    finally:
        try:
            agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
        except Exception:
            pass


def check_gemini_usage(include_flow: bool = True) -> dict:
    """後台靜默開啟 https://gemini.google.com/usage 抓取用量，並依需求讀取 Google Flow，依原作者鐵律讀取後立刻 tab_close"""
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"status": "error", "error": "AgentLimb 未連線"}

    nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://gemini.google.com/usage", "active": False})
    tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
    if not tab_id:
        return {"status": "error", "error": "無法開啟用量偵測標籤頁"}

    gemini_result = {}
    try:
        ready = wait_for_selector(tab_id, '[data-testid="current-usage"], [data-usage-island-root]', timeout=15.0)
        if not ready:
            gemini_result = {"status": "error", "error": "用量頁面載入逾時"}
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
        try:
            agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
        except Exception:
            pass

    # 循序執行：Gemini 分頁關閉後，再開啟 Flow 分頁探測，避免雙分頁競爭
    flow_info = {"credits": None, "reset_time": None}
    if include_flow:
        flow_info = check_flow_usage()

    gemini_result["flow_credits"] = flow_info.get("credits")
    gemini_result["flow_reset_time"] = flow_info.get("reset_time")
    return gemini_result


def discover_available_models() -> dict:
    """動態探索 AI Studio 當前帳號所有可用模型（自動識別 New / Paid 標記）"""
    st = agentlimb_client.get_status()
    if not st or not st.get("ok"):
        return {"status": "error", "error": "AgentLimb 未連線"}

    tabs = agentlimb_client.get_tabs()
    target_tab = None
    created_tab = False
    for t in tabs:
        url = t.get("url", "")
        if "aistudio.google.com" in url:
            target_tab = t
            break

    if target_tab is not None:
        tab_id = target_tab.get("id")
    else:
        nav_res = agentlimb_client.call_tool("tab_new", {"url": "https://aistudio.google.com/prompts/new_chat", "active": False})
        tab_id = nav_res.get("result", {}).get("tab", {}).get("id") or nav_res.get("id") or nav_res.get("tabId")
        created_tab = True

    try:
        ready = wait_for_selector(tab_id, ".model-selector-card", timeout=12.0)
        if not ready:
            return {"status": "error", "error": "未找到模型選擇按鈕"}

        # 點開模型選單
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

        # 關閉彈窗
        agentlimb_client.eval_js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))", tab_id=tab_id)

        return {
            "status": "ok",
            "models": models,
        }
    finally:
        # 如果是臨時建立的分頁，讀取完畢立刻關閉，不留垃圾分頁
        if created_tab and tab_id:
            try:
                agentlimb_client.call_tool("tab_close", {"tabId": tab_id})
            except Exception:
                pass


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Gemini AgentLimb Runner")
    subparsers = parser.add_subparsers(dest="cmd")

    p_usage = subparsers.add_parser("usage", help="檢測用量")
    p_usage.add_argument("--include-flow", action="store_true", default=True, help="同時檢測 Flow 點數 (預設啟用)")
    p_usage.add_argument("--no-flow", action="store_true", help="跳過 Flow 檢測")
    p_usage.add_argument("--port", type=int, default=8765)

    p_models = subparsers.add_parser("models", help="動態探索可用模型")

    p_task = subparsers.add_parser("task", help="執行 Agent 任務")
    p_task.add_argument("task_prompt", nargs="*", help="任務提示詞")
    p_task.add_argument("--prompt", default="", help="任務提示詞 (可選，或直接傳入 positional 參數)")
    p_task.add_argument("--model", default="gemini-3.8-flash")
    p_task.add_argument("--site", default="aistudio")
    p_task.add_argument("--entry", default="chat", help="入口模式：chat 或 task")
    p_task.add_argument("--thinking-level", default="high")
    p_task.add_argument("--thinking-policy", choices=["adaptive", "custom", "strict"], default="adaptive", help="思考閾值策略：adaptive(智慧自適應), custom(自定義超時), strict(嚴格模式不降級)")
    p_task.add_argument("--thinking-timeout", type=int, default=0, help="自定義思考逾時秒數 (0 表示由 policy 決定)")
    p_task.add_argument("--timeout", type=int, default=180)
    p_task.add_argument("--new-chat", action="store_true", help="開新對話")
    p_task.add_argument("--no-fallback", action="store_true", help="關閉階梯降級 (嚴格模式)")
    p_task.add_argument("--download-dir", default="", help="多模態下載目錄")
    p_task.add_argument("--keep-tab", action="store_true", help="執行完畢後保留瀏覽器分頁不關閉")

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

    # 彈性相容：如果使用者直接傳入參數或旗標 (如 --model 或直接寫提示詞) 而未帶 task，自動補上 task
    if len(sys.argv) > 1 and sys.argv[1] not in ("usage", "models", "task", "-h", "--help"):
        sys.argv.insert(1, "task")

    # 執行 task 子命令
    if len(sys.argv) > 1 and sys.argv[1] == "task":
        args = parser.parse_args()
        prompt = args.prompt or (" ".join(args.task_prompt) if args.task_prompt else "請用繁體中文用一句話介紹你自己")
        res = run_agent_task(
            prompt,
            model=args.model,
            site=args.site,
            entry=args.entry,
            thinking_level=args.thinking_level,
            thinking_policy=args.thinking_policy,
            thinking_timeout=args.thinking_timeout,
            auto_fallback=not args.no_fallback and args.thinking_policy != "strict",
            timeout_sec=args.timeout,
            new_chat=args.new_chat,
            download_dir=args.download_dir,
            keep_tab=args.keep_tab,
        )
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    # 預設：直接把所有參數當作任務提示詞
    task_input = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "請用繁體中文用一句話介紹你自己"
    res = run_agent_task(task_input)
    print(json.dumps(res, ensure_ascii=False))
