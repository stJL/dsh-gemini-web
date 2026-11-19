#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
外部 Chrome 网页版 Gemini / AI Studio / Google Flow 高速调度引擎（Playwright CDP 首选高速通道）
支持独立专用 AI Chrome、常驻 daemon、单命令多 Tab wave 并发调度、花名册角色绑定、
Google Drive 云端总线（AI Studio 标题/ID）与 Gemini Web Import code（文件夹/GitHub）导入。
"""

import argparse
import base64
import fnmatch
import http.server
import json
import os
import platform
import queue
import random
import re
import shutil
import socketserver
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # 允许 playbook / roster / harvest 等纯本地子命令脱离 .venv 直接运行
    sync_playwright = None


def _get_sync_playwright():
    if sync_playwright is not None:
        return sync_playwright
    try:
        from playwright.sync_api import sync_playwright as _sp
        return _sp
    except ImportError as exc:
        raise RuntimeError("未安装 playwright；请改用 .venv Python 或先运行 python scripts/setup_skill.py --auto") from exc

DAEMON_HOST = "127.0.0.1"
DAEMON_PORT = 19222
SESSION_STATE_FILE = Path.home() / ".gemini" / "gemini-web-agent-sessions.json"


def _human_pause(page, min_ms: int = 700, max_ms: int = 1400) -> None:
    """拟人随机微停顿，避免机械固定间隔连点触发 Google 前端行为风控。"""
    delay = random.randint(max(50, int(min_ms)), max(int(min_ms), int(max_ms)))
    page.wait_for_timeout(delay)


def _human_fill(page, locator, text: str) -> None:
    """拟人聚焦、输入并在发送前保留自然停顿（带真实键盘/焦点事件）。"""
    locator.scroll_into_view_if_needed()
    _human_pause(page, 220, 420)
    locator.click()
    _human_pause(page, 450, 800)
    content = text or ""
    if len(content) <= 180 and "\n" not in content:
        try:
            locator.fill("")
            locator.press_sequentially(content, delay=random.randint(18, 38))
        except Exception:
            locator.fill(content)
    else:
        locator.fill(content)
    # 模拟人眼核对提示词后移动鼠标到发送按钮的自然间隙
    _human_pause(page, 1400, 2200)


def _load_last_session(site: str) -> str:
    """读取最近一次活跃的会话 URL（按站点 gemini / aistudio）。"""
    try:
        if SESSION_STATE_FILE.exists():
            data = json.loads(SESSION_STATE_FILE.read_text(encoding="utf-8"))
            url = str(data.get(site, "")).strip()
            if url.startswith("https://"):
                return url
    except Exception:
        pass
    return ""


def _save_last_session(site: str, url: str) -> None:
    """仅保存具体会话 URL（跳过空白首页和 new_chat），方便长任务跨轮/跨重启续接。"""
    if not url or not url.startswith("https://"):
        return
    if site == "gemini" and not re.search(r"gemini\.google\.com/app/[^/?#]+", url):
        return
    if site == "aistudio" and (
        "/new_chat" in url or not re.search(r"aistudio\.google\.com/prompts/[^/?#]+", url)
    ):
        return
    try:
        SESSION_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        if SESSION_STATE_FILE.exists():
            try:
                data = json.loads(SESSION_STATE_FILE.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        data[site] = url
        SESSION_STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _validate_files(files: list[str] | None) -> list[str]:
    """校验待上传文件路径存在并转为绝对路径列表。"""
    if not files:
        return []
    resolved: list[str] = []
    for raw in files:
        p = Path(raw).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"待上传文件不存在: {raw}")
        resolved.append(str(p))
    return resolved


def _short_model_name(raw: str) -> str:
    """精简模型显示名，剔除 AI Studio 卡片附带的整段英文介绍词。"""
    s = re.sub(r"\s+", " ", (raw or "")).strip()
    if not s:
        return ""
    m = re.search(r"\b(gemini-[a-z0-9._-]+|lyria-[a-z0-9._-]+|gemma-[a-z0-9._-]+|deep-research-[a-z0-9._-]+)\b", s, re.IGNORECASE)
    if m:
        return m.group(1)
    first_line = (raw or "").splitlines()[0].strip()
    return first_line[:60] if first_line else s[:60]


def _write_text_output(res: dict, out_file: str) -> dict:
    """将长回答正文直写本地文件，避免完整正文回显到终端双重消耗 Input/Output Token。"""
    if not out_file:
        return res
    body = res.get("answer") if res.get("answer") is not None else res.get("text")
    if body:
        target = Path(out_file).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(body), encoding="utf-8")
        res["saved_text_file"] = str(target)
        res["text_chars"] = len(str(body))
        if "answer" in res:
            res["answer"] = ""
        if "text" in res:
            res["text"] = ""
    return res


def _format_compact_usage(res: dict) -> str:
    """将 usage / flow-usage 结果浓缩为 1 行极简摘要。"""
    parts: list[str] = []
    if "current_usage" in res or "weekly_usage" in res:
        cur = res.get("current_usage") or {}
        wk = res.get("weekly_usage") or {}
        plan = res.get("plan") or "gemini"
        cur_s = f"{cur.get('used_pct', '?')}%" + (f"({cur['reset_time']})" if cur.get("reset_time") else "")
        wk_s = f"{wk.get('used_pct', '?')}%" + (f"({wk['reset_time']})" if wk.get("reset_time") else "")
        parts.append(f"{plan}: cur={cur_s} wk={wk_s}")
    flow_d = res.get("flow") if isinstance(res.get("flow"), dict) else (res if "credits" in res else None)
    if flow_d is not None:
        pts = flow_d.get("credits")
        rst = flow_d.get("reset_time") or ""
        parts.append(f"flow: {pts if pts is not None else '?'}pts" + (f"({rst})" if rst else ""))
    return " | ".join(parts) if parts else json.dumps(res, ensure_ascii=False, separators=(",", ":"))


def _read_system_text(system_instruction: str, system_file: str) -> str:
    """合并文本形式与本地文件形式的 System Instructions。"""
    parts: list[str] = []
    if system_file:
        p = Path(system_file).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"系统指令文件不存在: {system_file}")
        parts.append(p.read_text(encoding="utf-8"))
    if system_instruction:
        parts.append(system_instruction)
    return "\n\n".join(part for part in parts if part)

MODEL_OPTIONS = {
    "auto": ("bard-mode-option-8c46e95b1a07cecc", "自动"),
    "flash-lite": ("bard-mode-option-8c46e95b1a07cecc", "自动"),
    "hydrogen": ("bard-mode-option-56fdd199312815e2", "Hydrogen"),
    "4h": ("bard-mode-option-56fdd199312815e2", "Hydrogen"),
    "neon": ("bard-mode-option-e6fa609c3fa255c0", "Neon"),
    "4n": ("bard-mode-option-e6fa609c3fa255c0", "Neon"),
    # Web 端已将 Argon/Pro 槽位升级替换为 4 Neon，保留旧别名向后兼容
    "argon": ("bard-mode-option-e6fa609c3fa255c0", "Neon"),
    "4a": ("bard-mode-option-e6fa609c3fa255c0", "Neon"),
    "pro": ("bard-mode-option-e6fa609c3fa255c0", "Neon"),
    "carbon": ("bard-mode-option-upsell_MODE_CATEGORY_ULTRA", "Carbon"),
    "4c": ("bard-mode-option-upsell_MODE_CATEGORY_ULTRA", "Carbon"),
}


def _import_platform_utils():
    scripts_dir = str(Path(__file__).resolve().parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import platform_utils
    return platform_utils


def _iter_devtools_active_port_files() -> list[Path]:
    """返回当前平台所有 Chromium 系浏览器可能的 DevToolsActivePort 路径（优先专用 AI Chrome）。"""
    return _import_platform_utils().iter_devtools_active_port_files()


def get_cdp_ws_url(port_override: int | None = None) -> str:
    """跨平台定位 Chrome CDP 地址：优先显式端口 / 专用 AI Chrome (9229)，再扫描 DevToolsActivePort。"""
    pu = _import_platform_utils()
    explicit_port = port_override
    if explicit_port is None:
        env_port = (os.environ.get("GEMINI_WEB_CDP_PORT") or "").strip()
        if env_port.isdigit():
            explicit_port = int(env_port)

    if explicit_port is not None:
        ver = pu.probe_cdp_http(explicit_port, timeout_sec=1.2)
        if ver and ver.get("webSocketDebuggerUrl"):
            return str(ver["webSocketDebuggerUrl"])
        return f"http://127.0.0.1:{explicit_port}"

    # 1. 最高优先级：检测专用独立 AI Chrome (默认 9229，免弹窗直连)
    dedicated_ver = pu.probe_cdp_http(pu.AI_CHROME_DEFAULT_PORT, timeout_sec=1.5)
    if dedicated_ver and dedicated_ver.get("webSocketDebuggerUrl"):
        return str(dedicated_ver["webSocketDebuggerUrl"])

    # 2. 扫描各 Chromium 家族 DevToolsActivePort（优先挑选 HTTP /json/version 存活者，避免陈旧端口文件）
    fallback_ws = ""
    for active_port_file in _iter_devtools_active_port_files():
        if not active_port_file.exists():
            continue
        lines = [
            line.strip()
            for line in active_port_file.read_text(encoding="utf-8", errors="ignore").splitlines()
            if line.strip()
        ]
        if len(lines) >= 2 and lines[0].isdigit():
            port = int(lines[0])
            ws_url = f"ws://127.0.0.1:{port}{lines[1]}"
            ver = pu.probe_cdp_http(port, timeout_sec=0.8)
            if ver:
                return str(ver.get("webSocketDebuggerUrl") or ws_url)
            if not fallback_ws:
                fallback_ws = ws_url
    if fallback_ws:
        return fallback_ws
    raise RuntimeError(
        "未检测到已就绪的 Chrome CDP。建议运行 `python scripts/setup_skill.py --setup-ai-chrome --launch-ai-chrome` "
        "启动专用 AI Chrome，或在日常 Chrome 开启 chrome://inspect/#remote-debugging / 使用 AgentLimb MCP。"
    )


def wait_gemini_ready(page, timeout_ms: int = 45000) -> None:
    """等待输入框与可见模型切换按钮渲染完成（兼容慢网冷启动及隐藏响应式副本）。"""
    page.locator('div[role="textbox"]:visible').first.wait_for(state="visible", timeout=timeout_ms)
    page.locator('button[data-test-id="bard-mode-menu-button"]:visible').first.wait_for(
        state="visible", timeout=timeout_ms
    )


def get_gemini_page(browser, new_tab: bool = True, tab_url_hint: str = "", bring_to_front: bool = True):
    """获取或打开 Gemini 标签页；复用模式支持按历史会话 URL 重连。"""
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    if new_tab and not tab_url_hint:
        for page in context.pages:
            url = page.url or ""
            if re.match(r"^https://gemini\.google\.com/app(?:/?(?:\?.*)?)$", url):
                if page.locator("model-response").count() == 0:
                    if bring_to_front:
                        page.bring_to_front()
                    wait_gemini_ready(page)
                    return page
        page = context.new_page()
        if bring_to_front:
            page.bring_to_front()
        page.goto("https://gemini.google.com/app", wait_until="domcontentloaded", timeout=45000)
        wait_gemini_ready(page)
        return page

    # 复用已有对话页：优先匹配已打开的标签页（未指定 hint 时优先选已有会话 /app/<id>）
    matched_pages = [
        p
        for p in context.pages
        if "gemini.google.com" in (p.url or "") and (not tab_url_hint or tab_url_hint in (p.url or ""))
    ]
    if matched_pages:
        if not tab_url_hint:
            matched_pages.sort(
                key=lambda p: 0 if re.search(r"gemini\.google\.com/app/[^/?#]+", p.url or "") else 1
            )
        page = matched_pages[0]
        if bring_to_front:
            page.bring_to_front()
        wait_gemini_ready(page)
        return page

    target_url = ""
    if tab_url_hint.startswith("https://"):
        target_url = tab_url_hint
    else:
        last_url = _load_last_session("gemini")
        if last_url and (not tab_url_hint or tab_url_hint in last_url):
            target_url = last_url
        elif tab_url_hint:
            raise RuntimeError(f"未找到匹配的 Gemini 标签页: {tab_url_hint}")

    page = context.new_page()
    if bring_to_front:
        page.bring_to_front()
    page.goto(target_url or "https://gemini.google.com/app", wait_until="domcontentloaded", timeout=45000)
    wait_gemini_ready(page)
    return page


_GEMINI_UPLOAD_TOOLS_BTN = (
    'button[aria-label="上传和工具"], '
    'button[aria-label*="Upload & tools" i], '
    'button[aria-label*="Upload and tools" i], '
    'button[aria-label*="Add files" i]'
)


def _gemini_attach_files(page, file_paths: list[str]) -> list[str]:
    """在 gemini.google.com/app 通过 Playwright FileChooser 接管无弹窗上传本地文件。"""
    if not file_paths:
        return []
    tools_btn = page.locator(_GEMINI_UPLOAD_TOOLS_BTN).first
    tools_btn.wait_for(state="visible", timeout=10000)
    tools_btn.click()
    page.wait_for_timeout(400)

    upload_item = page.locator(
        '.cdk-overlay-pane button[data-test-id="local-images-files-uploader-button"], '
        '.cdk-overlay-pane gem-menu-item:has-text("上传文件"), '
        '.cdk-overlay-pane gem-menu-item:has-text("Upload files"), '
        '.cdk-overlay-pane button:has-text("上传文件"), '
        '.cdk-overlay-pane button:has-text("Upload files"), '
        '.cdk-overlay-pane button[aria-label*="上传文件"], '
        '.cdk-overlay-pane button[aria-label*="Upload files" i]'
    ).first
    upload_item.wait_for(state="visible", timeout=10000)
    with page.expect_file_chooser(timeout=15000) as fc_info:
        upload_item.click()
    fc_info.value.set_files(file_paths)
    page.wait_for_timeout(1200)
    return [Path(p).name for p in file_paths]


def _zip_code_folder_fallback(folder: Path) -> Path:
    """当浏览器目录 FileChooser 不可用时，将本地代码目录忽略大体积依赖后打包为临时 ZIP 兜底上传。"""
    ignore_dirs = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next"}
    tmp_dir = Path(tempfile.mkdtemp(prefix="gemini_code_bundle_"))
    zip_path = tmp_dir / f"{folder.name}_code.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root_str, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            root_p = Path(root_str)
            for fname in files:
                fpath = root_p / fname
                try:
                    if fpath.stat().st_size > 15 * 1024 * 1024:
                        continue
                    zf.write(fpath, arcname=str(fpath.relative_to(folder)))
                except OSError:
                    continue
    return zip_path


def _gemini_import_code(page, code_folder: str = "", github_repo: str = "") -> dict:
    """在 gemini.google.com/app 通过 More uploads -> Import code 导入 GitHub 仓库或本地代码文件夹。"""
    imported: dict = {}
    folder_raw = (code_folder or "").strip()
    repo_raw = (github_repo or "").strip()
    if not folder_raw and not repo_raw:
        return imported

    def _open_import_code_dialog() -> None:
        tools_btn = page.locator(_GEMINI_UPLOAD_TOOLS_BTN).first
        tools_btn.wait_for(state="visible", timeout=10000)
        tools_btn.click()
        page.wait_for_timeout(400)
        more_btn = page.locator(
            '.cdk-overlay-pane button:has-text("More uploads"), '
            '.cdk-overlay-pane button:has-text("更多上传"), '
            '.cdk-overlay-pane [role="menuitem"]:has-text("More uploads"), '
            '.cdk-overlay-pane [role="menuitem"]:has-text("更多上传")'
        ).first
        if more_btn.count() > 0 and more_btn.is_visible():
            more_btn.click()
            page.wait_for_timeout(400)
        imp_btn = page.locator(
            '.cdk-overlay-pane button:has-text("Import code"), '
            '.cdk-overlay-pane button:has-text("导入代码"), '
            '.cdk-overlay-pane [role="menuitem"]:has-text("Import code"), '
            '.cdk-overlay-pane [role="menuitem"]:has-text("导入代码")'
        ).first
        imp_btn.wait_for(state="visible", timeout=10000)
        imp_btn.click()
        page.wait_for_timeout(500)

    if repo_raw:
        _open_import_code_dialog()
        url_input = page.locator(
            'input[aria-label*="GitHub" i], input[placeholder*="github.com" i]'
        ).first
        url_input.wait_for(state="visible", timeout=10000)
        url_input.click()
        url_input.fill(repo_raw)
        page.wait_for_timeout(200)
        submit_btn = page.locator(
            'button[type="submit"]:has-text("Import"), button[type="submit"]:has-text("导入")'
        ).first
        submit_btn.wait_for(state="visible", timeout=8000)
        submit_btn.click()
        page.wait_for_timeout(2000)
        imported["github_repo"] = repo_raw

    if folder_raw:
        folder_p = Path(folder_raw).expanduser().resolve()
        if not folder_p.is_dir():
            raise FileNotFoundError(f"待导入代码目录不存在: {folder_raw}")
        try:
            _open_import_code_dialog()
            folder_btn = page.locator(
                'button:has-text("Upload folder"), button:has-text("上传文件夹")'
            ).first
            folder_btn.wait_for(state="visible", timeout=10000)
            with page.expect_file_chooser(timeout=15000) as fc_info:
                folder_btn.click()
            fc_info.value.set_files(str(folder_p))
            page.wait_for_timeout(2000)
            imported["code_folder"] = str(folder_p)
            imported["code_import_mode"] = "upload_folder"
        except Exception:
            # 关闭可能残留的弹窗，降级打包 ZIP 走普通上传确保不中断任务
            cancel_btn = page.locator('button[aria-label*="Cancel code import" i], button[aria-label*="取消"]').first
            if cancel_btn.count() > 0 and cancel_btn.is_visible():
                cancel_btn.click()
                page.wait_for_timeout(250)
            zip_file = _zip_code_folder_fallback(folder_p)
            _gemini_attach_files(page, [str(zip_file)])
            imported["code_folder"] = str(folder_p)
            imported["code_import_mode"] = "zip_fallback"
            imported["fallback_zip"] = str(zip_file)

    return imported


def select_entry_mode(page, entry: str) -> None:
    """在新对话页切换「对话/Chat」或「任务/Task」模式。"""
    labels = ("任务", "Task") if entry.strip().lower() == "task" else ("对话", "Chat")
    for label in labels:
        btn = page.locator(f'gem-segmented-button button:has-text("{label}")').first
        if btn.count() > 0 and btn.is_visible():
            btn.click()
            page.wait_for_timeout(400)
            return


def select_model(page, model_key: str) -> str:
    """打开模型选择器并切换目标模型。"""
    key = model_key.strip().lower()
    mode_btn = page.locator('button[data-test-id="bard-mode-menu-button"]').first
    current_label = (mode_btn.inner_text() or "").strip()

    target = MODEL_OPTIONS.get(key)
    if target and target[1].lower() in current_label.lower():
        return current_label

    mode_btn.click()
    page.wait_for_timeout(400)

    if target:
        option = page.locator(f'.cdk-overlay-pane gem-menu-item[data-test-id="{target[0]}"]').first
        if option.count() > 0:
            option.click()
            page.wait_for_timeout(400)
            return (mode_btn.inner_text() or "").strip()

    items = page.locator('.cdk-overlay-pane gem-menu-item[role="menuitemradio"]')
    for i in range(items.count()):
        item = items.nth(i)
        txt = (item.inner_text() or "").strip()
        if key in txt.lower():
            item.click()
            page.wait_for_timeout(400)
            return (mode_btn.inner_text() or "").strip()

    page.keyboard.press("Escape")
    raise RuntimeError(f"未在模型菜单中找到匹配项: {model_key}")


def select_thinking_level(page, level: str) -> None:
    """选择思考等级（低/中/高）。"""
    mode_btn = page.locator('button[data-test-id="bard-mode-menu-button"]').first
    mode_btn.click()
    page.wait_for_timeout(400)
    sub_items = page.locator('.cdk-overlay-pane gem-menu-item[role="menuitemradio"]')
    for i in range(sub_items.count()):
        item = sub_items.nth(i)
        txt = (item.inner_text() or "").strip()
        if level.lower() in txt.lower():
            item.click()
            page.wait_for_timeout(300)
            return
    page.keyboard.press("Escape")


def select_tool(page, tool_name: str) -> None:
    """打开「上传和工具」并勾选直属工具（制作图片/视频/音乐）或「更多工具」子菜单（Canvas/Deep Research）。"""
    tools_btn = page.locator('button[aria-label="上传和工具"], button[aria-label*="Upload and tools" i]').first
    tools_btn.click()
    page.wait_for_timeout(400)

    def _click_visible_item() -> bool:
        items = page.locator('.cdk-overlay-pane gem-menu-item[role="menuitemcheckbox"], .cdk-overlay-pane gem-menu-item')
        for i in range(items.count()):
            item = items.nth(i)
            txt = (item.inner_text() or "").strip()
            if tool_name.lower() in txt.lower() and "更多" not in txt and "more tools" not in txt.lower():
                item.click()
                page.wait_for_timeout(400)
                return True
        return False

    if _click_visible_item():
        return
    more_tools = page.locator('gem-menu-item:has-text("更多工具"), gem-menu-item:has-text("More tools")').first
    if more_tools.count() > 0:
        more_tools.hover()
        page.wait_for_timeout(400)
        if _click_visible_item():
            return
    page.keyboard.press("Escape")
    raise RuntimeError(f"未在工具菜单中找到: {tool_name}")


def wait_response_complete(page, latest_resp, deadline: float) -> None:
    """等待流式输出完全结束（包含 500ms 文本静止防抖与 15s 静默兜底）。"""
    last_text = ""
    last_change_time = time.time()

    while time.time() < deadline:
        try:
            res = page.evaluate(DOM_STATUS_EVAL_JS)
            running = res.get("running", False)
            text = res.get("text") or res.get("answer") or ""

            if text != last_text:
                last_text = text
                last_change_time = time.time()

            has_payload = bool(text) or bool(res.get("images") or [])
            # 路径 A：正向判定非 running，且有文本或图片产出并稳定超过 500ms
            if not running and has_payload:
                page.wait_for_timeout(500)
                confirm_res = page.evaluate(DOM_STATUS_EVAL_JS)
                confirm_text = confirm_res.get("text") or confirm_res.get("answer") or ""
                if not confirm_res.get("running", False) and confirm_text == text:
                    return

            # 路径 B：15s 静止且底部工具栏出现兜底
            if running and has_payload and res.get("hasActionToolbar"):
                if (time.time() - last_change_time) >= 15.0:
                    return
        except Exception:
            pass

        page.wait_for_timeout(500)
    raise TimeoutError("等待 Gemini 网页端生成完成超时。")


DOM_STATUS_EVAL_JS = r"""(() => {
    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) {
            return false;
        }
        return el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0);
    };

    const findVisible = (selector) => {
        if (typeof document.querySelectorAll === 'function') {
            const list = document.querySelectorAll(selector);
            for (const el of list) {
                if (isVisible(el)) return el;
            }
            return null;
        }
        const single = document.querySelector(selector);
        return isVisible(single) ? single : null;
    };

    // 1. 显式停止按钮检测（正向运行证据：可见即判定 running）
    const stopBtn = findVisible(
        'button[aria-label*="Stop" i], button[aria-label*="停止"], ' +
        '.stop-button, button.stop, [data-test-id="stop-button"], ' +
        'ms-run-button button[aria-label*="Stop" i]'
    );

    // 2. 显式流式生成指示器检测
    const streamingIndicator = findVisible(
        'model-response[is-streaming="true"], .streaming-indicator, ' +
        'mat-progress-bar[mode="indeterminate"], .loading-indicator'
    );

    // 3. 显式空闲/就绪特征
    const sendBtn = findVisible(
        'button[aria-label*="Send" i], button[aria-label*="发送"], ' +
        'button[aria-label*="Run" i], .send-button'
    );
    const micBtn = findVisible(
        'button[aria-label*="Microphone" i], button[aria-label*="语音输入"], button[aria-label*="麦克风"], .speech_dictation_mic_button'
    );

    // 4. 回复底部操作工具栏
    const actionToolbar = findVisible(
        'message-actions, .response-footer, [data-test-id="copy-button"], ' +
        'button[aria-label*="Copy" i], button[aria-label*="复制"], ' +
        'button[aria-label*="Good response" i], button[aria-label*="赞"]'
    );

    const resps = document.querySelectorAll('model-response');
    const last = resps[resps.length - 1];
    const waitingBanner = last?.querySelector('spark-waiting-for-user-banner')?.innerText?.trim() || '';
    const goalFooter = last?.querySelector('remy-goal-status-footer')?.innerText?.trim() || '';
    const steps = Array.from(last?.querySelectorAll('spark-thinking-steps') || []).map(s => s.innerText.trim());
    const mc = last?.querySelector('message-content');
    const imgs = Array.from(last?.querySelectorAll('img') || []).map(i => i.src).filter(s => s && !s.startsWith('data:image/svg'));

    let responseText = '';
    const lastTextEl = last?.querySelector('message-content, .markdown, .model-response-text');
    if (lastTextEl) {
        responseText = (lastTextEl.innerText || lastTextEl.textContent || '').trim();
    } else if (mc) {
        responseText = (mc.innerText || mc.textContent || '').trim();
    } else {
        const candidates = document.querySelectorAll(
            'model-response .markdown, model-response message-content, ' +
            '.model-response-text, ms-chat-turn[data-role="model"] .turn-content, ' +
            '[data-message-author-role="model"]'
        );
        if (candidates.length > 0) {
            const lastEl = candidates[candidates.length - 1];
            responseText = (lastEl.innerText || lastEl.textContent || '').trim();
        }
    }

    const hasStopBtn = Boolean(stopBtn);
    const hasStreamingIndicator = Boolean(streamingIndicator);
    const isRunning = hasStopBtn || hasStreamingIndicator;

    return {
        url: location.href,
        model: document.querySelector('button[data-test-id="bard-mode-menu-button"]')?.innerText?.trim() || '',
        running: isRunning,
        hasStopBtn: hasStopBtn,
        hasStreamingIndicator: hasStreamingIndicator,
        hasActionToolbar: Boolean(actionToolbar),
        isIdleUI: !isRunning && (Boolean(sendBtn) || Boolean(micBtn)),
        goal_status: goalFooter,
        waiting_for_user: waitingBanner,
        steps: steps,
        images: imgs,
        answer: responseText,
        text: responseText,
    };
})()"""


def extract_latest_result(page) -> dict:
    """读取当前标签页最新一条回答的状态、步骤、是否需要用户确认及正文。"""
    return page.evaluate(DOM_STATUS_EVAL_JS)


def _resolve_ask_entry(entry: str, tool: str | None = None, thinking: str | None = None) -> str:
    """解析 gemini.google.com 入口：未显式指定时，带工具/思考参数自动走 chat，其余默认走高优 task 模式。"""
    cleaned = (entry or "").strip().lower()
    if cleaned in ("chat", "task"):
        return cleaned
    return "chat" if (tool or thinking) else "task"


def execute_ask(
    browser,
    prompt: str,
    entry: str = "",
    model: str = "",
    tool: str | None = None,
    thinking: str | None = None,
    new_tab: bool = True,
    tab_url_hint: str = "",
    async_send: bool = False,
    timeout_sec: int = 180,
    files: list[str] | None = None,
    code_folder: str = "",
    github_repo: str = "",
    bring_to_front: bool = True,
    _return_handle: bool = False,
) -> dict:
    """在外部 Chrome 的 Gemini 网页中执行提问或异步任务（默认 Task 模式，支持文件/文件夹/GitHub 代码导入）。"""
    t0 = time.time()
    file_paths = _validate_files(files)
    page = get_gemini_page(browser, new_tab=new_tab, tab_url_hint=tab_url_hint, bring_to_front=bring_to_front)

    before_count = page.locator("model-response").count()
    is_fresh_chat = before_count == 0 and not re.search(r"gemini\.google\.com/app/[^/?#]+", page.url or "")
    effective_entry = _resolve_ask_entry(entry, tool=tool, thinking=thinking)
    if is_fresh_chat:
        select_entry_mode(page, effective_entry)

    chosen_model = model or ("hydrogen" if is_fresh_chat else "")
    if chosen_model:
        active_model = select_model(page, chosen_model)
    else:
        mode_btn = page.locator('button[data-test-id="bard-mode-menu-button"]').first
        active_model = (mode_btn.inner_text() or "").strip() if mode_btn.count() > 0 else ""

    if thinking and effective_entry != "task":
        select_thinking_level(page, thinking)
    if tool and effective_entry != "task":
        select_tool(page, tool)

    imported_code = _gemini_import_code(page, code_folder=code_folder, github_repo=github_repo) if (code_folder or github_repo) else {}
    attached_files = _gemini_attach_files(page, file_paths) if file_paths else []

    if is_fresh_chat:
        _human_pause(page, 1100, 1800)

    textbox = page.locator('div[role="textbox"]').first
    _human_fill(page, textbox, prompt)

    send_btn = page.locator('button[aria-label="发送"], button[aria-label*="Send" i], button.send-button').first
    if send_btn.count() > 0 and send_btn.is_visible():
        send_btn.click()
    else:
        textbox.press("Enter")

    if async_send:
        # 异步任务发射模式：等 URL 分配会话 ID 或出现响应节点后即刻返回
        deadline = time.time() + 15
        while time.time() < deadline:
            if "/app/" in (page.url or "") or page.locator("model-response").count() > before_count:
                break
            page.wait_for_timeout(300)
        _save_last_session("gemini", page.url)
        out = {
            "status": "dispatched",
            "entry": effective_entry,
            "model": active_model,
            "url": page.url,
            "attached_files": attached_files,
            "imported_code": imported_code or None,
            "elapsed_sec": round(time.time() - t0, 2),
        }
        if _return_handle:
            out["_page"] = page
            out["_before_count"] = before_count
        return out

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if page.locator("model-response").count() > before_count:
            break
        page.wait_for_timeout(300)
    else:
        raise TimeoutError("等待 Gemini 网页端开始输出超时。")

    latest_resp = page.locator("model-response").nth(before_count)
    wait_response_complete(page, latest_resp, deadline)

    start_btn = latest_resp.locator('button:has-text("开始研究"), button:has-text("Start research")').first
    if tool and "research" in tool.lower() and start_btn.count() > 0 and start_btn.is_visible():
        start_btn.click()
        page.wait_for_timeout(1000)
        wait_response_complete(page, latest_resp, deadline)

    res = extract_latest_result(page)
    _save_last_session("gemini", res.get("url") or page.url)
    res["status"] = "ok"
    if attached_files:
        res["attached_files"] = attached_files
    if imported_code:
        res["imported_code"] = imported_code
    res["elapsed_sec"] = round(time.time() - t0, 2)
    return res


def execute_fetch(browser, tab_url_hint: str) -> dict:
    """回收异步任务或已有会话标签页的最新状态与结果。"""
    page = get_gemini_page(browser, new_tab=False, tab_url_hint=tab_url_hint)
    res = extract_latest_result(page)
    res["status"] = "running" if res.get("running") else "ok"
    return res


def _parse_usage_block(text: str) -> dict:
    """从 /usage 单条用量卡片文本提取已使用百分比与重置时间。"""
    pct_m = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    reset_m = re.search(r"(?:重置时间[:：]\s*|Resets?\s+)([^\n|]+)", text, re.IGNORECASE)
    return {
        "used_pct": float(pct_m.group(1)) if pct_m else None,
        "reset_time": reset_m.group(1).strip() if reset_m else None,
        "raw": re.sub(r"\s+", " ", text).strip(),
    }


def execute_usage(browser) -> dict:
    """打开临时标签页抓取 https://gemini.google.com/usage 网页端实时用量限额。"""
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.new_page()
    try:
        page.goto("https://gemini.google.com/usage", wait_until="domcontentloaded", timeout=30000)
        page.locator('[data-testid="current-usage"], [data-usage-island-root]').first.wait_for(
            state="visible", timeout=20000
        )
        raw = page.evaluate(
            """() => {
                const root = document.querySelector('[data-usage-island-root]');
                const cur = document.querySelector('[data-testid="current-usage"]');
                const wk = document.querySelector('[data-testid="weekly-usage"]');
                const upd = document.querySelector('[data-testid="usage-updated"]');
                const plan = root?.querySelector('header span')?.innerText?.trim() || null;
                return {
                    plan,
                    updated: upd?.innerText?.trim() || null,
                    current_text: cur?.innerText || '',
                    weekly_text: wk?.innerText || '',
                };
            }"""
        )
        return {
            "status": "ok",
            "url": page.url,
            "plan": raw.get("plan"),
            "updated": raw.get("updated"),
            "current_usage": _parse_usage_block(raw.get("current_text", "")) if raw.get("current_text") else None,
            "weekly_usage": _parse_usage_block(raw.get("weekly_text", "")) if raw.get("weekly_text") else None,
        }
    finally:
        try:
            page.close()
        except Exception:
            pass


