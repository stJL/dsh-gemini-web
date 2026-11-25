#!/usr/bin/env python3
"""本地自动化验收测试脚本：验证 inspect_antigravity 延迟基准与 gemini_web DOM/轮询状态机。"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

if "playwright" not in sys.modules:
    _pw_mod = MagicMock()
    sys.modules["playwright"] = _pw_mod
    sys.modules["playwright.sync_api"] = _pw_mod.sync_api

REPO_ROOT = Path(__file__).resolve().parent.parent
INSPECT_SCRIPT = REPO_ROOT / "scripts" / "inspect_antigravity.py"
GEMINI_WEB_SCRIPT = REPO_ROOT / "scripts" / "gemini_web.py"


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _clear_antigravity_caches() -> None:
    tmp_dir = Path(tempfile.gettempdir())
    for fname in ("antigravity_rpc_cache.json", "antigravity_db_cache.json"):
        target = tmp_dir / fname
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass


class TestInspectAntigravityBenchmarks(unittest.TestCase):
    """a) inspect_antigravity.py 冷/热启动及分层模式基准测试。"""

    @classmethod
    def setUpClass(cls) -> None:
        if not INSPECT_SCRIPT.is_file():
            raise unittest.SkipTest(f"未找到目标脚本: {INSPECT_SCRIPT}")

    def _run_inspect(self, *args: str, timeout_sec: float = 15.0) -> tuple[float, subprocess.CompletedProcess[str]]:
        t0 = time.perf_counter()
        proc = subprocess.run(
            [sys.executable, str(INSPECT_SCRIPT), *args],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            errors="replace",
        )
        elapsed = time.perf_counter() - t0
        self.assertEqual(
            proc.returncode,
            0,
            f"inspect_antigravity.py {' '.join(args)} failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}",
        )
        self.assertTrue(proc.stdout.strip(), "输出不应为空")
        return elapsed, proc

    def test_01_cold_and_warm_fast_mode(self) -> None:
        _clear_antigravity_caches()

        # 冷启动：要求 < 5.0 秒（远低于 Antigravity 10 秒异步任务截断阈值，原版为 17.36 秒超时）
        cold_elapsed, cold_proc = self._run_inspect("--markdown")
        print(f"\n[Benchmark] --markdown 冷启动耗时: {cold_elapsed * 1000:.1f} ms")
        self.assertLess(
            cold_elapsed,
            5.0,
            f"冷启动耗时 {cold_elapsed:.3f}s 超过 5.0s 阈值",
        )
        self.assertIn("Antigravity", cold_proc.stdout)

        # 热启动：要求 < 1.0 秒（远低于 10 秒异步阈值）
        warm_elapsed, _ = self._run_inspect("--markdown")
        print(f"[Benchmark] --markdown 热启动耗时: {warm_elapsed * 1000:.1f} ms")
        self.assertLess(
            warm_elapsed,
            1.0,
            f"热启动耗时 {warm_elapsed:.3f}s 超过 1.0s 阈值",
        )

    def test_02_live_only_mode(self) -> None:
        elapsed, proc = self._run_inspect("--json", "--live-only")
        print(f"[Benchmark] --live-only 耗时: {elapsed * 1000:.1f} ms")
        data = json.loads(proc.stdout)
        self.assertEqual(data["token_analytics"]["mode"], "live_only")
        self.assertTrue(data["token_analytics"]["skipped"])
        self.assertLess(elapsed, 1.0, f"--live-only 耗时 {elapsed:.3f}s 过高")

    def test_03_all_history_incremental_cache(self) -> None:
        # 首次生成全量 DB 缓存（历史对话较大时允许最多 45s 建立初次缓存）
        first_elapsed, _ = self._run_inspect("--markdown", "--all-history", timeout_sec=45.0)
        # 第二次增量复用：要求 < 1.2 秒（原版 > 17 秒）
        second_elapsed, _ = self._run_inspect("--markdown", "--all-history")
        print(
            f"[Benchmark] --all-history 首次: {first_elapsed * 1000:.1f} ms | "
            f"增量热缓存: {second_elapsed * 1000:.1f} ms"
        )
        self.assertLess(
            second_elapsed,
            1.2,
            f"--all-history 二次增量缓存耗时 {second_elapsed:.3f}s 超过 1.2s 阈值",
        )


class TestGeminiWebDOMAndPolling(unittest.TestCase):
    """b) gemini_web.py DOM 状态评估与防抖/兜底状态机测试。"""

    @classmethod
    def setUpClass(cls) -> None:
        if not GEMINI_WEB_SCRIPT.is_file():
            raise unittest.SkipTest(f"未找到目标脚本: {GEMINI_WEB_SCRIPT}")
        cls.mod = _load_module("gemini_web_under_test", GEMINI_WEB_SCRIPT)
        if not hasattr(cls.mod, "DOM_STATUS_EVAL_JS"):
            raise unittest.SkipTest("gemini_web.py 未导出 DOM_STATUS_EVAL_JS 常量")

    def _eval_html_with_node(self, dom_spec: dict[str, Any]) -> dict[str, Any]:
        """Node.js 轻量 DOM 模拟环境评测 DOM_STATUS_EVAL_JS。"""
        node_bin = shutil.which("node")
        if not node_bin:
            raise unittest.SkipTest("未找到 node 可执行文件。")

        harness = f"""
