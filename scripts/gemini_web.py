#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
外部 Chrome 网页版 Gemini 高速调用脚本（AgentLimb 未加载时的 Playwright CDP 备用通道）
支持对话模式、异步任务模式（发射后立即返回 / 稍后按会话 ID 回收）及常驻 daemon。
"""

import argparse
import base64
import fnmatch
import http.server
import json
import os
import platform
import queue
import re
import shutil
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

DAEMON_HOST = "127.0.0.1"
DAEMON_PORT = 19222
SESSION_STATE_FILE = Path.home() / ".gemini" / "gemini-web-agent-sessions.json"


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


def _iter_devtools_active_port_files() -> list[Path]:
    """返回当前平台所有 Chromium 系浏览器可能的 DevToolsActivePort 路径。"""
    scripts_dir = str(Path(__file__).resolve().parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import platform_utils
    return platform_utils.iter_devtools_active_port_files()


def get_cdp_ws_url(port_override: int | None = None) -> str:
    """跨平台从 Chrome / Chromium / Edge / Brave 的 DevToolsActivePort 读取 WebSocket CDP 地址。"""
    for active_port_file in _iter_devtools_active_port_files():
        if active_port_file.exists():
            lines = [
                line.strip()
                for line in active_port_file.read_text(encoding="utf-8", errors="ignore").splitlines()
                if line.strip()
            ]
            if len(lines) >= 2:
                port = port_override or int(lines[0])
                return f"ws://127.0.0.1:{port}{lines[1]}"
    if port_override:
        return f"http://127.0.0.1:{port_override}"
    raise RuntimeError("未找到 DevToolsActivePort，请先在 Chromium 系浏览器开启远程调试或使用 AgentLimb MCP。")


def wait_gemini_ready(page, timeout_ms: int = 45000) -> None:
    """等待输入框与可见模型切换按钮渲染完成（兼容慢网冷启动及隐藏响应式副本）。"""
    page.locator('div[role="textbox"]:visible').first.wait_for(state="visible", timeout=timeout_ms)
    page.locator('button[data-test-id="bard-mode-menu-button"]:visible').first.wait_for(
        state="visible", timeout=timeout_ms
    )


def get_gemini_page(browser, new_tab: bool = True, tab_url_hint: str = ""):
    """获取或打开 Gemini 标签页；复用模式支持按历史会话 URL 重连。"""
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    if new_tab and not tab_url_hint:
        for page in context.pages:
            url = page.url or ""
            if re.match(r"^https://gemini\.google\.com/app(?:/?(?:\?.*)?)$", url):
                if page.locator("model-response").count() == 0:
                    page.bring_to_front()
                    wait_gemini_ready(page)
                    return page
        page = context.new_page()
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
    page.bring_to_front()
    page.goto(target_url or "https://gemini.google.com/app", wait_until="domcontentloaded", timeout=45000)
    wait_gemini_ready(page)
    return page


def _gemini_attach_files(page, file_paths: list[str]) -> list[str]:
    """在 gemini.google.com/app 通过 Playwright FileChooser 接管无弹窗上传本地文件。"""
    if not file_paths:
        return []
    tools_btn = page.locator('button[aria-label="上传和工具"], button[aria-label*="Upload and tools" i]').first
    tools_btn.wait_for(state="visible", timeout=10000)
    tools_btn.click()
    page.wait_for_timeout(400)

    upload_item = page.locator(
        '.cdk-overlay-pane gem-menu-item:has-text("上传文件"), '
        '.cdk-overlay-pane gem-menu-item:has-text("Upload files"), '
        '.cdk-overlay-pane button[aria-label*="上传文件"], '
        '.cdk-overlay-pane button[aria-label*="Upload files" i]'
    ).first
    upload_item.wait_for(state="visible", timeout=10000)
    with page.expect_file_chooser(timeout=15000) as fc_info:
        upload_item.click()
    fc_info.value.set_files(file_paths)
    page.wait_for_timeout(1200)
    return [Path(p).name for p in file_paths]


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
) -> dict:
    """在外部 Chrome 的 Gemini 网页中执行提问或异步任务（默认 Task 模式，支持无弹窗附件上传与会话复用）。"""
    t0 = time.time()
    file_paths = _validate_files(files)
    page = get_gemini_page(browser, new_tab=new_tab, tab_url_hint=tab_url_hint)

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

    attached_files = _gemini_attach_files(page, file_paths) if file_paths else []

    textbox = page.locator('div[role="textbox"]').first
    textbox.click()
    textbox.fill(prompt)
    page.wait_for_timeout(300)

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
        return {
            "status": "dispatched",
            "entry": effective_entry,
            "model": active_model,
            "url": page.url,
            "attached_files": attached_files,
            "elapsed_sec": round(time.time() - t0, 2),
        }

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
        page.wait_for_timeout(800)
        if "accounts.google.com" in (page.url or "") or page.locator('button:has-text("Sign in"), a:has-text("Sign in"), a:has-text("登录"), button:has-text("登录")').count() > 0:
            return {
                "status": "unauthenticated",
                "error": "Google 帳號尚未登入。請先在瀏覽器中登入 Google 帳號。",
                "url": page.url,
                "plan": None,
                "current_usage": None,
                "weekly_usage": None,
            }
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
    "flash": "Gemini 3.8 Flash",
    "flash-lite": "Gemini 3.5 Flash Lite",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
    "gemini-3.8-flash": "Gemini 3.8 Flash",
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
):
    """获取或新建 AI Studio 标签页；复用模式支持优先选已有同类型对话并按历史 URL 重连。"""
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    matched_pages = [
        p
        for p in context.pages
        if "aistudio.google.com" in (p.url or "")
        and (tab_url_hint in (p.url or "") if tab_url_hint else (not required_path or required_path in (p.url or "")))
    ]
    if matched_pages:
        page = matched_pages[0]
        page.bring_to_front()
        if new_tab:
            try:
                # 优雅重置画布开启新对话，避免多开大量无用浏览器标签页
                page.evaluate('() => document.querySelector("button[aria-label=\\"New chat\\"]")?.click()')
                page.wait_for_timeout(400)
            except Exception:
                pass
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
    page.bring_to_front()
    page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(800)
    if "accounts.google.com" in (page.url or "") or page.locator('button:has-text("Sign in"), a:has-text("Sign in"), a:has-text("登录"), button:has-text("登录")').count() > 0:
        raise RuntimeError("Google 帳號尚未登入。請先在瀏覽器中登入 Google 帳號（https://accounts.google.com 或 https://aistudio.google.com）。")
    page.locator(ready_selector).first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(500)
    return page


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


def _aistudio_ensure_settings_panel_open(page) -> None:
    """确保 AI Studio 右侧 Run settings 面板展开。"""
    try:
        open_panel = page.locator("ms-run-settings.expanded, .runsettings.expanded").first
        if open_panel.count() == 0 or not open_panel.is_visible():
            tune = page.locator('button.runsettings-toggle-button, button[aria-label="Toggle run settings panel"]').first
            if tune.count() > 0 and tune.is_visible():
                tune.click()
                page.wait_for_timeout(350)
    except Exception:
        pass


def _aistudio_close_settings_panel_if_overlay(page) -> None:
    """若在窄屏幕下（overlay 遮罩模式），关闭右侧 Run settings 恢复主区域互动。"""
    try:
        is_overlay = page.evaluate("() => window.innerWidth < 1280 || Boolean(document.querySelector('.sidebar-overlay'))")
        if is_overlay:
            close_btn = page.locator('button[aria-label="Close run settings panel"]').first
            if close_btn.count() > 0 and close_btn.is_visible():
                close_btn.click()
                page.wait_for_timeout(250)
    except Exception:
        pass


def _aistudio_select_playground_model(page, model: str) -> str:
    """在 AI Studio Playground 切换模型，默认避开 Paid 付费标记条目。"""
    target_name = _resolve_aistudio_model_name(model)
    allow_paid = "paid" in model.lower()
    
    _aistudio_ensure_settings_panel_open(page)
    card = page.locator(".model-selector-card").first
    if card.count() == 0:
        return target_name

    current = re.sub(r"\s+", " ", (card.inner_text() or "")).strip()
    target_lower = target_name.lower()
    model_lower = model.lower()
    if (target_lower in current.lower() or model_lower in current.lower()) and (allow_paid or "paid" not in current.lower()):
        _aistudio_close_settings_panel_if_overlay(page)
        return current

    card.click()
    page.wait_for_timeout(600)
    clicked = page.evaluate(
        """({targetLower, modelLower, allowPaid}) => {
            const containers = document.querySelectorAll('.cdk-overlay-pane, [role="dialog"], ms-model-selector');
            const scope = containers.length ? containers : [document.body];
            const candidates = [];
            for (const root of scope) {
                for (const el of root.querySelectorAll('button.content-button, button, [role="option"], ms-model-card, .model-card')) {
                    const txt = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                    if (!txt || txt.length > 260) continue;
                    const lower = txt.toLowerCase();
                    const matches = lower.includes(targetLower) || (modelLower && lower.includes(modelLower));
                    if (!matches) continue;
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
        {"targetLower": target_lower, "modelLower": model_lower, "allowPaid": allow_paid},
    )
    if not clicked:
        page.keyboard.press("Escape")
        _aistudio_close_settings_panel_if_overlay(page)
        return current
    page.wait_for_timeout(500)
    _aistudio_close_settings_panel_if_overlay(page)
    return re.sub(r"\s+", " ", (card.inner_text() or "")).strip()


def _aistudio_set_system_instruction(page, system_instruction: str) -> bool:
    """在 AI Studio Playground 设置系统指令。若当前界面无独立输入框（如持续对话中），返回 False 供上下文前置。"""
    try:
        _aistudio_ensure_settings_panel_open(page)
        sys_btn = page.locator(".system-instructions-card, button:has-text('System instructions'), [aria-label*='System instruction' i]").first
        if sys_btn.count() > 0 and sys_btn.is_visible():
            sys_btn.click()
            page.wait_for_timeout(400)
            box = page.locator(
                'textarea[aria-label*="System" i], .cdk-overlay-pane textarea, ms-system-instructions textarea'
            ).first
            if box.count() > 0 and box.is_visible():
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
                return True
    except Exception:
        pass
    return False


def _aistudio_tune_playground_max(page, thinking_level: str = "max", max_output: bool = True) -> dict:
    """尽量将 AI Studio Playground 的 Thinking level 调到最高可用挡位，并将 Output length 拉满。"""
    applied: dict = {}
    try:
        _aistudio_ensure_settings_panel_open(page)
        tl_mode = (thinking_level or "").strip().lower()
        if tl_mode and tl_mode != "default":
            tl = page.locator('mat-select[aria-label="Thinking Level"]').first
            if tl.count() > 0 and tl.is_visible():
                tl.click(timeout=5000)
                page.wait_for_timeout(300)
                chosen = page.evaluate(
                    """(mode) => {
                        const opts = Array.from(document.querySelectorAll('.cdk-overlay-pane mat-option')).filter(o => {
                            const dis = o.getAttribute('aria-disabled') === 'true' || o.classList.contains('mdc-list-item--disabled');
                            const txt = (o.innerText || '').trim();
                            return !dis && !/\\bpaid\\b/i.test(txt);
                        });
                        if (!opts.length) return '';
                        let target = null;
                        if (mode === 'max' || mode === 'high' || mode === 'extra high' || mode === 'xhigh') {
                            // 封印 Extra High：免費池優先選 High，其次選 Medium，絕不選 Extra High（防 403 權限拒絕與分鐘級卡頓）
                            target = opts.find(o => /^high$/i.test((o.innerText || '').trim()))
                                  || opts.find(o => /medium/i.test(o.innerText || ''))
                                  || opts[0];
                        } else {
                            target = opts.find(o => (o.innerText || '').toLowerCase().includes(mode));
                        }
                        if (!target) return '';
                        const label = (target.innerText || '').replace(/\\s+/g, ' ').trim();
                        target.click();
                        return label;
                    }""",
                    tl_mode,
                )
                if chosen:
                    applied["thinking_level"] = chosen
                else:
                    page.keyboard.press("Escape")
                page.wait_for_timeout(250)
    except Exception:
        pass

    if max_output:
        max_set = page.evaluate(
            """() => {
                let outInp = document.querySelector('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]');
                if (!outInp || outInp.getBoundingClientRect().height <= 0) {
                    const adv = Array.from(document.querySelectorAll('button, mat-expansion-panel-header')).find(
                        el => /advanced\\s*settings/i.test(el.innerText || '')
                    );
                    if (adv) adv.click();
                }
                return !!document.querySelector('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]');
            }"""
        )
        page.wait_for_timeout(350)
        if max_set:
            new_val = page.evaluate(
                """() => {
                    const outInp = document.querySelector('input[name="maxOutputTokens"], input[aria-label="Maximum output tokens"]');
                    if (!outInp || outInp.getBoundingClientRect().height <= 0) return '';
                    const maxVal = outInp.max || '1048576';
                    if (outInp.value !== maxVal) {
                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                        setter.call(outInp, maxVal);
                        outInp.dispatchEvent(new Event('input', { bubbles: true }));
                        outInp.dispatchEvent(new Event('change', { bubbles: true }));
                        outInp.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                    return outInp.value;
                }"""
            )
            if new_val:
                applied["max_output_tokens"] = new_val
            page.wait_for_timeout(200)
    return applied


def _aistudio_click_run(page, prompt_box) -> None:
    """精确点击主运行按钮，避开 button.rerun-button。"""
    clicked = page.evaluate(
        """() => {
            const btns = Array.from(document.querySelectorAll('button'));
            for (const b of btns) {
                if (b.classList.contains('rerun-button')) continue;
                if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
                const rect = b.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;
                const txt = (b.innerText || '').trim();
                if (/^Run\\b/i.test(txt)) {
                    b.click();
                    return true;
                }
            }
            return false;
        }"""
    )
    if not clicked:
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
                    if (/editing/i.test(aria) || /editing/i.test(txt)) continue;
                    if (/\\b(Stop|Cancel)\\b/i.test(txt) || /\\b(Stop|Cancel)\\b/i.test(aria)) return true;
                }
                const modelTurns = Array.from(document.querySelectorAll('[data-turn-role="Model"]'));
                const last = modelTurns[modelTurns.length - 1];
                if (last) {
                    const rawThoughtPanels = Array.from(last.querySelectorAll('mat-expansion-panel')).filter(
                        el => !el.closest('ms-code-block') && !el.querySelector('ms-code-block, pre, code')
                    );
                    const thoughtEls = Array.from(last.querySelectorAll('ms-thought-chunk, .thought-container')).concat(rawThoughtPanels);
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
                const rawThoughtPanels = Array.from(last.querySelectorAll('mat-expansion-panel')).filter(
                    el => !el.closest('ms-code-block') && !el.querySelector('ms-code-block, pre, code')
                );
                const thoughtEls = Array.from(last.querySelectorAll('ms-thought-chunk, .thought-container')).concat(rawThoughtPanels);
                const thoughtSet = new Set(thoughtEls);
                const finalCmarks = Array.from(last.querySelectorAll('ms-cmark-node')).filter(
                    n => !Array.from(thoughtSet).some(t => t.contains(n)) && (n.innerText || '').trim().length > 0
                );
                const hasMedia = last.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length > 0;
                const hasCode = last.querySelectorAll('ms-code-block, pre, code').length > 0;
                const hasError = last.querySelector('.error, mat-error') || /Thinking level is unsupported|Model error/i.test(last.innerText || '');
                return finalCmarks.length > 0 || hasMedia || hasCode || Boolean(hasError);
            }""",
            min_turns,
        )
    )


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
            // 过滤嵌套节点：仅保留顶层 ms-cmark-node，防止父节点与子节点 innerText 重复输出两次
            const topCmarks = cmarkNodes.filter(
                n => !cmarkNodes.some(other => other !== n && other.contains(n))
            );
            let text = '';
            if (topCmarks.length) {
                text = topCmarks.map(n => (n.innerText || '').trim()).filter(Boolean).join('\\n\\n');
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
) -> dict:
    """在 AI Studio /new_music (Lyria) 工作台生成完整歌曲并可选导出 MP3。"""
    box = page.locator('textarea[aria-label="Prompt input"]').first
    if box.count() == 0 or not box.is_visible():
        empty_btn = page.locator("button.empty-state__title-button").first
        if empty_btn.count() > 0:
            empty_btn.click()
        box.wait_for(state="visible", timeout=15000)

    before_count = page.locator('audio[src^="data:audio/"]').count()
    box.click()
    box.fill(prompt)
    page.wait_for_timeout(350)

    gen_btn = page.locator('button.ctrl-enter-submits:has-text("Generate"), button.ctrl-enter-submits').first
    gen_btn.wait_for(state="visible", timeout=10000)
    gen_btn.click()

    if async_send:
        page.wait_for_timeout(1000)
        return {
            "status": "dispatched",
            "entry": "aistudio-music",
            "model": model,
            "url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }

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
) -> dict:
    """在 AI Studio /generate-speech (TTS) 工作台合成语音并可选导出 WAV。"""
    box = page.locator('textarea[aria-label="Speech block text"]').first
    if box.count() == 0 or not box.is_visible():
        create_card = page.locator("mat-card.create-dialog-card").first
        if create_card.count() > 0:
            create_card.click()
        box.wait_for(state="visible", timeout=15000)

    before_count = page.locator('audio[src^="data:audio/"]').count()
    box.click()
    box.fill(prompt)
    page.wait_for_timeout(350)

    run_btn = page.locator("button.ctrl-enter-submits").first
    run_btn.wait_for(state="visible", timeout=10000)
    run_btn.click()

    if async_send:
        page.wait_for_timeout(1000)
        return {
            "status": "dispatched",
            "entry": "aistudio-tts",
            "model": model,
            "url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }

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
    )

    cur_url = page.url or ""
    if "/new_music" in cur_url or model_id.startswith("lyria"):
        return _aistudio_run_music(page, prompt, model_id or nav_model, download_dir, async_send, timeout_sec, t0)
    if "/generate-speech" in cur_url or "tts" in model_id:
        return _aistudio_run_tts(page, prompt, model_id or nav_model, download_dir, async_send, timeout_sec, t0)

    before_turns = page.locator("ms-chat-turn").count()
    is_fresh_session = before_turns == 0 and "/new_chat" in cur_url
    need_model_pick = explicit_model or ("hydrogen" if is_fresh_session else "")
    if need_model_pick and (not new_tab or not model_id or (model_id not in cur_url)):
        active_model = _short_model_name(_aistudio_select_playground_model(page, need_model_pick))
    else:
        card = page.locator(".model-selector-card").first
        active_model = _short_model_name((card.inner_text() or "") if card.count() > 0 else (model_id or nav_model))

    if sys_text:
        ok = _aistudio_set_system_instruction(page, sys_text)
        if not ok:
            prompt = f"[System Instructions]\n{sys_text}\n\n[User Prompt]\n{prompt}"

    if _is_media_playground_model(active_model or model_id):
        tuned = {}
    else:
        tuned = _aistudio_tune_playground_max(page, thinking_level=thinking_level, max_output=max_output)

    attached_files = _aistudio_attach_files(page, file_paths) if file_paths else []

    prompt_box = page.locator('textarea[aria-label="Enter a prompt"]').first
    prompt_box.wait_for(state="attached", timeout=15000)
    prompt_box.fill(prompt)
    page.wait_for_timeout(250)
    _aistudio_click_run(page, prompt_box)

    if async_send:
        deadline = time.time() + 15
        while time.time() < deadline:
            if "/new_chat" not in (page.url or "") or page.locator("ms-chat-turn").count() > before_turns:
                break
            page.wait_for_timeout(300)
        _save_last_session("aistudio", page.url)
        return {
            "status": "dispatched",
            "entry": "aistudio-playground",
            "model": active_model,
            "url": page.url,
            "attached_files": attached_files,
            "elapsed_sec": round(time.time() - t0, 2),
        }

    deadline = time.time() + timeout_sec
    started = False
    stable_ticks = 0
    while time.time() < deadline:
        running = _aistudio_playground_is_running(page)
        turn_count = page.locator("ms-chat-turn").count()
        announcer = page.locator(".cdk-live-announcer-element")
        announcer_txt = (announcer.first.inner_text() or "") if announcer.count() > 0 else ""
        if running or turn_count > before_turns:
            started = True
        has_output = _aistudio_has_final_output(page, min_turns=before_turns)
        if started and "response ready" in announcer_txt.lower() and not running and has_output:
            break
        if started and not running and has_output:
            stable_ticks += 1
            if stable_ticks >= 4:
                break
        else:
            stable_ticks = 0
        page.wait_for_timeout(500)
    else:
        raise TimeoutError("等待 AI Studio Playground 输出超时。")

    extracted = _aistudio_extract_playground_result(page, download_dir=download_dir)
    if "/new_chat" in (page.url or ""):
        page.wait_for_timeout(1200)
    _save_last_session("aistudio", page.url)
    thoughts_raw = extracted.get("thoughts", "") or ""
    return {
        "status": "ok",
        "entry": "aistudio-playground",
        "model": active_model,
        "url": page.url,
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
            r"(?:重置时间[:：]\s*|Resets?\s+|Credits?\s+refresh(?:\s+daily\s+at)?|点数将于|點數將於|刷新时间[:：]|每日)\s+([^\n]+?)(?=\s+(?:刷新|重置|升级|升級|person|Upgrade|退出|Sign\s*out|frame_spark|可见水印|隐私权|Privacy)|$)",
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
            for (const el of document.querySelectorAll('img[src*="flow-content.google"], img[src*="/asb/"], img[src^="blob:"], video[src*="flow-content.google"], video[src*="/asb/"], video source[src*="flow-content.google"], video source[src*="/asb/"]')) {
                const src = el.getAttribute('src') || el.currentSrc || '';
                if (!src) continue;
                if (el.tagName === 'IMG' && (el.naturalWidth === 0 || el.naturalHeight === 0)) continue;
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
                dl_item = page.locator('.cdk-overlay-pane [role="menuitem"]:has-text("下载"), .cdk-overlay-pane button:has-text("下载")').first
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
) -> dict:
    """在 Google Flow (flow.google.com) 使用独立点数池生成图片（Nano Banana 2.1 为 0 点）或视频（Omni 1.2 Flash / Veo 3.1 - Lite）。"""
    t0 = time.time()
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()

    page = None
    if project_url:
        for p in ctx.pages:
            if project_url in (p.url or ""):
                page = p
                page.bring_to_front()
                break
        if page is None:
            page = ctx.new_page()
            page.bring_to_front()
            page.goto(project_url, wait_until="domcontentloaded", timeout=30000)
    else:
        page = ctx.new_page()
        page.bring_to_front()
        page.goto("https://flow.google.com/", wait_until="domcontentloaded", timeout=30000)
        new_proj = page.locator('button:has-text("新建项目"), button:has-text("New project")').first
        new_proj.wait_for(state="visible", timeout=25000)
        new_proj.click()
        page.wait_for_url(re.compile(r".*/project/.*"), timeout=25000)

    box = page.locator('div.ProseMirror[aria-label="您希望创作什么？"], div.ProseMirror[role="textbox"]').first
    box.wait_for(state="visible", timeout=25000)
    page.wait_for_timeout(600)

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
    box.click()
    box.fill(prompt)
    page.wait_for_timeout(200)

    gen_btn = page.locator('button[aria-label="开始生成"], button.generate-icon-button').first
    gen_btn.wait_for(state="visible", timeout=10000)
    gen_btn.click()

    if async_send:
        page.wait_for_timeout(1500)
        return {
            "status": "dispatched",
            "entry": "flow",
            "media": media,
            "estimated_credits": estimated_credits,
            "project_url": page.url,
            "elapsed_sec": round(time.time() - t0, 2),
        }

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

    with sync_playwright() as p:
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
    with sync_playwright() as p:
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
    if res.get("attached_files"):
        meta_parts.append(f"attached={','.join(str(x) for x in res['attached_files'])}")
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
    parser = argparse.ArgumentParser(description="外部 Chrome Gemini / AI Studio / Google Flow 调用工具（CDP 备用通道）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_daemon = sub.add_parser("daemon", help="启动常驻 CDP 桥接服务")
    p_daemon.add_argument("--port", type=int, default=None)

    p_ask = sub.add_parser("ask", help="在 gemini.google.com 发起异步任务或对话（默认 task 模式）")
    p_ask.add_argument("--prompt", "-p", required=True, help="提问或任务描述")
    p_ask.add_argument("--entry", choices=["", "chat", "task"], default="", help="入口: task(默认) | chat(对话；传 --tool/--thinking 时自动切 chat)")
    p_ask.add_argument("--model", "-m", default="", help="模型: hydrogen(新会话默认) | neon | carbon | auto（复用会话不传则保持原模型）")
    p_ask.add_argument("--tool", "-t", default=None, help="对话模式工具: Deep Research | Canvas | 制作图片 | 制作视频 | 制作音乐")
    p_ask.add_argument("--thinking", default=None, help="思考等级: 低 | 中 | 高")
    p_ask.add_argument("--file", dest="files", action="append", default=[], help="无弹窗上传本地附件（可多次传入）")
    p_ask.add_argument("--reuse-tab", action="store_true", help="显式复用已有标签页继续对话（默认已优先复用）")
    p_ask.add_argument("--new-chat", action="store_true", help="强制新开一个空白对话窗口")
    p_ask.add_argument("--tab-hint", default="", help="指定复用的会话 URL 或片段")
    p_ask.add_argument("--async-send", action="store_true", help="异步发射：发包拿到会话 URL 后立即返回不等待完成")
    p_ask.add_argument("--timeout", type=int, default=180, help="同步等待超时秒数")
    p_ask.add_argument("--out-file", default="", help="将正文直接写入本地文件，stdout 仅返回极简回执")
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
    p_pg.add_argument("--prompt", "-p", required=True, help="输入提示词或配音文本")
    p_pg.add_argument(
        "--model",
        "-m",
        default="",
        help="模型别名或ID: hydrogen(新会话默认) | neon | argon | nano2.1 | omni1.2 | lyria | tts | research 等（复用不传则保持原模型）",
    )
    p_pg.add_argument("--system", default="", help="系统指令 (System Instructions)")
    p_pg.add_argument("--system-file", default="", help="从本地文件读取文本并写入 System Instructions（如世界观设定 .md/.txt）")
    p_pg.add_argument("--file", dest="files", action="append", default=[], help="无弹窗上传本地文件（可多次传入，支持 txt/md/pdf/docx/图片/音视频）")
    p_pg.add_argument("--thinking-level", default="high", help="思考等级: high(默认推荐，兼具深度与速度) | medium | low | default(保留默认)；注意: extra-high 已封印防卡死")
    p_pg.add_argument("--no-max-output", action="store_true", help="不自动将 Output length 拉满至模型上限(1048576)")
    p_pg.add_argument("--with-thoughts", action="store_true", help="在输出中附带模型完整思考链（默认省略以省 Token）")
    p_pg.add_argument("--out-file", default="", help="将生成的文本/代码直接写入本地文件，stdout 仅返回回执")
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

    args = parser.parse_args()

    if args.cmd == "daemon":
        run_daemon(port_override=args.port)
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
        new_tab = bool(args.new_chat and not args.reuse_tab and not args.tab_hint)
        payload = {
            "prompt": args.prompt,
            "entry": args.entry,
            "model": args.model,
            "tool": args.tool,
            "thinking": args.thinking,
            "new_tab": new_tab,
            "tab_url_hint": args.tab_hint,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
            "files": args.files,
        }
        res = _exec_cdp(
            args.port,
            "/ask",
            payload,
            lambda b: execute_ask(
                b,
                prompt=args.prompt,
                entry=args.entry,
                model=args.model,
                tool=args.tool,
                thinking=args.thinking,
                new_tab=new_tab,
                tab_url_hint=args.tab_hint,
                async_send=args.async_send,
                timeout_sec=args.timeout,
                files=args.files,
            ),
        )
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
                with sync_playwright() as p:
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
        new_tab = bool(args.new_chat and not args.reuse_tab and not args.tab_hint)
        payload = {
            "prompt": args.prompt,
            "model": args.model,
            "system_instruction": args.system,
            "system_file": args.system_file,
            "files": args.files,
            "new_tab": new_tab,
            "tab_url_hint": args.tab_hint,
            "async_send": args.async_send,
            "timeout_sec": args.timeout,
            "download_dir": args.download_dir,
            "thinking_level": args.thinking_level,
            "max_output": not args.no_max_output,
            "include_thoughts": args.with_thoughts,
        }
        res = _exec_cdp(
            args.port,
            "/playground",
            payload,
            lambda b: execute_playground(
                b,
                prompt=args.prompt,
                model=args.model,
                system_instruction=args.system,
                system_file=args.system_file,
                files=args.files,
                new_tab=new_tab,
                tab_url_hint=args.tab_hint,
                async_send=args.async_send,
                timeout_sec=args.timeout,
                download_dir=args.download_dir,
                thinking_level=args.thinking_level,
                max_output=not args.no_max_output,
                include_thoughts=args.with_thoughts,
            ),
        )
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
        payload = {
            "prompt": args.prompt,
            "media": args.media,
            "model": args.model,
            "aspect": args.aspect,
            "count": args.count,
            "resolution": args.resolution,
            "video_mode": args.video_mode,
            "project_url": args.project_url,
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
                project_url=args.project_url,
                download_dir=args.download_dir,
                async_send=args.async_send,
                timeout_sec=args.timeout,
            ),
        )
        _print_result(res, False, as_json=args.as_json)


if __name__ == "__main__":
    main()
