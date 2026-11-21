#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_upstream.py - 一鍵同步原作者上游倉庫 (582835293/gemini-web-agent)

用途：
  當原作者修復了 Google 站點 DOM 選擇器、新增支援模型或更新底層自動化邏輯時，
  只需在 dsh-gemini-web 目錄下執行：
      python scripts/sync_upstream.py
  即可自動拉取上游最新改動，智慧增量同步底層核心腳本，保護 DSH 專屬測試與增強特性，並自動編譯外掛。
"""

import os
import re
import sys
import shutil
import tempfile
import subprocess
from pathlib import Path

UPSTREAM_REPO = "https://github.com/582835293/gemini-web-agent.git"
LOCAL_UPSTREAM_DIR = Path.home() / ".dsh" / "gemini-web-agent"
DSH_PLUGIN_DIR = Path(__file__).resolve().parent.parent

# 需要從原作者倉庫同步的底層核心腳本
SYNC_SCRIPTS = [
    "scripts/gemini_web.py",
    "scripts/gemini_agentlimb.py",
    "scripts/agentlimb_client.py",
    "scripts/platform_utils.py",
    "scripts/setup_skill.py",
]

# 需要智慧增量同步的資料夾（僅覆蓋上游自帶檔案，保留 DSH 專屬檔案）
SYNC_DIRS = [
    "references",
    "tests",
]

def run_cmd(cmd, cwd=None):
    res = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    return res.returncode, res.stdout.strip(), res.stderr.strip()

def apply_dsh_patches():
    """確保 DSH 專屬補丁保留（如 Flow 每日點數刷新正則、安全鎖定、DSH 技能目錄等）"""
    # 1. 守護 scripts/gemini_web.py
    gw_py = DSH_PLUGIN_DIR / "scripts" / "gemini_web.py"
    if gw_py.exists():
        text = gw_py.read_text(encoding="utf-8")
        if "reset_period" not in text or "個\\s*Google Flow" not in text:
            flow_body_pattern = re.compile(
                r'(\s*dialog\.wait_for\(state="visible", timeout=10000\)\n)'
                r'[\s\S]*?'
                r'(\n\s*finally:\n)',
                re.MULTILINE
            )
            dsh_flow_body = (
                '        raw = (dialog.inner_text() or "").strip()\n'
                '        credits_m = re.search(r"([\\d,]+)\\s*(?:個\\s*Google Flow\\s*點數|个\\s*Google Flow\\s*点数|Google Flow\\s*credits?)", raw, re.IGNORECASE)\n'
                '        # 忠实抓取完整的重置/刷新说明语句（例如 "Credits refresh daily at 5:00 PM" 或 "Resets on Dec 15" 或 "点数将于每日 17:00 刷新"）\n'
                '        reset_m = re.search(\n'
                '            r"(?:Credits?\\s+refresh[^\\n]+|Resets?(?:\\s+on)?\\s+[^\\n]+|点数将于[^\\n]+|點數將於[^\\n]+|(?:重置时间|刷新时间)[:：]\\s*[^\\n]+|每日\\s*[\\d:]+\\s*(?:AM|PM)?)",\n'
                '            raw,\n'
                '            re.IGNORECASE,\n'
                '        )\n'
                '        raw_reset = reset_m.group(0).strip() if reset_m else None\n'
                '        if raw_reset:\n'
                '            raw_reset = re.sub(\n'
                '                r"\\s*(?:Upgrade|Manage|Sign\\s*out|升级|升級|退出|person|Visible|可见水印|Privacy|隐私权|Terms).*$",\n'
                '                "",\n'
                '                raw_reset,\n'
                '                flags=re.IGNORECASE,\n'
                '            ).strip()\n\n'
                '        period = None\n'
                '        if raw_reset:\n'
                '            lower = raw_reset.lower()\n'
                '            if any(w in lower for w in ["daily", "每日", "每天"]):\n'
                '                period = "daily"\n'
                '            elif any(w in lower for w in ["month", "每月", "每逢", "resets on"]):\n'
                '                period = "monthly"\n\n'
                '        return {\n'
                '            "status": "ok",\n'
                '            "url": page.url,\n'
                '            "credits": int(credits_m.group(1).replace(",", "")) if credits_m else None,\n'
                '            "reset_time": raw_reset,\n'
                '            "reset_period": period,\n'
                '            "raw": raw,\n'
                '        }'
            )
            def repl_flow(m):
                return m.group(1) + dsh_flow_body + m.group(2)

            new_text, count = flow_body_pattern.subn(repl_flow, text, count=1)
            if count > 0:
                gw_py.write_text(new_text, encoding="utf-8")
                print("  [Patch] 已注入 Google Flow 點數重置與週期解析增強補丁至 gemini_web.py")

    # 2. 守護 scripts/gemini_agentlimb.py
    al_py = DSH_PLUGIN_DIR / "scripts" / "gemini_agentlimb.py"
    if al_py.exists():
        text = al_py.read_text(encoding="utf-8")
        if "Credits?s+refresh" not in text and "Credits?\\s+refresh" not in text:
            text = text.replace(
                'r"(?:Resets?(?:\\s+on)?|点数将于|點數將於|刷新时间[:：]|重置时间[:：]|每日)\\s+([^\\n]+?)',
                'r"(?:Resets?(?:\\s+on)?|Credits?\\s+refresh(?:\\s+daily\\s+at)?|点数将于|點數將於|刷新时间[:：]|重置时间[:：]|每日)\\s+([^\\n]+?)'
            )
            al_py.write_text(text, encoding="utf-8")
            print("  [Patch] 已確認保留 Google Flow 每日重置時間正則至 gemini_agentlimb.py")

    # 3. 守護 scripts/setup_skill.py
    sk_py = DSH_PLUGIN_DIR / "scripts" / "setup_skill.py"
    if sk_py.exists():
        text = sk_py.read_text(encoding="utf-8")
        changed = False
        if '"SKILL.zh-CN.md"' not in text:
            text = text.replace('"SKILL.md",', '"SKILL.md", "SKILL.zh-CN.md",')
            changed = True
        if 'home / ".dsh",' not in text:
            text = text.replace('home / ".gemini" / "skills",', 'home / ".gemini" / "skills",\n        home / ".dsh",')
            changed = True
        if 'home / ".dsh" / SKILL_NAME' not in text and 'synced = sync_skill_files(source_root, target_dir)' in text:
            extra_block = '''        synced = sync_skill_files(source_root, target_dir)
        # 同步更新其他已存在的已知全局技能目录（如 ~/.dsh/gemini-web-agent 與 ~/.gemini/config/skills/gemini-web-agent）
        home = Path.home()
        extra_candidates = [
            home / ".dsh" / SKILL_NAME,
            home / ".gemini" / "config" / "skills" / SKILL_NAME,
            home / ".gemini" / "skills" / SKILL_NAME,
            home / ".agents" / "skills" / SKILL_NAME,
        ]
        for extra in extra_candidates:
            if extra.exists() and extra.resolve() != target_dir.resolve() and extra.resolve() != source_root.resolve():
                try:
                    sync_skill_files(source_root, extra)
                    _write_version_meta(extra, source_root)
                except Exception:
                    pass'''
            text = text.replace('        synced = sync_skill_files(source_root, target_dir)', extra_block)
            changed = True
        if changed:
            sk_py.write_text(text, encoding="utf-8")
            print("  [Patch] 已注入 DSH 全局技能目錄安裝與中英文文檔支援至 setup_skill.py")

def main():
    print("=" * 65)
    print("🔄 dsh-gemini-web 增強型上游同步器 (Upstream Sync)")
    print(f"📍 目標上游: {UPSTREAM_REPO}")
    print("=" * 65)

    source_dir = None
    temp_dir = None

    if LOCAL_UPSTREAM_DIR.exists() and (LOCAL_UPSTREAM_DIR / ".git").exists():
        print(f"📦 偵測到本機上游倉庫: {LOCAL_UPSTREAM_DIR}")
        print("  正在從 GitHub 獲取最新 origin/main 分支...")
        code, out, err = run_cmd("git fetch origin main", cwd=LOCAL_UPSTREAM_DIR)
        if code == 0:
            run_cmd("git checkout -B upstream-sync origin/main", cwd=LOCAL_UPSTREAM_DIR)
            source_dir = LOCAL_UPSTREAM_DIR
        else:
            print(f"  ⚠️ 本機目錄 fetch 失敗: {err}")

    try:
        if not source_dir:
            temp_dir = Path(tempfile.mkdtemp(prefix="upstream_gemini_web_agent_"))
            print(f"📥 正在臨時克隆最新上游倉庫 ({temp_dir})...")
            code, out, err = run_cmd(f'git clone --depth 1 {UPSTREAM_REPO} "{temp_dir}"')
            if code != 0:
                print(f"❌ 克隆失敗: {err}")
                sys.exit(1)
            source_dir = temp_dir

        # 1. 比對並同步底層腳本
        print("\n🚀 正在比對並同步底層核心腳本...")
        updated_files = []
        for rel_path in SYNC_SCRIPTS:
            src = source_dir / rel_path
            dst = DSH_PLUGIN_DIR / rel_path
            if not src.exists():
                continue

            src_text = src.read_text(encoding="utf-8")
            dst_text = dst.read_text(encoding="utf-8") if dst.exists() else ""

            if src_text != dst_text:
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(src_text, encoding="utf-8")
                print(f"  📝 已更新: {rel_path}")
                updated_files.append(rel_path)
            else:
                print(f"  ✨ 已是最新: {rel_path}")

        # 2. 智慧增量同步資料夾（如 references、tests 等），絕不刪除 DSH 專屬測試與文件
        print("\n📚 正在增量同步參考文檔與測試套件...")
        for d in SYNC_DIRS:
            src_d = source_dir / d
            dst_d = DSH_PLUGIN_DIR / d
            if not src_d.exists():
                continue
            dst_d.mkdir(parents=True, exist_ok=True)
            synced_count = 0
            for item in src_d.rglob("*"):
                if item.is_file():
                    rel = item.relative_to(src_d)
                    target_file = dst_d / rel
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    # 覆蓋或新增上游檔案，完全不刪除任何既有 DSH 檔案 (如 *.test.ts)
                    shutil.copy2(item, target_file)
                    synced_count += 1
            print(f"  ✅ 已增量同步 {d}/ ({synced_count} 個上游檔案，DSH 專屬檔案完好保留)")

        # 3. 確保 DSH 專屬補丁不被沖掉
        print("\n🛡️ 檢查並修復 DSH 專屬增強補丁...")
        apply_dsh_patches()

        # 4. 編譯外掛產物 (bun build)
        print("\n🔨 建置外掛前端與後端產物 (bun build)...")
        bun_path = shutil.which("bun") or shutil.which("bun", path=str(Path.home() / ".bun" / "bin"))
        if bun_path:
            code, out, err = run_cmd(f'"{bun_path}" build src/index.ts --outfile index.js --target node', cwd=DSH_PLUGIN_DIR)
            if code == 0:
                print("  ✅ 外掛 index.js 已自動編譯完成！")
            else:
                print(f"  ⚠️ bun build 警告: {err}")
        else:
            print("  💡 未偵測到 bun，略過前端產物編譯。")

        print("\n" + "=" * 65)
        if updated_files:
            print(f"🎉 同步完成！共更新了 {len(updated_files)} 個底層核心腳本。")
        else:
            print("🎉 所有底層核心腳本均已是最新狀態，無需變更！")
        print("=" * 65)

    finally:
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
