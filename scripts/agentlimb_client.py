#!/usr/bin/env python3
"""
AgentLimb HTTP RPC Client (agentlimb_client.py)
Directly calls http://127.0.0.1:8765/api/tool with dynamic port discovery and multi-profile routing.

Features:
  - Dynamic discovery of bridge port (8765-8780)
  - Universal call_tool(tool, arguments, timeout)
  - Profile-aware routing via "browser" argument
  - Convenience wrappers: eval_js(), get_tabs(), get_status()
"""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_PORTS: Tuple[int, ...] = tuple(range(8765, 8781))


def _bridge_priority(data: Dict[str, Any]) -> Tuple[int, int]:
    """Rank bridge /health responses so authorized & active bridges win over revoked/idle ports."""
    if not isinstance(data, dict) or not data.get("ok"):
        return (-1, 0)
    authorized = bool(data.get("authorized"))
    active_browser = bool(data.get("activeBrowser"))
    denied = bool(data.get("denied"))
    browsers = data.get("browserList") or []
    has_auth_browser = any(isinstance(b, dict) and b.get("authorized") for b in browsers)
    has_any_browser = active_browser or bool(browsers) or bool(data.get("browsers"))

    if authorized and (active_browser or has_auth_browser) and not denied:
        return (4, 1 if data.get("stage") == "ready" else 0)
    if authorized and not denied:
        return (3, 1 if has_any_browser else 0)
    if has_any_browser and not denied and data.get("authorized") is not False:
        return (2, 0)
    if not denied:
        return (1, 0)
    return (0, 0)


def _select_best_bridge(
    host: str = "127.0.0.1",
    ports: Tuple[int, ...] = DEFAULT_PORTS,
) -> Tuple[int, Optional[Dict[str, Any]]]:
    """Probe candidate bridge ports and return (best_port, health_payload)."""
    best_port = ports[0]
    best_data: Optional[Dict[str, Any]] = None
    best_score: Tuple[int, int] = (-1, -1)

    for port in ports:
        try:
            req = urllib.request.Request(f"http://{host}:{port}/health")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    score = _bridge_priority(data)
                    if score > best_score:
                        best_score = score
                        best_port = port
                        best_data = data
                        if score[0] >= 4:
                            break
        except Exception:
            continue

    return best_port, best_data


def get_bridge_url(host: str = "127.0.0.1", ports: Tuple[int, ...] = DEFAULT_PORTS) -> str:
    """Probe the health endpoints of candidate bridge ports and return the active /api/tool URL."""
    best_port, _ = _select_best_bridge(host=host, ports=ports)
    return f"http://{host}:{best_port}/api/tool"


def get_status(host: str = "127.0.0.1", ports: Tuple[int, ...] = DEFAULT_PORTS) -> Optional[Dict[str, Any]]:
    """Return the health and connected browser info from the best available active bridge."""
    _, best_data = _select_best_bridge(host=host, ports=ports)
    return best_data


def call_tool(
    tool: str,
    arguments: Optional[Dict[str, Any]] = None,
    timeout: float = 60.0,
    host: str = "127.0.0.1",
    ports: Tuple[int, ...] = DEFAULT_PORTS,
) -> Any:
    """Invoke an AgentLimb browser tool over HTTP POST /api/tool."""
    payload = {
        "tool": tool,
        "arguments": arguments or {},
        "timeoutMs": int(timeout * 1000),
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = get_bridge_url(host=host, ports=ports)
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout + 5) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            if not res.get("ok"):
                raise RuntimeError(f"AgentLimb tool execution failed: {res.get('error')}")
            return res.get("result")
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8") if err.fp else ""
        raise RuntimeError(f"HTTP {err.code}: {body}") from err


def eval_js(
    expression: str,
    browser: Optional[str] = None,
    tab_id: Optional[int] = None,
    timeout: float = 60.0,
) -> Any:
    """Evaluate JavaScript in a tab (optionally targeting a specific browser profile/tab)."""
    args: Dict[str, Any] = {"expression": expression}
    if browser:
        args["browser"] = browser
    if tab_id is not None:
        args["tabId"] = int(tab_id)
    return call_tool("javascript_eval", args, timeout=timeout)


def get_tabs(browser: Optional[str] = None) -> List[Dict[str, Any]]:
    """List open tabs (optionally for a specific browser profile)."""
    args: Dict[str, Any] = {}
    if browser:
        args["browser"] = browser
    res = call_tool("tabs_context", args)
    if isinstance(res, dict) and "result" in res:
        res = res["result"]
    if isinstance(res, dict) and "tabs" in res:
        return res["tabs"]
    return []


if __name__ == "__main__":
    print("Testing AgentLimb RPC Client...")
    status = get_status()
    if not status:
        print("❌ No running AgentLimb bridge server found on ports 8765-8780.")
    else:
        print(f"✅ Bridge found on port {status.get('port')}: version {status.get('version')}")
        browsers = status.get("browserList", [])
        print(f"Connected browsers: {len(browsers)}")
        for b in browsers:
            print(f"  - {b.get('label')} (id: {b.get('id')}, active: {b.get('active')})")
        tabs = get_tabs()
        print(f"Active browser open tabs: {len(tabs)}")