AISTUDIO_MODEL_MAP = {
    "neon": "Gemini 4 Neon",
    "4n": "Gemini 4 Neon",
    "hydrogen": "Gemini 4 Hydrogen",
    "4h": "Gemini 4 Hydrogen",
    "argon": "Gemini 4 Argon",
    "4a": "Gemini 4 Argon",
}

_AISTUDIO_MODEL_IDS = {
    "neon": "gemini-4-neon",
    "4n": "gemini-4-neon",
    "hydrogen": "gemini-4-hydrogen",
    "4h": "gemini-4-hydrogen",
    "argon": "gemini-4-argon",
    "4a": "gemini-4-argon",
    "flash": "gemini-3.8-flash",
    "flash-lite": "gemini-3.5-flash-lite",
    "decision": "gemini-decision-1",
    "nano": "gemini-nano-banana-2.1",
    "nano2.1": "gemini-nano-banana-2.1",
    "nano-pro": "gemini-3-pro-image",
    "nano2": "gemini-3.1-flash-image",
    "nano-lite": "gemini-3.1-flash-lite-image",
    "omni": "gemini-omni-1.2-flash",
    "omni1.2": "gemini-omni-1.2-flash",
    "omni1.1": "gemini-omni-1.1-flash",
    "tts": "gemini-3.8-flash-tts",
    "flash-tts": "gemini-3.8-flash-tts",
    "tts-lite": "gemini-3.8-flash-lite-tts",
    "lyria": "lyria-3.5",
    "lyria3.5": "lyria-3.5",
    "music": "lyria-3.5",
    "lyria-pro": "lyria-3-pro-preview",
    "lyria-clip": "lyria-3-clip-preview",
    "research": "deep-research-preview-04-2026",
    "research-max": "deep-research-max-preview-04-2026",
    "transcribe": "gemini-3.5-transcribe",
    "gemma-31b": "gemma-4-31b-it",
    "gemma-26b": "gemma-4-26b-a4b-it",
}


def _resolve_aistudio_model_id(model: str) -> str:
    """将别名或完整 model-id 规范化为 AI Studio URL 直达 ID。"""
    key = model.strip().lower()
    if key in _AISTUDIO_MODEL_IDS:
        return _AISTUDIO_MODEL_IDS[key]
    if key.startswith(("gemini-", "lyria-", "deep-research-", "gemma-", "antigravity-")):
        return key
    return ""


def _with_query(url: str, **params: str) -> str:
    """向 URL 安全追加或覆盖查询参数。"""
    parts = urllib.parse.urlsplit(url)
    query = dict(urllib.parse.parse_qsl(parts.query, keep_blank_values=True))
    query.update({k: v for k, v in params.items() if v is not None})
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )


def _get_aistudio_page(
    browser,
    target_url: str,
    ready_selector: str,
    new_tab: bool = True,
    tab_url_hint: str = "",
    required_path: str = "/prompts",
    bring_to_front: bool = True,
):
    """获取或新建 AI Studio 标签页；复用模式支持优先选已有同类型对话并按历史 URL 重连。"""
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    if not new_tab or tab_url_hint:
        matched_pages = [
            p
            for p in context.pages
            if "aistudio.google.com" in (p.url or "")
            and (tab_url_hint in (p.url or "") if tab_url_hint else (not required_path or required_path in (p.url or "")))
        ]
        if matched_pages:
            if not tab_url_hint:
                matched_pages.sort(
                    key=lambda p: 0
                    if (re.search(r"aistudio\.google\.com/(?:app/)?prompts/[^/?#]+", p.url or "") and "/new_chat" not in (p.url or ""))
                    else 1
                )
            page = matched_pages[0]
            if bring_to_front:
                page.bring_to_front()
            page.locator(ready_selector).first.wait_for(state="visible", timeout=30000)
            return page

        if tab_url_hint.startswith("https://"):
            target_url = tab_url_hint
        else:
            last_url = _load_last_session("aistudio") if required_path == "/prompts" else ""
            if last_url and (not tab_url_hint or tab_url_hint in last_url):
                target_url = last_url
            elif tab_url_hint:
                raise RuntimeError(f"未找到匹配的 AI Studio 标签页: {tab_url_hint}")

    page = context.new_page()
    if bring_to_front:
        page.bring_to_front()
    page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
    page.locator(ready_selector).first.wait_for(state="visible", timeout=30000)
    # 从容等待前端鉴权、项目配置与风控脚本水合完成（像真人浏览那样留足初始停顿）
    _human_pause(page, 3000, 4200)
    return page


def _extract_aistudio_drive_id(url: str) -> str:
    """从 AI Studio 会话 URL 提取对应的 Google Drive 文件 ID（供下游 Gemini Task 直接从 Drive 拉取）。"""
    m = re.search(r"aistudio\.google\.com/(?:app/)?prompts/([A-Za-z0-9_-]{12,})", url or "")
    if not m:
        return ""
    candidate = m.group(1)
    return "" if candidate.lower() == "new_chat" else candidate


def _aistudio_wait_saved_url(page, timeout_sec: float = 5.0) -> str:
    """等待 AI Studio 从 /new_chat 自动保存为 /prompts/<drive_file_id>，以便获取 Drive ID 与命名权限。"""
    deadline = time.time() + max(0.5, float(timeout_sec))
    while time.time() < deadline:
        u = page.url or ""
        if _extract_aistudio_drive_id(u):
            return u
        page.wait_for_timeout(300)
    return page.url or ""


def _aistudio_set_prompt_title(page, title: str) -> str:
    """为 AI Studio 会话设置可读标题，使自动同步到 Google Drive 的文件名便于下游员工检索。"""
    clean = (title or "").strip()
    if not clean:
        return ""
    try:
        edit_btn = page.locator(
            'button[aria-label="Edit prompt title and description"], '
            'button[aria-label*="Edit prompt title" i], '
            'h1.mode-title'
        ).first
        if edit_btn.count() == 0 or not edit_btn.is_visible():
            return ""
        edit_btn.click()
        page.wait_for_timeout(350)
        name_input = page.locator(
            'mat-dialog-container input[aria-label*="Prompt name" i], '
            'mat-dialog-container input[aria-label*="Title" i], '
            'mat-dialog-container input[type="text"], '
            'mat-dialog-container input'
        ).first
        if name_input.count() == 0 or not name_input.is_visible():
            return ""
        name_input.click()
        name_input.fill(clean)
        page.wait_for_timeout(150)
        save_btn = page.locator(
            'mat-dialog-container button:has-text("Save"), '
            'mat-dialog-container button:has-text("保存"), '
            'mat-dialog-container button[type="submit"]'
        ).first
        if save_btn.count() > 0 and save_btn.is_visible():
            save_btn.click()
        else:
            name_input.press("Enter")
        page.wait_for_timeout(450)
        return clean
    except Exception:
        return ""


def _aistudio_attach_files(page, file_paths: list[str], timeout_sec: int = 60) -> list[str]:
    """在 AI Studio Playground 通过 <input type='file'> 无弹窗上传本地文件并等待解析完成。"""
    if not file_paths:
        return []
    file_input = page.locator('ms-add-media-button input[type="file"], input.file-input').first
    file_input.wait_for(state="attached", timeout=15000)
    file_input.set_input_files(file_paths)
    deadline = time.time() + timeout_sec
    expected_names = [Path(p).name for p in file_paths]
    while time.time() < deadline:
        box_text = (
            page.evaluate(
                "() => (document.querySelector('ms-prompt-box, .prompt-box-container, footer, form')?.innerText || '')"
            )
            or ""
        )
        all_seen = all(name in box_text for name in expected_names)
        if all_seen and "Loading..." not in box_text and "Uploading" not in box_text:
            break
        page.wait_for_timeout(500)
    page.wait_for_timeout(400)
    return expected_names


def _resolve_aistudio_model_name(model: str) -> str:
    key = model.strip().lower()
    return AISTUDIO_MODEL_MAP.get(key, model.strip())