const spec = {json.dumps(dom_spec)};
function makeEl(cfg) {{
  return {{
    _cfg: cfg,
    innerText: cfg.text || '',
    textContent: cfg.text || '',
    offsetParent: cfg.visible ? {{}} : null,
    offsetWidth: cfg.visible ? 32 : 0,
    offsetHeight: cfg.visible ? 32 : 0,
    getClientRects: () => (cfg.visible ? [{{ width: 10, height: 10 }}] : []),
    getAttribute: (attr) => cfg.attributes ? cfg.attributes[attr] : null,
    querySelector: () => null,
    querySelectorAll: () => [],
  }};
}}
global.window = {{
  getComputedStyle: (el) => ({{
    display: el._cfg.display || 'block',
    visibility: el._cfg.visibility || 'visible',
    opacity: el._cfg.opacity !== undefined ? String(el._cfg.opacity) : '1',
  }}),
}};
global.location = {{ href: 'https://gemini.google.com/app' }};
global.document = {{
  querySelectorAll: (selector) => {{
    const matched = [];
    const parts = selector.split(',').map(s => s.trim().toLowerCase());
    for (const item of spec.elements) {{
      const itemTags = (item.tags || []).map(t => t.toLowerCase());
      const hasStreamingAttr = item.attributes && item.attributes['is-streaming'] === 'true';
      const matches = parts.some(p => {{
        if (p.includes('[is-streaming="true"]')) {{
          return hasStreamingAttr;
        }}
        return itemTags.some(t => t === p || p.startsWith(t) && !p.includes('['));
      }});
      if (matches) {{
        matched.push(makeEl(item));
      }}
    }}
    return matched;
  }},
  querySelector: (selector) => {{
    const all = global.document.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }},
}};
const result = {self.mod.DOM_STATUS_EVAL_JS};
console.log(JSON.stringify(result));
"""
        proc = subprocess.run(
            [node_bin, "-e", harness],
            capture_output=True,
            text=True,
            timeout=5.0,
            check=True,
        )
        return json.loads(proc.stdout.strip())

    def test_scenario_a_no_stop_no_mic_idle(self) -> None:
        """场景 A：stopBtn = null, micBtn = null（无语音按钮的空闲态）-> 断言 running == False。"""
        node_spec = {
            "elements": [
                {"tags": ["model-response"], "visible": True, "text": "已完成架构规划。"},
                {"tags": ['button[aria-label*="Send" i]'], "visible": True},
            ]
        }
        res = self._eval_html_with_node(node_spec)
        self.assertFalse(res["running"], f"场景 A 期望 running=False，实际: {res}")
        self.assertFalse(res["hasStopBtn"])
        self.assertTrue(res["isIdleUI"])

    def test_scenario_b_visible_stop_no_mic_streaming(self) -> None:
        """场景 B：stopBtn = visible, micBtn = null（正在流式输出）-> 断言 running == True。"""
        node_spec = {
            "elements": [
                {"tags": ["model-response"], "visible": True, "text": "正在生成中..."},
                {"tags": ['button[aria-label*="Stop" i]'], "visible": True},
            ]
        }
        res = self._eval_html_with_node(node_spec)
        self.assertTrue(res["running"], f"场景 B 期望 running=True，实际: {res}")
        self.assertTrue(res["hasStopBtn"])

    def test_scenario_c_no_stop_visible_mic_idle(self) -> None:
        """场景 C：stopBtn = null, micBtn = visible（带麦克风的空闲态）-> 断言 running == False。"""
        node_spec = {
            "elements": [
                {"tags": ["model-response"], "visible": True, "text": "回答完毕。"},
                {"tags": ['button[aria-label*="Microphone" i]'], "visible": True},
                {"tags": ['button[aria-label*="Copy" i]'], "visible": True},
            ]
        }
        res = self._eval_html_with_node(node_spec)
        self.assertFalse(res["running"], f"场景 C 期望 running=False，实际: {res}")
        self.assertFalse(res["hasStopBtn"])
        self.assertTrue(res["isIdleUI"])


if __name__ == "__main__":
    unittest.main()
