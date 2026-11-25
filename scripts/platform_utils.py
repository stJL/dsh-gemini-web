#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
跨平台兼容与解耦公共模块（纯 Python 标准库，供 setup_skill / gemini_web / inspect_antigravity 共用）：
1. 统一多系统 & 全 Chromium 家族（Chrome/Chromium/Edge/Brave/Vivaldi + Linux Snap/Flatpak）探测；
2. 统一 Linux 全发行版（Debian/Ubuntu/Fedora/RHEL/Arch/openSUSE/Alpine 等）包管理指引与 venv/virtualenv 兜底；
3. 纯 Python 零外部命令依赖的进程与监听端口探测（Linux `/proc` + Windows Win32 `ctypes`）。
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.request
import venv
from pathlib import Path

# 专用 AI Chrome 独立 Profile 配置（与用户日常 Chrome 彻底隔离，永不碰默认 User Data）
AI_CHROME_DEFAULT_PORT = 9229
AI_CHROME_PROFILE_DIRNAME = ".gemini-web-chrome"
AI_CHROME_SHORTCUT_BASENAME = "Gemini AI Chrome"

# 支持 AgentLimb 扩展与 Chrome DevTools Protocol (CDP) 的 Chromium 家族注册表
CHROMIUM_LINUX_APP_DIRS = (
    "google-chrome",
    "google-chrome-beta",
    "google-chrome-unstable",
    "chromium",
    "microsoft-edge",
    "microsoft-edge-beta",
    "BraveSoftware/Brave-Browser",
    "vivaldi",
)

CHROMIUM_FLATPAK_DIRS = (
    ".var/app/com.google.Chrome/config/google-chrome",
    ".var/app/org.chromium.Chromium/config/chromium",
    ".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser",
    ".var/app/com.microsoft.Edge/config/microsoft-edge",
)

CHROMIUM_SNAP_DIRS = (
    "snap/chromium/common/chromium",
    "snap/brave/current/.config/BraveSoftware/Brave-Browser",
)

CHROMIUM_LINUX_BINS = (
    "google-chrome",
    "google-chrome-stable",
    "google-chrome-beta",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
    "brave-browser",
    "vivaldi",
)


def get_ai_chrome_profile_dir(home: Path | None = None, custom_dir: str = "") -> Path:
    """返回专用 AI Chrome 独立 User Data 目录（与日常 Chrome 物理隔离，一次登录永久免弹窗）。"""
    if (custom_dir or "").strip():
        return Path(custom_dir).expanduser().resolve()
    env_dir = (os.environ.get("GEMINI_WEB_CHROME_DIR") or "").strip()
    if env_dir:
        return Path(env_dir).expanduser().resolve()
    return ((home or Path.home()) / AI_CHROME_PROFILE_DIRNAME).resolve()