def _aistudio_select_playground_model(page, model: str) -> str:
    """在 AI Studio Playground 切换模型，默认避开 Paid 付费标记条目。"""
    target_name = _resolve_aistudio_model_name(model)
    allow_paid = "paid" in model.lower()
    card = page.locator(".model-selector-card").first
    if card.count() == 0:
        return target_name

    current = re.sub(r"\s+", " ", (card.inner_text() or "")).strip()
    if target_name.lower() in current.lower() and (allow_paid or "paid" not in current.lower()):
        return current

    card.click()
    page.wait_for_timeout(500)
    clicked = page.evaluate(
        """({targetLower, allowPaid}) => {
            const containers = document.querySelectorAll('.cdk-overlay-pane, [role="dialog"], ms-model-selector');
            const scope = containers.length ? containers : [document.body];
            const candidates = [];
            for (const root of scope) {
                for (const el of root.querySelectorAll('button, [role="option"], ms-model-card, .model-card, tr, li')) {
                    const txt = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                    if (!txt || txt.length > 260) continue;
                    const lower = txt.toLowerCase();
                    if (!lower.includes(targetLower)) continue;
                    const hasPaid = /\\bpaid\\b/i.test(txt);
                    if (!allowPaid && hasPaid) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        candidates.push({ el, score: txt.length });
                    }
                }
            }
            candidates.sort((a, b) => a.score - b.score);
            if (!candidates.length) return false;
            candidates[0].el.click();
            return true;
        }""",
        {"targetLower": target_name.lower(), "allowPaid": allow_paid},
    )
    if not clicked:
        page.keyboard.press("Escape")
        raise RuntimeError(f"未在 AI Studio Playground 模型列表中找到可用免费模型: {target_name}")
    page.wait_for_timeout(500)
    return re.sub(r"\s+", " ", (card.inner_text() or "")).strip()


def _aistudio_set_system_instruction(page, system_instruction: str) -> None:
    """在 AI Studio Playground 设置系统指令。"""
    sys_btn = page.locator(".system-instructions-card").first
    if sys_btn.count() == 0:
        raise RuntimeError("未找到 Playground 的 System Instructions 入口 (.system-instructions-card)")
    sys_btn.click()
    page.wait_for_timeout(400)
    box = page.locator(
        'textarea[aria-label*="System" i], .cdk-overlay-pane textarea, ms-system-instructions textarea'
    ).first
    box.wait_for(state="visible", timeout=10000)
    box.fill(system_instruction)
    page.wait_for_timeout(200)
    close_btn = page.locator(
        '.cdk-overlay-pane button[aria-label*="Close" i], ms-system-instructions button[aria-label*="Close" i]'
    ).first
    if close_btn.count() > 0 and close_btn.is_visible():
        close_btn.click()
    else:
        page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def _aistudio_tune_playground_max(page, thinking_level: str = "max", max_output: bool = True) -> dict:
    """按指定思考等级调整 AI Studio Playground 的 Thinking Level（防 high 误中 Extra High），并按需拉满 Output length。"""
    applied: dict = {}
    tl_mode = (thinking_level or "").strip().lower().replace("-", "_").replace(" ", "_")
    alias_map = {
        "max": "extra_high",
        "extra_high": "extra_high",
        "extra": "extra_high",
        "high": "high",
        "medium": "medium",
        "med": "medium",
        "low": "low",
        "minimal": "minimal",
        "min": "minimal",
    }
    if tl_mode in ("", "default", "keep"):
        tl_norm = ""
    else:
        tl_norm = alias_map.get(tl_mode, tl_mode)

    if tl_norm:
        tl = page.locator('mat-select[aria-label="Thinking Level"]').first
        if tl.count() > 0 and tl.is_visible():
            cur_tl = re.sub(r"\s+", " ", (tl.inner_text() or "")).strip().lower()
            already_match = (
                (tl_norm == "extra_high" and "extra" in cur_tl and "high" in cur_tl)
                or (tl_norm == "high" and "high" in cur_tl and "extra" not in cur_tl)
                or (tl_norm in ("medium", "low", "minimal") and tl_norm in cur_tl)
            )
            if already_match:
                applied["thinking_level"] = cur_tl
            else:
                tl.hover()
                _human_pause(page, 250, 450)
                tl.click()
                _human_pause(page, 500, 800)
                opts = page.locator(".cdk-overlay-pane mat-option")
                target_opt = None
                target_label = ""
                candidates: list[tuple[str, object]] = []
                for idx in range(opts.count()):
                    opt = opts.nth(idx)
                    if opt.get_attribute("aria-disabled") == "true":
                        continue
                    label = re.sub(r"\s+", " ", (opt.inner_text() or "")).strip()
                    if not label or re.search(r"\bpaid\b", label, re.IGNORECASE):
                        continue
                    candidates.append((label, opt))
                low_cands = [(lbl.lower(), lbl, o) for lbl, o in candidates]
                if tl_norm == "extra_high":
                    pick = next((x for x in low_cands if re.search(r"extra\s*high", x[0])), None) or next((x for x in low_cands if x[0] == "high"), None) or (low_cands[-1] if low_cands else None)
                elif tl_norm == "high":
                    pick = next((x for x in low_cands if x[0] == "high"), None) or next((x for x in low_cands if "high" in x[0] and "extra" not in x[0]), None) or (low_cands[-1] if low_cands else None)
                elif tl_norm in ("medium", "low"):
                    pick = next((x for x in low_cands if x[0] == tl_norm), None) or next((x for x in low_cands if tl_norm in x[0]), None)
                elif tl_norm == "minimal":
                    pick = next((x for x in low_cands if "minimal" in x[0]), None) or next((x for x in low_cands if x[0] == "low"), None) or (low_cands[0] if low_cands else None)
                else:
                    plain = tl_norm.replace("_", " ")
                    pick = next((x for x in low_cands if x[0] == plain), None) or next((x for x in low_cands if plain in x[0]), None)

                if pick:
                    target_label, target_opt = pick[1], pick[2]
                    target_opt.click()
                    applied["thinking_level"] = target_label
                else:
                    page.keyboard.press("Escape")
                _human_pause(page, 550, 900)

    if max_output:
        out_inp = page.locator('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]').first
        if out_inp.count() > 0 and out_inp.is_visible():
            max_val = out_inp.get_attribute("max") or ""
            if max_val and (out_inp.input_value() or "") != max_val:
                out_inp.click()
                _human_pause(page, 200, 380)
                out_inp.fill(max_val)
                applied["max_output_tokens"] = max_val
                _human_pause(page, 350, 600)
    return applied


def _aistudio_click_run(page, prompt_box) -> None:
    """用 Playwright 原生指针 hover + click 主运行按钮（isTrusted=true，模拟真人移动鼠标按下），降级 Ctrl+Enter。"""
    run_btns = page.locator("ms-run-button button:not(.rerun-button), button:has-text('Run'):not(.rerun-button)")
    for i in range(run_btns.count()):
        btn = run_btns.nth(i)
        try:
            if not btn.is_visible() or btn.is_disabled():
                continue
            txt = (btn.inner_text() or "").strip()
            if re.match(r"^Run\b", txt, re.IGNORECASE):
                btn.scroll_into_view_if_needed()
                btn.hover()
                _human_pause(page, 350, 600)
                btn.click()
                return
        except Exception:
            continue
    prompt_box.press("Control+Enter")


def _aistudio_playground_is_running(page) -> bool:
    return bool(
        page.evaluate(
            """() => {
                for (const b of document.querySelectorAll('button')) {
                    const rect = b.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) continue;
                    const txt = (b.innerText || '').trim();
                    const aria = (b.getAttribute('aria-label') || '').trim();
                    if (/\\b(Stop|Cancel)\\b/i.test(txt) || /\\b(Stop|Cancel)\\b/i.test(aria)) return true;
                }
                const modelTurns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
                const last = modelTurns[modelTurns.length - 1];
                if (last) {
                    const thoughtEls = Array.from(last.querySelectorAll('ms-thought-chunk, mat-expansion-panel'));
                    const thoughtSet = new Set(thoughtEls);
                    const finalCmarks = Array.from(last.querySelectorAll('ms-cmark-node')).filter(
                        n => !Array.from(thoughtSet).some(t => t.contains(n)) && (n.innerText || '').trim().length > 0
                    );
                    const hasMedia = last.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length > 0;
                    const raw = (last.innerText || '');
                    if (!finalCmarks.length && !hasMedia && (/正在思考|Thinking/i.test(raw) || last.querySelector('mat-spinner, mat-progress-bar'))) {
                        return true;
                    }
                }
                return false;
            }"""
        )
    )


def _is_media_playground_model(model_name_or_id: str) -> bool:
    """判断是否为生图/生视频/音乐/TTS等无需 Thinking Level 与 1M 输出参数的媒体模型。"""
    s = (model_name_or_id or "").strip().lower()
    return any(tok in s for tok in ("nano", "image", "omni", "veo", "lyria", "tts", "transcribe", "live"))


def _aistudio_has_final_output(page, min_turns: int = 0) -> bool:
    return bool(
        page.evaluate(
            """(minTurns) => {
                const allTurns = Array.from(document.querySelectorAll('ms-chat-turn'));
                if (minTurns > 0 && allTurns.length <= minTurns) return false;
                const modelTurns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
                const last = modelTurns[modelTurns.length - 1];
                if (!last) return false;
                if (allTurns.length > 0) {
                    const lastTurn = allTurns[allTurns.length - 1];
                    if (!lastTurn.querySelector('[data-turn-role="Model"]') && !lastTurn.matches('[data-turn-role="Model"]')) {
                        if (lastTurn !== last && !lastTurn.contains(last)) return false;
                    }
                }
                const thoughtEls = Array.from(last.querySelectorAll('ms-thought-chunk, mat-expansion-panel'));
                const thoughtSet = new Set(thoughtEls);
                const finalCmarks = Array.from(last.querySelectorAll('ms-cmark-node')).filter(
                    n => !Array.from(thoughtSet).some(t => t.contains(n)) && (n.innerText || '').trim().length > 0
                );
                const hasMedia = last.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length > 0;
                return finalCmarks.length > 0 || hasMedia;
            }""",
            min_turns,
        )
    )


def _aistudio_extract_turn_error(page, min_turns: int = 0) -> str:
    """检测 AI Studio 最后一轮 Model Turn 是否输出了错误卡片（便于立即 Fast-Fail，避免空等 180s）。"""
    raw = page.evaluate(
        """(minTurns) => {
            const allTurns = Array.from(document.querySelectorAll('ms-chat-turn'));
            if (minTurns > 0 && allTurns.length <= minTurns) return '';
            const modelTurns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
            const last = modelTurns[modelTurns.length - 1];
            if (!last) return '';
            const hasCmark = last.querySelectorAll('ms-cmark-node').length > 0;
            const hasMedia = last.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length > 0;
            if (hasCmark || hasMedia) return '';
            const errNode = last.querySelector('.model-error, .error-message, [class*="error" i]');
            const icons = Array.from(last.querySelectorAll('mat-icon, .material-symbols-outlined, .material-icons'));
            const hasErrIcon = icons.some(ic => (ic.innerText || '').trim().toLowerCase() === 'error');
            const txt = (errNode?.innerText || last.innerText || '').trim();
            if (hasErrIcon || errNode || /权限遭拒|permission denied|quota|internal error|something went wrong|rate limit/i.test(txt)) {
                return txt.replace(/^(?:edit|more_vert|Model\\s*\\d{1,2}:\\d{2}|error)\\s*/gim, '').trim() || txt;
            }
            return '';
        }""",
        min_turns,
    )
    return raw.strip() if isinstance(raw, str) else ""


def _aistudio_output_signature(page) -> tuple[int, int]:
    """返回最后一条 Model Turn 的字符数与媒体数量，用于流式静止确认防提前截断。"""
    res = page.evaluate(
        """() => {
            const turns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
            const last = turns[turns.length - 1];
            if (!last) return [0, 0];
            const len = (last.innerText || '').length;
            const media = last.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length;
            return [len, media];
        }"""
    )
    if isinstance(res, list) and len(res) >= 2:
        return int(res[0] or 0), int(res[1] or 0)
    return 0, 0


def _save_data_url(data_url: str, out_dir: Path, prefix: str, default_ext: str = ".bin") -> str:
    """将 data:<mime>;base64,... 字符串解码保存到本地文件。"""
    m = re.match(r"^data:([^;]+);base64,(.+)$", data_url, re.DOTALL)
    if not m:
        raise RuntimeError(f"无法解析 data URL: {data_url[:60]}...")
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
    ext = ext_map.get(mime, default_ext)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{prefix}_{int(time.time() * 1000)}{ext}"
    target.write_bytes(base64.b64decode(m.group(2)))
    return str(target)


def _save_blob_url(page, blob_url: str, out_dir: Path, prefix: str, default_ext: str) -> str:
    """在浏览器上下文读取 blob: URL 并写入本地文件。"""
    data_url = page.evaluate(
        """async (url) => {
            const resp = await fetch(url);
            const blob = await resp.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(String(reader.error || 'FileReader failed'));
                reader.readAsDataURL(blob);
            });
        }""",
        blob_url,
    )
    return _save_data_url(data_url, out_dir, prefix, default_ext=default_ext)


def _aistudio_extract_playground_result(page, download_dir: str = "") -> dict:
    """触发虚拟滚动渲染并提取最后一轮模型回答与生成媒体（图片/视频）。"""
    page.bring_to_front()
    turns = page.locator("ms-chat-turn")
    if turns.count() > 0:
        turns.last.scroll_into_view_if_needed()
        page.wait_for_timeout(800)

    data = page.evaluate(
        """() => {
            const modelTurns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
            const last = modelTurns[modelTurns.length - 1];
            if (!last) return { text: '', thoughts: '', count: 0, imgBlobs: [], videoBlobs: [] };
            const thoughtEls = Array.from(last.querySelectorAll('ms-thought-chunk, mat-expansion-panel'));
            const thoughtSet = new Set(thoughtEls);
            const thoughts = thoughtEls.map(el => (el.innerText || '').trim()).filter(Boolean).join('\\n\\n');
            const cmarkNodes = Array.from(last.querySelectorAll('ms-cmark-node')).filter(
                n => !Array.from(thoughtSet).some(t => t.contains(n)) && !(n.parentElement && n.parentElement.closest('ms-cmark-node'))
            );
            let text = '';
            if (cmarkNodes.length) {
                text = cmarkNodes.map(n => (n.innerText || '').trim()).filter(Boolean).join('\\n\\n');
            } else {
                const tc = last.querySelector('.turn-content');
                text = ((tc ? tc.innerText : last.innerText) || '').trim();
            }
            const imgBlobs = Array.from(last.querySelectorAll('img[src^="blob:"]'))
                .filter(img => img.naturalWidth > 200)
                .map(img => img.src);
            const videoBlobs = Array.from(last.querySelectorAll('video[src^="blob:"], video source[src^="blob:"]'))
                .map(v => v.getAttribute('src') || v.currentSrc || '')
                .filter(u => u.startsWith('blob:'));
            return {
                text,
                thoughts,
                count: modelTurns.length,
                imgBlobs: Array.from(new Set(imgBlobs)),
                videoBlobs: Array.from(new Set(videoBlobs)),
            };
        }"""
    )

    saved_files: list[str] = []
    if download_dir:
        out_dir = Path(download_dir).resolve()
        for idx, b_url in enumerate(data.get("imgBlobs", []), 1):
            saved_files.append(_save_blob_url(page, b_url, out_dir, f"aistudio_img_{idx}", ".png"))
        for idx, b_url in enumerate(data.get("videoBlobs", []), 1):
            saved_files.append(_save_blob_url(page, b_url, out_dir, f"aistudio_video_{idx}", ".mp4"))
    data["saved_files"] = saved_files
    return data


