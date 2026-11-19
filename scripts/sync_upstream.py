#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_upstream.py - 一鍵同步原作者上游倉庫 (582835293/gemini-web-agent)

用途：
  當原作者修復了 Google 站點 DOM 選擇器、新增支援模型或更新底層自動化邏輯時，
  只需在 dsh-gemini-web 目錄下執行：
      python scripts/sync_upstream.py
  即可自動拉取上游最新改動，智慧同步底層核心腳本，保留 DSH 增強特性，並自動編譯外掛。
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

UPSTREAM_REPO = "https://github.com/582835293/gemini-web-agent.git"
LOCAL_UPSTREAM_DIR = Path.home() / ".dsh" / "gemini-web-agent"
DSH_PLUGIN_DIR = Path(__file__).resolve().parent.parent

# 需要從原作者倉庫同步的底層檔案與資料夾
SYNC_SCRIPTS = [
    "scripts/gemini_web.py",
    "scripts/gemini_agentlimb.py",
    "scripts/agentlimb_client.py",
    "scripts/platform_utils.py",
    "scripts/setup_skill.py",
]
SYNC_DIRS = [
    "references",
    "tests",
]

def run_cmd(cmd, cwd=None):
    res = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    return res.returncode, res.stdout.strip(), res.stderr.strip()

def apply_dsh_patches():
    """確保 DSH 專屬補丁保留（如 Flow 每日點數刷新正則、安全鎖定等）"""
    gw_py = DSH_PLUGIN_DIR / "scripts" / "gemini_web.py"
    if gw_py.exists():
        text = gw_py.read_text(encoding="utf-8")
        if r"Credits?\s+refresh" not in text:
            # 確保 Flow 每日重置正則支援
            text = text.replace(
                'r"(?:重置时间[:：]\\s*|Resets?\\s+)([^\n]+?)(?=\\s+(?:升级|person|Upgrade|退出|Sign\\s*out|frame_spark|可见水印|隐私权|Privacy)|$)"',
                'r"(?:Resets?(?:\\s+on)?|Credits?\\s+refresh(?:\\s+daily\\s+at)?|点数将于|點數將於|刷新时间[:：]|重置时间[:：]|每日)\\s+([^\\n]+?)(?=\\s*(?:刷新|重置|升级|升級|person|Upgrade|Manage|退出|Sign\\s*out|frame_spark|可见水印|隐私权|Privacy)|$)"'
            )
            gw_py.write_text(text, encoding="utf-8")
            print("  [Patch] 已注入 Google Flow 每日重置時間正則支援至 gemini_web.py")

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

def main():
    print("=" * 65)
    print("🔄 dsh-gemini-web 上游同步器 (Upstream Sync)")
    print(f"📍 目標上游: {UPSTREAM_REPO}")
    print("=" * 65)

    source_dir = None
    if LOCAL_UPSTREAM_DIR.exists() and (LOCAL_UPSTREAM_DIR / ".git").exists():
        print(f"📦 偵測到本機上游倉庫: {LOCAL_UPSTREAM_DIR}")
        print("  正在從 GitHub 獲取最新 origin/main 分支...")
        code, out, err = run_cmd("git fetch origin main", cwd=LOCAL_UPSTREAM_DIR)
        if code == 0:
            # 嘗試 fast-forward 或 checkout 最新 upstream
            run_cmd("git checkout -B upstream-sync origin/main", cwd=LOCAL_UPSTREAM_DIR)
            source_dir = LOCAL_UPSTREAM_DIR
        else:
            print(f"  ⚠️ 本機目錄 fetch 失敗: {err}")

    if not source_dir:
        temp_dir = Path("/tmp/upstream_gemini_web_agent")
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        print("📥 正在臨時克隆最新上游倉庫...")
        code, out, err = run_cmd(f"git clone --depth 1 {UPSTREAM_REPO} {temp_dir}")
        if code != 0:
            print(f"❌ 克隆失敗: {err}")
            sys.exit(1)
        source_dir = temp_dir

    # 1. 比對並同步底層腳本
    print("\n🚀 正在比對並同步底層腳本...")
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

    # 2. 同步資料夾（如 references、tests 等）
    for d in SYNC_DIRS:
        src_d = source_dir / d
        dst_d = DSH_PLUGIN_DIR / d
        if src_d.exists():
            if dst_d.exists():
                shutil.rmtree(dst_d)
            shutil.copytree(src_d, dst_d)
            print(f"  📚 已同步資料夾: {d}/")

    # 3. 確保 DSH 專屬補丁不被沖掉
    print("\n🛡️ 檢查並修復 DSH 專屬增強補丁...")
    apply_dsh_patches()

    # 4. 編譯外掛產物 (bun build)
    print("\n🔨 建置外掛前端與後端產物 (bun build)...")
    bun_path = shutil.which("bun")
    if bun_path:
        code, out, err = run_cmd("bun build src/index.ts --outfile index.js --target node", cwd=DSH_PLUGIN_DIR)
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

if __name__ == "__main__":
    main()
