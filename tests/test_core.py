#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gemini-web-agent 离线回归冒烟测试（纯标准库 unittest，不连接真实浏览器）。"""

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# 允许在未激活 .venv（系统 Python 未安装 playwright）的环境中导入纯逻辑函数
if "playwright" not in sys.modules:
    pw_mod = MagicMock()
    sys.modules["playwright"] = pw_mod
    sys.modules["playwright.sync_api"] = pw_mod.sync_api

import gemini_web as gw  # noqa: E402
import inspect_antigravity as ia  # noqa: E402
import platform_utils as pu  # noqa: E402
import setup_skill as ss  # noqa: E402


class TestGeminiWebCore(unittest.TestCase):
    def test_resolve_ask_entry_defaults_and_auto_chat(self) -> None:
        self.assertEqual(gw._resolve_ask_entry(""), "task")
        self.assertEqual(gw._resolve_ask_entry("", tool="Canvas"), "chat")
        self.assertEqual(gw._resolve_ask_entry("", thinking="高"), "chat")
        self.assertEqual(gw._resolve_ask_entry("chat"), "chat")
        self.assertEqual(gw._resolve_ask_entry("task", tool="Canvas"), "task")

    def test_model_resolution_and_short_name(self) -> None:
        self.assertEqual(gw._resolve_aistudio_model_id("neon"), "gemini-4-neon")
        self.assertEqual(gw._resolve_aistudio_model_id("4n"), "gemini-4-neon")
        self.assertEqual(gw._resolve_aistudio_model_id("hydrogen"), "gemini-4-hydrogen")
        self.assertEqual(gw._resolve_aistudio_model_id("argon"), "gemini-4-argon")
        self.assertEqual(gw._resolve_aistudio_model_id("lyria"), "lyria-3.5")
        self.assertEqual(gw._resolve_aistudio_model_id("tts"), "gemini-3.8-flash-tts")
        self.assertEqual(gw.MODEL_OPTIONS["neon"][0], "bard-mode-option-e6fa609c3fa255c0")
        self.assertEqual(gw.MODEL_OPTIONS["neon"][1], "Neon")
        import inspect
        self.assertEqual(inspect.signature(gw.execute_build).parameters["model"].default, "neon")
        self.assertEqual(
            gw._short_model_name("Gemini 4 Hydrogen gemini-4-hydrogen High speed model for everyday tasks"),
            "gemini-4-hydrogen",
        )
        self.assertTrue(gw._is_media_playground_model("gemini-nano-banana-2.1"))
        self.assertTrue(gw._is_media_playground_model("lyria-3.5"))
        self.assertFalse(gw._is_media_playground_model("gemini-4-hydrogen"))

    def test_cross_platform_devtools_candidates(self) -> None:
        paths = gw._iter_devtools_active_port_files()
        self.assertTrue(len(paths) >= 2)
        self.assertTrue(all(p.name == "DevToolsActivePort" for p in paths))

    def test_write_text_output_and_harvest_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            dl_dir = root / "downloads"
            out_dir = root / "project"
            dl_dir.mkdir()

            # 测试 --out-file 直写文件并清空内存字段以省输出 Token
            txt_target = out_dir / "reply.md"
            res = {"status": "ok", "model": "gemini-4-hydrogen", "text": "hello world"}
            written = gw._write_text_output(res, str(txt_target))
            self.assertEqual(written["text"], "")
            self.assertEqual(written["text_chars"], 11)
            self.assertEqual(txt_target.read_text(encoding="utf-8"), "hello world")

            # 测试 harvest 跳过未完成下载，且解包 JSON 到安全相对路径
            (dl_dir / "pending.crdownload").write_text("partial", encoding="utf-8")
            bundle_path = dl_dir / "bundle-vn.json"
            bundle_path.write_text(
                json.dumps({"index.html": "<h1>OK</h1>", "data/story.json": {"title": "Test"}}),
                encoding="utf-8",
            )
            h_res = gw.execute_harvest(
                pattern="bundle*.json",
                dest=str(out_dir),
                src_dir=str(dl_dir),
                since_min=10,
                unpack_json=True,
                copy_only=False,
            )
            self.assertEqual(h_res["status"], "ok")
            self.assertEqual((out_dir / "index.html").read_text(encoding="utf-8"), "<h1>OK</h1>")
            self.assertIn('"title": "Test"', (out_dir / "data" / "story.json").read_text(encoding="utf-8"))
            self.assertFalse(bundle_path.exists())

            # 路径穿越防护校验
            bad_bundle = dl_dir / "bad.json"
            bad_bundle.write_text(json.dumps({"../../escape.txt": "nope"}), encoding="utf-8")
            with self.assertRaises(ValueError):
                gw.execute_harvest(
                    pattern="bad.json",
                    dest=str(out_dir),
                    src_dir=str(dl_dir),
                    since_min=10,
                    unpack_json=True,
                )

    def test_harvest_time_filter_and_copy(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            dl_dir = root / "downloads"
            out_dir = root / "assets"
            dl_dir.mkdir()
            fresh = dl_dir / "bg.png"
            fresh.write_bytes(b"png")
            old = dl_dir / "old.png"
            old.write_bytes(b"old")
            old_ts = time.time() - 7200
            Path(old).touch()
            import os
            os.utime(old, (old_ts, old_ts))

            h_res = gw.execute_harvest(
                pattern="*.png",
                dest=str(out_dir),
                src_dir=str(dl_dir),
                since_min=5,
                copy_only=True,
            )
            self.assertEqual(h_res["matched_count"], 1)
            self.assertTrue((out_dir / "bg.png").exists())
            self.assertFalse((out_dir / "old.png").exists())
            self.assertTrue(fresh.exists())

    def test_roster_and_playbook_management(self) -> None:
        """验证 .web-team.json 一页一员工花名册增删改查，以及内置 5 套编队卡查阅与 AI 自主新增编队卡。"""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            roster_file = root / ".web-team.json"

            # 1. roster set (新增 + 增量更新) / list / remove / clear
            r1 = gw.execute_roster(
                action="set",
                roster_file=str(roster_file),
                project="SaaS控制台",
                role="director",
                title="项目总监",
                site="aistudio",
                model="gemini-4-neon",
                thinking_level="high",
            )
            self.assertEqual(r1["status"], "ok")
            self.assertEqual(r1["count"], 1)

            # 增量补齐 tab_id 与 url，原字段应保留
            r2 = gw.execute_roster(
                action="set",
                roster_file=str(roster_file),
                role="director",
                tab_id="101",
                url="https://aistudio.google.com/prompts/demo",
                status="running",
            )
            self.assertEqual(r2["roster"]["director"]["model"], "gemini-4-neon")
            self.assertEqual(r2["roster"]["director"]["tab_id"], 101)
            self.assertEqual(r2["roster"]["director"]["status"], "running")

            listed = gw.execute_roster(action="list", roster_file=str(roster_file))
            self.assertEqual(listed["project"], "SaaS控制台")
            self.assertEqual(listed["count"], 1)

            rem = gw.execute_roster(action="remove", roster_file=str(roster_file), role="director")
            self.assertEqual(rem["status"], "ok")
            self.assertEqual(rem["count"], 0)

            gw.execute_roster(action="set", roster_file=str(roster_file), role="qa", site="gemini_task")
            clr = gw.execute_roster(action="clear", roster_file=str(roster_file))
            self.assertEqual(clr["count"], 0)

            # 2. 校验仓库内置 director_prompt.md 与 5 套主流编队卡均就绪且可读
            self.assertTrue((REPO_ROOT / "references" / "director_prompt.md").is_file())
            builtin_list = gw.execute_playbook(action="list")
            builtin_names = {item["name"] for item in builtin_list["playbooks"]}
            for expected in (
                "web_fullstack_app",
                "data_office_automation",
                "content_video_media",
                "academic_deep_research",
                "interactive_game_studio",
            ):
                self.assertIn(expected, builtin_names)
            shown = gw.execute_playbook(action="show", name="web_fullstack_app")
            self.assertIn("frontend_builder", shown["text"])

            # 3. 验证隔离目录中 AI 自主新增编队卡与路径穿越拦截
            tmp_pb_dir = root / "playbooks"
            added = gw.execute_playbook(
                action="add",
                name="legal_contract_review",
                title="法务合同审查编队",
                scenarios="商业合同条款风险审查与比对",
                content="| `reviewer` | 条款审查员 | `aistudio` | `gemini-4-neon` | `high` | 识别风险点 |",
                playbooks_dir=tmp_pb_dir,
            )
            self.assertEqual(added["status"], "ok")
            custom_shown = gw.execute_playbook(action="show", name="legal_contract_review", playbooks_dir=tmp_pb_dir)
            self.assertIn("法务合同审查编队", custom_shown["text"])

            with self.assertRaises(ValueError):
                gw.execute_playbook(action="show", name="../evil", playbooks_dir=tmp_pb_dir)
            with self.assertRaises(ValueError):
                gw.execute_playbook(action="add", name="bad/slug", title="bad", playbooks_dir=tmp_pb_dir)

    def test_roster_tab_conflict_and_delivery_audit(self) -> None:
        """验证 roster set 跨角色共享 tab_id 硬拦截，以及 roster audit 抓出空资产/源码缺图造假并放行真实交付。"""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            proj_dir = root / "game_proj"
            (proj_dir / "js").mkdir(parents=True)
            (proj_dir / "assets").mkdir(parents=True)
            roster_file = proj_dir / ".web-team.json"

            gw.execute_roster(
                action="set",
                roster_file=str(roster_file),
                project="围城测试",
                role="director",
                site="aistudio",
                model="gemini-4-neon",
                tab_id="101",
            )
            # 不同角色绑定相同 tab_id 必须抛出 ROLE_TAB_CONFLICT
            with self.assertRaises(ValueError) as ctx:
                gw.execute_roster(
                    action="set",
                    roster_file=str(roster_file),
                    role="lead_arch",
                    site="aistudio",
                    model="gemini-4-neon",
                    tab_id="101",
                )
            self.assertIn("ROLE_TAB_CONFLICT", str(ctx.exception))

            gw.execute_roster(action="set", roster_file=str(roster_file), role="coder", site="gemini_task", model="neon", tab_id="102")
            gw.execute_roster(action="set", roster_file=str(roster_file), role="artist", site="flow", model="Nano Banana 2.1", tab_id="103")
            gw.execute_roster(action="set", roster_file=str(roster_file), role="audio", site="aistudio", model="lyria-3.5", tab_id="104")

            # 源码引用了 assets/bg.png 与 assets/bgm.mp3，但目录为空 -> 审计必须不通过
            (proj_dir / "js" / "assets.js").write_text(
                "const P = { bg: 'assets/bg.png', bgm: 'assets/bgm.mp3' };\n",
                encoding="utf-8",
            )
            bad_audit = gw.execute_roster(
                action="audit",
                roster_file=str(roster_file),
                project_dir=str(proj_dir),
                min_roles=2,
            )
            self.assertFalse(bad_audit["passed"])
            err_joined = "\n".join(bad_audit["errors"])
            self.assertIn("MISSING_FLOW_IMAGES", err_joined)
            self.assertIn("MISSING_AUDIO_FILES", err_joined)
            self.assertIn("MISSING_REFERENCED_ASSETS", err_joined)

            # 落盘真实体积 > 512B 的图片与音频 -> 审计必须通过
            (proj_dir / "assets" / "bg.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 600)
            (proj_dir / "assets" / "bgm.mp3").write_bytes(b"ID3" + b"1" * 600)
            good_audit = gw.execute_roster(
                action="audit",
                roster_file=str(roster_file),
                project_dir=str(proj_dir),
                min_roles=2,
            )
            self.assertTrue(good_audit["passed"])
            self.assertEqual(good_audit["status"], "ok")
            self.assertEqual(good_audit["errors"], [])
            self.assertEqual(good_audit["real_images"], 1)
            self.assertEqual(good_audit["real_audios"], 1)


class TestSetupAndInspect(unittest.TestCase):
    def test_sync_removes_stale_files_in_subdirs(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "skill-dest"
            stale = target / "scripts" / "slice_sprites.py"
            stale.parent.mkdir(parents=True)
            stale.write_text("# stale", encoding="utf-8")
            synced = ss.sync_skill_files(REPO_ROOT, target)
            self.assertTrue(synced)
            self.assertFalse(stale.exists())
            self.assertTrue((target / "references" / "models.md").is_file())
            self.assertTrue((target / "SKILL.md").is_file())

    def test_version_meta_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            ss._write_version_meta(target, REPO_ROOT, commit="abc1234", last_checked_at="2026-11-18T00:00:00+00:00")
            meta = ss._read_version_meta(target)
            self.assertEqual(meta["installed_commit"], "abc1234")
            self.assertTrue(meta["last_checked_at"].startswith("2026-11-18"))

    def test_inspect_render_brief_and_markdown_safe_on_empty(self) -> None:
        empty_report = {"account": {}, "quota_pools": [], "token_analytics": {"today": {}, "all_time": {}, "recent_sessions": []}}
        brief = ia.render_brief_report(empty_report)
        md = ia.render_markdown_report(empty_report)
        self.assertIn("acct=local", brief)
        self.assertIn("today(", brief)
        self.assertTrue(len(md) > 50)

    def test_wait_gemini_ready_default_timeout_and_detect_chrome(self) -> None:
        import inspect
        sig = inspect.signature(gw.wait_gemini_ready)
        self.assertGreaterEqual(sig.parameters["timeout_ms"].default, 45000)
        cdp = ss.detect_chrome_cdp()
        self.assertIn("cdp_mode", cdp)
        self.assertIn("available_chromium_browsers", cdp)


class TestLinuxDistroAndProcDecoupling(unittest.TestCase):
    def test_chromium_family_linux_xdg_snap_flatpak(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            xdg = home / ".custom_cfg"
            paths = pu.iter_devtools_active_port_files(
                sys_name="Linux",
                home=home,
                env={"XDG_CONFIG_HOME": str(xdg)},
            )
            path_strs = [str(p).replace("\\", "/") for p in paths]
            self.assertTrue(any(p.endswith(".custom_cfg/google-chrome/DevToolsActivePort") for p in path_strs))
            self.assertTrue(any(p.endswith(".custom_cfg/microsoft-edge/DevToolsActivePort") for p in path_strs))
            self.assertTrue(any(p.endswith(".custom_cfg/BraveSoftware/Brave-Browser/DevToolsActivePort") for p in path_strs))
            self.assertTrue(any("snap/chromium/common/chromium/DevToolsActivePort" in p for p in path_strs))
            self.assertTrue(any(".var/app/com.google.Chrome/config/google-chrome/DevToolsActivePort" in p for p in path_strs))

    def test_linux_distro_package_hints(self) -> None:
        self.assertIn("apt install", pu.linux_venv_install_hint('ID=ubuntu\nID_LIKE=debian\n'))
        self.assertIn("dnf install", pu.linux_venv_install_hint('ID=fedora\n'))
        self.assertIn("pacman -S", pu.linux_venv_install_hint('ID=manjaro\nID_LIKE=arch\n'))
        self.assertIn("zypper install", pu.linux_venv_install_hint('ID="opensuse-tumbleweed"\nID_LIKE="opensuse suse"\n'))
        self.assertIn("apk add", pu.linux_venv_install_hint('ID=alpine\n'))

    def test_parse_proc_net_tcp_and_mock_proc_tree(self) -> None:
        tcp_lines = [
            "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
            "   0: 0100007F:9731 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 54321 1 00000000 100 0 0 10 0",
            "   1: 0100007F:0050 00000000:0000 01 00000000:00000000 00:00000000 00000000  1000        0 99999 1 00000000 100 0 0 10 0",
        ]
        mapping = pu.parse_proc_net_tcp_lines(tcp_lines)
        self.assertEqual(mapping.get("54321"), 0x9731)  # 0x9731 == 38705
        self.assertNotIn("99999", mapping)  # 状态 01 (ESTABLISHED) 不计入 LISTEN

        with tempfile.TemporaryDirectory() as td:
            proc_root = Path(td)
            (proc_root / "net").mkdir()
            (proc_root / "net" / "tcp").write_text("\n".join(tcp_lines), encoding="utf-8")
            pdir = proc_root / "4242"
            pdir.mkdir()
            (pdir / "cmdline").write_bytes(b"/opt/agy/language_server\x00--standalone\x00--csrf_token=tok123\x00")
            fd_dir = pdir / "fd"
            fd_dir.mkdir()
            fd_sock = fd_dir / "7"
            fd_sock.write_text("", encoding="utf-8")
            fd_other = fd_dir / "8"
            fd_other.write_text("", encoding="utf-8")

            from unittest.mock import patch

            def _fake_readlink(path_obj):
                p_str = str(path_obj).replace("\\", "/")
                if p_str.endswith("/4242/exe"):
                    return "/opt/agy/language_server"
                if p_str.endswith("/4242/fd/7"):
                    return "socket:[54321]"
                if p_str.endswith("/4242/fd/8"):
                    return "pipe:[11111]"
                raise OSError("not a symlink")

            with patch("platform_utils.os.readlink", side_effect=_fake_readlink):
                cands = pu.find_linux_servers_via_proc(proc_root=proc_root)
            self.assertEqual(len(cands), 1)
            self.assertEqual(cands[0]["pid"], 4242)
            self.assertEqual(cands[0]["exe"], "/opt/agy/language_server")
            self.assertEqual(cands[0]["ports"], [0x9731])
            self.assertEqual(cands[0]["score"], 100)

    def test_inspect_incremental_db_cache_equivalence(self) -> None:
        """验证 inspect_antigravity v2 预聚合缓存与 SQLite 只追加增量解析与全量结果完全一致。"""
        import sqlite3

        def _enc_varint(val: int) -> bytes:
            out = bytearray()
            while True:
                b = val & 0x7F
                val >>= 7
                if val:
                    out.append(b | 0x80)
                else:
                    out.append(b)
                    break
            return bytes(out)

        def _enc_field_varint(fnum: int, val: int) -> bytes:
            return _enc_varint((fnum << 3) | 0) + _enc_varint(val)

        def _enc_field_bytes(fnum: int, payload: bytes) -> bytes:
            return _enc_varint((fnum << 3) | 2) + _enc_varint(len(payload)) + payload

        def _make_gen_blob(inp: int, out_t: int, cached: int, thinking: int, model_name: str) -> bytes:
            usage = (
                _enc_field_varint(2, inp)
                + _enc_field_varint(3, out_t)
                + _enc_field_varint(5, cached)
                + _enc_field_varint(10, thinking)
            )
            sub1 = _enc_field_bytes(4, usage)
            top = _enc_field_bytes(1, sub1)
            telemetry = b"\x00model_enum\x00" + model_name.encode("ascii") + b"\x00"
            return top + telemetry

        def _make_step_meta(ts: int) -> bytes:
            return _enc_field_bytes(1, _enc_field_varint(1, ts))

        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "sess_test.db"
            con = sqlite3.connect(str(db_path))
            con.execute("CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER, step_payload BLOB, metadata BLOB)")
            con.execute("CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)")
            con.execute(
                "INSERT INTO steps VALUES (?, ?, ?, ?)",
                (1, 14, b"<USER_REQUEST>\nHello\n</USER_REQUEST>", _make_step_meta(1763510400)),
            )
            con.execute(
                "INSERT INTO gen_metadata VALUES (?, ?)",
                (1, _make_gen_blob(1000, 200, 500, 50, "gemini-4-neon")),
            )
            con.commit()

            st1 = db_path.stat()
            parsed1, changed1 = ia._parse_single_db(str(db_path), None, st1.st_mtime, st1.st_size)
            self.assertTrue(changed1)
            self.assertIsNotNone(parsed1)
            self.assertEqual(parsed1["sess_turns"], 1)
            self.assertEqual(parsed1["last_routed_model"], "gemini-4-neon")

            cached_entry = {
                "v": ia.DB_CACHE_SCHEMA_VERSION,
                "mtime": st1.st_mtime,
                "size": st1.st_size,
                "data": parsed1,
            }

            # 追加第 2 轮（不同模型），验证增量更新与无缓存全量解析完全一致
            con.execute(
                "INSERT INTO steps VALUES (?, ?, ?, ?)",
                (2, 14, b"next turn", _make_step_meta(1763510460)),
            )
            con.execute(
                "INSERT INTO gen_metadata VALUES (?, ?)",
                (2, _make_gen_blob(2000, 300, 4000, 80, "gemini-4-hydrogen")),
            )
            con.commit()
            con.close()

            st2 = db_path.stat()
            parsed_inc, changed_inc = ia._parse_single_db(str(db_path), cached_entry, st2.st_mtime, st2.st_size)
            parsed_full, _ = ia._parse_single_db(str(db_path), None, st2.st_mtime, st2.st_size)
            self.assertTrue(changed_inc)
            self.assertEqual(parsed_inc, parsed_full)
            self.assertEqual(parsed_inc["sess_turns"], 2)
            self.assertEqual(parsed_inc["sess_total"], (1000 + 500 + 200) + (2000 + 4000 + 300))
            self.assertEqual(parsed_inc["last_routed_model"], "gemini-4-hydrogen")
            self.assertEqual(len(parsed_inc["route_transitions"]), 2)


class TestHighSpeedChannelBAndWave(unittest.TestCase):
    def test_dedicated_ai_chrome_profile_priority_and_shortcut_generation(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            paths = pu.iter_devtools_active_port_files(sys_name="Windows", home=home, env={})
            self.assertGreater(len(paths), 1)
            self.assertTrue(str(paths[0]).replace("\\", "/").endswith(".gemini-web-chrome/DevToolsActivePort"))

            desk = home / "Desk"
            prof = home / "ai-prof"
            # 测试 Linux .desktop 与 macOS .command 生成（纯跨平台文件写入）
            lin = pu.create_ai_chrome_shortcut("/usr/bin/google-chrome", prof, port=9229, desktop_dir=desk, sys_name="Linux")
            self.assertTrue(Path(lin["shortcut_path"]).exists())
            self.assertIn("--remote-debugging-port=9229", Path(lin["shortcut_path"]).read_text(encoding="utf-8"))

            mac = pu.create_ai_chrome_shortcut("/Applications/Google Chrome", prof, port=9229, desktop_dir=desk, sys_name="Darwin")
            self.assertTrue(Path(mac["shortcut_path"]).exists())
            self.assertIn("--user-data-dir=", Path(mac["shortcut_path"]).read_text(encoding="utf-8"))

            # 测试当前系统快捷方式生成（Windows 生成 .lnk 或 .bat）
            cur = pu.create_ai_chrome_shortcut(sys.executable, prof, port=9229, desktop_dir=desk)
            self.assertTrue(cur["created"])
            self.assertTrue(Path(cur["shortcut_path"]).exists())

    def test_drive_id_unpack_json_and_dual_channel_roster_audit(self) -> None:
        self.assertEqual(
            gw._extract_aistudio_drive_id("https://aistudio.google.com/app/prompts/1YGdPFoCQcoCReWe7uxqcwcobHkK-FLTr"),
            "1YGdPFoCQcoCReWe7uxqcwcobHkK-FLTr",
        )
        self.assertEqual(gw._extract_aistudio_drive_id("https://aistudio.google.com/prompts/new_chat"), "")
        self.assertTrue(gw._is_concrete_session_url("https://gemini.google.com/app/42cc12f5dbe57da0"))
        self.assertTrue(gw._is_concrete_session_url("https://flow.google.com/project/3dae7955-82fb-498e-bf35-0ab681529cde"))
        self.assertFalse(gw._is_concrete_session_url("https://gemini.google.com/app"))

        with tempfile.TemporaryDirectory() as td:
            proj = Path(td)
            sample_reply = (
                "以下是源码 JSON：\n```json\n"
                '{"index.html": "<img src=\'assets/hero.png\'>", "js/app.js": "console.log(1);"}\n'
                "```\n完成。"
            )
            written = gw._unpack_json_from_text(sample_reply, proj)
            self.assertEqual(len(written), 2)
            self.assertTrue((proj / "js" / "app.js").is_file())

            # 恶意路径穿越必须拦截
            with self.assertRaises(ValueError):
                gw._unpack_json_from_text('{"../evil.txt": "bad"}', proj)

            # 双通道花名册：通道 B 仅登记唯一会话 URL（无 tab_id）应通过审计，跨角色同 URL 必须拦截
            rf = str(proj / ".web-team.json")
            gw.execute_roster(
                action="set",
                roster_file=rf,
                role="coder",
                site="aistudio",
                model="neon",
                url="https://aistudio.google.com/app/prompts/1AbCdEfGhIjKlMnOpQrStUvWx",
            )
            r_list = gw.execute_roster(action="list", roster_file=rf)
            self.assertEqual(r_list["roster"]["coder"]["drive_file_id"], "1AbCdEfGhIjKlMnOpQrStUvWx")

            with self.assertRaises(ValueError) as ctx:
                gw.execute_roster(
                    action="set",
                    roster_file=rf,
                    role="tester",
                    site="aistudio",
                    model="neon",
                    url="https://aistudio.google.com/app/prompts/1AbCdEfGhIjKlMnOpQrStUvWx",
                )
            self.assertIn("ROLE_URL_CONFLICT", str(ctx.exception))

            gw.execute_roster(
                action="set",
                roster_file=rf,
                role="artist",
                site="flow",
                model="Nano Banana 2.1",
                url="https://flow.google.com/fx/project/proj-abc123",
            )
            (proj / "assets").mkdir(exist_ok=True)
            (proj / "assets" / "hero.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 600)

            audit_ok = gw.execute_roster(action="audit", roster_file=rf, project_dir=str(proj), min_roles=2)
            self.assertTrue(audit_ok["passed"], audit_ok.get("errors"))

    def test_execute_wave_concurrent_mock_pipeline(self) -> None:
        from unittest.mock import patch

        class _FakeLocator:
            def __init__(self, count_val=0, text_val=""):
                self._count = count_val
                self._text = text_val
                self.first = self

            def count(self):
                return self._count

            def inner_text(self):
                return self._text

        class _FakePage:
            def __init__(self, url, turns=1, resp_count=1, eval_res=None):
                self.url = url
                self._turns = turns
                self._resp_count = resp_count
                self._eval_res = eval_res or {}

            def is_closed(self):
                return False

            def locator(self, sel):
                if "ms-chat-turn" in sel:
                    return _FakeLocator(self._turns)
                if "cdk-live-announcer" in sel:
                    return _FakeLocator(1, "Response ready.")
                if "model-response" in sel:
                    return _FakeLocator(self._resp_count)
                return _FakeLocator(0)

            def evaluate(self, _js):
                return self._eval_res

        with tempfile.TemporaryDirectory() as td:
            proj = Path(td)
            pg_page = _FakePage("https://aistudio.google.com/app/prompts/1WaveDriveFileId12345", turns=2)
            task_page = _FakePage(
                "https://gemini.google.com/app/task999",
                resp_count=1,
                eval_res={"running": False, "text": "QA Passed 100%", "url": "https://gemini.google.com/app/task999"},
            )
            flow_page = _FakePage("https://flow.google.com/fx/project/flow777")

            def _fake_pg(browser, **kwargs):
                return {
                    "status": "dispatched",
                    "entry": "aistudio-playground",
                    "model": "gemini-4-neon",
                    "url": pg_page.url,
                    "drive_file_id": "1WaveDriveFileId12345",
                    "_page": pg_page,
                    "_before_turns": 0,
                }

            def _fake_ask(browser, **kwargs):
                return {
                    "status": "dispatched",
                    "entry": "task",
                    "model": "4 Hydrogen",
                    "url": task_page.url,
                    "_page": task_page,
                    "_before_count": 0,
                }

            def _fake_flow(browser, **kwargs):
                return {
                    "status": "dispatched",
                    "entry": "flow",
                    "media": "image",
                    "project_url": flow_page.url,
                    "url": flow_page.url,
                    "_page": flow_page,
                    "_before_urls": set(),
                }

            def _fake_flow_dl(page, urls, download_dir="", resolution="", media="image"):
                p = Path(download_dir)
                p.mkdir(parents=True, exist_ok=True)
                img = p / "raw_flow_1.png"
                img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"1" * 600)
                return [str(img)]

            tasks = [
                {
                    "role": "coder",
                    "site": "aistudio",
                    "model": "neon",
                    "title": "[Demo] coder",
                    "prompt": "build index",
                    "unpack_json_dir": ".",
                },
                {
                    "role": "artist",
                    "site": "flow",
                    "prompt": "draw hero",
                    "download_dir": "assets/images",
                    "save_as": "hero.png",
                },
                {
                    "role": "qa_worker",
                    "site": "gemini_task",
                    "model": "hydrogen",
                    "prompt": "run qa",
                    "out_file": "docs/qa.md",
                },
            ]

            with (
                patch.object(gw, "execute_playground", side_effect=_fake_pg),
                patch.object(gw, "execute_ask", side_effect=_fake_ask),
                patch.object(gw, "execute_flow", side_effect=_fake_flow),
                patch.object(gw, "_aistudio_playground_is_running", return_value=False),
                patch.object(gw, "_aistudio_extract_turn_error", return_value=""),
                patch.object(gw, "_aistudio_has_final_output", return_value=True),
                patch.object(gw, "_aistudio_output_signature", return_value=(120, 0)),
                patch.object(
                    gw,
                    "_aistudio_extract_playground_result",
                    return_value={"text": '```json\n{"index.html": "<img src=\'assets/images/hero.png\'>"}\n```', "saved_files": []},
                ),
                patch.object(gw, "_aistudio_set_prompt_title", return_value="[Demo] coder"),
                patch.object(gw, "_flow_collect_media_urls", return_value=["https://cdn.example/hero.png"]),
                patch.object(gw, "_flow_download_latest", side_effect=_fake_flow_dl),
            ):
                wave_res = gw.execute_wave(
                    browser=object(),
                    tasks=tasks,
                    roster_file=".web-team.json",
                    project="Demo",
                    project_dir=str(proj),
                    timeout_sec=30,
                    poll_interval_sec=0.05,
                    stagger_sec=0.0,
                )

            self.assertEqual(wave_res["status"], "ok")
            self.assertEqual(wave_res["succeeded"], 3)
            self.assertTrue((proj / "index.html").is_file())
            self.assertTrue((proj / "assets" / "images" / "hero.png").is_file())
            self.assertEqual((proj / "docs" / "qa.md").read_text(encoding="utf-8"), "QA Passed 100%")

            # 验证 wave 自动登记的 .web-team.json 直接通过交付审计门禁！
            audit_res = gw.execute_roster(
                action="audit",
                roster_file=str(proj / ".web-team.json"),
                project_dir=str(proj),
                min_roles=3,
            )
            self.assertTrue(audit_res["passed"], audit_res.get("errors"))

            # 验证 AI Studio 返回错误时 wave 立即快败，不空等超时
            with (
                patch.object(gw, "execute_playground", side_effect=_fake_pg),
                patch.object(gw, "_aistudio_playground_is_running", return_value=False),
                patch.object(gw, "_aistudio_extract_turn_error", return_value="权限遭拒"),
            ):
                fail_res = gw.execute_wave(
                    browser=object(),
                    tasks=[{"role": "coder2", "site": "aistudio", "model": "neon", "prompt": "hi"}],
                    roster_file=str(proj / ".web-team2.json"),
                    project_dir=str(proj),
                    timeout_sec=10,
                    poll_interval_sec=0.05,
                    stagger_sec=0.0,
                )
            self.assertEqual(fail_res["status"], "failed")
            self.assertIn("权限遭拒", fail_res["results"][0]["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
