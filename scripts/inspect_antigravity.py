#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity 全景配额、底层路由校验与 Token 深度监控脚本
功能：
1. 动态探测本地 Antigravity language_server Connect-RPC 接口，获取实时模型配额、重置倒计时与双轨桶额度（5小时滚动限流 + 周限额）。
2. 解析本地 SQLite 会话数据库 (gen_metadata / executor_metadata / steps)，校验当前会话及历史会话的真实后端路由模型 (routed_model)。
3. 统计当前会话上下文占用水位 (Context Window)、今日四维 Token 消耗 (Input / Cached / Output / Thinking)、缓存命中率及历史汇总。
"""

import os
import sys
import re
import shutil
import glob
import json
import struct
import sqlite3
import subprocess
import http.client
import urllib.request
import ssl
import time
import tempfile
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from contextlib import closing

# 缓存路径与版本号
RPC_CACHE_PATH = os.path.join(tempfile.gettempdir(), "antigravity_rpc_cache.json")
DB_CACHE_PATH = os.path.join(tempfile.gettempdir(), "antigravity_db_cache.json")
DB_CACHE_SCHEMA_VERSION = 2

# 预编译热点正则与复用 SSL 上下文（避免 Windows 下每次新建 SSLContext 重复加载系统证书存储）
_RPC_SSL_CTX = ssl._create_unverified_context()
_RE_CSRF_TOKEN = re.compile(r"--csrf_token[=\s]+([A-Za-z0-9\-_.=+/]+)")
_RE_ASCII_RUN = re.compile(rb"[\x20-\x7E]{3,}")
_RE_MODEL_NAME_BYTES = re.compile(rb"^(?:gemini-[a-zA-Z0-9\.\-]+|claude-[a-zA-Z0-9\.\-]+|gpt-[a-zA-Z0-9\.\-]+)$")
_TELEMETRY_MARKERS = (b"model_enum", b"used_non_gemini_model", b"used_claude")
_RE_SETTINGS_CHANGE = re.compile(
    r"<USER_SETTINGS_CHANGE>\s*The user changed setting `Model Selection` from ([A-Za-z0-9\.\-\s\(\)]+?) to ([A-Za-z0-9\.\-\s\(\)]+?)\."
)
_RE_USER_REQUEST = re.compile(r"<USER_REQUEST>\s*([\s\S]*?)\s*</USER_REQUEST>")
_RE_LAST_STEP_IDX = re.compile(rb"last_step_index\x12[\x01-\x10](\d+)")

_PROTO_F1 = frozenset((1,))
_PROTO_F4_20 = frozenset((4, 20))
_PROTO_F_USAGE = frozenset((2, 3, 5, 10))

# 适配 Windows 终端 UTF-8 输出
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

LOCAL_TZ = datetime.now().astimezone().tzinfo or timezone(timedelta(hours=8))


def local_tz_label() -> str:
    offset = datetime.now(LOCAL_TZ).utcoffset()
    if offset is None:
        return "Local"
    total_mins = int(offset.total_seconds() // 60)
    sign = "+" if total_mins >= 0 else "-"
    abs_mins = abs(total_mins)
    hh, mm = divmod(abs_mins, 60)
    return f"UTC{sign}{hh}" if mm == 0 else f"UTC{sign}{hh}:{mm:02d}"
GEMINI_HOME = os.path.join(os.path.expanduser("~"), ".gemini")
DATA_SOURCES = [
    os.path.join(GEMINI_HOME, "antigravity", "conversations"),
    os.path.join(GEMINI_HOME, "antigravity-ide", "conversations"),
    os.path.join(GEMINI_HOME, "antigravity-cli", "conversations"),
]


# ============================================================================
# 1. Protobuf 轻量解析器与 SQLite 只读工具
# ============================================================================

def parse_proto(data: bytes, target_fields: frozenset[int] | None = None):
    """快速解析 Protobuf Wire Format（支持按 target_fields 跳过无关字段，减少切片与对象分配）"""
    pos = 0
    fields = {}
    length_data = len(data)
    while pos < length_data:
        try:
            key = 0
            shift = 0
            while True:
                if pos >= length_data or shift > 64:
                    return fields
                b = data[pos]
                pos += 1
                key |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            field_num = key >> 3
            wire_type = key & 0x7
            want = target_fields is None or field_num in target_fields
            if wire_type == 0:  # Varint
                if want:
                    val = 0
                    shift = 0
                    while True:
                        if pos >= length_data or shift > 64:
                            return fields
                        b = data[pos]
                        pos += 1
                        val |= (b & 0x7F) << shift
                        shift += 7
                        if not (b & 0x80):
                            break
                    fields.setdefault(field_num, []).append(("varint", val))
                else:
                    shift = 0
                    while True:
                        if pos >= length_data or shift > 64:
                            return fields
                        b = data[pos]
                        pos += 1
                        shift += 7
                        if not (b & 0x80):
                            break
            elif wire_type == 1:  # fixed64
                if pos + 8 > length_data:
                    break
                if want:
                    val = struct.unpack("<Q", data[pos : pos + 8])[0]
                    fields.setdefault(field_num, []).append(("fixed64", val))
                pos += 8
            elif wire_type == 2:  # bytes / sub-message
                length = 0
                shift = 0
                while True:
                    if pos >= length_data or shift > 64:
                        return fields
                    b = data[pos]
                    pos += 1
                    length |= (b & 0x7F) << shift
                    shift += 7
                    if not (b & 0x80):
                        break
                if length < 0 or pos + length > length_data:
                    break
                if want:
                    payload = data[pos : pos + length]
                    fields.setdefault(field_num, []).append(("bytes", payload))
                pos += length
            elif wire_type == 5:  # fixed32
                if pos + 4 > length_data:
                    break
                if want:
                    val = struct.unpack("<I", data[pos : pos + 4])[0]
                    fields.setdefault(field_num, []).append(("fixed32", val))
                pos += 4
            else:
                break
        except Exception:
            break
    return fields


def open_readonly_db(db_path: str):
    """以只读安全模式打开 SQLite 数据库"""
    db_uri = Path(os.path.abspath(db_path)).as_uri()
    uri = f"{db_uri}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True, timeout=3.0)
        con.execute("PRAGMA busy_timeout = 2000;")
        con.execute("PRAGMA query_only = ON;")
        return con
    except sqlite3.OperationalError:
        imm_uri = f"{db_uri}?mode=ro&immutable=1"
        return sqlite3.connect(imm_uri, uri=True, timeout=2.0)


# ============================================================================
# 2. 本地 Language Server Connect-RPC 探测与配额拉取
# ============================================================================

def _open_rpc_conn(port: int, protocol: str, timeout: float):
    if protocol == "https":
        return http.client.HTTPSConnection("127.0.0.1", port, timeout=timeout, context=_RPC_SSL_CTX)
    return http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)


def _rpc_post_on_conn(conn, csrf_token: str, endpoint: str):
    path = f"/exa.language_server_pb.LanguageServerService/{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "X-Codeium-Csrf-Token": csrf_token,
        "Connect-Protocol-Version": "1",
        "Connection": "keep-alive",
    }
    conn.request("POST", path, body=b'{"wrapper_data":{}}', headers=headers)
    resp = conn.getresponse()
    raw = resp.read()
    if resp.status == 200:
        return json.loads(raw.decode("utf-8", errors="ignore"))
    return None


def _probe_and_fetch_rpc_pair(port: int, csrf_token: str, protocol: str, status_timeout: float = 0.6, quota_timeout: float = 1.0):
    """复用单条 HTTP/HTTPS Keep-Alive 连接连续拉取 GetUserStatus 与 RetrieveUserQuotaSummary，避免重复 TLS 握手。"""
    conn = None
    try:
        conn = _open_rpc_conn(port, protocol, status_timeout)
        status = _rpc_post_on_conn(conn, csrf_token, "GetUserStatus")
        if not status or "userStatus" not in status:
            return None
        quota_summary = None
        try:
            if conn.sock is not None:
                conn.sock.settimeout(quota_timeout)
            quota_summary = _rpc_post_on_conn(conn, csrf_token, "RetrieveUserQuotaSummary")
        except Exception:
            # 服务端若主动关闭连接，降级重连补发一次
            quota_summary = query_rpc(port, csrf_token, protocol, "RetrieveUserQuotaSummary", timeout=quota_timeout)
        return status["userStatus"], quota_summary
    except Exception:
        return None
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def query_rpc(port: int, csrf_token: str, protocol: str, endpoint: str, timeout: float = 1.5):
    """调用本地 Connect-RPC 接口（复用模块级 SSLContext 避免重复扫描系统证书存储）"""
    conn = None
    try:
        conn = _open_rpc_conn(port, protocol, timeout)
        return _rpc_post_on_conn(conn, csrf_token, endpoint)
    except Exception:
        return None
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def find_language_servers():
    """扫描正在运行的 language_server 进程及其监听端口（Windows/Linux 优先零子进程原生探测）"""
    candidates = []
    if sys.platform == "win32":
        # 0. Windows 零子进程 Win32 ctypes 原生探测（~10-30ms，免除 tasklist / wmic / powershell 开销）
        try:
            scripts_dir = str(Path(__file__).resolve().parent)
            if scripts_dir not in sys.path:
                sys.path.insert(0, scripts_dir)
            import platform_utils
            win32_cands = platform_utils.find_windows_servers_via_win32()
            if win32_cands:
                candidates.extend(win32_cands)
        except Exception:
            pass

        if candidates:
            candidates.sort(key=lambda x: x["score"], reverse=True)
            return candidates

        # 1. Windows 兜底轻量级探测 (tasklist + netstat + wmic/powershell)
        pids = []
        try:
            p_task = subprocess.run(
                ["tasklist", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=3,
            )
            for row in p_task.stdout.splitlines():
                row_s = row.strip()
                if "language_server" in row_s.lower() or "agy" in row_s.lower():
                    parts = [c.strip('"') for c in row_s.split('","')]
                    if len(parts) >= 2 and parts[1].isdigit():
                        pids.append(int(parts[1]))
        except Exception:
            pass

        if pids:
            pid_ports = defaultdict(list)
            try:
                p_net = subprocess.run(
                    ["netstat", "-ano", "-p", "tcp"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=3,
                )
                pid_set = set(pids)
                for line in p_net.stdout.splitlines():
                    if "LISTENING" in line:
                        toks = line.split()
                        if len(toks) >= 5 and toks[-1].isdigit():
                            l_pid = int(toks[-1])
                            if l_pid in pid_set:
                                try:
                                    port_num = int(toks[1].rsplit(":", 1)[-1])
                                    pid_ports[l_pid].append(port_num)
                                except Exception:
                                    pass
            except Exception:
                pass

            has_wmic = bool(shutil.which("wmic"))
            for pid in pids:
                cmd_line = ""
                exe_path = ""
                if has_wmic:
                    try:
                        p_wmic = subprocess.run(
                            ["wmic", "process", "where", f"ProcessId={pid}", "get", "CommandLine,ExecutablePath", "/format:list"],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            timeout=3,
                        )
                        for line in p_wmic.stdout.splitlines():
                            if line.startswith("CommandLine="):
                                cmd_line = line.split("=", 1)[1]
                            elif line.startswith("ExecutablePath="):
                                exe_path = line.split("=", 1)[1]
                    except Exception:
                        pass

                if not cmd_line or "--csrf_token" not in cmd_line:
                    try:
                        ps_single = f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine"
                        p_ps = subprocess.run(
                            ["powershell", "-NoProfile", "-Command", ps_single],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            timeout=3,
                        )
                        cmd_line = p_ps.stdout.strip()
                    except Exception:
                        pass

                if "--csrf_token" in cmd_line:
                    score = 0
                    if "--standalone" in cmd_line or "Programs\\Antigravity\\resources" in exe_path:
                        score += 100
                    elif "Antigravity IDE" in exe_path:
                        score += 50
                    candidates.append({
                        "pid": pid,
                        "cmd": cmd_line,
                        "exe": exe_path,
                        "ports": sorted(set(pid_ports[pid])),
                        "score": score,
                    })

        # 2. 若原生轻量探测未捕获，降级使用全量 PowerShell WQL 探测
        if not candidates:
            ps_cmd = (
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
                "Get-CimInstance Win32_Process | Where-Object { "
                "($_.Name -like '*language_server*' -or $_.Name -like '*agy*') "
                "-and $_.Name -notlike '*powershell*' -and $_.Name -notlike '*pwsh*' "
                "-and $_.CommandLine -like '*--csrf_token*' "
                "} | ForEach-Object { "
                "$p = $_.ProcessId; "
                "$ports = @(Get-NetTCPConnection -OwningProcess $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique); "
                "[PSCustomObject]@{ pid = $p; name = $_.Name; exe = $_.ExecutablePath; cmd = $_.CommandLine; ports = $ports } "
                "} | ConvertTo-Json -Compress"
            )
            try:
                proc = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", ps_cmd],
                    capture_output=True,
                    timeout=8,
                )
                out = proc.stdout.decode("utf-8", errors="ignore").strip()
                if out:
                    parsed = json.loads(out)
                    if isinstance(parsed, dict):
                        parsed = [parsed]
                    for item in parsed:
                        pid = item.get("pid")
                        cmd = item.get("cmd") or ""
                        exe = item.get("exe") or ""
                        ports = item.get("ports") or []
                        if isinstance(ports, int):
                            ports = [ports]
                        score = 0
                        if "--standalone" in cmd or "Programs\\Antigravity\\resources" in exe:
                            score += 100
                        elif "Antigravity IDE" in exe:
                            score += 50
                        candidates.append({
                            "pid": pid,
                            "cmd": cmd,
                            "exe": exe,
                            "ports": ports,
                            "score": score,
                        })
            except Exception:
                pass
    else:
        proc_found = False
        if sys.platform.startswith("linux"):
            try:
                scripts_dir = str(Path(__file__).resolve().parent)
                if scripts_dir not in sys.path:
                    sys.path.insert(0, scripts_dir)
                import platform_utils
                proc_cands = platform_utils.find_linux_servers_via_proc()
                if proc_cands:
                    candidates.extend(proc_cands)
                    proc_found = True
            except Exception:
                pass

        if not proc_found:
            try:
                proc = subprocess.run(
                    ["ps", "-ax", "-o", "pid=,args="],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=5,
                )
                for line in proc.stdout.splitlines():
                    line = line.strip()
                    if not line or "--csrf_token" not in line:
                        continue
                    if "language_server" not in line and "agy" not in line:
                        continue
                    parts = line.split(None, 1)
                    if len(parts) < 2 or not parts[0].isdigit():
                        continue
                    pid = int(parts[0])
                    cmd = parts[1]
                    exe = cmd.split()[0]
                    ports = []
                    if shutil.which("lsof"):
                        lp = subprocess.run(
                            ["lsof", "-nP", "-a", "-p", str(pid), "-iTCP", "-sTCP:LISTEN"],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            timeout=3,
                        )
                        for m_port in re.finditer(r":(\d+)\s+\(LISTEN\)", lp.stdout):
                            ports.append(int(m_port.group(1)))
                    elif shutil.which("ss"):
                        sp = subprocess.run(
                            ["ss", "-ltnp"],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            timeout=3,
                        )
                        pid_tag = f"pid={pid}"
                        for sline in sp.stdout.splitlines():
                            if pid_tag in sline:
                                for m_port in re.finditer(r":(\d+)\s+", sline):
                                    ports.append(int(m_port.group(1)))
                    score = 100 if "--standalone" in cmd else 50
                    candidates.append({
                        "pid": pid,
                        "cmd": cmd,
                        "exe": exe,
                        "ports": sorted(set(ports)),
                        "score": score,
                    })
            except Exception:
                pass
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates


def fetch_live_rpc_data(use_cache: bool = True):
    """自动探测并拉取 GetUserStatus 与 RetrieveUserQuotaSummary（支持端口缓存快速命中 + Keep-Alive 复用 + 并发端口试错）"""
    if use_cache and os.path.exists(RPC_CACHE_PATH):
        try:
            with open(RPC_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
            port = cached.get("port")
            csrf_token = cached.get("csrf_token")
            proto = cached.get("protocol", "http")
            if port and csrf_token:
                pair = _probe_and_fetch_rpc_pair(port, csrf_token, proto, status_timeout=0.4, quota_timeout=1.0)
                if pair is not None:
                    user_status, quota_summary = pair
                    return {
                        "pid": cached.get("pid"),
                        "port": port,
                        "protocol": proto,
                        "exe": cached.get("exe"),
                        "user_status": user_status,
                        "quota_summary": quota_summary,
                    }
        except Exception:
            pass

    candidates = find_language_servers()
    probes = []
    for cand in candidates:
        cmd = cand["cmd"]
        m_token = _RE_CSRF_TOKEN.search(cmd)
        if not m_token:
            continue
        csrf_token = m_token.group(1)
        ports = cand.get("ports") or []
        # Antigravity 语言服务器优先走 https，先排列 https 再排列 http
        for proto in ("https", "http"):
            for port in ports:
                probes.append((cand, csrf_token, port, proto))

    if not probes:
        return None

    def _save_and_build(cand, csrf_token, port, proto, user_status, quota_summary):
        try:
            with open(RPC_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump({
                    "pid": cand["pid"],
                    "port": port,
                    "protocol": proto,
                    "csrf_token": csrf_token,
                    "exe": cand.get("exe", ""),
                    "saved_at": time.time(),
                }, f)
        except Exception:
            pass
        return {
            "pid": cand["pid"],
            "port": port,
            "protocol": proto,
            "exe": cand.get("exe", ""),
            "user_status": user_status,
            "quota_summary": quota_summary,
        }

    if len(probes) == 1:
        cand, csrf_token, port, proto = probes[0]
        pair = _probe_and_fetch_rpc_pair(port, csrf_token, proto, status_timeout=0.6, quota_timeout=1.0)
        if pair is not None:
            return _save_and_build(cand, csrf_token, port, proto, pair[0], pair[1])
        return None

    executor = ThreadPoolExecutor(max_workers=min(8, len(probes)))
    try:
        future_map = {
            executor.submit(_probe_and_fetch_rpc_pair, port, csrf_token, proto, 0.6, 1.0): (cand, csrf_token, port, proto)
            for cand, csrf_token, port, proto in probes
        }
        for fut in as_completed(future_map):
            try:
                pair = fut.result()
            except Exception:
                pair = None
            if pair is not None:
                cand, csrf_token, port, proto = future_map[fut]
                return _save_and_build(cand, csrf_token, port, proto, pair[0], pair[1])
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    return None


# ============================================================================
# 3. 底层路由 (gen_metadata) 与 Token 统计深度解析
# ============================================================================

def _find_first_telemetry_marker(data: bytes) -> tuple[int, int, bytes] | None:
    """用 C 级 bytes.find 定位首个独立 ASCII 遥测标记（等价于原全量 finditer 首个精确匹配）。"""
    n = len(data)
    best_pos = -1
    best_end = -1
    best_tok = b""
    for marker in _TELEMETRY_MARKERS:
        mlen = len(marker)
        search_from = 0
        while True:
            pos = data.find(marker, search_from)
            if pos == -1 or (best_pos != -1 and pos >= best_pos):
                break
            end = pos + mlen
            left_ok = pos == 0 or not (0x20 <= data[pos - 1] <= 0x7E)
            right_ok = end == n or not (0x20 <= data[end] <= 0x7E)
            if left_ok and right_ok:
                best_pos = pos
                best_end = end
                best_tok = marker
                break
            search_from = pos + 1
    if best_pos == -1:
        return None
    return best_pos, best_end, best_tok


def extract_routed_model_from_blob(data: bytes):
    """从 gen_metadata 单条二进制记录中提取真实后端路由模型名称（C 级 bytes.find 窗口定位，零全量 decode）"""
    if not data:
        return None

    found = _find_first_telemetry_marker(data)
    if found is not None:
        start, end, tel_bytes = found
        # 仅在标记词前后小窗口提取 ASCII 片段，覆盖前后各 15 个 token 的等价范围
        left_slice = data[max(0, start - 2048) : start]
        right_slice = data[end : min(len(data), end + 2048)]
        left_tokens = _RE_ASCII_RUN.findall(left_slice)
        right_tokens = _RE_ASCII_RUN.findall(right_slice)
        if (len(left_tokens) >= 16 or start <= 2048) and (len(right_tokens) >= 15 or end + 2048 >= len(data)):
            for tok in left_tokens[-15:]:
                if _RE_MODEL_NAME_BYTES.match(tok):
                    return tok.decode("ascii")
            for tok in right_tokens[:14]:
                if _RE_MODEL_NAME_BYTES.match(tok):
                    return tok.decode("ascii")
        else:
            all_tokens = _RE_ASCII_RUN.findall(data)
            for i, tok in enumerate(all_tokens):
                if tok == tel_bytes:
                    for cand in all_tokens[max(0, i - 15) : min(len(all_tokens), i + 15)]:
                        if _RE_MODEL_NAME_BYTES.match(cand):
                            return cand.decode("ascii")
                    break

    # 兜底：末尾 30 个 ASCII 片段倒序查找
    tail_slice = data[-4096:] if len(data) > 4096 else data
    tail_tokens = _RE_ASCII_RUN.findall(tail_slice)
    if len(tail_tokens) < 31 and len(data) > 4096:
        tail_tokens = _RE_ASCII_RUN.findall(data)
    for tok in reversed(tail_tokens[-30:]):
        if _RE_MODEL_NAME_BYTES.match(tok):
            return tok.decode("ascii")
    return None


def extract_requested_models_from_steps(cur, after_idx: int | None = None):
    """从 steps (step_type=14 用户消息) 提取真实的 <USER_SETTINGS_CHANGE> 模型切换记录"""
    selected_history = []
    try:
        if after_idx is None:
            rows = cur.execute(
                "SELECT idx, step_payload FROM steps WHERE step_type = 14 AND step_payload IS NOT NULL ORDER BY idx ASC"
            ).fetchall()
        else:
            rows = cur.execute(
                "SELECT idx, step_payload FROM steps WHERE step_type = 14 AND idx > ? AND step_payload IS NOT NULL ORDER BY idx ASC",
                (after_idx,),
            ).fetchall()
        for idx, payload in rows:
            txt = payload.decode("utf-8", errors="ignore")
            if "USER_SETTINGS_CHANGE" not in txt:
                continue
            for m in _RE_SETTINGS_CHANGE.finditer(txt):
                selected_history.append({
                    "step_idx": idx,
                    "from": m.group(1).strip(),
                    "to": m.group(2).strip(),
                })
    except Exception:
        pass
    return selected_history


def extract_session_title(cur):
    """从 steps 表提取会话标题或第一条用户请求"""
    try:
        for r in cur.execute("SELECT step_payload FROM steps WHERE step_type = 14 AND step_payload IS NOT NULL ORDER BY idx ASC LIMIT 5").fetchall():
            if r[0]:
                txt = r[0].decode("utf-8", errors="ignore")
                m = _RE_USER_REQUEST.search(txt)
                if m:
                    line = m.group(1).strip().splitlines()[0].strip()
                    if line:
                        return line[:60]
    except Exception:
        pass
    return "未命名会话"


def get_context_window_for_model(routed_model: str):
    """根据模型返回上下文窗口上限"""
    rm = (routed_model or "").lower()
    if "gpt" in rm:
        return 131072, "128k"
    if "claude" in rm:
        if "3.5" in rm or "3-5" in rm or "3.7" in rm or "3-7" in rm or "4." in rm or "4-" in rm:
            return 200000, "200k"
        return 1000000, "1M"
    return 1048576, "1M"


def load_db_cache() -> dict:
    if os.path.exists(DB_CACHE_PATH):
        try:
            with open(DB_CACHE_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, dict) and raw.get("_schema") == DB_CACHE_SCHEMA_VERSION:
                entries = raw.get("entries")
                if isinstance(entries, dict):
                    return entries
        except Exception:
            pass
    return {}


def save_db_cache(cache: dict) -> None:
    try:
        payload = {"_schema": DB_CACHE_SCHEMA_VERSION, "entries": cache}
        with open(DB_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        pass


def _fetch_step_times_for_idxs(cur, step_idxs: set[int]) -> dict[int, int]:
    """按需分批读取 gen_metadata 引用的 steps.metadata 时间戳，避免扫描整张 steps 表。"""
    step_times: dict[int, int] = {}
    if not step_idxs:
        return step_times
    sorted_idxs = sorted(step_idxs)
    chunk_size = 500
    for i in range(0, len(sorted_idxs), chunk_size):
        chunk = sorted_idxs[i : i + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        try:
            sql = f"SELECT idx, metadata FROM steps WHERE idx IN ({placeholders}) AND metadata IS NOT NULL"
            for r_idx, meta in cur.execute(sql, chunk).fetchall():
                s_proto = parse_proto(meta, _PROTO_F1)
                if 1 in s_proto:
                    for _, p in s_proto[1]:
                        sub_time = parse_proto(p, _PROTO_F1)
                        if 1 in sub_time and sub_time[1]:
                            step_times[r_idx] = sub_time[1][0][1]
        except Exception:
            pass
    return step_times


def _apply_gen_rows(cur, has_steps: bool, rows: list, state: dict, db_mtime: float) -> None:
    """将一批按 idx 升序排列的 gen_metadata 行累加进会话预聚合状态（全量与增量共用，保证结果一致）。"""
    setting_changes = state["setting_changes"]
    change_ptr = state["change_ptr"]
    current_active_label = state["current_active_label"]
    route_transitions = state["route_transitions"]
    by_date_route = state["by_date_route"]
    obs_routes = state["obs_routes"]

    pending_turns = []
    needed_step_idxs: set[int] = set()

    for idx, data in rows:
        routed = extract_routed_model_from_blob(data)
        top = parse_proto(data, _PROTO_F1)
        step_idx_resolved = idx

        if 1 in top:
            for _, p1 in top[1]:
                sub1 = parse_proto(p1, _PROTO_F4_20)
                if 20 in sub1:
                    for _, b20 in sub1[20]:
                        if b"last_step_index" in b20:
                            m_step = _RE_LAST_STEP_IDX.search(b20)
                            if m_step:
                                try:
                                    step_idx_resolved = int(m_step.group(1))
                                    break
                                except Exception:
                                    pass

                while change_ptr < len(setting_changes) and setting_changes[change_ptr]["step_idx"] <= step_idx_resolved:
                    current_active_label = setting_changes[change_ptr]["to"]
                    change_ptr += 1

                if 4 not in sub1:
                    continue
                for _, p4 in sub1[4]:
                    usage = parse_proto(p4, _PROTO_F_USAGE)
                    inp = usage.get(2, [(0, 0)])[0][1]
                    out = usage.get(3, [(0, 0)])[0][1]
                    cached_val = usage.get(5, [(0, 0)])[0][1]
                    thinking = usage.get(10, [(0, 0)])[0][1]
                    tot = inp + cached_val + out

                    if inp + cached_val > 0:
                        state["last_turn_inp"] = inp
                        state["last_turn_cached"] = cached_val
                        state["last_turn_out"] = out
                        state["last_turn_thinking"] = thinking
                        state["last_turn_context"] = inp + cached_val

                    state["sess_total"] += tot
                    state["sess_inp"] += inp
                    state["sess_cached"] += cached_val
                    state["sess_out"] += out
                    state["sess_thinking"] += thinking
                    state["sess_turns"] += 1

                    needed_step_idxs.add(step_idx_resolved)
                    needed_step_idxs.add(idx)
                    pending_turns.append((idx, step_idx_resolved, tot, inp, cached_val, out, thinking, routed, current_active_label))

        if routed:
            state["last_routed_model"] = routed
            state["last_step_idx"] = idx
            if not route_transitions or route_transitions[-1]["routed_model"] != routed:
                route_transitions.append({
                    "gen_idx": idx,
                    "step_idx": step_idx_resolved,
                    "routed_model": routed,
                    "ui_label": current_active_label or "",
                })

        state["max_gen_idx"] = idx
        state["gen_row_count"] += 1

    state["change_ptr"] = change_ptr
    state["current_active_label"] = current_active_label

    if not pending_turns:
        return

    step_times = _fetch_step_times_for_idxs(cur, needed_step_idxs) if has_steps else {}
    fallback_ts = int(db_mtime)
    ts_date_cache: dict[int, str] = {}

    for idx, step_idx_resolved, tot, inp, cached_val, out, thinking, routed, act_label in pending_turns:
        ts = step_times.get(step_idx_resolved) or step_times.get(idx) or fallback_ts
        step_date = ts_date_cache.get(ts)
        if step_date is None:
            step_date = datetime.fromtimestamp(ts, LOCAL_TZ).strftime("%Y-%m-%d")
            ts_date_cache[ts] = step_date

        date_bucket = by_date_route.get(step_date)
        if date_bucket is None:
            date_bucket = {}
            by_date_route[step_date] = date_bucket
        r_key = routed or ""
        rb = date_bucket.get(r_key)
        if rb is None:
            rb = {"turns": 0, "tot": 0, "inp": 0, "cached": 0, "out": 0, "thinking": 0}
            date_bucket[r_key] = rb
        rb["turns"] += 1
        rb["tot"] += tot
        rb["inp"] += inp
        rb["cached"] += cached_val
        rb["out"] += out
        rb["thinking"] += thinking

        if routed:
            ob = obs_routes.get(routed)
            if ob is None:
                ob = {"count": 0, "total_tokens": 0, "matched_labels": []}
                obs_routes[routed] = ob
            ob["count"] += 1
            ob["total_tokens"] += tot
            if act_label and act_label not in ob["matched_labels"]:
                ob["matched_labels"].append(act_label)


def _clone_parsed_state(cached_data: dict) -> dict:
    """浅深混合复制预聚合缓存状态，供活跃库增量累加，不污染原缓存字典。"""
    return {
        "sess_turns": cached_data.get("sess_turns", 0),
        "sess_total": cached_data.get("sess_total", 0),
        "sess_inp": cached_data.get("sess_inp", 0),
        "sess_cached": cached_data.get("sess_cached", 0),
        "sess_out": cached_data.get("sess_out", 0),
        "sess_thinking": cached_data.get("sess_thinking", 0),
        "last_turn_inp": cached_data.get("last_turn_inp", 0),
        "last_turn_cached": cached_data.get("last_turn_cached", 0),
        "last_turn_out": cached_data.get("last_turn_out", 0),
        "last_turn_thinking": cached_data.get("last_turn_thinking", 0),
        "last_turn_context": cached_data.get("last_turn_context", 0),
        "last_routed_model": cached_data.get("last_routed_model"),
        "last_step_idx": cached_data.get("last_step_idx"),
        "title": cached_data.get("title", "未命名会话"),
        "route_transitions": list(cached_data.get("route_transitions", [])),
        "setting_changes": list(cached_data.get("setting_changes", [])),
        "by_date_route": {
            d: {r: dict(vals) for r, vals in rmap.items()}
            for d, rmap in cached_data.get("by_date_route", {}).items()
        },
        "obs_routes": {
            r: {
                "count": info.get("count", 0),
                "total_tokens": info.get("total_tokens", 0),
                "matched_labels": list(info.get("matched_labels", [])),
            }
            for r, info in cached_data.get("obs_routes", {}).items()
        },
        "max_gen_idx": cached_data.get("max_gen_idx"),
        "gen_row_count": cached_data.get("gen_row_count", 0),
        "max_step_idx": cached_data.get("max_step_idx", -1),
        "change_ptr": cached_data.get("change_ptr", 0),
        "current_active_label": cached_data.get("current_active_label"),
    }


def _parse_single_db(db_path: str, cached_entry: dict | None, db_mtime: float, db_size: int) -> tuple[dict | None, bool]:
    """解析单个会话数据库：支持活跃库 SQLite 只追加增量更新，避免整表重扫。"""
    try:
        with closing(open_readonly_db(db_path)) as con:
            cur = con.cursor()
            tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "gen_metadata" not in tables:
                return None, False
            has_steps = "steps" in tables

            # 1. 尝试基于已有 v2 缓存进行 SQLite 只追加增量更新
            if isinstance(cached_entry, dict) and cached_entry.get("v") == DB_CACHE_SCHEMA_VERSION:
                cached_data = cached_entry.get("data")
                if isinstance(cached_data, dict):
                    c_count = cached_data.get("gen_row_count", -1)
                    c_max_gen = cached_data.get("max_gen_idx")
                    cur_count, cur_max_idx = cur.execute("SELECT COUNT(*), MAX(idx) FROM gen_metadata").fetchone()
                    cur_count = int(cur_count or 0)

                    # 情况 A：文件 mtime/size 变动（如写入 steps/WAL），但 gen_metadata 无新增轮次 -> 零开销直接复用
                    if cur_count == c_count and cur_max_idx == c_max_gen:
                        return cached_data, True

                    # 情况 B：纯追加新增轮次 -> 仅查询 idx > c_max_gen 的增量行
                    if (
                        c_count > 0
                        and cur_count > c_count
                        and c_max_gen is not None
                        and cur_max_idx is not None
                        and cur_max_idx > c_max_gen
                    ):
                        new_rows = cur.execute(
                            "SELECT idx, data FROM gen_metadata WHERE idx > ? ORDER BY idx ASC",
                            (c_max_gen,),
                        ).fetchall()
                        if len(new_rows) == cur_count - c_count:
                            state = _clone_parsed_state(cached_data)
                            if has_steps:
                                prev_max_step = state.get("max_step_idx", -1)
                                new_changes = extract_requested_models_from_steps(cur, after_idx=prev_max_step)
                                if new_changes:
                                    state["setting_changes"].extend(new_changes)
                                cur_max_step = cur.execute("SELECT MAX(idx) FROM steps").fetchone()[0]
                                if cur_max_step is not None:
                                    state["max_step_idx"] = int(cur_max_step)
                                if state.get("title") in ("", "未命名会话"):
                                    state["title"] = extract_session_title(cur)
                            _apply_gen_rows(cur, has_steps, new_rows, state, db_mtime)
                            return state, True

            # 2. 全量解析（先查 gen_metadata，为空直接跳过 steps 扫描）
            rows = cur.execute("SELECT idx, data FROM gen_metadata ORDER BY idx ASC").fetchall()
            if not rows:
                return None, False

            setting_changes = extract_requested_models_from_steps(cur) if has_steps else []
            max_step_idx = -1
            title = "未命名会话"
            if has_steps:
                try:
                    ms = cur.execute("SELECT MAX(idx) FROM steps").fetchone()[0]
                    if ms is not None:
                        max_step_idx = int(ms)
                except Exception:
                    pass
                title = extract_session_title(cur)

            state = {
                "sess_turns": 0,
                "sess_total": 0,
                "sess_inp": 0,
                "sess_cached": 0,
                "sess_out": 0,
                "sess_thinking": 0,
                "last_turn_inp": 0,
                "last_turn_cached": 0,
                "last_turn_out": 0,
                "last_turn_thinking": 0,
                "last_turn_context": 0,
                "last_routed_model": None,
                "last_step_idx": None,
                "title": title,
                "route_transitions": [],
                "setting_changes": setting_changes,
                "by_date_route": {},
                "obs_routes": {},
                "max_gen_idx": None,
                "gen_row_count": 0,
                "max_step_idx": max_step_idx,
                "change_ptr": 0,
                "current_active_label": None,
            }
            _apply_gen_rows(cur, has_steps, rows, state, db_mtime)
            return state, True
    except Exception:
        return None, False


def analyze_all_databases(
    target_date: str = None,
    recent_dbs: int = 3,
    all_history: bool = False,
    live_only: bool = False,
    use_cache: bool = True,
):
    """扫描会话数据库，统计 Token 消耗、上下文水位与后端真实路由历史（支持极速预聚合 + SQLite 增量缓存）"""
    if not target_date:
        target_date = datetime.now(LOCAL_TZ).strftime("%Y-%m-%d")

    if live_only:
        return {
            "mode": "live_only",
            "skipped": True,
            "all_history": False,
            "scanned_dbs": 0,
            "today": {
                "date": target_date,
                "total_tokens": 0,
                "input_tokens": 0,
                "cached_tokens": 0,
                "output_tokens": 0,
                "thinking_tokens": 0,
                "cache_hit_rate": 0.0,
                "sessions": 0,
                "turns": 0,
                "by_routed_model": {},
            },
            "all_time": {
                "total_tokens": 0,
                "input_tokens": 0,
                "cached_tokens": 0,
                "output_tokens": 0,
                "thinking_tokens": 0,
                "cache_hit_rate": 0.0,
                "sessions": 0,
                "turns": 0,
            },
            "observed_backend_routes": {},
            "recent_sessions": [],
        }

    db_meta_list = []
    for s_dir in DATA_SOURCES:
        if os.path.isdir(s_dir):
            try:
                raw_dbs = []
                wal_map: dict[str, tuple[float, int]] = {}
                with os.scandir(s_dir) as it:
                    for ent in it:
                        name = ent.name
                        if name.endswith(".db"):
                            try:
                                st = ent.stat()
                                if st.st_size > 0:
                                    raw_dbs.append((ent.path, name, st.st_mtime, st.st_size))
                            except OSError:
                                pass
                        elif name.endswith(".db-wal"):
                            try:
                                st = ent.stat()
                                wal_map[name] = (st.st_mtime, st.st_size)
                            except OSError:
                                pass
                for path, name, mtime, size in raw_dbs:
                    wal_mtime, wal_size = wal_map.get(name + "-wal", (0.0, 0))
                    eff_mtime = mtime if mtime >= wal_mtime else wal_mtime
                    db_meta_list.append((path, eff_mtime, mtime, size, wal_mtime, wal_size))
            except OSError:
                pass

    db_meta_list.sort(key=lambda x: x[1], reverse=True)
    scanned_total = len(db_meta_list)
    if all_history:
        target_items = db_meta_list
    else:
        min_keep = max(1, recent_dbs)
        today_count = sum(
            1 for _, eff_mtime, _, _, _, _ in db_meta_list
            if datetime.fromtimestamp(eff_mtime, LOCAL_TZ).strftime("%Y-%m-%d") == target_date
        )
        # 至少保留最近 recent_dbs 个，同时自动囊括今日更新过的全部会话以保证 today 汇总不漏算
        keep_count = max(min_keep, today_count)
        target_items = db_meta_list[:keep_count]

    today_stats = {
        "date": target_date,
        "total_tokens": 0,
        "input_tokens": 0,
        "cached_tokens": 0,
        "output_tokens": 0,
        "thinking_tokens": 0,
        "cache_hit_rate": 0.0,
        "sessions": 0,
        "turns": 0,
        "by_routed_model": defaultdict(lambda: {"turns": 0, "total": 0, "input": 0, "cached": 0, "output": 0, "thinking": 0}),
    }

    all_time_stats = {
        "total_tokens": 0,
        "input_tokens": 0,
        "cached_tokens": 0,
        "output_tokens": 0,
        "thinking_tokens": 0,
        "sessions": 0,
        "turns": 0,
    }

    observed_routed_models = defaultdict(lambda: {
        "count": 0,
        "total_tokens": 0,
        "last_seen": "",
        "sample_session": "",
        "matched_labels": set(),
    })
    sessions_list = []

    db_cache = load_db_cache() if use_cache else {}
    cache_dirty = False

    # 1. 拆分直接缓存命中与需要打开 SQLite（增量/冷扫）的数据库（同时校验 -wal 文件防止 WAL 未 checkpoint 导致缓存滞后）
    parsed_by_path: dict[str, dict | None] = {}
    pending_items: list[tuple[str, float, float, int, float, int, dict | None]] = []

    for db_path, eff_mtime, db_mtime, db_size, wal_mtime, wal_size in target_items:
        cached = db_cache.get(db_path) if use_cache else None
        if (
            use_cache
            and isinstance(cached, dict)
            and cached.get("v") == DB_CACHE_SCHEMA_VERSION
            and cached.get("mtime") == db_mtime
            and cached.get("size") == db_size
            and cached.get("wal_mtime") == wal_mtime
            and cached.get("wal_size") == wal_size
        ):
            parsed_by_path[db_path] = cached.get("data")
        else:
            pending_items.append((db_path, eff_mtime, db_mtime, db_size, wal_mtime, wal_size, cached))

    # 2. 顺序解析未命中缓存或需增量更新的数据库（纯 Python Protobuf 解析受 GIL 约束，单线程无切换开销更稳更快）
    for db_path, eff_mtime, db_mtime, db_size, wal_mtime, wal_size, cached in pending_items:
        parsed, changed = _parse_single_db(db_path, cached, eff_mtime, db_size)
        parsed_by_path[db_path] = parsed
        if parsed is not None and changed:
            db_cache[db_path] = {
                "v": DB_CACHE_SCHEMA_VERSION,
                "mtime": db_mtime,
                "size": db_size,
                "wal_mtime": wal_mtime,
                "wal_size": wal_size,
                "data": parsed,
            }
            cache_dirty = True

    # 3. 按最新有效修改时间降序严格汇总统计
    for db_idx, (db_path, eff_mtime, _db_mtime, _db_size, _wal_mtime, _wal_size) in enumerate(target_items):
        parsed = parsed_by_path.get(db_path)
        if not parsed or parsed.get("sess_turns", 0) == 0:
            continue

        convo_id = os.path.splitext(os.path.basename(db_path))[0]
        mtime_str = datetime.fromtimestamp(eff_mtime, LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
        source_type = "antigravity"
        if "antigravity-ide" in db_path:
            source_type = "antigravity-ide"
        elif "antigravity-cli" in db_path:
            source_type = "antigravity-cli"

        all_time_stats["total_tokens"] += parsed.get("sess_total", 0)
        all_time_stats["input_tokens"] += parsed.get("sess_inp", 0)
        all_time_stats["cached_tokens"] += parsed.get("sess_cached", 0)
        all_time_stats["output_tokens"] += parsed.get("sess_out", 0)
        all_time_stats["thinking_tokens"] += parsed.get("sess_thinking", 0)
        all_time_stats["turns"] += parsed.get("sess_turns", 0)
        all_time_stats["sessions"] += 1

        today_routes = parsed.get("by_date_route", {}).get(target_date)
        if today_routes:
            today_stats["sessions"] += 1
            fallback_rm = parsed.get("last_routed_model") or "unknown"
            for r_key, vals in today_routes.items():
                t_turns = vals["turns"]
                t_tot = vals["tot"]
                t_inp = vals["inp"]
                t_cached = vals["cached"]
                t_out = vals["out"]
                t_thinking = vals["thinking"]
                today_stats["turns"] += t_turns
                today_stats["total_tokens"] += t_tot
                today_stats["input_tokens"] += t_inp
                today_stats["cached_tokens"] += t_cached
                today_stats["output_tokens"] += t_out
                today_stats["thinking_tokens"] += t_thinking
                rm_key = r_key or fallback_rm
                bm = today_stats["by_routed_model"][rm_key]
                bm["turns"] += t_turns
                bm["total"] += t_tot
                bm["input"] += t_inp
                bm["cached"] += t_cached
                bm["output"] += t_out
                bm["thinking"] += t_thinking

        for routed, ob in parsed.get("obs_routes", {}).items():
            obs = observed_routed_models[routed]
            obs["count"] += ob.get("count", 0)
            obs["total_tokens"] += ob.get("total_tokens", 0)
            if not obs["last_seen"] or mtime_str > obs["last_seen"]:
                obs["last_seen"] = mtime_str
                obs["sample_session"] = convo_id
            for act_label in ob.get("matched_labels", []):
                if act_label:
                    obs["matched_labels"].add(act_label)

        if db_idx < 8:
            last_rm = parsed.get("last_routed_model")
            ctx_win, ctx_lbl = get_context_window_for_model(last_rm)
            last_ctx = parsed.get("last_turn_context", 0)
            ctx_pct = round((last_ctx / ctx_win) * 100, 2) if ctx_win > 0 else 0.0
            s_inp_c = parsed.get("sess_inp", 0) + parsed.get("sess_cached", 0)
            sess_cache_rate = round((parsed.get("sess_cached", 0) / s_inp_c) * 100, 2) if s_inp_c > 0 else 0.0
            last_turn_cache_rate = round((parsed.get("last_turn_cached", 0) / last_ctx) * 100, 2) if last_ctx > 0 else 0.0

            sessions_list.append({
                "conversation_id": convo_id,
                "source": source_type,
                "title": parsed.get("title", ""),
                "updated_at": mtime_str,
                "turns": parsed.get("sess_turns", 0),
                "last_gen_idx": parsed.get("last_step_idx"),
                "routed_model": last_rm or "未识别",
                "route_transitions": parsed.get("route_transitions", []),
                "setting_changes": parsed.get("setting_changes", []),
                "context_window": ctx_win,
                "context_label": ctx_lbl,
                "context_tokens": last_ctx,
                "context_pct": ctx_pct,
                "last_turn": {
                    "input_tokens": parsed.get("last_turn_inp", 0),
                    "cached_tokens": parsed.get("last_turn_cached", 0),
                    "output_tokens": parsed.get("last_turn_out", 0),
                    "thinking_tokens": parsed.get("last_turn_thinking", 0),
                    "cache_hit_rate": last_turn_cache_rate,
                },
                "session_totals": {
                    "total_tokens": parsed.get("sess_total", 0),
                    "input_tokens": parsed.get("sess_inp", 0),
                    "cached_tokens": parsed.get("sess_cached", 0),
                    "output_tokens": parsed.get("sess_out", 0),
                    "thinking_tokens": parsed.get("sess_thinking", 0),
                    "cache_hit_rate": sess_cache_rate,
                },
            })

    if use_cache and cache_dirty:
        save_db_cache(db_cache)

    prompt_today = today_stats["input_tokens"] + today_stats["cached_tokens"]
    if prompt_today > 0:
        today_stats["cache_hit_rate"] = round((today_stats["cached_tokens"] / prompt_today) * 100, 2)
    today_stats["by_routed_model"] = dict(today_stats["by_routed_model"])

    prompt_all = all_time_stats["input_tokens"] + all_time_stats["cached_tokens"]
    all_time_stats["cache_hit_rate"] = round((all_time_stats["cached_tokens"] / prompt_all) * 100, 2) if prompt_all > 0 else 0.0

    routed_summary = {}
    for k, v in sorted(observed_routed_models.items(), key=lambda item: item[1]["last_seen"], reverse=True):
        routed_summary[k] = {
            "turns_count": v["count"],
            "total_tokens": v["total_tokens"],
            "last_seen": v["last_seen"],
            "sample_session": v["sample_session"],
            "matched_ui_labels": sorted(list(v["matched_labels"])),
        }

    return {
        "skipped": False,
        "all_history": all_history,
        "scanned_dbs": len(target_items),
        "total_dbs": scanned_total,
        "today": today_stats,
        "all_time": all_time_stats,
        "recent_sessions": sessions_list,
        "observed_backend_routes": routed_summary,
    }


# ============================================================================
# 4. 时间格式化与配额整合输出
# ============================================================================

def format_reset_time(raw_time: str):
    """将 UTC 时间字符串转换为本地时间 (UTC+8) 并计算剩余倒计时"""
    if not raw_time:
        return {"utc": "—", "local": "—", "countdown": "—"}
    now_utc = datetime.now(timezone.utc)
    dt_utc = None
    try:
        if raw_time.endswith("Z"):
            dt_utc = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
        elif "/" in raw_time:
            for fmt in ("%m/%d/%Y %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
                try:
                    dt_utc = datetime.strptime(raw_time, fmt).replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    pass
        else:
            dt_utc = datetime.fromisoformat(raw_time)
            if dt_utc.tzinfo is None:
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    except Exception:
        return {"utc": raw_time, "local": raw_time, "countdown": "—"}

    if not dt_utc:
        return {"utc": raw_time, "local": raw_time, "countdown": "—"}

    dt_local = dt_utc.astimezone(LOCAL_TZ)
    diff = (dt_utc - now_utc).total_seconds()
    if diff <= 0:
        countdown = "已重置 / 随时刷新"
    else:
        days = int(diff // 86400)
        hours = int((diff % 86400) // 3600)
        mins = int((diff % 3600) // 60)
        if days > 0:
            countdown = f"{days}天 {hours}小时 {mins}分"
        elif hours > 0:
            countdown = f"{hours}小时 {mins}分"
        else:
            countdown = f"{mins}分"

    return {
        "utc": dt_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "local": dt_local.strftime("%Y-%m-%d %H:%M:%S"),
        "countdown": countdown,
    }


def infer_backend_route(model_id: str, label: str, observed_routes: dict):
    """结合实测数据库记录与已知规则，映射客户端模型的后端实际路由标识"""
    mid = (model_id or "").lower()
    for r_name, info in observed_routes.items():
        if label in info.get("matched_ui_labels", []):
            return f"{r_name} (实测已验证)"

    if "gemini-3.8-flash" in mid:
        if "gemini-3.8-flash-n" in observed_routes:
            return "gemini-3.8-flash-n (实测已验证)"
        return "gemini-3.8-flash-n"
    if "gemini-4-argon" in mid:
        if "gemini-4-argon-trial" in observed_routes:
            return "gemini-4-argon-trial (当前实测) / gemini-4-argon-c (历史)"
        return "gemini-4-argon-trial"
    if "claude-opus-5-5" in mid:
        return "claude-opus-5-5 (待本机触发校验; 历史曾路由 claude-opus-4-6-thinking)"
    if "claude-sonnet-5-5" in mid:
        return "claude-sonnet-5-5 (待本机触发校验; 历史曾路由 claude-sonnet-4-6)"
    if "gpt-oss-120b" in mid:
        return "gpt-oss-120b-medium (待本机触发校验)"
    if "gemini-4-carbon" in mid:
        return "gemini-4-carbon (需 Ultra 订阅解锁)"
    return "未知路由"


def build_full_report(
    target_date: str = None,
    recent_dbs: int = 3,
    all_history: bool = False,
    live_only: bool = False,
    use_cache: bool = True,
):
    rpc_data = fetch_live_rpc_data(use_cache=use_cache)
    db_data = analyze_all_databases(
        target_date=target_date,
        recent_dbs=recent_dbs,
        all_history=all_history,
        live_only=live_only,
        use_cache=use_cache,
    )

    report = {
        "generated_at": f"{datetime.now(LOCAL_TZ).strftime('%Y-%m-%d %H:%M:%S')} ({local_tz_label()})",
        "rpc_connection": None,
        "account": None,
        "quota_pools": [],
        "models": [],
        "token_analytics": db_data,
    }

    if rpc_data:
        us = rpc_data["user_status"]
        qs = rpc_data["quota_summary"]
        report["rpc_connection"] = {
            "pid": rpc_data["pid"],
            "port": rpc_data["port"],
            "protocol": rpc_data["protocol"],
            "exe": rpc_data["exe"],
        }
        plan_info = us.get("planStatus", {}).get("planInfo", {})
        user_tier = us.get("userTier", {})
        report["account"] = {
            "name": us.get("name", ""),
            "email": us.get("email", ""),
            "tier_name": user_tier.get("name", plan_info.get("planName", "")),
            "tier_id": user_tier.get("id", ""),
            "teams_tier": plan_info.get("teamsTier", ""),
            "available_prompt_credits": us.get("planStatus", {}).get("availablePromptCredits"),
            "monthly_prompt_credits": plan_info.get("monthlyPromptCredits"),
            "available_flow_credits": us.get("planStatus", {}).get("availableFlowCredits"),
            "monthly_flow_credits": plan_info.get("monthlyFlowCredits"),
        }

        if qs and "response" in qs and "groups" in qs["response"]:
            for g in qs["response"]["groups"]:
                buckets_out = []
                for b in g.get("buckets", []):
                    rem_frac = b.get("remainingFraction", 1.0)
                    rem_pct = round(rem_frac * 100, 2)
                    used_pct = round(max(0.0, 100.0 - rem_pct), 2)
                    t_info = format_reset_time(b.get("resetTime", ""))
                    buckets_out.append({
                        "bucket_id": b.get("bucketId", ""),
                        "display_name": b.get("displayName", ""),
                        "window": b.get("window", ""),
                        "remaining_pct": rem_pct,
                        "used_pct": used_pct,
                        "reset_utc": t_info["utc"],
                        "reset_local": t_info["local"],
                        "countdown": t_info["countdown"],
                        "description": b.get("description", ""),
                    })
                report["quota_pools"].append({
                    "group_name": g.get("displayName", ""),
                    "description": g.get("description", ""),
                    "buckets": buckets_out,
                })

        configs = us.get("cascadeModelConfigData", {}).get("clientModelConfigs", [])
        obs_routes = db_data.get("observed_backend_routes", {})
        for c in configs:
            q_info = c.get("quotaInfo") or {}
            rem_frac = q_info.get("remainingFraction")
            rem_pct = round(float(rem_frac) * 100, 2) if rem_frac is not None else 0.0
            used_pct = round(max(0.0, 100.0 - rem_pct), 2) if rem_frac is not None else 100.0
            t_info = format_reset_time(q_info.get("resetTime", ""))
            alias_obj = c.get("modelOrAlias") or {}
            internal_alias = alias_obj.get("model") or alias_obj.get("alias") or json.dumps(alias_obj)
            label = c.get("label", "")
            model_id = c.get("modelId", "")

            report["models"].append({
                "label": label,
                "model_id": model_id,
                "internal_code": internal_alias,
                "backend_routed_model": infer_backend_route(model_id, label, obs_routes),
                "disabled": bool(c.get("disabled", False)),
                "remaining_pct": rem_pct,
                "used_pct": used_pct,
                "reset_utc": t_info["utc"],
                "reset_local": t_info["local"],
                "countdown": t_info["countdown"],
                "tag_title": c.get("tagTitle", ""),
                "tag_description": c.get("tagDescription", ""),
            })

    return report


def render_markdown_report(report: dict) -> str:
    """将完整报告渲染为无省略的结构化 Markdown"""
    lines = []
    lines.append(f"# Antigravity 全景额度、底层路由校验与 Token 监控大盘")
    lines.append(f"> **采集时间**：`{report.get('generated_at', '-')}`")
    if report.get("rpc_connection"):
        rc = report["rpc_connection"]
        acc = report.get("account") or {}
        lines.append(
            f"> **本地 RPC 节点**：`PID {rc['pid']}` (`{rc['protocol']}://127.0.0.1:{rc['port']}`) | "
            f"**账户**：`{acc.get('email', '—')}` (`{acc.get('tier_name', '—')}` / `{acc.get('tier_id', '—')}`)"
        )
    lines.append("")

    # 1. 底层路由校验与当前会话上下文水位
    ta = report.get("token_analytics", {})
    recent = ta.get("recent_sessions", [])
    lines.append("## 1. 底层路由校验 (`gen_metadata`) 与当前会话上下文占用")
    if recent:
        curr = recent[0]
        lt = curr["last_turn"]
        st = curr["session_totals"]
        lines.append(f"- **当前活跃会话 ID**：`{curr['conversation_id']}` （来源：`{curr['source']}`，最后更新：`{curr['updated_at']}`）")
        lines.append(f"- **底层路由校验 (`gen_metadata`)**：")
        lines.append(f"  - 本地会话数据库 (`gen_metadata`) 中，**当前会话最新轮次 (gen_idx={curr['last_gen_idx']}) 实际使用的后端路由为：`{curr['routed_model']}`**。")
        if len(curr.get("route_transitions", [])) > 1:
            trans_strs = [
                f"`{t['routed_model']}` (step {t['step_idx']}, gen_idx {t['gen_idx']}{', 切换为 ' + t['ui_label'] if t['ui_label'] else ''})"
                for t in curr["route_transitions"]
            ]
            lines.append(f"  - **本会话内路由切换轨迹**：{' → '.join(trans_strs)}")
        if curr.get("setting_changes"):
            sc_strs = [f"step {s['step_idx']}: `{s['from']}` → `{s['to']}`" for s in curr["setting_changes"]]
            lines.append(f"  - **检测到用户模型选择变更 (`USER_SETTINGS_CHANGE`)**：{'; '.join(sc_strs)}")
        lines.append(
            f"- **当前会话上下文窗口水位 (Context Window)**：**`{curr['context_tokens']:,}` / `{curr['context_window']:,}` Tokens ({curr['context_label']})** —— **占用率 `{curr['context_pct']}%`**"
        )
        lines.append(
            f"  - **最新一轮 (Last Turn) 明细**：新鲜输入 `{lt['input_tokens']:,}` | 缓存命中 `{lt['cached_tokens']:,}` (单轮命中率 `{lt['cache_hit_rate']}%`) | 生成输出 `{lt['output_tokens']:,}` | 思考推理 `{lt['thinking_tokens']:,}`"
        )
        lines.append(
            f"  - **本会话累计 ({curr['turns']} 轮)**：总计 `{st['total_tokens']:,}` | 新鲜输入 `{st['input_tokens']:,}` | 缓存命中 `{st['cached_tokens']:,}` (会话命中率 `{st['cache_hit_rate']}%`) | 生成输出 `{st['output_tokens']:,}` | 思考推理 `{st['thinking_tokens']:,}`"
        )
    lines.append("")

    # 2. 三大额度池双轨制实时监控
    tz_lbl = local_tz_label()
    lines.append("## 2. 官方三大额度池双轨监控 (`RetrieveUserQuotaSummary`)")
    if report.get("quota_pools"):
        lines.append(f"| 额度池分组 (Group) | 桶标识 (Bucket ID) | 周期类型 | 剩余额度 | 已用比例 | 重置时间 ({tz_lbl} 本地) | 重置时间 (UTC) | 距离重置倒计时 |")
        lines.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
        for pool in report["quota_pools"]:
            gname = pool["group_name"]
            for b in pool["buckets"]:
                lines.append(
                    f"| **{gname}** | `{b['bucket_id']}` | `{b['window']}` | **{b['remaining_pct']:.2f}%** | {b['used_pct']:.2f}% | {b['reset_local']} | {b['reset_utc']} | **{b['countdown']}** |"
                )
    else:
        lines.append("> 未能连接到本地 Language Server RPC 接口。")
    lines.append("")

    # 3. 所有模型完整标识、内部代号、实时额度与后端路由全表
    lines.append("## 3. 全量模型完整标识、协议代号、后端路由与实时额度表 (`GetUserStatus`)")
    if report.get("models"):
        lines.append(f"| 界面显示名称 (Label) | 完整客户端 ModelId (无省略) | 协议层内部代号 (`modelOrAlias`) | 实际后端路由模型 (`gen_metadata` 映射) | 剩余额度 | 重置时间 ({tz_lbl}) | 倒计时 | 状态 |")
        lines.append("| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |")
        for m in report["models"]:
            status_str = "⚪ 未解锁" if m["disabled"] else ("🟢 满额" if m["remaining_pct"] >= 99.9 else "🟢 正常")
            lines.append(
                f"| **{m['label']}** | `{m['model_id']}` | `{m['internal_code']}` | `{m['backend_routed_model']}` | **{m['remaining_pct']:.2f}%** | {m['reset_local']} | {m['countdown']} | {status_str} |"
            )
    lines.append("")

    # 4. 今日消耗总量与四维拆解
    if ta.get("skipped"):
        lines.append("## 4. 本地 SQLite 历史分析已跳过 (`--live-only`)")
        lines.append("> ℹ️ 已开启 `--live-only` 模式，已跳过本地 SQLite 历史会话分析。")
        lines.append("")
    else:
        if not ta.get("all_history", False):
            lines.append(f"> ⚡ 当前处于极速观测模式（分析最近 {ta.get('scanned_dbs', 3)} 个活跃会话）；可使用 `--all-history` 完整分析全部 {ta.get('total_dbs', 0)} 个历史会话。")
            lines.append("")
        td = ta.get("today", {})
        at = ta.get("all_time", {})
        lines.append(f"## 4. 今日 Token 消耗总量与四维缓存分析 (`{td.get('date', '')}`)")
        lines.append("| 统计维度 | 今日累计数据 (`Today`) | 历史全量累计 (`All-Time`) |")
        lines.append("| :--- | :--- | :--- |")
        lines.append(f"| **活跃会话数 / 交互轮次** | `{td.get('sessions', 0)}` 个会话 / `{td.get('turns', 0):,}` 轮 | `{at.get('sessions', 0)}` 个会话 / `{at.get('turns', 0):,}` 轮 |")
        lines.append(f"| **总消耗 Token (`Total`)** | **`{td.get('total_tokens', 0):,}`** (`{td.get('total_tokens', 0)/10000:.2f} 万`) | **`{at.get('total_tokens', 0):,}`** (`{at.get('total_tokens', 0)/100000000:.3f} 亿`) |")
        lines.append(f"| **新鲜输入 (`Input Tokens`)** | `{td.get('input_tokens', 0):,}` (`{td.get('input_tokens', 0)/10000:.2f} 万`) | `{at.get('input_tokens', 0):,}` |")
        lines.append(f"| **缓存命中 (`Cached Tokens`)** | `{td.get('cached_tokens', 0):,}` (`{td.get('cached_tokens', 0)/10000:.2f} 万`) | `{at.get('cached_tokens', 0):,}` |")
        lines.append(f"| **生成输出 (`Output Tokens`)** | `{td.get('output_tokens', 0):,}` (`{td.get('output_tokens', 0)/10000:.2f} 万`) | `{at.get('output_tokens', 0):,}` |")
        lines.append(f"| **思考推理 (`Thinking Tokens`)** | `{td.get('thinking_tokens', 0):,}` (`{td.get('thinking_tokens', 0)/10000:.2f} 万`) | `{at.get('thinking_tokens', 0):,}` |")
        lines.append(f"| **提示词缓存命中率 (`Cache Hit Rate`)** | **`{td.get('cache_hit_rate', 0):.2f}%`** | **`{at.get('cache_hit_rate', 0):.2f}%`** |")
        lines.append("")

        if td.get("by_routed_model"):
            lines.append("### 今日按实际后端路由模型拆分明细")
            lines.append("| 实际后端路由模型 (`routed_model`) | 今日轮次 | 今日总 Token | 新鲜输入 (`Input`) | 缓存命中 (`Cached`) | 生成输出 (`Output`) | 思考推理 (`Thinking`) |")
            lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
            for rm_name, rm_val in td["by_routed_model"].items():
                lines.append(
                    f"| `{rm_name}` | {rm_val['turns']} | `{rm_val['total']:,}` | `{rm_val['input']:,}` | `{rm_val['cached']:,}` | `{rm_val['output']:,}` | `{rm_val['thinking']:,}` |"
                )
            lines.append("")

    # 5. 本机历史数据库观测到的所有真实后端路由模型汇总
    obs = ta.get("observed_backend_routes", {})
    if obs:
        lines.append("## 5. 本机 SQLite 数据库 (`gen_metadata`) 实测捕获的全部后端路由模型清单")
        lines.append("| 后端实际路由模型标识 (`routed_model`) | 累计捕获轮次 | 累计消耗 Token | 最近一次捕获时间 | 样本会话 ID (完整) |")
        lines.append("| :--- | :---: | :---: | :---: | :--- |")
        for rm_name, info in obs.items():
            lines.append(
                f"| **`{rm_name}`** | {info['turns_count']:,} | `{info['total_tokens']:,}` | {info['last_seen']} | `{info['sample_session']}` |"
            )
        lines.append("")

    # 6. 最近活跃会话列表
    if recent:
        lines.append("## 6. 最近活跃会话上下文与路由明细 (Top 5)")
        lines.append("| 会话完整 ID | 最后更新时间 | 最新后端路由 | 轮次 | 当前上下文水位 | 会话累计总 Token | 会话缓存命中率 |")
        lines.append("| :--- | :---: | :--- | :---: | :---: | :---: | :---: |")
        for s in recent[:5]:
            lines.append(
                f"| `{s['conversation_id']}` | {s['updated_at']} | `{s['routed_model']}` | {s['turns']} | `{s['context_tokens']:,}` / `{s['context_label']}` (`{s['context_pct']}%`) | `{s['session_totals']['total_tokens']:,}` | `{s['session_totals']['cache_hit_rate']}%` |"
            )

    return "\n".join(lines)


def render_brief_report(report: dict) -> str:
    """将完整报告浓缩为 3~4 行极简摘要，用于大幅节省本地 AI Input Token。"""
    acc = report.get("account") or {}
    ta = report.get("token_analytics", {})
    recent = ta.get("recent_sessions", [])
    td = ta.get("today", {})

    head_parts = [f"acct={acc.get('email') or 'local'}({acc.get('tier_name') or '-'})"]
    if recent:
        curr = recent[0]
        head_parts.append(f"ctx={curr.get('context_pct', 0)}%({curr.get('context_tokens', 0):,}/{curr.get('context_label', '-')})")
        head_parts.append(f"routed={curr.get('routed_model', '-')}")
    lines = [" | ".join(head_parts)]

    pools_out = []
    for pool in report.get("quota_pools", []):
        gname = pool.get("group_name", "")
        b_strs = [f"{b.get('window', '?')}:{b.get('remaining_pct', 0):.0f}%({b.get('countdown', '-')})" for b in pool.get("buckets", [])]
        if b_strs:
            pools_out.append(f"{gname}[{','.join(b_strs)}]")
    if pools_out:
        lines.append("pools: " + " ; ".join(pools_out))

    lines.append(
        f"today({td.get('date', '')}): turns={td.get('turns', 0)} in={td.get('input_tokens', 0):,} "
        f"cached={td.get('cached_tokens', 0):,}({td.get('cache_hit_rate', 0):.1f}%) out={td.get('output_tokens', 0):,}"
    )
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity 运行时状态与配额观测工具")
    parser.add_argument("-m", "--markdown", action="store_true", help="以 Markdown 格式输出完整报告")
    parser.add_argument("--json", action="store_true", help="以 JSON 格式输出完整原始数据（默认输出 3 行极简摘要以省 Token）")
    parser.add_argument("--live-only", action="store_true", help="仅探测 RPC 配额与连接状态，跳过本地 SQLite 历史分析")
    parser.add_argument("--all-history", action="store_true", help="扫描全量历史会话数据库（默认扫描今日活跃与最近 3 个会话）")
    parser.add_argument("--recent-dbs", type=int, default=3, help="至少扫描最近更新的数据库数量（默认 3）")
    parser.add_argument("--no-cache", action="store_true", help="强制不使用 RPC/DB 缓存")
    args = parser.parse_args()

    report_data = build_full_report(
        recent_dbs=args.recent_dbs,
        all_history=args.all_history,
        live_only=args.live_only,
        use_cache=not args.no_cache,
    )
    if args.json:
        print(json.dumps(report_data, ensure_ascii=False, indent=2))
    elif args.markdown:
        print(render_markdown_report(report_data))
    else:
        print(render_brief_report(report_data))