def probe_cdp_http(port: int | str, timeout_sec: float = 1.2) -> dict | None:
    """绕过系统代理探测指定端口的 Chrome CDP /json/version；就绪返回 JSON 字典，否则 None。"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(f"http://127.0.0.1:{port}/json/version", method="GET")
    try:
        with opener.open(req, timeout=timeout_sec) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:
        return None
    return None


def iter_devtools_active_port_files(
    sys_name: str | None = None,
    home: Path | None = None,
    env: dict[str, str] | None = None,
) -> list[Path]:
    """跨平台返回所有 Chromium 系浏览器可能的 DevToolsActivePort 路径（优先专用 AI Chrome 独立目录）。"""
    sys_low = (sys_name or platform.system()).lower()
    home_dir = home or Path.home()
    env_map = env if env is not None else os.environ
    candidates: list[Path] = []

    # 最高优先级：专用独立 AI Chrome Profile（免弹窗、不干扰日常 Chrome）
    ai_profile = get_ai_chrome_profile_dir(home=home_dir)
    candidates.append(ai_profile / "DevToolsActivePort")

    if sys_low.startswith("win"):
        local_app = Path(env_map.get("LOCALAPPDATA") or (home_dir / "AppData" / "Local"))
        rel_dirs = (
            ("Google", "Chrome", "User Data"),
            ("Google", "Chrome Beta", "User Data"),
            ("Google", "Chrome SxS", "User Data"),
            ("Microsoft", "Edge", "User Data"),
            ("BraveSoftware", "Brave-Browser", "User Data"),
            ("Chromium", "User Data"),
            ("Vivaldi", "User Data"),
        )
        for parts in rel_dirs:
            candidates.append(local_app.joinpath(*parts, "DevToolsActivePort"))
        return candidates

    if sys_low == "darwin":
        support = home_dir / "Library" / "Application Support"
        rel_dirs = (
            ("Google", "Chrome"),
            ("Google", "Chrome Beta"),
            ("Microsoft Edge",),
            ("BraveSoftware", "Brave-Browser"),
            ("Chromium",),
            ("Vivaldi",),
        )
        for parts in rel_dirs:
            candidates.append(support.joinpath(*parts, "DevToolsActivePort"))
        return candidates

    xdg_cfg = Path(env_map.get("XDG_CONFIG_HOME") or (home_dir / ".config"))
    for rel in CHROMIUM_LINUX_APP_DIRS:
        candidates.append(xdg_cfg / rel / "DevToolsActivePort")
    for rel in CHROMIUM_SNAP_DIRS:
        candidates.append(home_dir / rel / "DevToolsActivePort")
    for rel in CHROMIUM_FLATPAK_DIRS:
        candidates.append(home_dir / rel / "DevToolsActivePort")
    return candidates


def detect_chromium_executables(
    sys_name: str | None = None,
    home: Path | None = None,
    env: dict[str, str] | None = None,
) -> list[str]:
    """探测当前系统可用的 Chromium 系浏览器可执行文件路径。"""
    sys_low = (sys_name or platform.system()).lower()
    home_dir = home or Path.home()
    env_map = env if env is not None else os.environ
    found: list[str] = []

    if sys_low.startswith("win"):
        local_app = Path(env_map.get("LOCALAPPDATA") or (home_dir / "AppData" / "Local"))
        raw_bins = [
            Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
            local_app / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
            Path(r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        found.extend(str(p) for p in raw_bins if p.exists())
        return found

    if sys_low == "darwin":
        mac_bins = [
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
            Path("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
            Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        ]
        found.extend(str(p) for p in mac_bins if p.exists())
        return found

    for cmd in CHROMIUM_LINUX_BINS:
        which = shutil.which(cmd)
        if which and which not in found:
            found.append(which)
    flatpak_exports = (
        Path("/var/lib/flatpak/exports/bin"),
        home_dir / ".local" / "share" / "flatpak" / "exports" / "bin",
    )
    for exp_dir in flatpak_exports:
        for app_id in ("com.google.Chrome", "org.chromium.Chromium", "com.brave.Browser", "com.microsoft.Edge"):
            p = exp_dir / app_id
            if p.exists() and str(p) not in found:
                found.append(str(p))
    return found


def detect_default_browser(sys_name: str | None = None) -> str:
    """尽轻量尝试读取当前系统默认浏览器标识（失败返回空字符串）。"""
    sys_low = (sys_name or platform.system()).lower()
    if sys_low.startswith("win") or sys_low == "darwin":
        return ""
    if shutil.which("xdg-settings"):
        try:
            proc = subprocess.run(
                ["xdg-settings", "get", "default-web-browser"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=1.5,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout.strip().lower()
        except Exception:
            pass
    return (os.environ.get("BROWSER") or "").strip().lower()


def parse_os_release(text: str) -> dict[str, str]:
    """解析 Linux /etc/os-release 键值。"""
    info: dict[str, str] = {}
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        info[k.strip()] = v.strip().strip('"').strip("'").lower()
    return info


def linux_venv_install_hint(os_release_text: str | None = None) -> str:
    """根据 Linux 发行版返回准确的 venv/ensurepip 安装指引。"""
    if os_release_text is None:
        osr = Path("/etc/os-release")
        os_release_text = osr.read_text(encoding="utf-8", errors="ignore") if osr.exists() else ""
    info = parse_os_release(os_release_text)
    tokens = f"{info.get('ID', '')} {info.get('ID_LIKE', '')}".split()
    ver_id = info.get("VERSION_ID", "")

    if any(t in ("ubuntu", "debian", "linuxmint", "pop", "kali", "raspbian") for t in tokens):
        return "sudo apt update && sudo apt install -y python3-venv python3-pip"
    if any(t in ("fedora", "rhel", "centos", "rocky", "almalinux") for t in tokens):
        return "sudo dnf install -y python3 python3-pip python3-virtualenv"
    if any(t in ("arch", "manjaro", "endeavouros", "garuda") for t in tokens):
        return "sudo pacman -S --noconfirm python python-pip python-virtualenv"
    if any(t in ("opensuse", "opensuse-leap", "opensuse-tumbleweed", "suse", "sles") for t in tokens):
        return "sudo zypper install -y python3 python3-pip python3-virtualenv"
    if "alpine" in tokens:
        return "sudo apk add --no-cache python3 py3-pip py3-virtualenv"
    if "nixos" in tokens:
        return "请使用 nix-shell -p python3 python3Packages.playwright python3Packages.virtualenv"
    return f"请使用系统包管理器安装 Python venv/ensurepip 或 python-virtualenv（检测到发行版: {info.get('ID') or 'linux'} {ver_id}）".strip()


def create_python_venv(venv_dir: Path, sys_python: str) -> tuple[bool, str]:
    """创建 Python .venv；标准库 venv 缺少 ensurepip 时自动尝试 virtualenv 兜底。"""
    try:
        venv.EnvBuilder(with_pip=True).create(str(venv_dir))
        return True, ""
    except Exception as std_err:
        if venv_dir.exists():
            shutil.rmtree(venv_dir, ignore_errors=True)

        # 兜底方案：若系统已安装 virtualenv（不依赖 ensurepip），尝试直接用其构建 .venv
        fallback_cmds: list[list[str]] = []
        v_bin = shutil.which("virtualenv")
        if v_bin:
            fallback_cmds.append([v_bin, str(venv_dir)])
        fallback_cmds.append([sys_python, "-m", "virtualenv", str(venv_dir)])

        for cmd in fallback_cmds:
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=45)
                if proc.returncode == 0 and venv_dir.exists():
                    return True, ""
                if venv_dir.exists():
                    shutil.rmtree(venv_dir, ignore_errors=True)
            except Exception:
                pass

        sys_low = platform.system().lower()
        hint = (
            linux_venv_install_hint()
            if sys_low == "linux"
            else "请确认当前 Python 安装完整并包含 venv 与 pip 模块"
        )
        return False, f"创建 .venv 失败: {std_err}（建议执行: {hint}）"


def parse_proc_net_tcp_lines(lines: list[str]) -> dict[str, int]:
    """解析 Linux /proc/net/tcp{,6} 中处于 LISTEN (0A) 状态的 socket inode -> port 映射。"""
    inode_to_port: dict[str, int] = {}
    for line in lines:
        parts = line.strip().split()
        if len(parts) < 10 or ":" not in parts[1]:
            continue
        state = parts[3].upper()
        if state != "0A":  # 0A == TCP_LISTEN
            continue
        hex_port = parts[1].rsplit(":", 1)[1]
        inode = parts[9]
        if inode == "0" or not inode.isdigit():
            continue
        try:
            inode_to_port[inode] = int(hex_port, 16)
        except ValueError:
            continue
    return inode_to_port


def find_linux_servers_via_proc(proc_root: Path = Path("/proc")) -> list[dict]:
    """纯 Python 零外部命令读取 /proc 发现含 --csrf_token 的 Antigravity 语言服务器与监听端口。"""
    if not proc_root.is_dir():
        return []

    inode_to_port: dict[str, int] = {}
    for net_name in ("net/tcp", "net/tcp6"):
        net_file = proc_root / net_name
        if net_file.is_file():
            try:
                raw_lines = net_file.read_text(encoding="utf-8", errors="ignore").splitlines()
                inode_to_port.update(parse_proc_net_tcp_lines(raw_lines))
            except OSError:
                pass

    candidates: list[dict] = []
    try:
        entries = list(proc_root.iterdir())
    except OSError:
        return []

    for entry in entries:
        if not entry.name.isdigit() or not entry.is_dir():
            continue
        pid = int(entry.name)
        cmdline_file = entry / "cmdline"
        try:
            raw_cmd = cmdline_file.read_bytes()
        except OSError:
            continue
        if not raw_cmd:
            continue
        cmd = " ".join(part for part in raw_cmd.decode("utf-8", errors="ignore").split("\x00") if part)
        if "--csrf_token" not in cmd:
            continue
        if "language_server" not in cmd and "agy" not in cmd:
            continue

        exe = ""
        try:
            exe = os.readlink(entry / "exe")
        except OSError:
            exe = cmd.split()[0] if cmd else ""

        ports: list[int] = []
        fd_dir = entry / "fd"
        if fd_dir.is_dir():
            try:
                for fd_entry in fd_dir.iterdir():
                    try:
                        target = os.readlink(fd_entry)
                    except OSError:
                        continue
                    m = re.match(r"^socket:\[(\d+)\]$", target)
                    if m and m.group(1) in inode_to_port:
                        ports.append(inode_to_port[m.group(1)])
            except OSError:
                pass

        score = 100 if "--standalone" in cmd else 50
        candidates.append({
            "pid": pid,
            "cmd": cmd,
            "exe": exe,
            "ports": sorted(set(ports)),
            "score": score,
        })

    return candidates


def _get_windows_listening_ports(target_pids: set[int]) -> dict[int, list[int]]:
    """通过 Win32 iphlpapi.GetExtendedTcpTable 零子进程获取指定 PID 的 IPv4/IPv6 LISTEN 端口。"""
    if sys.platform != "win32" or not target_pids:
        return {}

    import ctypes
    from ctypes import wintypes

    iphlpapi = ctypes.WinDLL("iphlpapi", use_last_error=True)
    iphlpapi.GetExtendedTcpTable.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(wintypes.DWORD),
        wintypes.BOOL,
        wintypes.ULONG,
        wintypes.ULONG,
        wintypes.ULONG,
    ]
    iphlpapi.GetExtendedTcpTable.restype = wintypes.DWORD

    TCP_TABLE_OWNER_PID_LISTENER = 3
    AF_INET = 2
    AF_INET6 = 23
    ERROR_INSUFFICIENT_BUFFER = 122

    class MIB_TCPROW_OWNER_PID(ctypes.Structure):
        _fields_ = [
            ("dwState", wintypes.DWORD),
            ("dwLocalAddr", wintypes.DWORD),
            ("dwLocalPort", wintypes.DWORD),
            ("dwRemoteAddr", wintypes.DWORD),
            ("dwRemotePort", wintypes.DWORD),
            ("dwOwningPid", wintypes.DWORD),
        ]

    class MIB_TCP6ROW_OWNER_PID(ctypes.Structure):
        _fields_ = [
            ("ucLocalAddr", ctypes.c_ubyte * 16),
            ("dwLocalScopeId", wintypes.DWORD),
            ("dwLocalPort", wintypes.DWORD),
            ("ucRemoteAddr", ctypes.c_ubyte * 16),
            ("dwRemoteScopeId", wintypes.DWORD),
            ("dwRemotePort", wintypes.DWORD),
            ("dwState", wintypes.DWORD),
            ("dwOwningPid", wintypes.DWORD),
        ]

    pid_ports: dict[int, set[int]] = {p: set() for p in target_pids}

    def _ntohs(val: int) -> int:
        v = val & 0xFFFF
        return ((v & 0xFF) << 8) | ((v >> 8) & 0xFF)

    for af, row_cls in ((AF_INET, MIB_TCPROW_OWNER_PID), (AF_INET6, MIB_TCP6ROW_OWNER_PID)):
        size = wintypes.DWORD(0)
        rc = iphlpapi.GetExtendedTcpTable(None, ctypes.byref(size), False, af, TCP_TABLE_OWNER_PID_LISTENER, 0)
        if rc != ERROR_INSUFFICIENT_BUFFER or size.value <= 4:
            continue
        buf = (ctypes.c_ubyte * (size.value + 64))()
        size_alloc = wintypes.DWORD(len(buf))
        rc = iphlpapi.GetExtendedTcpTable(buf, ctypes.byref(size_alloc), False, af, TCP_TABLE_OWNER_PID_LISTENER, 0)
        if rc != 0:
            continue
        num_entries = wintypes.DWORD.from_buffer(buf, 0).value
        row_size = ctypes.sizeof(row_cls)
        offset = ctypes.sizeof(wintypes.DWORD)
        for _ in range(num_entries):
            if offset + row_size > size_alloc.value:
                break
            row = row_cls.from_buffer(buf, offset)
            offset += row_size
            owning_pid = int(row.dwOwningPid)
            if owning_pid in pid_ports:
                port = _ntohs(int(row.dwLocalPort))
                if port > 0:
                    pid_ports[owning_pid].add(port)

    return {pid: sorted(ports) for pid, ports in pid_ports.items()}


def find_windows_servers_status() -> tuple[list[dict], bool]:
    """纯 Python ctypes 零子进程探测含 --csrf_token 的 Antigravity 语言服务器，并返回 (candidates, win32_ok)。"""
    if sys.platform != "win32":
        return [], False

    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    ntdll = ctypes.WinDLL("ntdll", use_last_error=True)

    TH32CS_SNAPPROCESS = 0x00000002
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    PROCESS_COMMAND_LINE_INFORMATION = 60

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.c_size_t),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", wintypes.LONG),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", wintypes.WCHAR * 260),
        ]

    class UNICODE_STRING(ctypes.Structure):
        _fields_ = [
            ("Length", wintypes.USHORT),
            ("MaximumLength", wintypes.USHORT),
            ("Buffer", ctypes.c_void_p),
        ]

    kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    kernel32.Process32FirstW.restype = wintypes.BOOL
    kernel32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    kernel32.Process32NextW.restype = wintypes.BOOL
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    kernel32.QueryFullProcessImageNameW.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD),
    ]
    kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL

    ntdll.NtQueryInformationProcess.argtypes = [
        wintypes.HANDLE,
        wintypes.ULONG,
        ctypes.c_void_p,
        wintypes.ULONG,
        ctypes.POINTER(wintypes.ULONG),
    ]
    ntdll.NtQueryInformationProcess.restype = ctypes.c_long

    # 1. 枚举进程并筛选 language_server / agy
    matched_pids: list[int] = []
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not snap or snap == INVALID_HANDLE_VALUE:
        return [], False
    try:
        pe = PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(PROCESSENTRY32W)
        if kernel32.Process32FirstW(snap, ctypes.byref(pe)):
            while True:
                name_low = (pe.szExeFile or "").lower()
                if "language_server" in name_low or "agy" in name_low:
                    matched_pids.append(int(pe.th32ProcessID))
                if not kernel32.Process32NextW(snap, ctypes.byref(pe)):
                    break
    finally:
        kernel32.CloseHandle(snap)

    if not matched_pids:
        return [], True

    # 2. 获取候选进程的完整可执行路径与命令行
    proc_infos: list[tuple[int, str, str]] = []
    for pid in matched_pids:
        h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h_proc:
            continue
        try:
            exe_path = ""
            exe_buf = ctypes.create_unicode_buffer(1024)
            exe_len = wintypes.DWORD(len(exe_buf))
            if kernel32.QueryFullProcessImageNameW(h_proc, 0, exe_buf, ctypes.byref(exe_len)):
                exe_path = exe_buf.value

            cmd_line = ""
            buf_size = 8192
            for _ in range(2):
                raw_buf = (ctypes.c_ubyte * buf_size)()
                ret_len = wintypes.ULONG(0)
                status = ntdll.NtQueryInformationProcess(
                    h_proc,
                    PROCESS_COMMAND_LINE_INFORMATION,
                    raw_buf,
                    buf_size,
                    ctypes.byref(ret_len),
                )
                if status == 0:
                    us = UNICODE_STRING.from_buffer(raw_buf)
                    if us.Buffer and us.Length > 0:
                        cmd_line = ctypes.wstring_at(us.Buffer, us.Length // 2)
                    break
                # STATUS_INFO_LENGTH_MISMATCH / STATUS_BUFFER_TOO_SMALL / STATUS_BUFFER_OVERFLOW
                if (status & 0xFFFFFFFF) in (0xC0000004, 0xC0000023, 0x80000005) and ret_len.value > buf_size:
                    buf_size = ret_len.value + 64
                    continue
                break

            if "--csrf_token" in cmd_line:
                proc_infos.append((pid, cmd_line, exe_path))
        finally:
            kernel32.CloseHandle(h_proc)

    if not proc_infos:
        # 已成功用 Win32 原生枚举并检查过所有目标进程命令行，无需外部命令兜底
        return [], True

    # 3. 批量查监听端口
    pid_ports = _get_windows_listening_ports({pid for pid, _, _ in proc_infos})

    candidates: list[dict] = []
    for pid, cmd_line, exe_path in proc_infos:
        score = 0
        if "--standalone" in cmd_line or "Programs\\Antigravity\\resources" in exe_path:
            score += 100
        elif "Antigravity IDE" in exe_path:
            score += 50
        candidates.append({
            "pid": pid,
            "cmd": cmd_line,
            "exe": exe_path,
            "ports": pid_ports.get(pid, []),
            "score": score,
        })

    return candidates, True


def find_windows_servers_via_win32() -> list[dict]:
    """纯 Python ctypes 零子进程调用 Win32 API 发现含 --csrf_token 的 Antigravity 语言服务器与监听端口。"""
    candidates, _ = find_windows_servers_status()
    return candidates


def is_ai_chrome_configured(custom_dir: str = "", home: Path | None = None) -> bool:
    """判断本机是否已由用户完成独立 AI Chrome Profile (~/.gemini-web-chrome/Default) 初始化配置。"""
    prof = get_ai_chrome_profile_dir(home=home, custom_dir=custom_dir)
    return (prof / "Default").is_dir()


def _read_linux_xdg_user_dir(key: str, home_dir: Path) -> Path | None:
    """从 ~/.config/user-dirs.dirs 读取 XDG 用户目录（如中文 Ubuntu 下 XDG_DESKTOP_DIR="$HOME/桌面"）。"""
    cfg = home_dir / ".config" / "user-dirs.dirs"
    if not cfg.is_file():
        return None
    try:
        for line in cfg.read_text(encoding="utf-8", errors="ignore").splitlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            if k.strip() != key:
                continue
            val = v.strip().strip('"').strip("'")
            val = val.replace("$HOME", str(home_dir))
            if val.startswith("~"):
                val = str(home_dir / val[2:] if val.startswith("~/") else home_dir)
            p = Path(val)
            if p.is_dir():
                return p
    except Exception:
        pass
    return None


def _resolve_desktop_dir(sys_name: str | None = None, home: Path | None = None) -> Path:
    """跨平台定位用户桌面目录（Windows 兼容 OneDrive；Linux 兼容 XDG_DESKTOP_DIR 如 ~/桌面）。"""
    sys_low = (sys_name or platform.system()).lower()
    home_dir = home or Path.home()
    if sys_low.startswith("win"):
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=3,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                p = Path(proc.stdout.strip())
                if p.exists():
                    return p
        except Exception:
            pass
    elif sys_low == "linux":
        xdg_desk = _read_linux_xdg_user_dir("XDG_DESKTOP_DIR", home_dir)
        if xdg_desk is not None:
            return xdg_desk
        zh_desk = home_dir / "桌面"
        if zh_desk.is_dir():
            return zh_desk
    desktop = home_dir / "Desktop"
    return desktop if desktop.exists() else home_dir


def create_ai_chrome_shortcut(
    chrome_exe: str,
    profile_dir: Path | str,
    port: int = AI_CHROME_DEFAULT_PORT,
    desktop_dir: Path | str | None = None,
    sys_name: str | None = None,
) -> dict:
    """跨平台创建专用 AI Chrome 桌面快捷方式（独立 --user-data-dir 与固定 CDP 端口，绝不碰日常 Chrome）。"""
    if not chrome_exe:
        raise FileNotFoundError("未找到本机 Chromium/Chrome 可执行文件，无法创建专用 AI Chrome 快捷方式。")
    sys_low = (sys_name or platform.system()).lower()
    prof = Path(profile_dir).expanduser().resolve()
    prof.mkdir(parents=True, exist_ok=True)
    desk = Path(desktop_dir).expanduser().resolve() if desktop_dir else _resolve_desktop_dir(sys_name=sys_low)
    desk.mkdir(parents=True, exist_ok=True)

    chrome_args = (
        f'--remote-debugging-port={int(port)} '
        f'--user-data-dir="{prof}" '
        '--no-first-run --no-default-browser-check'
    )
    launch_cmd = f'"{chrome_exe}" {chrome_args}'

    if sys_low.startswith("win"):
        lnk_path = desk / f"{AI_CHROME_SHORTCUT_BASENAME}.lnk"
        # 通过 PowerShell WScript.Shell 创建原生 Windows .lnk 快捷方式
        ps_exe = chrome_exe.replace("'", "''")
        ps_args = chrome_args.replace("'", "''")
        ps_lnk = str(lnk_path).replace("'", "''")
        ps_work = str(Path(chrome_exe).parent).replace("'", "''")
        ps_script = (
            "$ws = New-Object -ComObject WScript.Shell; "
            f"$s = $ws.CreateShortcut('{ps_lnk}'); "
            f"$s.TargetPath = '{ps_exe}'; "
            f"$s.Arguments = '{ps_args}'; "
            f"$s.WorkingDirectory = '{ps_work}'; "
            f"$s.IconLocation = '{ps_exe},0'; "
            "$s.Description = 'Gemini Web Agent 专用独立 Chrome (CDP 高速免弹窗)'; "
            "$s.Save()"
        )
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
        if proc.returncode != 0 or not lnk_path.exists():
            # 兜底生成 .bat 启动脚本，确保跨环境可靠可用
            bat_path = desk / f"{AI_CHROME_SHORTCUT_BASENAME}.bat"
            bat_path.write_text(f'@echo off\r\nstart "" {launch_cmd}\r\n', encoding="utf-8")
            return {
                "created": True,
                "shortcut_path": str(bat_path),
                "format": "bat",
                "profile_dir": str(prof),
                "port": int(port),
                "launch_command": launch_cmd,
                "warning": (proc.stderr or "").strip() or None,
            }
        return {
            "created": True,
            "shortcut_path": str(lnk_path),
            "format": "lnk",
            "profile_dir": str(prof),
            "port": int(port),
            "launch_command": launch_cmd,
        }

    if sys_low == "darwin":
        cmd_path = desk / f"{AI_CHROME_SHORTCUT_BASENAME}.command"
        cmd_path.write_text(
            "#!/bin/bash\n"
            f'"{chrome_exe}" --remote-debugging-port={int(port)} '
            f'--user-data-dir="{prof}" --no-first-run --no-default-browser-check &\n',
            encoding="utf-8",
        )
        cmd_path.chmod(cmd_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return {
            "created": True,
            "shortcut_path": str(cmd_path),
            "format": "command",
            "profile_dir": str(prof),
            "port": int(port),
            "launch_command": launch_cmd,
        }

    desktop_file = desk / "gemini-ai-chrome.desktop"
    desktop_file.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        f"Name={AI_CHROME_SHORTCUT_BASENAME}\n"
        "Comment=Gemini Web Agent 专用独立 Chrome (CDP 高速免弹窗)\n"
        f'Exec="{chrome_exe}" --remote-debugging-port={int(port)} --user-data-dir="{prof}" --no-first-run --no-default-browser-check\n'
        "Icon=google-chrome\n"
        "Terminal=false\n"
        "Categories=Network;WebBrowser;Development;\n",
        encoding="utf-8",
    )
    desktop_file.chmod(desktop_file.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return {
        "created": True,
        "shortcut_path": str(desktop_file),
        "format": "desktop",
        "profile_dir": str(prof),
        "port": int(port),
        "launch_command": launch_cmd,
    }


def launch_ai_chrome(
    chrome_exe: str,
    profile_dir: Path | str,
    port: int = AI_CHROME_DEFAULT_PORT,
    open_urls: list[str] | None = None,
    wait_ready_sec: float = 8.0,
) -> dict:
    """启动独立隔离的专用 AI Chrome 实例（绝不强杀日常 Chrome），并等待其 CDP HTTP 端口就绪。"""
    prof = Path(profile_dir).expanduser().resolve()
    prof.mkdir(parents=True, exist_ok=True)
    port_int = int(port)

    existing = probe_cdp_http(port_int, timeout_sec=1.0)
    if existing:
        return {
            "launched": True,
            "already_running": True,
            "cdp_http_ready": True,
            "port": port_int,
            "profile_dir": str(prof),
            "ws_url": existing.get("webSocketDebuggerUrl") or f"http://127.0.0.1:{port_int}",
            "browser": existing.get("Browser"),
        }

    if not chrome_exe:
        raise FileNotFoundError("未找到本机 Chromium/Chrome 可执行文件。")

    is_first_profile = not (prof / "Default").exists()
    urls = list(open_urls or [])
    if not urls and is_first_profile:
        urls = [
            "https://aistudio.google.com/prompts/new_chat",
            "https://gemini.google.com/app",
        ]

    cmd = [
        chrome_exe,
        f"--remote-debugging-port={port_int}",
        f"--user-data-dir={prof}",
        "--no-first-run",
        "--no-default-browser-check",
        *urls,
    ]
    popen_kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "stdin": subprocess.DEVNULL,
    }
    launched_pid: int | None = None
    if platform.system().lower().startswith("win"):
        # 优先使用 WMI Win32_Process.Create 拉起 Chrome，彻底脱离终端 Job Object，命令退出后不被系统连坐回收
        try:
            ps_cmd_str = " ".join(f'"{c}"' if (" " in str(c) or "=" in str(c)) else str(c) for c in cmd)
            ps_escaped = ps_cmd_str.replace("'", "''")
            wmi_res = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    f"$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{ CommandLine = '{ps_escaped}' }}; "
                    "if ($r.ReturnValue -eq 0) { Write-Output $r.ProcessId } else { exit 1 }",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=6,
            )
            if wmi_res.returncode == 0 and wmi_res.stdout.strip().isdigit():
                launched_pid = int(wmi_res.stdout.strip())
        except Exception:
            launched_pid = None

        if launched_pid is None:
            base_flags = (
                getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
            )
            breakaway = getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0x01000000)
            try:
                proc = subprocess.Popen(cmd, creationflags=(base_flags | breakaway), **popen_kwargs)
            except OSError:
                proc = subprocess.Popen(cmd, creationflags=base_flags, **popen_kwargs)
            launched_pid = proc.pid
    else:
        popen_kwargs["start_new_session"] = True
        if platform.system().lower() == "linux" and not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
            env_copy = dict(os.environ)
            uid = os.getuid() if hasattr(os, "getuid") else 1000
            run_dir = Path(f"/run/user/{uid}")
            if (run_dir / "wayland-0").exists():
                env_copy.setdefault("XDG_RUNTIME_DIR", str(run_dir))
                env_copy.setdefault("WAYLAND_DISPLAY", "wayland-0")
            if Path("/tmp/.X11-unix/X0").exists():
                env_copy.setdefault("DISPLAY", ":0")
            elif Path("/tmp/.X11-unix/X1").exists():
                env_copy.setdefault("DISPLAY", ":1")
            if (run_dir / "bus").exists():
                env_copy.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path={run_dir / 'bus'}")
            popen_kwargs["env"] = env_copy
        proc = subprocess.Popen(cmd, **popen_kwargs)
        launched_pid = proc.pid

    deadline = time.time() + max(1.0, float(wait_ready_sec))
    ver = None
    while time.time() < deadline:
        ver = probe_cdp_http(port_int, timeout_sec=1.2)
        if ver:
            if is_first_profile:
                # 首次创建隔离 Profile 时 Chrome 可能会在初始化后切一次主进程，短等并复核最终 wsUrl
                time.sleep(1.5)
                ver = probe_cdp_http(port_int, timeout_sec=1.5) or ver
            break
        time.sleep(0.35)

    return {
        "launched": True,
        "already_running": False,
        "first_run_login_needed": is_first_profile,
        "cdp_http_ready": ver is not None,
        "pid": launched_pid,
        "port": port_int,
        "profile_dir": str(prof),
        "ws_url": (ver or {}).get("webSocketDebuggerUrl") or f"http://127.0.0.1:{port_int}",
        "browser": (ver or {}).get("Browser"),
    }