def _aistudio_run_music(
    page,
    prompt: str,
    model: str,
    download_dir: str,
    async_send: bool,
    timeout_sec: int,
    t0: float,
    _return_handle: bool = False,
) -> dict:
    """在 AI Studio /new_music (Lyria) 工作台生成完整歌曲并可选导出 MP3。"""
    box = page.locator('textarea[aria-label="Prompt input"]').first
    if box.count() == 0 or not box.is_visible():
        empty_btn = page.locator("button.empty-state__title-button").first
        if empty_btn.count() > 0:
            empty_btn.click()
        box.wait_for(state="visible", timeout=15000)

    before_count = page.locator('audio[src^="data:audio/"]').count()
    _human_fill(page, box, prompt)

    gen_btn = page.locator('button.ctrl-enter-submits:has-text("Generate"), button.ctrl-enter-submits').first
    gen_btn.wait_for(state="visible", timeout=10000)
    gen_btn.click()

    if async_send:
        page.wait_for_timeout(1000)
        out = {
            "status": "dispatched",
            "entry": "aistudio-music",
            "model": model,
            "url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }
        if _return_handle:
            out["_page"] = page
            out["_before_count"] = before_count
        return out

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        audios = page.locator('audio[src^="data:audio/"]')
        composing = page.locator('button:has-text("Stop composing")').count() > 0
        if audios.count() > before_count and not composing:
            break
        page.wait_for_timeout(800)
    else:
        raise TimeoutError("等待 AI Studio Lyria 音乐生成超时。")

    audio_info = page.evaluate(
        """() => {
            const list = Array.from(document.querySelectorAll('audio[src^="data:audio/"]'));
            const last = list[list.length - 1];
            return last ? { src: last.src, duration: last.duration || null } : null;
        }"""
    )
    saved_files: list[str] = []
    if download_dir and audio_info and audio_info.get("src"):
        saved_files.append(_save_data_url(audio_info["src"], Path(download_dir).resolve(), "aistudio_music", ".mp3"))

    return {
        "status": "ok",
        "entry": "aistudio-music",
        "model": model,
        "url": page.url,
        "duration_sec": audio_info.get("duration") if audio_info else None,
        "saved_files": saved_files,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def _aistudio_run_tts(
    page,
    prompt: str,
    model: str,
    download_dir: str,
    async_send: bool,
    timeout_sec: int,
    t0: float,
    _return_handle: bool = False,
) -> dict:
    """在 AI Studio /generate-speech (TTS) 工作台合成语音并可选导出 WAV。"""
    box = page.locator('textarea[aria-label="Speech block text"]').first
    if box.count() == 0 or not box.is_visible():
        create_card = page.locator("mat-card.create-dialog-card").first
        if create_card.count() > 0:
            create_card.click()
        box.wait_for(state="visible", timeout=15000)

    before_count = page.locator('audio[src^="data:audio/"]').count()
    _human_fill(page, box, prompt)

    run_btn = page.locator("button.ctrl-enter-submits").first
    run_btn.wait_for(state="visible", timeout=10000)
    run_btn.click()

    if async_send:
        page.wait_for_timeout(1000)
        out = {
            "status": "dispatched",
            "entry": "aistudio-tts",
            "model": model,
            "url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }
        if _return_handle:
            out["_page"] = page
            out["_before_count"] = before_count
        return out

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if page.locator('audio[src^="data:audio/"]').count() > before_count:
            break
        page.wait_for_timeout(500)
    else:
        raise TimeoutError("等待 AI Studio TTS 语音合成超时。")

    audio_info = page.evaluate(
        """() => {
            const list = Array.from(document.querySelectorAll('audio[src^="data:audio/"]'));
            const last = list[list.length - 1];
            return last ? { src: last.src, duration: last.duration || null } : null;
        }"""
    )
    saved_files: list[str] = []
    if download_dir and audio_info and audio_info.get("src"):
        saved_files.append(_save_data_url(audio_info["src"], Path(download_dir).resolve(), "aistudio_tts", ".wav"))

    return {
        "status": "ok",
        "entry": "aistudio-tts",
        "model": model,
        "url": page.url,
        "duration_sec": audio_info.get("duration") if audio_info else None,
        "saved_files": saved_files,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def execute_playground(
    browser,
    prompt: str,
    model: str = "",
    system_instruction: str = "",
    system_file: str = "",
    files: list[str] | None = None,
    new_tab: bool = False,
    tab_url_hint: str = "",
    async_send: bool = False,
    timeout_sec: int = 180,
    download_dir: str = "",
    thinking_level: str = "max",
    max_output: bool = True,
    include_thoughts: bool = False,
    title: str = "",
    bring_to_front: bool = True,
    _return_handle: bool = False,
) -> dict:
    """在 AI Studio Playground 全工作台执行对话/生图/生视频/Lyria音乐/TTS配音/Deep Research。"""
    t0 = time.time()
    file_paths = _validate_files(files)
    sys_text = _read_system_text(system_instruction, system_file)
    explicit_model = (model or "").strip()
    nav_model = explicit_model or "hydrogen"
    model_id = _resolve_aistudio_model_id(nav_model)
    target_url = (
        f"https://aistudio.google.com/prompts/new_chat?model={model_id}"
        if model_id
        else "https://aistudio.google.com/prompts/new_chat"
    )
    ready_selector = (
        'textarea[aria-label="Enter a prompt"], '
        'textarea[aria-label="Prompt input"], '
        'button.empty-state__title-button, '
        'textarea[aria-label="Speech block text"], '
        'mat-card.create-dialog-card'
    )
    required_path = (
        "/new_music"
        if model_id.startswith("lyria")
        else ("/generate-speech" if "tts" in model_id else "/prompts")
    )
    page = _get_aistudio_page(
        browser,
        target_url=target_url,
        ready_selector=ready_selector,
        new_tab=new_tab,
        tab_url_hint=tab_url_hint,
        required_path=required_path,
        bring_to_front=bring_to_front,
    )

    cur_url = page.url or ""
    if "/new_music" in cur_url or model_id.startswith("lyria"):
        return _aistudio_run_music(page, prompt, model_id or nav_model, download_dir, async_send, timeout_sec, t0, _return_handle=_return_handle)
    if "/generate-speech" in cur_url or "tts" in model_id:
        return _aistudio_run_tts(page, prompt, model_id or nav_model, download_dir, async_send, timeout_sec, t0, _return_handle=_return_handle)

    before_turns = page.locator("ms-chat-turn").count()
    is_fresh_session = before_turns == 0 and "/new_chat" in cur_url
    need_model_pick = explicit_model or ("hydrogen" if is_fresh_session else "")
    if need_model_pick and (not new_tab or not model_id or (model_id not in cur_url)):
        active_model = _short_model_name(_aistudio_select_playground_model(page, need_model_pick))
    else:
        card = page.locator(".model-selector-card").first
        active_model = _short_model_name((card.inner_text() or "") if card.count() > 0 else (model_id or nav_model))

    if sys_text:
        _aistudio_set_system_instruction(page, sys_text)

    if _is_media_playground_model(active_model or model_id):
        tuned = {}
    else:
        tuned = _aistudio_tune_playground_max(page, thinking_level=thinking_level, max_output=max_output)

    attached_files = _aistudio_attach_files(page, file_paths) if file_paths else []

    prompt_box = page.locator('textarea[aria-label="Enter a prompt"]').first
    prompt_box.wait_for(state="visible", timeout=15000)
    _human_fill(page, prompt_box, prompt)
    _aistudio_click_run(page, prompt_box)

    if async_send:
        deadline = time.time() + 15
        while time.time() < deadline:
            if "/new_chat" not in (page.url or "") or page.locator("ms-chat-turn").count() > before_turns:
                break
            page.wait_for_timeout(300)
        if _return_handle:
            _save_last_session("aistudio", page.url)
            drive_id = _extract_aistudio_drive_id(page.url)
            set_title = ""
        else:
            set_title = _aistudio_set_prompt_title(page, title) if title else ""
            _save_last_session("aistudio", page.url)
            drive_id = _extract_aistudio_drive_id(page.url)
        out = {
            "status": "dispatched",
            "entry": "aistudio-playground",
            "model": active_model,
            "url": page.url,
            "drive_file_id": drive_id or None,
            "title": set_title or None,
            "attached_files": attached_files,
            "elapsed_sec": round(time.time() - t0, 2),
        }
        if _return_handle:
            out["_page"] = page
            out["_before_turns"] = before_turns
        return out

    deadline = time.time() + timeout_sec
    started = False
    stable_ticks = 0
    last_sig = (-1, -1)
    while time.time() < deadline:
        running = _aistudio_playground_is_running(page)
        turn_count = page.locator("ms-chat-turn").count()
        announcer = page.locator(".cdk-live-announcer-element")
        announcer_txt = (announcer.first.inner_text() or "") if announcer.count() > 0 else ""
        if running or turn_count > before_turns:
            started = True
        if started and not running:
            turn_err = _aistudio_extract_turn_error(page, min_turns=before_turns)
            if turn_err:
                raise RuntimeError(f"AI Studio 返回错误: {turn_err}")
        has_output = _aistudio_has_final_output(page, min_turns=before_turns)
        cur_sig = _aistudio_output_signature(page)
        if started and not running and has_output and cur_sig == last_sig:
            stable_ticks += 1
            need_ticks = 2 if "response ready" in announcer_txt.lower() else 4
            if stable_ticks >= need_ticks:
                break
        else:
            stable_ticks = 0
        last_sig = cur_sig
        page.wait_for_timeout(500)
    else:
        raise TimeoutError("等待 AI Studio Playground 输出超时。")

    extracted = _aistudio_extract_playground_result(page, download_dir=download_dir)
    _aistudio_wait_saved_url(page, timeout_sec=5.0)
    set_title = _aistudio_set_prompt_title(page, title) if title else ""
    _save_last_session("aistudio", page.url)
    drive_id = _extract_aistudio_drive_id(page.url)
    thoughts_raw = extracted.get("thoughts", "") or ""
    return {
        "status": "ok",
        "entry": "aistudio-playground",
        "model": active_model,
        "url": page.url,
        "drive_file_id": drive_id or None,
        "title": set_title or None,
        "text": extracted.get("text", ""),
        "thoughts": thoughts_raw if include_thoughts else "",
        "thoughts_chars": len(thoughts_raw),
        "img_count": len(extracted.get("imgBlobs", [])),
        "video_count": len(extracted.get("videoBlobs", [])),
        "saved_files": extracted.get("saved_files", []),
        "attached_files": attached_files,
        "run_settings": tuned,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def execute_attach(
    browser,
    files: list[str],
    site: str = "auto",
    tab_url_hint: str = "",
) -> dict:
    """只把本地文件无弹窗挂载到已打开的 AI Studio 或 Gemini 标签页，不立即发送。"""
    t0 = time.time()
    file_paths = _validate_files(files)
    if not file_paths:
        raise ValueError("请至少传入一个 --file 文件路径")
    inferred_site = site
    if inferred_site == "auto":
        if "gemini.google.com" in tab_url_hint:
            inferred_site = "gemini"
        elif "aistudio.google.com" in tab_url_hint:
            inferred_site = "aistudio"
        else:
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            urls = [p.url or "" for p in context.pages]
            inferred_site = "gemini" if any("gemini.google.com" in u for u in urls) and not any("aistudio.google.com" in u for u in urls) else "aistudio"

    if inferred_site == "gemini":
        page = get_gemini_page(browser, new_tab=False, tab_url_hint=tab_url_hint)
        attached = _gemini_attach_files(page, file_paths)
        _save_last_session("gemini", page.url)
    else:
        page = _get_aistudio_page(
            browser,
            target_url="https://aistudio.google.com/prompts/new_chat",
            ready_selector='textarea[aria-label="Enter a prompt"]',
            new_tab=False,
            tab_url_hint=tab_url_hint,
        )
        attached = _aistudio_attach_files(page, file_paths)
        _save_last_session("aistudio", page.url)

    return {
        "status": "attached",
        "site": inferred_site,
        "url": page.url,
        "attached_files": attached,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def _aistudio_build_select_mode(page, mode: str) -> None:
    """在 AI Studio Build 切换构建模式（default/plan/max）。"""
    btn = page.locator(
        'button:has-text("Default"), button:has-text("Plan"), button:has-text("Max")'
    ).filter(has_text=re.compile(r"keyboard_arrow_down|mode", re.IGNORECASE)).first
    if btn.count() == 0:
        return
    btn.click()
    page.wait_for_timeout(300)
    items = page.locator('.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button, .cdk-overlay-pane mat-option')
    target_lower = mode.strip().lower()
    for i in range(items.count()):
        item = items.nth(i)
        txt = (item.inner_text() or "").strip()
        if target_lower in txt.lower():
            item.click()
            page.wait_for_timeout(300)
            return
    page.keyboard.press("Escape")
    raise RuntimeError(f"未在 AI Studio Build 模式菜单中找到: {mode}")


def _aistudio_build_configure(page, model: str = "", framework: str = "") -> None:
    """打开 AI Studio Build 应用设置弹窗，切换聊天模型与目标框架。"""
    if not model and not framework:
        return
    opened = page.evaluate(
        """() => {
            for (const b of document.querySelectorAll('button')) {
                if (b.getAttribute('data-test-id') === 'settings-menu') continue;
                if (b.closest('[data-test-id="settings-menu"]')) continue;
                const rect = b.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const txt = (b.innerText || '').trim().toLowerCase();
                if (aria.includes('setting') || txt === 'settings' || txt.includes('settings')) {
                    b.click();
                    return true;
                }
            }
            return false;
        }"""
    )
    if not opened:
        raise RuntimeError("未找到 AI Studio Build 应用级设置按钮")
    page.wait_for_timeout(500)

    def _pick_mat_select(selector_locator, target_text: str, label: str, skip_paid: bool = False, fallback_text: str = "") -> None:
        if selector_locator.count() == 0:
            raise RuntimeError(f"未找到 Build {label} 下拉框")
        selector_locator.click()
        page.wait_for_timeout(350)
        opts = page.locator(".cdk-overlay-pane mat-option")

        def _try_pick(needle: str) -> bool:
            n_low = needle.strip().lower()
            for i in range(opts.count()):
                opt = opts.nth(i)
                txt = (opt.inner_text() or "").strip()
                t_low = txt.lower()
                if skip_paid and re.search(r"\bpaid\b", t_low):
                    continue
                if opt.get_attribute("aria-disabled") == "true":
                    continue
                if n_low in t_low:
                    opt.click()
                    page.wait_for_timeout(300)
                    return True
            return False

        if _try_pick(target_text):
            return
        if fallback_text and _try_pick(fallback_text):
            return
        page.keyboard.press("Escape")
        raise RuntimeError(f"Build {label} 中未找到匹配项: {target_text}")

    if model:
        resolved = _resolve_aistudio_model_name(model)
        allow_paid = "paid" in model.lower()
        fallback = ""
        if not allow_paid:
            if "neon" in resolved.lower():
                fallback = "Gemini 4 Argon"
            elif "argon" in resolved.lower():
                fallback = "Gemini 4 Hydrogen"
        _pick_mat_select(
            page.locator('mat-select[aria-label="Select the model for chat"]').first,
            resolved,
            "模型",
            skip_paid=not allow_paid,
            fallback_text=fallback,
        )
    if framework:
        selects = page.locator("mat-select")
        fw_select = None
        for i in range(selects.count()):
            s = selects.nth(i)
            if (s.get_attribute("aria-label") or "") != "Select the model for chat":
                fw_select = s
                break
        if fw_select is None:
            raise RuntimeError("未找到 Build 框架 mat-select 下拉框")
        _pick_mat_select(fw_select, framework, "框架")

    done_btn = page.locator(
        'mat-dialog-container button:has-text("Save"), mat-dialog-container button:has-text("Done"), mat-dialog-container button[aria-label*="Close" i]'
    ).first
    if done_btn.count() > 0 and done_btn.is_visible():
        done_btn.click()
    else:
        page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def _aistudio_build_export_zip(page, download_dir: str, extract: bool) -> dict:
    """在 AI Studio Build 应用页点击 Export options -> Download as .zip file 并按需解压。"""
    export_btn = page.locator('button[aria-label="Export options"]').first
    if export_btn.count() == 0 or not export_btn.is_visible():
        code_btn = page.locator('button[aria-label="Code"]').first
        if code_btn.count() > 0 and code_btn.is_visible():
            code_btn.click()
            page.wait_for_timeout(800)
    if export_btn.count() == 0 or not export_btn.is_visible():
        target = _with_query(page.url, showCode="true", showAssistant="true")
        page.goto(target, wait_until="domcontentloaded", timeout=30000)
        export_btn = page.locator('button[aria-label="Export options"]').first

    export_btn.wait_for(state="visible", timeout=20000)
    export_btn.click()
    page.wait_for_timeout(400)
    zip_item = page.locator('.cdk-overlay-pane [role="menuitem"]:has-text("Download as .zip file")').first
    zip_item.wait_for(state="visible", timeout=10000)

    out_dir = Path(download_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    with page.expect_download(timeout=60000) as dl_info:
        zip_item.click()
    dl = dl_info.value
    zip_path = out_dir / (dl.suggested_filename or f"aistudio-build-{int(time.time())}.zip")
    dl.save_as(str(zip_path))

    result = {"zip_path": str(zip_path)}
    if extract:
        extract_dir = out_dir / zip_path.stem
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
            result["extracted_dir"] = str(extract_dir)
            result["extracted_files"] = len(zf.namelist())
    return result


def execute_build(
    browser,
    prompt: str = "",
    app_url: str = "",
    mode: str = "max",
    model: str = "neon",
    framework: str = "",
    download_dir: str = "",
    extract: bool = False,
    async_send: bool = False,
    timeout_sec: int = 300,
) -> dict:
    """在 AI Studio Build (aistudio.google.com/apps) 创建/修改应用，或导出项目 ZIP。"""
    if not prompt and not download_dir:
        raise ValueError("build 命令至少需要提供 --prompt 或 --download-dir")

    t0 = time.time()
    target = (
        _with_query(app_url, showCode="true", showAssistant="true")
        if app_url
        else "https://aistudio.google.com/apps"
    )
    ready_sel = (
        'button[aria-label="Send"], '
        'div[aria-label="Describe an app and let Gemini do the rest"], '
        'textarea[placeholder*="Make changes"], '
        'button[aria-label="Export options"]'
    )
    page = _get_aistudio_page(
        browser,
        target_url=target,
        ready_selector=ready_sel,
        new_tab=not bool(app_url),
        tab_url_hint=app_url,
        required_path="/apps",
    )

    if prompt:
        if mode:
            _aistudio_build_select_mode(page, mode)
        if model or framework:
            _aistudio_build_configure(page, model=model, framework=framework)

        iter_box = page.locator('textarea[placeholder*="Make changes"]').first
        if iter_box.count() > 0 and iter_box.is_visible():
            iter_box.click()
            iter_box.fill(prompt)
        else:
            new_box = page.locator('div[aria-label="Describe an app and let Gemini do the rest"]').first
            new_box.wait_for(state="visible", timeout=15000)
            new_box.click()
            new_box.fill(prompt)

        page.wait_for_timeout(250)
        send_btn = page.locator('button[aria-label="Send"]').first
        send_btn.wait_for(state="visible", timeout=10000)
        send_btn.click()

        if async_send:
            deadline = time.time() + 20
            while time.time() < deadline:
                if (page.url or "").rstrip("/") != "https://aistudio.google.com/apps":
                    break
                page.wait_for_timeout(400)
            return {
                "status": "dispatched",
                "entry": "aistudio-build",
                "url": page.url,
                "elapsed_sec": round(time.time() - t0, 2),
            }

        deadline = time.time() + timeout_sec
        page.wait_for_timeout(2000)
        last_len = -1
        stable_ticks = 0
        while time.time() < deadline:
            body_state = page.evaluate(
                """() => {
                    const sendBtn = document.querySelector('button[aria-label="Send"]');
                    const sendReady = !!(sendBtn && !sendBtn.disabled && sendBtn.getBoundingClientRect().width > 0);
                    let stopping = false;
                    for (const b of document.querySelectorAll('button')) {
                        const rect = b.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) continue;
                        const txt = (b.innerText || '').trim();
                        const aria = (b.getAttribute('aria-label') || '').trim();
                        if (/^Stop\\b/i.test(txt) || /^Stop\\b/i.test(aria)) {
                            stopping = true;
                            break;
                        }
                    }
                    const appLen = (document.body.innerText || '').length;
                    return { sendReady, stopping, appLen };
                }"""
            )
            if body_state["sendReady"] and not body_state["stopping"]:
                if body_state["appLen"] == last_len:
                    stable_ticks += 1
                    if stable_ticks >= 4:
                        break
                else:
                    stable_ticks = 0
                    last_len = body_state["appLen"]
            else:
                stable_ticks = 0
                last_len = body_state["appLen"]
            page.wait_for_timeout(800)
        else:
            raise TimeoutError("等待 AI Studio Build 生成完成超时。")

    res: dict = {
        "status": "ok",
        "entry": "aistudio-build",
        "url": page.url,
        "elapsed_sec": round(time.time() - t0, 2),
    }
    if download_dir:
        res.update(_aistudio_build_export_zip(page, download_dir=download_dir, extract=extract))
    return res


FLOW_MODEL_ALIASES = {
    "nano": "Nano Banana 2.1",
    "nano2.1": "Nano Banana 2.1",
    "nano-2.1": "Nano Banana 2.1",
    "nano-pro": "Nano Banana Pro",
    "nano-lite": "Nano Banana 2 Lite",
    "omni": "Omni 1.2 Flash",
    "omni1.2": "Omni 1.2 Flash",
    "veo-lite": "Veo 3.1 - Lite",
}


def execute_flow_usage(browser) -> dict:
    """打开临时标签页读取 https://flow.google.com/ 右上角 Google Flow 独立点数与重置时间。"""
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.new_page()
    try:
        page.goto("https://flow.google.com/", wait_until="domcontentloaded", timeout=30000)
        acc = page.locator('[aria-label="账号详情"], [aria-label*="Account" i]').first
        acc.wait_for(state="visible", timeout=25000)
        page.wait_for_timeout(400)
        acc.click()
        dialog = page.locator('[role="dialog"]').first
        dialog.wait_for(state="visible", timeout=10000)
        raw = re.sub(r"\s+", " ", (dialog.inner_text() or "")).strip()
        credits_m = re.search(r"([\d,]+)\s*(?:个\s*Google Flow\s*点数|Google Flow\s*credits?)", raw, re.IGNORECASE)
        reset_m = re.search(
            r"(?:重置时间[:：]\s*|Resets?\s+)([^\n]+?)(?=\s+(?:升级|person|Upgrade|退出|Sign\s*out|frame_spark|可见水印|隐私权|Privacy)|$)",
            raw,
            re.IGNORECASE,
        )
        return {
            "status": "ok",
            "url": page.url,
            "credits": int(credits_m.group(1).replace(",", "")) if credits_m else None,
            "reset_time": reset_m.group(1).strip() if reset_m else None,
            "raw": raw,
        }
    finally:
        try:
            page.close()
        except Exception:
            pass


def _flow_ensure_direct_mode(page) -> None:
    """确保处于 Google Flow 直出提示栏模式（显示「设置触发器」按钮），而非聊天智能体视图。"""
    trig = page.locator('button[aria-label="设置触发器"], button[aria-label*="Settings trigger" i]').first
    if trig.count() > 0 and trig.is_visible():
        return

    # 关闭可能展开的右侧聊天栏，露出画布直出底栏
    close_btns = page.locator('button[aria-label="关闭"], button[aria-label="Close"]')
    for idx in range(close_btns.count() - 1, -1, -1):
        b = close_btns.nth(idx)
        if b.is_visible():
            b.click()
            page.wait_for_timeout(400)
            if trig.count() > 0 and trig.is_visible():
                return
            break

    # 若仍处在「智能体」开关开启状态，点击切换开关回到直出模式
    switched = page.evaluate(
        """() => {
            for (const b of document.querySelectorAll('button')) {
                const r = b.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                const txt = (b.innerText || '').trim();
                if (txt === '智能体' || txt === 'Agent') {
                    b.click();
                    return true;
                }
            }
            return false;
        }"""
    )
    if switched:
        page.wait_for_timeout(400)
    trig.wait_for(state="visible", timeout=15000)


def _flow_configure(
    page,
    media: str,
    model: str,
    aspect: str,
    count: int,
    resolution: str,
    video_mode: str,
) -> int | None:
    """打开「设置触发器」配置媒体类型、比例、模型、分辨率与数量（默认 x1），返回预计消耗点数。"""
    trig = page.locator('button[aria-label="设置触发器"], button[aria-label*="Settings trigger" i]').first
    trig.click()
    page.wait_for_timeout(400)

    def _click_radio(match_fn, label: str, required: bool = True) -> None:
        radios = page.locator('.cdk-overlay-pane button[role="radio"]')
        for i in range(radios.count()):
            r = radios.nth(i)
            txt = re.sub(r"\s+", " ", (r.inner_text() or "")).strip()
            if match_fn(txt):
                r.click()
                page.wait_for_timeout(250)
                return
        if required:
            raise RuntimeError(f"Google Flow 设置中未找到选项: {label}")

    is_video = media.strip().lower() == "video"
    _click_radio(
        lambda t: ("视频" in t or "video" in t.lower()) if is_video else ("图片" in t or "image" in t.lower()),
        media,
    )

    if is_video and video_mode:
        vm = video_mode.strip().lower()
        if vm in ("frames", "帧"):
            _click_radio(lambda t: "帧" in t or "frame" in t.lower(), video_mode, required=False)
        elif vm in ("ingredients", "素材"):
            _click_radio(lambda t: "素材" in t or "ingredient" in t.lower(), video_mode, required=False)

    if aspect:
        _click_radio(lambda t: aspect in t, aspect, required=False)

    target_model = FLOW_MODEL_ALIASES.get(model.strip().lower(), model.strip()) if model else (
        "Omni 1.2 Flash" if is_video else "Nano Banana 2.1"
    )
    model_btn = page.locator(
        '.cdk-overlay-pane button[aria-label="选择模型系列"], .cdk-overlay-pane button[aria-label*="model" i]'
    ).first
    if model_btn.count() > 0 and target_model.lower() not in (model_btn.inner_text() or "").lower():
        model_btn.click()
        page.wait_for_timeout(350)
        picked = page.evaluate(
            """(targetLower) => {
                const panes = document.querySelectorAll('.cdk-overlay-pane');
                const lastPane = panes[panes.length - 1];
                if (!lastPane) return false;
                for (const el of lastPane.querySelectorAll('[role="menuitem"], [role="option"], button')) {
                    const txt = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                    if (txt.toLowerCase().includes(targetLower)) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }""",
            target_model.lower(),
        )
        if not picked:
            page.keyboard.press("Escape")
            raise RuntimeError(f"Google Flow 未找到模型: {target_model}")
        page.wait_for_timeout(350)

    if is_video and resolution in ("360p", "720p"):
        _click_radio(lambda t: resolution in t, resolution, required=False)

    _click_radio(lambda t: t.strip() == f"x{count}", f"x{count}", required=False)
    page.wait_for_timeout(200)

    pane_txt = (page.locator(".cdk-overlay-pane").last.inner_text() or "") if page.locator(".cdk-overlay-pane").count() > 0 else ""
    cost_m = re.search(r"(\d+)\s*(?:个点数|credits?)", pane_txt, re.IGNORECASE)
    estimated = int(cost_m.group(1)) if cost_m else None

    backdrop = page.locator(".cdk-overlay-backdrop").first
    if backdrop.count() > 0 and backdrop.is_visible():
        backdrop.click()
    else:
        trig.click()
    page.wait_for_timeout(300)
    return estimated


def _flow_collect_media_urls(page) -> list[str]:
    return page.evaluate(
        """() => {
            const urls = [];
            const nodes = document.querySelectorAll(
                'img[src*="flow-content.google"], img[src*="flow.google.com/asb/"], img.image[src], ' +
                'video[src*="flow-content.google"], video[src*="flow.google.com/asb/"], video[src], ' +
                'video source[src*="flow-content.google"], video source[src*="flow.google.com/asb/"], video source[src]'
            );
            for (const el of nodes) {
                const src = el.getAttribute('src') || el.currentSrc || '';
                if (!src || src.startsWith('data:')) continue;
                if (el.tagName === 'IMG') {
                    const isFlowSrc = src.includes('flow-content.google') || src.includes('/asb/');
                    if (el.naturalWidth === 0 || el.naturalHeight === 0) continue;
                    // 排除用户头像等小图标（仅保留大图或 Flow 专属资源路径）
                    if (!isFlowSrc && el.naturalWidth < 256 && el.naturalHeight < 256) continue;
                    if (el.classList && el.classList.contains('gb_2')) continue;
                }
                urls.push(src);
            }
            return Array.from(new Set(urls));
        }"""
    )


def _flow_download_latest(page, media_urls: list[str], download_dir: str, resolution: str, media: str) -> list[str]:
    out_dir = Path(download_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []

    # 图片优先尝试卡片「更多选项 -> 下载 -> 2K/1K」，可触发 2K 高清重塑版本
    if media == "image":
        try:
            tile = page.locator(".tile-row").first
            more = tile.locator('button[aria-label="更多选项"], button[aria-label*="More" i]').first
            if more.count() > 0:
                more.click()
                page.wait_for_timeout(300)
                dl_item = page.locator(
                    '.cdk-overlay-pane [role="menuitem"]:has-text("下载"), '
                    '.cdk-overlay-pane button:has-text("下载"), '
                    '.cdk-overlay-pane [role="menuitem"]:has-text("Download"), '
                    '.cdk-overlay-pane button:has-text("Download")'
                ).first
                if dl_item.count() > 0:
                    dl_item.hover()
                    page.wait_for_timeout(350)
                    tier = "2K" if resolution.upper() == "2K" else "1K"
                    tier_item = page.locator(f'.cdk-overlay-pane button:has-text("{tier}"), .cdk-overlay-pane [role="menuitem"]:has-text("{tier}")').first
                    if tier_item.count() > 0:
                        with page.expect_download(timeout=60000) as dl_info:
                            tier_item.click()
                        dl = dl_info.value
                        p = out_dir / (dl.suggested_filename or f"flow_{int(time.time())}.png")
                        dl.save_as(str(p))
                        saved.append(str(p))
                        return saved
        except Exception:
            backdrop = page.locator(".cdk-overlay-backdrop").first
            if backdrop.count() > 0 and backdrop.is_visible():
                backdrop.click()

    ext = ".mp4" if media == "video" else ".png"
    for idx, url in enumerate(media_urls, 1):
        resp = page.request.get(url, timeout=60000)
        if not resp.ok:
            raise RuntimeError(f"下载 Flow 媒体失败 (HTTP {resp.status}): {url}")
        target = out_dir / f"flow_{media}_{int(time.time())}_{idx}{ext}"
        target.write_bytes(resp.body())
        saved.append(str(target))
    return saved


def execute_flow(
    browser,
    prompt: str,
    media: str = "image",
    model: str = "",
    aspect: str = "16:9",
    count: int = 1,
    resolution: str = "",
    video_mode: str = "",
    project_url: str = "",
    download_dir: str = "",
    async_send: bool = False,
    timeout_sec: int = 240,
    bring_to_front: bool = True,
    _return_handle: bool = False,
) -> dict:
    """在 Google Flow (flow.google.com) 使用独立点数池生成图片（Nano Banana 2.1 为 0 点）或视频（Omni 1.2 Flash / Veo 3.1 - Lite）。"""
    t0 = time.time()
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()

    page = None
    if project_url:
        for p in ctx.pages:
            if project_url in (p.url or ""):
                page = p
                if bring_to_front:
                    page.bring_to_front()
                break
        if page is None:
            page = ctx.new_page()
            if bring_to_front:
                page.bring_to_front()
            page.goto(project_url, wait_until="domcontentloaded", timeout=30000)
    else:
        page = ctx.new_page()
        if bring_to_front:
            page.bring_to_front()
        page.goto("https://flow.google.com/", wait_until="domcontentloaded", timeout=30000)
        new_proj = page.locator('button:has-text("新建项目"), button:has-text("New project")').first
        new_proj.wait_for(state="visible", timeout=25000)
        new_proj.click()
        page.wait_for_url(re.compile(r".*/project/.*"), timeout=25000)

    box = page.locator('div.ProseMirror[aria-label="您希望创作什么？"], div.ProseMirror[role="textbox"]').first
    box.wait_for(state="visible", timeout=25000)
    _human_pause(page, 1000, 1700)

    _flow_ensure_direct_mode(page)
    estimated_credits = _flow_configure(
        page,
        media=media,
        model=model,
        aspect=aspect,
        count=count,
        resolution=resolution,
        video_mode=video_mode,
    )

    before_urls = set(_flow_collect_media_urls(page))
    box = page.locator('div.ProseMirror[aria-label="您希望创作什么？"], div.ProseMirror[role="textbox"]').first
    _human_fill(page, box, prompt)

    gen_btn = page.locator('button[aria-label="开始生成"], button.generate-icon-button').first
    gen_btn.wait_for(state="visible", timeout=10000)
    gen_btn.click()

    if async_send:
        page.wait_for_timeout(1500)
        out = {
            "status": "dispatched",
            "entry": "flow",
            "media": media,
            "estimated_credits": estimated_credits,
            "project_url": page.url,
            "url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }
        if _return_handle:
            out["_page"] = page
            out["_before_urls"] = before_urls
        return out

    deadline = time.time() + timeout_sec
    new_urls: list[str] = []
    while time.time() < deadline:
        cur_urls = _flow_collect_media_urls(page)
        new_urls = [u for u in cur_urls if u not in before_urls]
        if new_urls:
            break
        page.wait_for_timeout(1000)
    else:
        raise TimeoutError(f"等待 Google Flow 生成{media}超时。")

    saved_files = (
        _flow_download_latest(page, new_urls, download_dir=download_dir, resolution=resolution, media=media)
        if download_dir
        else []
    )
    return {
        "status": "ok",
        "entry": "flow",
        "media": media,
        "estimated_credits": estimated_credits,
        "project_url": page.url,
        "media_urls": new_urls,
        "saved_files": saved_files,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def _unpack_json_from_text(text: str, dest_dir: Path | str) -> list[str]:
    """从模型回复正文提取 {相对路径: 文件内容} JSON 对象并安全解包落盘，省去手动下载 Blob。"""
    raw = (text or "").strip()
    if not raw:
        return []
    candidates: list[str] = []
    # 1. 优先提取 fenced ```json ... ``` 代码块（从后往前找最完整的一个）
    for m in reversed(list(re.finditer(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw, re.IGNORECASE))):
        candidates.append(m.group(1).strip())
    # 2. 兜底提取最外层 { ... }
    first_b = raw.find("{")
    last_b = raw.rfind("}")
    if first_b != -1 and last_b > first_b:
        candidates.append(raw[first_b : last_b + 1].strip())

    parsed_obj = None
    for cand in candidates:
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict) and obj and all(isinstance(k, str) and isinstance(v, str) for k, v in obj.items()):
                parsed_obj = obj
                break
        except Exception:
            continue

    if not parsed_obj:
        return []

    base_dir = Path(dest_dir).expanduser().resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for rel_path, content in parsed_obj.items():
        if not rel_path.strip():
            continue
        target = _safe_rel_dest(base_dir, rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        written.append(str(target))
    return written


def _is_concrete_session_url(url: str) -> bool:
    """判断 URL 是否是具体会话/项目页（非空白首页/new_chat），可作为通道 B 的独立标签页证据。"""
    u = (url or "").strip()
    if not u.startswith("https://"):
        return False
    if re.search(r"aistudio\.google\.com/(?:app/)?prompts/(?!new_chat\b)[^/?#]+", u):
        return True
    if re.search(r"aistudio\.google\.com/(?:app/)?(?:new_music|generate-speech|apps/[^/?#]+)", u):
        return True
    if re.search(r"gemini\.google\.com/app/[^/?#]+", u):
        return True
    if re.search(r"flow\.google\.com/(?:[^/]+/)?project/[^/?#]+", u):
        return True
    return False


def _roster_lookup_role(roster_file: str, role: str) -> dict:
    """读取 .web-team.json 中指定角色的已有记录（不存在返回空字典）。"""
    r_key = (role or "").strip()
    if not r_key:
        return {}
    path = Path(roster_file or ".web-team.json").expanduser().resolve()
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        roster = loaded.get("roster") if isinstance(loaded, dict) else {}
        info = roster.get(r_key) if isinstance(roster, dict) else {}
        return dict(info) if isinstance(info, dict) else {}
    except Exception:
        return {}


def _resolve_task_path(raw: str, base_dir: Path) -> str:
    if not (raw or "").strip():
        return ""
    p = Path(raw).expanduser()
    return str(p.resolve() if p.is_absolute() else (base_dir / p).resolve())


def execute_wave(
    browser,
    tasks: list[dict],
    roster_file: str = ".web-team.json",
    project: str = "",
    project_dir: str = ".",
    timeout_sec: int = 360,
    poll_interval_sec: float = 1.5,
    stagger_sec: float = 3.5,
) -> dict:
    """
    高速并发波次引擎：单次调用内将多个员工任务并发发射至独立标签页，
    然后在 Python 进程内后台静默轮询全部完成、自动落盘/解包 JSON 并回写 .web-team.json。
    """
    t0 = time.time()
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("wave 任务列表 tasks 不能为空。")

    base_dir = Path(project_dir or ".").expanduser().resolve()
    roster_path = _resolve_task_path(roster_file or ".web-team.json", base_dir)

    seen_roles: set[str] = set()
    for idx, task in enumerate(tasks):
        if not isinstance(task, dict):
            raise ValueError(f"wave 第 {idx + 1} 项任务必须是 JSON 对象。")
        r_name = str(task.get("role") or f"worker_{idx + 1}").strip()
        if r_name in seen_roles:
            raise ValueError(f"wave 中存在重复角色 '{r_name}'，同一波次内每个角色只能出现一次。")
        seen_roles.add(r_name)

    pending: list[dict] = []
    results: list[dict] = []

    # 阶段 1：极速并发发射所有员工任务（每个角色严格绑定独立标签页）
    for idx, raw_task in enumerate(tasks):
        task = dict(raw_task)
        role = str(task.get("role") or f"worker_{idx + 1}").strip()
        site = str(task.get("site") or "aistudio").strip().lower()
        model = str(task.get("model") or "").strip()
        prompt = str(task.get("prompt") or "")
        prompt_file = str(task.get("prompt_file") or "").strip()
        if not prompt and prompt_file:
            pf = Path(_resolve_task_path(prompt_file, base_dir))
            prompt = pf.read_text(encoding="utf-8")
        if not prompt and site != "build":
            results.append({"role": role, "site": site, "status": "error", "error": "缺少 prompt 或 prompt_file"})
            continue

        existing_role = _roster_lookup_role(roster_path, role)
        role_url = str(task.get("tab_url_hint") or task.get("project_url") or existing_role.get("url") or "").strip()
        # 角色尚无专属会话 URL 时强制开独立新标签页，杜绝串页污染
        force_new_tab = not bool(role_url) or bool(task.get("new_tab"))
        files_resolved = [_resolve_task_path(f, base_dir) for f in (task.get("files") or []) if str(f).strip()]
        sys_file_resolved = _resolve_task_path(str(task.get("system_file") or ""), base_dir)
        out_file_resolved = _resolve_task_path(str(task.get("out_file") or ""), base_dir)
        download_dir_resolved = _resolve_task_path(str(task.get("download_dir") or ""), base_dir)
        unpack_dir_resolved = _resolve_task_path(str(task.get("unpack_json_dir") or ""), base_dir)
        folder_resolved = _resolve_task_path(str(task.get("folder") or task.get("code_folder") or ""), base_dir)
        github_repo = str(task.get("github") or task.get("github_repo") or "").strip()
        title_str = str(task.get("title") or "").strip()
        thinking_level = str(task.get("thinking_level") or "high").strip()

        try:
            if site in ("aistudio", "playground", "lyria", "tts"):
                eff_model = model or ("lyria" if site == "lyria" else ("tts" if site == "tts" else "neon"))
                dispatched = execute_playground(
                    browser,
                    prompt=prompt,
                    model=eff_model,
                    system_instruction=str(task.get("system") or task.get("system_instruction") or ""),
                    system_file=sys_file_resolved,
                    files=files_resolved or None,
                    new_tab=force_new_tab,
                    tab_url_hint="" if force_new_tab else role_url,
                    async_send=True,
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    download_dir=download_dir_resolved,
                    thinking_level=thinking_level,
                    max_output=not bool(task.get("no_max_output")),
                    include_thoughts=bool(task.get("include_thoughts")),
                    title=title_str,
                    bring_to_front=True,
                    _return_handle=True,
                )
            elif site in ("gemini_task", "gemini", "gemini_chat", "task", "chat"):
                eff_entry = "chat" if site in ("gemini_chat", "chat") else str(task.get("entry") or "task")
                dispatched = execute_ask(
                    browser,
                    prompt=prompt,
                    entry=eff_entry,
                    model=model or ("hydrogen" if force_new_tab else ""),
                    tool=task.get("tool"),
                    thinking=task.get("thinking"),
                    new_tab=force_new_tab,
                    tab_url_hint="" if force_new_tab else role_url,
                    async_send=True,
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    files=files_resolved or None,
                    code_folder=folder_resolved,
                    github_repo=github_repo,
                    bring_to_front=True,
                    _return_handle=True,
                )
            elif site == "flow":
                dispatched = execute_flow(
                    browser,
                    prompt=prompt,
                    media=str(task.get("media") or "image"),
                    model=model or "Nano Banana 2.1",
                    aspect=str(task.get("aspect") or "16:9"),
                    count=int(task.get("count") or 1),
                    resolution=str(task.get("resolution") or ""),
                    video_mode=str(task.get("video_mode") or ""),
                    project_url="" if force_new_tab else role_url,
                    download_dir=download_dir_resolved,
                    async_send=True,
                    timeout_sec=int(task.get("timeout_sec") or timeout_sec),
                    bring_to_front=True,
                    _return_handle=True,
                )
            elif site == "build":
                # Build 涉及整站生成与 ZIP 下载，保持独立同步调用或异步发射
                res_b = execute_build(
                    browser,
                    prompt=prompt,
                    app_url=str(task.get("app_url") or role_url),
                    mode=str(task.get("mode") or "max"),
                    model=model or "neon",
                    framework=str(task.get("framework") or ""),
                    download_dir=download_dir_resolved,
                    extract=bool(task.get("extract", True)),
                    async_send=bool(task.get("async_send", False)),
                    timeout_sec=int(task.get("timeout_sec") or max(timeout_sec, 300)),
                )
                execute_roster(
                    action="set",
                    roster_file=roster_path,
                    role=role,
                    title=title_str or str(task.get("role_title") or ""),
                    site="build",
                    model=model or "neon",
                    url=str(res_b.get("app_url") or ""),
                    duty=str(task.get("duty") or ""),
                    status="done" if res_b.get("status") == "ok" else "running",
                    project=project,
                )
                results.append({"role": role, "site": "build", **res_b})
                continue
            else:
                raise ValueError(f"wave 不支持的站点类型: {site}")

            page_obj = dispatched.pop("_page", None)
            dispatched_url = str(dispatched.get("url") or dispatched.get("project_url") or "")
            drive_id = str(dispatched.get("drive_file_id") or _extract_aistudio_drive_id(dispatched_url) or "")
            execute_roster(
                action="set",
                roster_file=roster_path,
                role=role,
                title=title_str or str(task.get("role_title") or ""),
                site=site,
                model=str(dispatched.get("model") or model),
                thinking_level=thinking_level if site in ("aistudio", "playground") else "",
                url=dispatched_url,
                drive_file_id=drive_id,
                duty=str(task.get("duty") or ""),
                status="running",
                project=project,
            )
            pending.append({
                "role": role,
                "site": site,
                "entry": str(dispatched.get("entry") or site),
                "model": str(dispatched.get("model") or model),
                "page": page_obj,
                "url": dispatched_url,
                "drive_file_id": drive_id,
                "title": title_str,
                "before_turns": dispatched.get("_before_turns", 0),
                "before_count": dispatched.get("_before_count", 0),
                "before_urls": dispatched.get("_before_urls", set()),
                "out_file": out_file_resolved,
                "download_dir": download_dir_resolved,
                "unpack_json_dir": unpack_dir_resolved,
                "save_as": str(task.get("save_as") or "").strip(),
                "media": str(task.get("media") or "image"),
                "resolution": str(task.get("resolution") or ""),
                "include_thoughts": bool(task.get("include_thoughts")),
                "started_at": time.time(),
                "stable_ticks": 0,
                "last_text": "",
                "last_change_at": time.time(),
                "has_started": False,
            })
            # 错峰拟人节流：派完一个 Tab 后保留随机人手切换停顿，避免瞬间连点多站触发风控
            if idx < len(tasks) - 1 and float(stagger_sec) > 0:
                time.sleep(float(stagger_sec) * random.uniform(0.85, 1.35))
        except Exception as exc:
            execute_roster(
                action="set",
                roster_file=roster_path,
                role=role,
                site=site,
                model=model,
                status="failed",
                project=project,
            )
            results.append({"role": role, "site": site, "status": "error", "error": str(exc)})

    # 阶段 2：单线程后台静默轮询全部待回收标签页（不抢焦点、零 LLM 往返）
    deadline = time.time() + max(30, int(timeout_sec))
    while pending and time.time() < deadline:
        still_pending: list[dict] = []
        for item in pending:
            page = item["page"]
            entry = item["entry"]
            role = item["role"]
            try:
                if page is None or page.is_closed():
                    raise RuntimeError("目标标签页已关闭")

                if entry == "aistudio-playground":
                    running = _aistudio_playground_is_running(page)
                    turn_count = page.locator("ms-chat-turn").count()
                    if running or turn_count > item["before_turns"]:
                        item["has_started"] = True
                    if item["has_started"] and not running:
                        turn_err = _aistudio_extract_turn_error(page, min_turns=item["before_turns"])
                        if turn_err:
                            raise RuntimeError(f"AI Studio 返回错误: {turn_err}")
                    has_output = _aistudio_has_final_output(page, min_turns=item["before_turns"])
                    announcer = page.locator(".cdk-live-announcer-element")
                    announcer_txt = (announcer.first.inner_text() or "") if announcer.count() > 0 else ""
                    cur_sig = _aistudio_output_signature(page)
                    done_now = False
                    if item["has_started"] and not running and has_output and cur_sig == item.get("last_sig"):
                        item["stable_ticks"] += 1
                        need_ticks = 2 if "response ready" in announcer_txt.lower() else 3
                        if item["stable_ticks"] >= need_ticks:
                            done_now = True
                    else:
                        item["stable_ticks"] = 0
                    item["last_sig"] = cur_sig

                    if not done_now:
                        still_pending.append(item)
                        continue

                    extracted = _aistudio_extract_playground_result(page, download_dir=item["download_dir"])
                    _aistudio_wait_saved_url(page, timeout_sec=5.0)
                    if item["title"]:
                        _aistudio_set_prompt_title(page, item["title"])
                    final_url = page.url or item["url"]
                    drive_id = _extract_aistudio_drive_id(final_url) or item["drive_file_id"]
                    text_body = extracted.get("text", "") or ""
                    rec: dict = {
                        "role": role,
                        "site": item["site"],
                        "entry": entry,
                        "status": "ok",
                        "model": item["model"],
                        "url": final_url,
                        "drive_file_id": drive_id or None,
                        "title": item["title"] or None,
                        "text_chars": len(text_body),
                        "saved_files": extracted.get("saved_files", []),
                        "elapsed_sec": round(time.time() - item["started_at"], 2),
                    }
                    if item["out_file"]:
                        p_out = Path(item["out_file"])
                        p_out.parent.mkdir(parents=True, exist_ok=True)
                        p_out.write_text(text_body, encoding="utf-8")
                        rec["saved_text_file"] = str(p_out)
                    if item["unpack_json_dir"]:
                        rec["unpacked_files"] = _unpack_json_from_text(text_body, item["unpack_json_dir"])
                    if not item["out_file"] and not rec.get("unpacked_files"):
                        rec["text_preview"] = text_body[:600]
                    execute_roster(
                        action="set",
                        roster_file=roster_path,
                        role=role,
                        url=final_url,
                        drive_file_id=drive_id,
                        status="done",
                        project=project,
                    )
                    results.append(rec)

                elif entry in ("aistudio-music", "aistudio-tts"):
                    audios = page.locator('audio[src^="data:audio/"]')
                    composing = entry == "aistudio-music" and page.locator('button:has-text("Stop composing")').count() > 0
                    if audios.count() <= item["before_count"] or composing:
                        still_pending.append(item)
                        continue
                    audio_info = page.evaluate(
                        """() => {
                            const list = Array.from(document.querySelectorAll('audio[src^="data:audio/"]'));
                            const last = list[list.length - 1];
                            return last ? { src: last.src, duration: last.duration || null } : null;
                        }"""
                    )
                    saved_files: list[str] = []
                    if item["download_dir"] and audio_info and audio_info.get("src"):
                        default_ext = ".mp3" if entry == "aistudio-music" else ".wav"
                        prefix = item["save_as"] or (f"{role}_audio")
                        out_p = _save_data_url(audio_info["src"], Path(item["download_dir"]).resolve(), Path(prefix).stem, Path(prefix).suffix or default_ext)
                        if item["save_as"]:
                            final_p = Path(item["download_dir"]).resolve() / item["save_as"]
                            if final_p != Path(out_p):
                                shutil.move(out_p, str(final_p))
                                out_p = str(final_p)
                        saved_files.append(out_p)
                    final_url = page.url or item["url"]
                    execute_roster(action="set", roster_file=roster_path, role=role, url=final_url, status="done", project=project)
                    results.append({
                        "role": role,
                        "site": item["site"],
                        "entry": entry,
                        "status": "ok",
                        "model": item["model"],
                        "url": final_url,
                        "duration_sec": audio_info.get("duration") if audio_info else None,
                        "saved_files": saved_files,
                        "elapsed_sec": round(time.time() - item["started_at"], 2),
                    })

                elif entry == "flow":
                    cur_urls = _flow_collect_media_urls(page)
                    new_urls = [u for u in cur_urls if u not in item["before_urls"]]
                    if not new_urls:
                        still_pending.append(item)
                        continue
                    saved_files = (
                        _flow_download_latest(
                            page,
                            new_urls,
                            download_dir=item["download_dir"],
                            resolution=item["resolution"],
                            media=item["media"],
                        )
                        if item["download_dir"]
                        else []
                    )
                    if item["save_as"] and len(saved_files) == 1:
                        src_f = Path(saved_files[0])
                        dst_f = src_f.parent / item["save_as"]
                        if dst_f != src_f:
                            shutil.move(str(src_f), str(dst_f))
                            saved_files = [str(dst_f)]
                    final_url = page.url or item["url"]
                    execute_roster(action="set", roster_file=roster_path, role=role, url=final_url, status="done", project=project)
                    results.append({
                        "role": role,
                        "site": "flow",
                        "entry": "flow",
                        "status": "ok",
                        "model": item["model"],
                        "url": final_url,
                        "media_urls": new_urls,
                        "saved_files": saved_files,
                        "elapsed_sec": round(time.time() - item["started_at"], 2),
                    })

                else:
                    # Gemini Web (task / chat)
                    if page.locator("model-response").count() <= item["before_count"]:
                        still_pending.append(item)
                        continue
                    st = page.evaluate(DOM_STATUS_EVAL_JS)
                    running = bool(st.get("running", False))
                    text_body = st.get("text") or st.get("answer") or ""
                    if text_body != item["last_text"]:
                        item["last_text"] = text_body
                        item["last_change_at"] = time.time()
                    has_payload = bool(text_body) or bool(st.get("images") or [])
                    done_now = False
                    if not running and has_payload:
                        item["stable_ticks"] += 1
                        if item["stable_ticks"] >= 2:
                            done_now = True
                    elif running and has_payload and st.get("hasActionToolbar") and (time.time() - item["last_change_at"]) >= 15.0:
                        done_now = True
                    else:
                        item["stable_ticks"] = 0

                    if not done_now:
                        still_pending.append(item)
                        continue

                    final_url = st.get("url") or page.url or item["url"]
                    rec = {
                        "role": role,
                        "site": item["site"],
                        "entry": entry,
                        "status": "ok",
                        "model": st.get("model") or item["model"],
                        "url": final_url,
                        "text_chars": len(text_body),
                        "waiting_for_user": st.get("waiting_for_user") or "",
                        "elapsed_sec": round(time.time() - item["started_at"], 2),
                    }
                    if item["out_file"]:
                        p_out = Path(item["out_file"])
                        p_out.parent.mkdir(parents=True, exist_ok=True)
                        p_out.write_text(text_body, encoding="utf-8")
                        rec["saved_text_file"] = str(p_out)
                    if item["unpack_json_dir"]:
                        rec["unpacked_files"] = _unpack_json_from_text(text_body, item["unpack_json_dir"])
                    if not item["out_file"] and not rec.get("unpacked_files"):
                        rec["text_preview"] = text_body[:600]
                    execute_roster(action="set", roster_file=roster_path, role=role, url=final_url, status="done", project=project)
                    results.append(rec)
            except Exception as exc:
                execute_roster(action="set", roster_file=roster_path, role=role, status="failed", project=project)
                results.append({"role": role, "site": item["site"], "status": "error", "error": str(exc)})

        pending = still_pending
        if pending:
            time.sleep(max(0.4, float(poll_interval_sec)))

    for item in pending:
        execute_roster(action="set", roster_file=roster_path, role=item["role"], status="timeout", project=project)
        results.append({
            "role": item["role"],
            "site": item["site"],
            "status": "timeout",
            "url": item["url"],
            "error": f"等待超过 {timeout_sec}s 未完成（标签页仍在后台运行，可稍后用 fetch 或同 role 续查）",
        })

    ok_count = sum(1 for r in results if r.get("status") == "ok")
    return {
        "status": "ok" if ok_count == len(results) else ("partial" if ok_count > 0 else "failed"),
        "entry": "wave",
        "project": project,
        "roster_file": roster_path,
        "total": len(results),
        "succeeded": ok_count,
        "failed": len(results) - ok_count,
        "results": results,
        "elapsed_sec": round(time.time() - t0, 2),
    }


def run_daemon(port_override: int | None = None, bind_port: int = DAEMON_PORT) -> None:
    """单线程持有 Playwright CDP 连接，通过本地 HTTP 提供极速转发服务。"""
    ws_url = get_cdp_ws_url(port_override)
    task_q: queue.Queue = queue.Queue()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def _send_json(self, code: int, payload: dict):
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == "/health":
                self._send_json(200, {"status": "ok", "ws_url": ws_url})
                return
            self._send_json(404, {"error": "not found"})

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            done = threading.Event()
            box: dict = {}
            task_q.put((self.path, body, done, box))
            done.wait(timeout=body.get("timeout_sec", 180) + 30)
            if "error" in box:
                self._send_json(500, box)
            elif "result" in box:
                self._send_json(200, box["result"])
            else:
                self._send_json(504, {"error": "daemon task timeout"})

    class ReusableTCPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        allow_reuse_address = True

    with _get_sync_playwright()() as p:
        print(f"[daemon] 正在连接外部 Chrome CDP: {ws_url}", flush=True)
        browser = p.chromium.connect_over_cdp(ws_url, timeout=60000)
        server = ReusableTCPServer((DAEMON_HOST, bind_port), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f"[daemon] 已就绪，监听 http://{DAEMON_HOST}:{bind_port}", flush=True)

        last_active = time.time()
        while True:
            try:
                path, body, done, box = task_q.get(timeout=1.0)
                last_active = time.time()
            except queue.Empty:
                if not browser.is_connected():
                    break
                if (time.time() - last_active) > 600:
                    print("[daemon] 空闲超过 10 分钟，自动退出释放资源", flush=True)
                    break
                continue
            try:
                if path == "/ask":
                    box["result"] = execute_ask(
                        browser,
                        prompt=body["prompt"],
                        entry=body.get("entry", ""),
                        model=body.get("model", ""),
                        tool=body.get("tool"),
                        thinking=body.get("thinking"),
                        new_tab=body.get("new_tab", False),
                        tab_url_hint=body.get("tab_url_hint", ""),
                        async_send=body.get("async_send", False),
                        timeout_sec=body.get("timeout_sec", 180),
                        files=body.get("files"),
                        code_folder=body.get("code_folder", ""),
                        github_repo=body.get("github_repo", ""),
                    )
                elif path == "/fetch":
                    box["result"] = execute_fetch(browser, tab_url_hint=body.get("tab_url_hint", ""))
                elif path == "/usage":
                    box["result"] = execute_usage(browser)
                elif path == "/playground":
                    box["result"] = execute_playground(
                        browser,
                        prompt=body["prompt"],
                        model=body.get("model", ""),
                        system_instruction=body.get("system_instruction", ""),
                        system_file=body.get("system_file", ""),
                        files=body.get("files"),
                        new_tab=body.get("new_tab", False),
                        tab_url_hint=body.get("tab_url_hint", ""),
                        async_send=body.get("async_send", False),
                        timeout_sec=body.get("timeout_sec", 180),
                        download_dir=body.get("download_dir", ""),
                        thinking_level=body.get("thinking_level", "max"),
                        max_output=body.get("max_output", True),
                        include_thoughts=body.get("include_thoughts", False),
                        title=body.get("title", ""),
                    )
                elif path == "/wave":
                    box["result"] = execute_wave(
                        browser,
                        tasks=body["tasks"],
                        roster_file=body.get("roster_file", ".web-team.json"),
                        project=body.get("project", ""),
                        project_dir=body.get("project_dir", "."),
                        timeout_sec=body.get("timeout_sec", 360),
                        poll_interval_sec=body.get("poll_interval_sec", 1.5),
                        stagger_sec=body.get("stagger_sec", 3.5),
                    )
                elif path == "/attach":
                    box["result"] = execute_attach(
                        browser,
                        files=body["files"],
                        site=body.get("site", "auto"),
                        tab_url_hint=body.get("tab_url_hint", ""),
                    )
                elif path == "/build":
                    box["result"] = execute_build(
                        browser,
                        prompt=body.get("prompt", ""),
                        app_url=body.get("app_url", ""),
                        mode=body.get("mode", "max"),
                        model=body.get("model", "neon"),
                        framework=body.get("framework", ""),
                        download_dir=body.get("download_dir", ""),
                        extract=body.get("extract", False),
                        async_send=body.get("async_send", False),
                        timeout_sec=body.get("timeout_sec", 300),
                    )
                elif path == "/flow-usage":
                    box["result"] = execute_flow_usage(browser)
                elif path == "/flow":
                    box["result"] = execute_flow(
                        browser,
                        prompt=body["prompt"],
                        media=body.get("media", "image"),
                        model=body.get("model", ""),
                        aspect=body.get("aspect", "16:9"),
                        count=body.get("count", 1),
                        resolution=body.get("resolution", ""),
                        video_mode=body.get("video_mode", ""),
                        project_url=body.get("project_url", ""),
                        download_dir=body.get("download_dir", ""),
                        async_send=body.get("async_send", False),
                        timeout_sec=body.get("timeout_sec", 240),
                    )
                else:
                    box["error"] = f"未知路径: {path}"
            except Exception as e:
                box["error"] = str(e)
            finally:
                done.set()


def call_daemon(path: str, payload: dict, bind_port: int = DAEMON_PORT) -> dict | None:
    """绕过代理直连本地 daemon；daemon 未运行返回 None。"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        f"http://{DAEMON_HOST}:{bind_port}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with opener.open(req, timeout=payload.get("timeout_sec", 180) + 35) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"daemon 返回错误 ({e.code}): {detail}") from e
    except urllib.error.URLError:
        return None


def _exec_cdp(port: int | None, path: str, payload: dict, local_fn) -> dict:
    """优先转发给本地常驻 daemon；未运行则直连 CDP 执行（超时 5000ms 快速失败）。"""
    res = call_daemon(path, payload)
    if res is not None:
        return res
    ws_url = get_cdp_ws_url(port)
    with _get_sync_playwright()() as p:
        browser = p.chromium.connect_over_cdp(ws_url, timeout=5000)
        return local_fn(browser)


def _default_downloads_dir() -> Path:
    """跨平台定位用户默认下载目录。"""
    return Path.home() / "Downloads"


def _safe_rel_dest(base_dir: Path, rel_path: str) -> Path:
    """防止解包 JSON 时发生路径穿越。"""
    cleaned = rel_path.replace("\\", "/").lstrip("/")
    target = (base_dir / cleaned).resolve()
    base_resolved = base_dir.resolve()
    if target != base_resolved and base_resolved not in target.parents:
        raise ValueError(f"非法解包目标路径（禁止越出目标目录）: {rel_path}")
    return target


def execute_harvest(
    pattern: str = "*",
    dest: str = ".",
    src_dir: str = "",
    since_min: float = 30.0,
    unpack_json: bool = False,
    copy_only: bool = False,
) -> dict:
    """免本地 AI 上下文直接收割 Chrome 下载目录中的网页产物到工程目录，支持单个 JSON Blob 包拆包。"""
    t0 = time.time()
    src = Path(src_dir).expanduser().resolve() if src_dir else _default_downloads_dir().resolve()
    if not src.is_dir():
        raise FileNotFoundError(f"下载源目录不存在: {src}")
    dst = Path(dest).expanduser().resolve()
    dst.mkdir(parents=True, exist_ok=True)

    patterns = [p.strip() for p in (pattern or "*").split(",") if p.strip()] or ["*"]
    cutoff = time.time() - max(0.0, since_min) * 60.0 if since_min > 0 else 0.0

    matched: list[Path] = []
    for entry in sorted(src.iterdir(), key=lambda p: p.stat().st_mtime if p.exists() else 0):
        if not entry.is_file():
            continue
        if entry.name.endswith((".crdownload", ".tmp", ".part")):
            continue
        if cutoff and entry.stat().st_mtime < cutoff:
            continue
        if any(fnmatch.fnmatch(entry.name.lower(), pat.lower()) for pat in patterns):
            matched.append(entry)

    saved_files: list[str] = []
    unpacked_files: list[str] = []
    for src_file in matched:
        if unpack_json and src_file.suffix.lower() == ".json":
            bundle = json.loads(src_file.read_text(encoding="utf-8"))
            if not isinstance(bundle, dict):
                raise ValueError(f"JSON 包顶层必须为 {{相对路径: 内容}} 对象: {src_file.name}")
            for rel_name, content in bundle.items():
                out_path = _safe_rel_dest(dst, str(rel_name))
                out_path.parent.mkdir(parents=True, exist_ok=True)
                text_val = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False, indent=2)
                out_path.write_text(text_val, encoding="utf-8")
                unpacked_files.append(str(out_path))
            if not copy_only:
                src_file.unlink()
        else:
            target_file = dst / src_file.name
            if copy_only:
                shutil.copy2(src_file, target_file)
            else:
                shutil.move(str(src_file), str(target_file))
            saved_files.append(str(target_file))

    all_out = unpacked_files + saved_files
    return {
        "status": "ok" if all_out else "empty",
        "entry": "harvest",
        "src_dir": str(src),
        "dest_dir": str(dst),
        "matched_count": len(matched),
        "saved_files": all_out,
        "elapsed_sec": round(time.time() - t0, 2),
    }


DEFAULT_PLAYBOOKS_DIR = Path(__file__).resolve().parent.parent / "references" / "playbooks"
_SLUG_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_playbook_slug(name: str) -> str:
    """校验编队卡名称仅允许字母/数字/下划线/连字符，严防路径穿越。"""
    raw = (name or "").strip()
    if raw.lower().endswith(".md"):
        raw = raw[:-3]
    if not raw or not _SLUG_RE.match(raw):
        raise ValueError(f"非法编队卡名称（仅支持 [a-zA-Z0-9_-]）: {name!r}")
    return raw


_AUDIT_IGNORE_DIRS = frozenset({".git", ".venv", "venv", "node_modules", "__pycache__"})
_ASSET_REF_RE = re.compile(
    r"""['"]((?:\./)?assets/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg|mp3|wav|ogg))['"]"""
)
_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
_AUDIO_EXTS = frozenset({".mp3", ".wav", ".ogg"})
_CODE_EXTS = frozenset({".html", ".htm", ".js", ".mjs", ".ts", ".css"})


def execute_roster(
    action: str = "list",
    roster_file: str = ".web-team.json",
    role: str = "",
    title: str = "",
    site: str = "",
    model: str = "",
    thinking_level: str = "",
    tab_id: str = "",
    url: str = "",
    drive_file_id: str = "",
    duty: str = "",
    status: str = "",
    project: str = "",
    project_dir: str = ".",
    min_roles: int = 2,
) -> dict:
    """管理项目根目录 `.web-team.json` 一页一员工花名册（含双通道跨角色 tab_id/url 冲突拦截与交付审计门禁）。"""
    path = Path(roster_file or ".web-team.json").expanduser().resolve()
    data: dict = {"project": "", "updated_at": "", "roster": {}}
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data["project"] = str(loaded.get("project") or "")
                data["updated_at"] = str(loaded.get("updated_at") or "")
                if isinstance(loaded.get("roster"), dict):
                    data["roster"] = loaded["roster"]
        except Exception:
            pass

    if action == "list":
        return {
            "status": "ok",
            "entry": "roster",
            "action": "list",
            "file": str(path),
            "project": data["project"],
            "count": len(data["roster"]),
            "roster": data["roster"],
        }

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S")
    if action == "set":
        r_key = (role or "").strip()
        if not r_key:
            raise ValueError("roster set 必须提供 --role")
        entry = dict(data["roster"].get(r_key) or {})
        if title:
            entry["title"] = title.strip()
        if site:
            entry["site"] = site.strip()
        if model:
            entry["model"] = model.strip()
        if thinking_level:
            entry["thinking_level"] = thinking_level.strip()
        if tab_id:
            parsed_tab_id = int(tab_id) if str(tab_id).strip().isdigit() else str(tab_id).strip()
            for other_role, other_info in data["roster"].items():
                if other_role != r_key and isinstance(other_info, dict) and other_info.get("tab_id") == parsed_tab_id:
                    raise ValueError(
                        f"ROLE_TAB_CONFLICT: tab_id={parsed_tab_id} 已绑定给角色 '{other_role}'，"
                        f"严禁多个角色共用同一个标签页！请先调用 tab_new 为 '{r_key}' 创建新标签页。"
                    )
            entry["tab_id"] = parsed_tab_id
        if url:
            clean_url = url.strip()
            if _is_concrete_session_url(clean_url):
                for other_role, other_info in data["roster"].items():
                    if other_role != r_key and isinstance(other_info, dict) and str(other_info.get("url") or "").strip() == clean_url:
                        raise ValueError(
                            f"ROLE_URL_CONFLICT: 会话 URL={clean_url} 已绑定给角色 '{other_role}'，"
                            f"严禁多个角色共用同一会话！请为 '{r_key}' 新开独立标签页。"
                        )
            entry["url"] = clean_url
            auto_drive = _extract_aistudio_drive_id(clean_url)
            if auto_drive and not drive_file_id:
                entry["drive_file_id"] = auto_drive
        if drive_file_id:
            entry["drive_file_id"] = drive_file_id.strip()
        if duty:
            entry["duty"] = duty.strip()
        if status:
            entry["status"] = status.strip()
        elif "status" not in entry:
            entry["status"] = "ready"
        entry["updated_at"] = now_iso
        data["roster"][r_key] = entry
        if project:
            data["project"] = project.strip()
        data["updated_at"] = now_iso
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {
            "status": "ok",
            "entry": "roster",
            "action": "set",
            "file": str(path),
            "project": data["project"],
            "role": r_key,
            "count": len(data["roster"]),
            "roster": data["roster"],
        }

    if action == "remove":
        r_key = (role or "").strip()
        if not r_key:
            raise ValueError("roster remove 必须提供 --role")
        removed = data["roster"].pop(r_key, None)
        data["updated_at"] = now_iso
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {
            "status": "ok" if removed is not None else "not_found",
            "entry": "roster",
            "action": "remove",
            "file": str(path),
            "role": r_key,
            "count": len(data["roster"]),
            "roster": data["roster"],
        }

    if action == "clear":
        data["roster"] = {}
        data["updated_at"] = now_iso
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {
            "status": "ok",
            "entry": "roster",
            "action": "clear",
            "file": str(path),
            "count": 0,
            "roster": {},
        }

    if action == "audit":
        p_dir = Path(project_dir or ".").expanduser().resolve()
        roster = data["roster"]
        errors: list[str] = []

        if len(roster) < max(1, int(min_roles)):
            errors.append(
                f"INSUFFICIENT_ROLES: 当前仅登记 {len(roster)} 个角色，多员工协作至少需 {int(min_roles)} 个独立角色"
            )

        seen_tabs: dict[str, str] = {}
        seen_urls: dict[str, str] = {}
        has_image_role = False
        has_audio_role = False
        for r_name, info in roster.items():
            if not isinstance(info, dict):
                continue
            tid = info.get("tab_id")
            r_url = str(info.get("url") or "").strip()
            has_tid = tid not in (None, "")
            has_concrete_url = _is_concrete_session_url(r_url)

            if not has_tid and not has_concrete_url:
                errors.append(
                    f"MISSING_TAB_OR_URL: 角色 '{r_name}' 缺少 tab_id（通道 A）且缺少独立会话 url（通道 B），未确认实际开启独立 Chrome 标签页"
                )
            if has_tid:
                tid_key = str(tid)
                if tid_key in seen_tabs:
                    errors.append(
                        f"DUPLICATE_TAB_ID: 角色 '{r_name}' 与 '{seen_tabs[tid_key]}' 违规共用同一 tab_id={tid_key}"
                    )
                else:
                    seen_tabs[tid_key] = r_name
            if has_concrete_url:
                if r_url in seen_urls:
                    errors.append(
                        f"DUPLICATE_SESSION_URL: 角色 '{r_name}' 与 '{seen_urls[r_url]}' 违规共用同一会话 url={r_url}"
                    )
                else:
                    seen_urls[r_url] = r_name

            site_low = str(info.get("site") or "").lower()
            model_low = str(info.get("model") or "").lower()
            if site_low == "flow" or any(k in model_low for k in ("nano", "image", "omni", "veo")):
                has_image_role = True
            if any(k in model_low for k in ("lyria", "tts", "music", "speech")):
                has_audio_role = True

        real_images = 0
        real_audios = 0
        referenced_assets: set[str] = set()
        if p_dir.is_dir():
            for root_str, dirs, files in os.walk(p_dir):
                dirs[:] = [d for d in dirs if d not in _AUDIT_IGNORE_DIRS]
                root_p = Path(root_str)
                for fname in files:
                    fpath = root_p / fname
                    ext = fpath.suffix.lower()
                    try:
                        fsize = fpath.stat().st_size
                    except OSError:
                        fsize = 0
                    if ext in _IMAGE_EXTS and fsize > 512:
                        real_images += 1
                    if ext in _AUDIO_EXTS and fsize > 512:
                        real_audios += 1
                    if ext in _CODE_EXTS:
                        try:
                            text_src = fpath.read_text(encoding="utf-8", errors="ignore")
                            for m in _ASSET_REF_RE.finditer(text_src):
                                referenced_assets.add(m.group(1).lstrip("./"))
                        except OSError:
                            pass

        if has_image_role and real_images == 0:
            errors.append(
                "MISSING_FLOW_IMAGES: 花名册包含视觉美术角色，但项目目录未落盘任何真实图片(>512B)，严禁用 Canvas 伪造替代 Flow 外包生图"
            )
        if has_audio_role and real_audios == 0:
            errors.append(
                "MISSING_AUDIO_FILES: 花名册包含配乐/配音角色，但项目目录未落盘任何真实音频(>512B)，严禁用 WebAudio 振荡器伪造替代 Lyria/TTS 外包音频"
            )

        missing_refs = sorted(
            rel for rel in referenced_assets if not (p_dir / rel).is_file() or (p_dir / rel).stat().st_size == 0
        )
        if missing_refs:
            errors.append(
                f"MISSING_REFERENCED_ASSETS: 源码引用了 {missing_refs} 但磁盘不存在有效文件（疑似本地降级造假未完成下载）"
            )

        passed = len(errors) == 0
        return {
            "status": "ok" if passed else "failed",
            "entry": "roster",
            "action": "audit",
            "passed": passed,
            "file": str(path),
            "project_dir": str(p_dir),
            "count": len(roster),
            "real_images": real_images,
            "real_audios": real_audios,
            "checked_assets_count": len(referenced_assets),
            "errors": errors,
            "roster": roster,
        }

    raise ValueError(f"不支持的 roster action: {action}")


def _extract_playbook_meta(md_path: Path) -> dict:
    title = md_path.stem
    scenarios = ""
    for line in md_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if s.startswith("# ") and title == md_path.stem:
            title = s[2:].strip()
        elif "适用场景" in s and not scenarios:
            scenarios = re.sub(r"^>\s*\*\*适用场景\*\*[：:]\s*", "", s).strip()
        if title != md_path.stem and scenarios:
            break
    return {"name": md_path.stem, "title": title, "scenarios": scenarios, "path": str(md_path)}


def execute_playbook(
    action: str = "list",
    name: str = "",
    title: str = "",
    scenarios: str = "",
    content: str = "",
    from_file: str = "",
    playbooks_dir: str | Path | None = None,
) -> dict:
    """查阅或 AI 自主沉淀新增主流工作编队卡（references/playbooks/*.md）。"""
    using_default_dir = playbooks_dir is None
    pb_dir = Path(playbooks_dir).expanduser().resolve() if playbooks_dir is not None else DEFAULT_PLAYBOOKS_DIR.resolve()

    if action == "list":
        items: list[dict] = []
        if pb_dir.is_dir():
            for md_file in sorted(pb_dir.glob("*.md")):
                items.append(_extract_playbook_meta(md_file))
        return {
            "status": "ok",
            "entry": "playbook",
            "action": "list",
            "dir": str(pb_dir),
            "count": len(items),
            "playbooks": items,
        }

    slug = _validate_playbook_slug(name)
    target = pb_dir / f"{slug}.md"

    if action == "show":
        if not target.is_file():
            raise FileNotFoundError(f"未找到编队卡: {slug} ({target})")
        meta = _extract_playbook_meta(target)
        return {
            "status": "ok",
            "entry": "playbook",
            "action": "show",
            "name": slug,
            "title": meta["title"],
            "path": str(target),
            "text": target.read_text(encoding="utf-8"),
        }

    if action == "add":
        body = content
        if from_file:
            src_f = Path(from_file).expanduser().resolve()
            if not src_f.is_file():
                raise FileNotFoundError(f"编队卡源文件不存在: {src_f}")
            body = src_f.read_text(encoding="utf-8")
        body = (body or "").strip()
        if not body and not (title or scenarios):
            raise ValueError("playbook add 至少需要提供 --content / --from-file 或 --title / --scenarios")

        final_title = (title or slug).strip()
        final_scenarios = (scenarios or "通用协作任务").strip()
        if body.startswith("# "):
            final_md = body + "\n"
        else:
            lines = [f"# {final_title} (`{slug}`)", "", f"> **适用场景**：{final_scenarios}", ""]
            if body:
                lines.append(body)
            else:
                lines.extend([
                    "## 团队花名册（1 Tab = 1 员工）",
                    "",
                    "| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |",
                    "| :--- | :--- | :--- | :--- | :--- | :--- |",
                    "| `director` | 项目总监 | `aistudio` (Playground) | `gemini-4-neon` | `high` | 拆解需求、设定契约与审查成果 |",
                    "| `executor` | 核心执行员 | `gemini_task` | `gemini-4-hydrogen` | — | 在 Debian 12 沙盒离线落地并用 Python `zipfile` 打包 |",
                ])
            final_md = "\n".join(lines) + "\n"

        pb_dir.mkdir(parents=True, exist_ok=True)
        target.write_text(final_md, encoding="utf-8")

        synced_global = ""
        if using_default_dir:
            global_pb_dir = Path.home() / ".gemini" / "config" / "skills" / "gemini-web-agent" / "references" / "playbooks"
            if global_pb_dir.is_dir() and global_pb_dir.resolve() != pb_dir:
                global_target = global_pb_dir / f"{slug}.md"
                global_target.write_text(final_md, encoding="utf-8")
                synced_global = str(global_target)

        return {
            "status": "ok",
            "entry": "playbook",
            "action": "add",
            "name": slug,
            "title": final_title,
            "path": str(target),
            "synced_global_path": synced_global or None,
        }

    raise ValueError(f"不支持的 playbook action: {action}")


def _print_result(
    res: dict,
    raw: bool = False,
    raw_keys: tuple[str, ...] = ("answer", "text", "url"),
    as_json: bool = False,
) -> None:
    if raw:
        for k in raw_keys:
            if res.get(k):
                print(res[k])
                return
        print("")
        return
    if as_json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return
    if res.get("entry") == "roster":
        if res.get("action") == "audit":
            if res.get("passed"):
                print(
                    f"ok | audit=passed | roles={res.get('count', 0)} | "
                    f"imgs={res.get('real_images', 0)} | audios={res.get('real_audios', 0)} | "
                    f"checked_assets={res.get('checked_assets_count', 0)} | dir={res.get('project_dir', '')}"
                )
            else:
                errs = res.get("errors") or []
                print(f"failed | audit=failed | errors={len(errs)} | dir={res.get('project_dir', '')}")
                for err in errs:
                    print(f"- ERROR: {err}")
            return
        head = f"ok | roster({res.get('action')}) | count={res.get('count', 0)}"
        if res.get("project"):
            head += f" | project={res['project']}"
        head += f" | file={res.get('file', '')}"
        print(head)
        for r_key, info in (res.get("roster") or {}).items():
            title_s = f"({info['title']})" if info.get("title") else ""
            site_s = info.get("site") or "-"
            model_s = info.get("model") or "-"
            tl_s = f"({info['thinking_level']})" if info.get("thinking_level") else ""
            tab_s = info.get("tab_id") if info.get("tab_id") is not None else "-"
            st_s = info.get("status") or "-"
            url_s = f" | {info['url']}" if info.get("url") else ""
            print(f"- {r_key}{title_s} | {site_s}:{model_s}{tl_s} | tab={tab_s} | {st_s}{url_s}")
        return
    if res.get("entry") == "wave":
        head = (
            f"{res.get('status', 'ok')} | wave | ok={res.get('succeeded', 0)}/{res.get('total', 0)} "
            f"| elapsed={res.get('elapsed_sec', 0)}s | roster={res.get('roster_file', '')}"
        )
        print(head)
        for item in res.get("results") or []:
            parts = [f"- {item.get('role', '?')} [{item.get('site', '?')}] -> {item.get('status', '?')}"]
            if item.get("elapsed_sec") is not None:
                parts.append(f"{item['elapsed_sec']}s")
            if item.get("drive_file_id"):
                parts.append(f"drive={item['drive_file_id']}")
            if item.get("saved_text_file"):
                parts.append(f"out={item['saved_text_file']}")
            if item.get("unpacked_files"):
                parts.append(f"unpacked={len(item['unpacked_files'])}")
            if item.get("saved_files"):
                parts.append(f"files={','.join(Path(str(x)).name for x in item['saved_files'])}")
            if item.get("url"):
                parts.append(f"url={item['url']}")
            if item.get("error"):
                parts.append(f"err={item['error']}")
            print(" | ".join(parts))
        return
    if res.get("entry") == "playbook":
        act = res.get("action")
        if act == "list":
            print(f"ok | playbooks | count={res.get('count', 0)} | dir={res.get('dir', '')}")
            for pb in res.get("playbooks") or []:
                sc = f" — {pb['scenarios']}" if pb.get("scenarios") else ""
                print(f"- {pb['name']}: {pb.get('title', pb['name'])}{sc}")
            return
        if act == "show":
            print(f"ok | playbook={res.get('name')} | path={res.get('path')}")
            print("---")
            print(res.get("text", "").rstrip())
            return
        print(f"ok | playbook(add)={res.get('name')} | path={res.get('path')}")
        return
    if "current_usage" in res or "weekly_usage" in res or "credits" in res:
        print(_format_compact_usage(res))
        return
    meta_parts: list[str] = [str(res.get("status") or "ok")]
    if res.get("model"):
        meta_parts.append(f"model={_short_model_name(str(res['model']))}")
    rs = res.get("run_settings") or {}
    if rs.get("thinking_level"):
        meta_parts.append(f"think={rs['thinking_level']}")
    if rs.get("max_output_tokens"):
        meta_parts.append(f"max_out={rs['max_output_tokens']}")
    if res.get("saved_text_file"):
        meta_parts.append(f"out={res['saved_text_file']}({res.get('text_chars', 0)}c)")
    if res.get("dest_dir"):
        meta_parts.append(f"dest={res['dest_dir']}")
    if res.get("matched_count") is not None:
        meta_parts.append(f"matched={res['matched_count']}")
    if res.get("saved_files"):
        meta_parts.append(f"files={','.join(str(x) for x in res['saved_files'])}")
    if res.get("unpacked_files"):
        meta_parts.append(f"unpacked={len(res['unpacked_files'])}")
    if res.get("attached_files"):
        meta_parts.append(f"attached={','.join(str(x) for x in res['attached_files'])}")
    if res.get("imported_code"):
        imp = res["imported_code"]
        imp_tag = imp.get("github_repo") or imp.get("code_folder") or ""
        if imp_tag:
            meta_parts.append(f"code={imp_tag}")
    if res.get("drive_file_id"):
        meta_parts.append(f"drive={res['drive_file_id']}")
    if res.get("extracted_dir"):
        meta_parts.append(f"dir={res['extracted_dir']}")
    elif res.get("zip_path"):
        meta_parts.append(f"zip={res['zip_path']}")
    url = res.get("url") or res.get("project_url") or res.get("app_url")
    if url:
        meta_parts.append(f"url={url}")
    if res.get("elapsed_sec") is not None:
        meta_parts.append(f"{res['elapsed_sec']}s")
    print(" | ".join(meta_parts))
    if not res.get("saved_text_file"):
        body = res.get("answer") or res.get("text") or ""
        if body:
            print("---")
            print(body)


def _add_json_flag(p) -> None:
    p.add_argument("--json", dest="as_json", action="store_true", help="输出完整 JSON（默认直接输出极简行协议以省 Token）")


def main() -> None:
    parser = argparse.ArgumentParser(description="外部 Chrome Gemini / AI Studio / Google Flow 高速调度工具（CDP 优先引擎）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_daemon = sub.add_parser("daemon", help="启动常驻 CDP 桥接服务（默认优先连接专用 AI Chrome 9229）")
    p_daemon.add_argument("--port", type=int, default=None)

    p_wave = sub.add_parser("wave", help="一键并发波次调度：单命令多 Tab 并发派发、后台静默等待、自动落盘/解包并更新花名册")
    p_wave.add_argument("--spec", "-s", required=True, help="波次任务清单 JSON 文件路径（支持 [...] 或 {project, tasks:[...]}）")
    p_wave.add_argument("--roster-file", default=".web-team.json", help="花名册 JSON 路径（默认 ./.web-team.json）")
    p_wave.add_argument("--project", default="", help="项目名称（覆盖 spec 内 project）")
    p_wave.add_argument("--project-dir", default=".", help="相对路径解析根目录（默认当前目录）")
    p_wave.add_argument("--timeout", type=int, default=360, help="整波次最大等待超时秒数（默认 360）")
    p_wave.add_argument("--poll-interval", type=float, default=1.5, help="后台状态轮询间隔秒数（默认 1.5）")
    p_wave.add_argument("--stagger", type=float, default=3.5, help="各 Tab 错峰派单间隔秒数（默认 3.5，防过快点击触发风控）")
    _add_json_flag(p_wave)
    p_wave.add_argument("--port", type=int, default=None)

    p_ask = sub.add_parser("ask", help="在 gemini.google.com 发起异步任务或对话（默认 task 模式，支持文件夹/GitHub 导入）")
    p_ask.add_argument("--prompt", "-p", default="", help="提问或任务描述")
    p_ask.add_argument("--prompt-file", default="", help="从本地文件读取长 Prompt（避免命令行转义）")
    p_ask.add_argument("--entry", choices=["", "chat", "task"], default="", help="入口: task(默认) | chat(对话；传 --tool/--thinking 时自动切 chat)")
    p_ask.add_argument("--model", "-m", default="", help="模型: hydrogen(新会话默认) | neon | carbon | auto（复用会话不传则保持原模型）")
    p_ask.add_argument("--tool", "-t", default=None, help="对话模式工具: Deep Research | Canvas | 制作图片 | 制作视频 | 制作音乐")
    p_ask.add_argument("--thinking", default=None, help="思考等级: 低 | 中 | 高")
    p_ask.add_argument("--file", dest="files", action="append", default=[], help="无弹窗上传本地附件（可多次传入）")
    p_ask.add_argument("--folder", default="", help="通过 More uploads -> Import code 上传整个本地代码文件夹（兼容自动 ZIP 兜底）")
    p_ask.add_argument("--github", default="", help="通过 More uploads -> Import code 导入 GitHub 仓库或分支 URL")
    p_ask.add_argument("--role", default="", help="绑定 .web-team.json 员工角色名（自动隔离独立标签页并回写 URL）")
    p_ask.add_argument("--roster-file", default=".web-team.json", help="配合 --role 使用的花名册路径")
    p_ask.add_argument("--reuse-tab", action="store_true", help="显式复用已有标签页继续对话（默认已优先复用）")
    p_ask.add_argument("--new-chat", action="store_true", help="强制新开一个空白对话窗口")
    p_ask.add_argument("--tab-hint", default="", help="指定复用的会话 URL 或片段")
    p_ask.add_argument("--async-send", action="store_true", help="异步发射：发包拿到会话 URL 后立即返回不等待完成")
    p_ask.add_argument("--timeout", type=int, default=180, help="同步等待超时秒数")
    p_ask.add_argument("--out-file", default="", help="将正文直接写入本地文件，stdout 仅返回极简回执")
    p_ask.add_argument("--unpack-json-dir", default="", help="自动从回答中提取 {相对路径: 内容} JSON 并解包落盘")
    p_ask.add_argument("--raw", action="store_true", help="仅输出纯文本回答")
    _add_json_flag(p_ask)
    p_ask.add_argument("--port", type=int, default=None)

    p_fetch = sub.add_parser("fetch", help="检查并回收 gemini.google.com 异步任务或已有会话的最新结果")
    p_fetch.add_argument("--tab-hint", default="", help="目标会话 URL 片段或会话 ID")
    p_fetch.add_argument("--out-file", default="", help="将正文直接写入本地文件，stdout 仅返回极简回执")
    p_fetch.add_argument("--raw", action="store_true", help="仅输出纯文本回答")
    _add_json_flag(p_fetch)
    p_fetch.add_argument("--port", type=int, default=None)

    p_usage = sub.add_parser("usage", help="检测网页端 https://gemini.google.com/usage 用量限额")
    p_usage.add_argument("--include-flow", action="store_true", help="同时检测 Google Flow 独立点数余额")
    _add_json_flag(p_usage)
    p_usage.add_argument("--port", type=int, default=None)

    p_pg = sub.add_parser("playground", help="在 AI Studio Playground (对话/生图/生视频/Lyria音乐/TTS配音/Research) 运行")
    p_pg.add_argument("--prompt", "-p", default="", help="输入提示词或配音文本")
    p_pg.add_argument("--prompt-file", default="", help="从本地文件读取长 Prompt（避免命令行转义）")
    p_pg.add_argument(
        "--model",
        "-m",
        default="",
        help="模型别名或ID: hydrogen(新会话默认) | neon | argon | nano2.1 | omni1.2 | lyria | tts | research 等（复用不传则保持原模型）",
    )
    p_pg.add_argument("--title", default="", help="设置 AI Studio 会话标题（同步至 Google Drive 便于下游 Gemini Task 直接拉取）")
    p_pg.add_argument("--role", default="", help="绑定 .web-team.json 员工角色名（自动隔离独立标签页并回写 URL 与 Drive ID）")
    p_pg.add_argument("--roster-file", default=".web-team.json", help="配合 --role 使用的花名册路径")
    p_pg.add_argument("--system", default="", help="系统指令 (System Instructions)")
    p_pg.add_argument("--system-file", default="", help="从本地文件读取文本并写入 System Instructions（如世界观设定 .md/.txt）")
    p_pg.add_argument("--file", dest="files", action="append", default=[], help="无弹窗上传本地文件（可多次传入，支持 txt/md/pdf/docx/图片/音视频）")
    p_pg.add_argument(
        "--thinking-level",
        default="max",
        help="思考等级: max/extra_high(最高) | high | medium | low | minimal(极速) | default(保留默认)",
    )
    p_pg.add_argument("--no-max-output", action="store_true", help="不自动将 Output length 拉满至模型上限(1048576)")
    p_pg.add_argument("--with-thoughts", action="store_true", help="在输出中附带模型完整思考链（默认省略以省 Token）")
    p_pg.add_argument("--out-file", default="", help="将生成的文本/代码直接写入本地文件，stdout 仅返回回执")
    p_pg.add_argument("--unpack-json-dir", default="", help="自动从回答中提取 {相对路径: 内容} JSON 并解包落盘")
    p_pg.add_argument("--download-dir", default="", help="将生成的图片(PNG)/视频(MP4)/音乐(MP3)/配音(WAV)落盘到指定目录")
    p_pg.add_argument("--reuse-tab", action="store_true", help="显式复用已有 AI Studio 标签页继续对话（默认已优先复用）")
    p_pg.add_argument("--new-chat", action="store_true", help="强制新开一个 AI Studio 对话窗口")
    p_pg.add_argument("--tab-hint", default="", help="目标会话 URL 或片段")
    p_pg.add_argument("--async-send", action="store_true", help="发送后立即返回会话 URL，不等待输出结束")
    p_pg.add_argument("--timeout", type=int, default=180, help="同步等待超时秒数")
    p_pg.add_argument("--raw", action="store_true", help="仅输出纯文本回答")
    _add_json_flag(p_pg)
    p_pg.add_argument("--port", type=int, default=None)

    p_attach = sub.add_parser("attach", help="仅将本地文件无弹窗挂载到已打开的 AI Studio / Gemini 对话标签页")
    p_attach.add_argument("--file", dest="files", action="append", required=True, help="待上传的本地文件路径（可多次传入）")
    p_attach.add_argument("--site", choices=["auto", "aistudio", "gemini"], default="auto", help="目标站点（默认自动识别）")
    p_attach.add_argument("--tab-hint", default="", help="目标会话 URL 或片段")
    _add_json_flag(p_attach)
    p_attach.add_argument("--port", type=int, default=None)

    p_build = sub.add_parser("build", help="在 AI Studio Build 创建/迭代全套整站工程并下载 ZIP（简单任务请优先用 ask --entry task）")
    p_build.add_argument("--prompt", "-p", default="", help="整套应用需求或修改指令（可省略以仅导出已有项目）")
    p_build.add_argument("--app-url", default="", help="已有 AI Studio Build 应用 URL（用于迭代或直接导出 ZIP）")
    p_build.add_argument("--mode", default="max", choices=["", "default", "plan", "max"], help="Build 模式: max(默认最高可用) | plan | default")
    p_build.add_argument("--model", "-m", default="neon", help="聊天模型: neon(默认最新非Paid最强) | argon | hydrogen")
    p_build.add_argument("--framework", default="", help="目标框架: React | Next.js | Angular | XR Blocks | Android")
    p_build.add_argument("--download-dir", default="", help="下载项目 ZIP 的本地目录")
    p_build.add_argument("--extract", action="store_true", help="下载 ZIP 后自动解压到同名目录")
    p_build.add_argument("--async-send", action="store_true", help="提交构建指令拿到项目 URL 后立即返回")
    p_build.add_argument("--timeout", type=int, default=300, help="等待构建完成超时秒数")
    _add_json_flag(p_build)
    p_build.add_argument("--port", type=int, default=None)

    p_fusage = sub.add_parser("flow-usage", help="检测 Google Flow (flow.google.com) 独立点数余额与重置时间")
    _add_json_flag(p_fusage)
    p_fusage.add_argument("--port", type=int, default=None)

    p_flow = sub.add_parser("flow", help="在 Google Flow (flow.google.com) 生成图片或视频（首选入口）")
    p_flow.add_argument("--prompt", "-p", required=True, help="生图或生视频提示词")
    p_flow.add_argument("--media", choices=["image", "video"], default="image", help="媒体类型: image(生图) | video(生视频)")
    p_flow.add_argument("--model", "-m", default="", help="模型: Nano Banana 2.1 | Nano Banana Pro | Omni 1.2 Flash | Veo 3.1 - Lite 等")
    p_flow.add_argument("--aspect", default="16:9", choices=["16:9", "4:3", "1:1", "3:4", "9:16"], help="画幅比例")
    p_flow.add_argument("--count", type=int, default=1, choices=[1, 2, 3, 4], help="生成数量（默认 1，节省点数）")
    p_flow.add_argument("--resolution", default="", help="视频分辨率 (360p|720p) 或图片下载清晰度 (1K|2K)")
    p_flow.add_argument("--video-mode", default="", choices=["", "ingredients", "frames"], help="视频模式: ingredients(素材) | frames(帧)")
    p_flow.add_argument("--role", default="", help="绑定 .web-team.json 员工角色名（自动复用该角色的 Flow 项目 URL 并回写）")
    p_flow.add_argument("--roster-file", default=".web-team.json", help="配合 --role 使用的花名册路径")
    p_flow.add_argument("--project-url", default="", help="复用已有 Flow 项目 URL (/project/...)")
    p_flow.add_argument("--download-dir", default="", help="生成后自动下载媒体到指定目录")
    p_flow.add_argument("--async-send", action="store_true", help="提交后立即返回 project_url")
    p_flow.add_argument("--timeout", type=int, default=240, help="同步等待生成超时秒数")
    _add_json_flag(p_flow)
    p_flow.add_argument("--port", type=int, default=None)

    p_harvest = sub.add_parser("harvest", help="从 Chrome 下载目录收割网页导出文件并可选解包 JSON Blob 到目标目录")
    p_harvest.add_argument("--pattern", default="*", help="匹配文件名通配符（逗号分隔，如 *.png,*.mp3 或 bundle-*.json）")
    p_harvest.add_argument("--dest", "-d", default=".", help="归档或解包目标目录（默认当前目录）")
    p_harvest.add_argument("--src-dir", default="", help="指定下载源目录（默认自动定位 ~/Downloads）")
    p_harvest.add_argument("--since-min", type=float, default=30.0, help="仅收割最近 N 分钟内的文件（0 表示不限时间，默认 30）")
    p_harvest.add_argument("--unpack-json", action="store_true", help="将匹配的 JSON 包按 {相对路径: 内容} 解包到 --dest")
    p_harvest.add_argument("--copy", dest="copy_only", action="store_true", help="仅复制而不移动/删除源下载文件")
    _add_json_flag(p_harvest)

    p_roster = sub.add_parser("roster", help="管理当前工程 .web-team.json 一页一员工花名册（纯本地零浏览器依赖）")
    p_roster.add_argument("action", choices=["list", "set", "remove", "clear", "audit"], help="操作类型: list | set | remove | clear | audit")
    p_roster.add_argument("--file", default=".web-team.json", help="花名册 JSON 路径（默认 ./.web-team.json）")
    p_roster.add_argument("--role", default="", help="员工角色标识（如 director / coder / artist / qa）")
    p_roster.add_argument("--title", default="", help="岗位中文名称")
    p_roster.add_argument("--site", default="", help="站点渠道（aistudio / gemini_task / build / flow）")
    p_roster.add_argument("--model", "-m", default="", help="模型名或 ID")
    p_roster.add_argument("--thinking-level", default="", help="思考等级（minimal/low/medium/high/extra_high）")
    p_roster.add_argument("--tab-id", default="", help="Chrome 标签页 ID（通道 A）")
    p_roster.add_argument("--url", default="", help="会话或项目 URL（通道 B 唯一标识）")
    p_roster.add_argument("--drive-file-id", default="", help="AI Studio 自动同步的 Google Drive 文件 ID")
    p_roster.add_argument("--duty", default="", help="一句话职责说明")
    p_roster.add_argument("--status", default="", help="状态（ready / running / done / blocked）")
    p_roster.add_argument("--project", default="", help="所属项目名称")
    p_roster.add_argument("--project-dir", default=".", help="audit 时校验真实落盘资产与源码的项目目录")
    p_roster.add_argument("--min-roles", type=int, default=2, help="audit 时要求的最少独立员工角色数（默认 2）")
    _add_json_flag(p_roster)

    p_pb = sub.add_parser("playbook", help="查阅或由 AI 自主沉淀新增主流工作编队卡（references/playbooks/*.md）")
    p_pb.add_argument("action", choices=["list", "show", "add"], help="操作类型: list | show | add")
    p_pb.add_argument("--name", default="", help="编队卡短名 slug（如 web_fullstack_app）")
    p_pb.add_argument("--title", default="", help="编队卡中文标题（add 时使用）")
    p_pb.add_argument("--scenarios", default="", help="适用场景描述（add 时使用）")
    p_pb.add_argument("--content", default="", help="编队卡 Markdown 正文内容（add 时使用）")
    p_pb.add_argument("--from-file", default="", help="从本地 Markdown 文件导入正文（add 时使用）")
    p_pb.add_argument("--raw", action="store_true", help="show 时仅输出原始 Markdown 正文")
    _add_json_flag(p_pb)

    args = parser.parse_args()

    if args.cmd == "daemon":
        run_daemon(port_override=args.port)
        return

    if args.cmd == "wave":
        spec_path = Path(args.spec).expanduser().resolve()
        if not spec_path.is_file():
            parser.error(f"wave 任务清单文件不存在: {args.spec}")
        raw_spec = json.loads(spec_path.read_text(encoding="utf-8"))
        if isinstance(raw_spec, list):
            tasks = raw_spec
            spec_project = ""
        elif isinstance(raw_spec, dict) and isinstance(raw_spec.get("tasks"), list):
            tasks = raw_spec["tasks"]
            spec_project = str(raw_spec.get("project") or "")
        else:
            parser.error("wave --spec JSON 必须是任务数组 [...] 或包含 tasks 数组的对象。")
        eff_project = args.project or spec_project
        payload = {
            "tasks": tasks,
            "roster_file": str(Path(args.roster_file).expanduser().resolve()),
            "project": eff_project,
            "project_dir": str(Path(args.project_dir).expanduser().resolve()),
            "timeout_sec": args.timeout,
            "poll_interval_sec": args.poll_interval,
            "stagger_sec": args.stagger,
        }
        res = _exec_cdp(
            args.port,
            "/wave",
            payload,
            lambda b: execute_wave(
                b,
                tasks=tasks,
                roster_file=payload["roster_file"],
                project=eff_project,
                project_dir=payload["project_dir"],
                timeout_sec=args.timeout,
                poll_interval_sec=args.poll_interval,
                stagger_sec=args.stagger,
            ),
        )
        _print_result(res, False, as_json=args.as_json)
        if res.get("succeeded", 0) == 0 and res.get("total", 0) > 0:
            sys.exit(1)
        return

    if args.cmd == "roster":
        res = execute_roster(
            action=args.action,
            roster_file=args.file,
            role=args.role,
            title=args.title,
            site=args.site,
            model=args.model,
            thinking_level=args.thinking_level,
            tab_id=args.tab_id,
            url=args.url,
            drive_file_id=args.drive_file_id,
            duty=args.duty,
            status=args.status,
            project=args.project,
            project_dir=args.project_dir,
            min_roles=args.min_roles,
        )
        _print_result(res, False, as_json=args.as_json)
        if args.action == "audit" and not res.get("passed", True):
            sys.exit(2)
        return

    if args.cmd == "playbook":
        res = execute_playbook(
            action=args.action,
            name=args.name,
            title=args.title,
            scenarios=args.scenarios,
            content=args.content,
            from_file=args.from_file,
        )
        _print_result(res, getattr(args, "raw", False), ("text",), as_json=args.as_json)
        return

    if args.cmd == "harvest":
        res = execute_harvest(
            pattern=args.pattern,
            dest=args.dest,
            src_dir=args.src_dir,
            since_min=args.since_min,
            unpack_json=args.unpack_json,
            copy_only=args.copy_only,
        )
        _print_result(res, False, as_json=args.as_json)
        return

    if args.cmd == "ask":
        prompt_text = args.prompt
        if not prompt_text and args.prompt_file:
            prompt_text = Path(args.prompt_file).expanduser().resolve().read_text(encoding="utf-8")
        if not prompt_text:
            parser.error("ask 必须提供 --prompt 或 --prompt-file")
        tab_hint = args.tab_hint
        new_tab = bool(args.new_chat and not args.reuse_tab and not tab_hint)
        if args.role and not tab_hint:
            role_info = _roster_lookup_role(args.roster_file, args.role)
            if role_info.get("url") and not args.new_chat:
                tab_hint = str(role_info["url"])
                new_tab = False
            else:
                new_tab = True
        payload = {
            "prompt": prompt_text,
            "entry": args.entry,
            "model": args.model,
            "tool": args.tool,
            "thinking": args.thinking,
            "new_tab": new_tab,
            "tab_url_hint": tab_hint,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
            "files": args.files,
            "code_folder": args.folder,
            "github_repo": args.github,
        }
        res = _exec_cdp(
            args.port,
            "/ask",
            payload,
            lambda b: execute_ask(
                b,
                prompt=prompt_text,
                entry=args.entry,
                model=args.model,
                tool=args.tool,
                thinking=args.thinking,
                new_tab=new_tab,
                tab_url_hint=tab_hint,
                async_send=args.async_send,
                timeout_sec=args.timeout,
                files=args.files,
                code_folder=args.folder,
                github_repo=args.github,
            ),
        )
        if args.role:
            execute_roster(
                action="set",
                roster_file=args.roster_file,
                role=args.role,
                site="gemini_task" if (args.entry or "task") == "task" else "gemini_chat",
                model=str(res.get("model") or args.model),
                url=str(res.get("url") or ""),
                status="running" if args.async_send else "done",
            )
        if args.unpack_json_dir:
            body_txt = str(res.get("answer") or res.get("text") or "")
            res["unpacked_files"] = _unpack_json_from_text(body_txt, args.unpack_json_dir)
        res = _write_text_output(res, args.out_file)
        _print_result(res, args.raw, ("answer", "url"), as_json=args.as_json)
        return

    if args.cmd == "fetch":
        res = _exec_cdp(
            args.port,
            "/fetch",
            {"tab_url_hint": args.tab_hint},
            lambda b: execute_fetch(b, tab_url_hint=args.tab_hint),
        )
        res = _write_text_output(res, args.out_file)
        _print_result(res, args.raw, ("answer",), as_json=args.as_json)
        return

    if args.cmd == "usage":
        if args.include_flow:
            res = call_daemon("/usage", {})
            if res is not None:
                res["flow"] = call_daemon("/flow-usage", {})
            else:
                ws_url = get_cdp_ws_url(args.port)
                with _get_sync_playwright()() as p:
                    browser = p.chromium.connect_over_cdp(ws_url, timeout=5000)
                    res = execute_usage(browser)
                    res["flow"] = execute_flow_usage(browser)
        else:
            res = _exec_cdp(args.port, "/usage", {}, execute_usage)
        _print_result(res, False, as_json=args.as_json)
        return

    if args.cmd == "flow-usage":
        res = _exec_cdp(args.port, "/flow-usage", {}, execute_flow_usage)
        _print_result(res, False, as_json=args.as_json)
        return

    if args.cmd == "playground":
        prompt_text = args.prompt
        if not prompt_text and args.prompt_file:
            prompt_text = Path(args.prompt_file).expanduser().resolve().read_text(encoding="utf-8")
        if not prompt_text:
            parser.error("playground 必须提供 --prompt 或 --prompt-file")
        tab_hint = args.tab_hint
        new_tab = bool(args.new_chat and not args.reuse_tab and not tab_hint)
        if args.role and not tab_hint:
            role_info = _roster_lookup_role(args.roster_file, args.role)
            if role_info.get("url") and not args.new_chat:
                tab_hint = str(role_info["url"])
                new_tab = False
            else:
                new_tab = True
        payload = {
            "prompt": prompt_text,
            "model": args.model,
            "system_instruction": args.system,
            "system_file": args.system_file,
            "files": args.files,
            "new_tab": new_tab,
            "tab_url_hint": tab_hint,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
            "download_dir": args.download_dir,
            "thinking_level": args.thinking_level,
            "max_output": not args.no_max_output,
            "include_thoughts": args.with_thoughts,
            "title": args.title,
        }
        res = _exec_cdp(
            args.port,
            "/playground",
            payload,
            lambda b: execute_playground(
                b,
                prompt=prompt_text,
                model=args.model,
                system_instruction=args.system,
                system_file=args.system_file,
                files=args.files,
                new_tab=new_tab,
                tab_url_hint=tab_hint,
                async_send=args.async_send,
                timeout_sec=args.timeout,
                download_dir=args.download_dir,
                thinking_level=args.thinking_level,
                max_output=not args.no_max_output,
                include_thoughts=args.with_thoughts,
                title=args.title,
            ),
        )
        if args.role:
            execute_roster(
                action="set",
                roster_file=args.roster_file,
                role=args.role,
                title=args.title,
                site="aistudio",
                model=str(res.get("model") or args.model),
                thinking_level=args.thinking_level,
                url=str(res.get("url") or ""),
                drive_file_id=str(res.get("drive_file_id") or ""),
                status="running" if args.async_send else "done",
            )
        if args.unpack_json_dir:
            body_txt = str(res.get("text") or res.get("answer") or "")
            res["unpacked_files"] = _unpack_json_from_text(body_txt, args.unpack_json_dir)
        res = _write_text_output(res, args.out_file)
        _print_result(res, args.raw, ("text", "url"), as_json=args.as_json)
        return

    if args.cmd == "attach":
        payload = {
            "files": args.files,
            "site": args.site,
            "tab_url_hint": args.tab_hint,
        }
        res = _exec_cdp(
            args.port,
            "/attach",
            payload,
            lambda b: execute_attach(
                b,
                files=args.files,
                site=args.site,
                tab_url_hint=args.tab_hint,
            ),
        )
        _print_result(res, False, as_json=args.as_json)
        return

    if args.cmd == "build":
        if not args.prompt and not args.download_dir:
            parser.error("build 至少需要提供 --prompt 或 --download-dir")
        payload = {
            "prompt": args.prompt,
            "app_url": args.app_url,
            "mode": args.mode,
            "model": args.model,
            "framework": args.framework,
            "download_dir": args.download_dir,
            "extract": args.extract,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
        }
        res = _exec_cdp(
            args.port,
            "/build",
            payload,
            lambda b: execute_build(
                b,
                prompt=args.prompt,
                app_url=args.app_url,
                mode=args.mode,
                model=args.model,
                framework=args.framework,
                download_dir=args.download_dir,
                extract=args.extract,
                async_send=args.async_send,
                timeout_sec=args.timeout,
            ),
        )
        _print_result(res, False, as_json=args.as_json)
        return

    if args.cmd == "flow":
        project_url = args.project_url
        if args.role and not project_url:
            role_info = _roster_lookup_role(args.roster_file, args.role)
            if role_info.get("url"):
                project_url = str(role_info["url"])
        payload = {
            "prompt": args.prompt,
            "media": args.media,
            "model": args.model,
            "aspect": args.aspect,
            "count": args.count,
            "resolution": args.resolution,
            "video_mode": args.video_mode,
            "project_url": project_url,
            "download_dir": args.download_dir,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
        }
        res = _exec_cdp(
            args.port,
            "/flow",
            payload,
            lambda b: execute_flow(
                b,
                prompt=args.prompt,
                media=args.media,
                model=args.model,
                aspect=args.aspect,
                count=args.count,
                resolution=args.resolution,
                video_mode=args.video_mode,
                project_url=project_url,
                download_dir=args.download_dir,
                async_send=args.async_send,
                timeout_sec=args.timeout,
            ),
        )
        if args.role:
            execute_roster(
                action="set",
                roster_file=args.roster_file,
                role=args.role,
                site="flow",
                model=args.model or "Nano Banana 2.1",
                url=str(res.get("project_url") or res.get("url") or ""),
                status="running" if args.async_send else "done",
            )
        _print_result(res, False, as_json=args.as_json)


if __name__ == "__main__":
    main()
