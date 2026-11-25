// src/index.ts
import path5 from "node:path";

// src/transport/router.ts
import { spawn as spawn4, execFile as execFile3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";

// src/bridge/detector.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
function getAiChromeProfileDir() {
  const customDir = (process.env.GEMINI_WEB_CHROME_DIR || "").trim();
  if (customDir) {
    return path.resolve(customDir.startsWith("~") ? path.join(getEffectiveHome(), customDir.slice(1)) : customDir);
  }
  return path.join(getEffectiveHome(), ".gemini-web-chrome");
}
function isDedicatedAiChromeConfigured() {
  try {
    return fs.existsSync(path.join(getAiChromeProfileDir(), "Default"));
  } catch {
    return false;
  }
}
function getEffectiveHome() {
  try {
    const userInfo = os.userInfo?.();
    if (userInfo?.homedir && fs.existsSync(userInfo.homedir)) {
      return userInfo.homedir;
    }
  } catch {}
  const rawHome = os.homedir();
  if (rawHome.includes(".dsh/agy-accounts") || rawHome.includes(".dsh/profiles")) {
    const match = rawHome.match(/^(\/home\/[^/]+)/);
    if (match && fs.existsSync(match[1])) {
      return match[1];
    }
  }
  return rawHome;
}
function getPluginDir() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(currentFile);
    for (let i = 0;i < 4; i++) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch {}
  return path.resolve(process.cwd());
}
function findPythonVenv() {
  const pluginDir = getPluginDir();
  const home = getEffectiveHome();
  const isWin = process.platform === "win32";
  const binName = isWin ? "Scripts/python.exe" : "bin/python";
  const venvPaths = [
    path.join(pluginDir, ".venv", binName),
    path.join(home, ".dsh", "gemini-web-agent", ".venv", binName),
    path.join(home, ".dsh", "skills", "gemini-web-agent", ".venv", binName),
    path.join(home, ".gemini", "config", "skills", "gemini-web-agent", ".venv", binName)
  ];
  for (const p of venvPaths) {
    if (fs.existsSync(p))
      return p;
  }
  return null;
}
function findCliScript() {
  const pluginDir = getPluginDir();
  const home = getEffectiveHome();
  const scriptPaths = [
    path.join(pluginDir, "scripts", "gemini_web.py"),
    path.join(home, ".dsh", "gemini-web-agent", "scripts", "gemini_web.py"),
    path.join(home, ".dsh", "skills", "gemini-web-agent", "scripts", "gemini_web.py"),
    path.join(home, ".gemini", "config", "skills", "gemini-web-agent", "scripts", "gemini_web.py")
  ];
  for (const p of scriptPaths) {
    if (fs.existsSync(p))
      return p;
  }
  return null;
}
function findAgentLimbScript() {
  const pluginDir = getPluginDir();
  const home = getEffectiveHome();
  const scriptPaths = [
    path.join(pluginDir, "scripts", "gemini_agentlimb.py"),
    path.join(home, ".dsh", "gemini-web-agent", "scripts", "gemini_agentlimb.py"),
    path.join(home, ".dsh", "skills", "gemini-web-agent", "scripts", "gemini_agentlimb.py"),
    path.join(home, ".gemini", "config", "skills", "gemini-web-agent", "scripts", "gemini_agentlimb.py")
  ];
  for (const p of scriptPaths) {
    if (fs.existsSync(p))
      return p;
  }
  return null;
}
function scanChromiumCdpInstances() {
  const home = getEffectiveHome();
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const candidates = [];
  const ignorePatterns = [/antigravity/i, /cursor/i, /code/i, /deepseek/i, /electron/i, /dsh/i];
  const isBrowserPath = (filePath) => {
    return !ignorePatterns.some((pattern) => pattern.test(filePath));
  };
  const prettyName = (dirPath) => {
    const norm = dirPath.replace(/\\/g, "/");
    if (/brave/i.test(norm))
      return "Brave Browser";
    if (/google[/-]chrome|chrome/i.test(norm))
      return "Google Chrome";
    if (/edge/i.test(norm))
      return "Microsoft Edge";
    if (/vivaldi/i.test(norm))
      return "Vivaldi";
    if (/opera/i.test(norm))
      return "Opera";
    if (/chromium/i.test(norm))
      return "Chromium";
    if (/360/i.test(norm))
      return "360 Browser";
    if (/qq/i.test(norm))
      return "QQ Browser";
    const parts = dirPath.split(path.sep).filter(Boolean);
    return parts[parts.length - 1] || "Chromium Browser";
  };
  if (isWin) {
    try {
      if (fs.existsSync(localAppData)) {
        const topDirs = fs.readdirSync(localAppData, { withFileTypes: true });
        for (const dirent of topDirs) {
          if (dirent.isDirectory()) {
            const p1 = path.join(localAppData, dirent.name, "User Data", "DevToolsActivePort");
            if (fs.existsSync(p1) && isBrowserPath(p1)) {
              candidates.push({ name: prettyName(dirent.name), file: p1 });
            }
            try {
              const subDir = path.join(localAppData, dirent.name);
              for (const sub of fs.readdirSync(subDir, { withFileTypes: true })) {
                if (sub.isDirectory()) {
                  const p2 = path.join(subDir, sub.name, "User Data", "DevToolsActivePort");
                  if (fs.existsSync(p2) && isBrowserPath(p2)) {
                    candidates.push({ name: prettyName(path.join(dirent.name, sub.name)), file: p2 });
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  } else if (isMac) {
    const appSupport = path.join(home, "Library", "Application Support");
    try {
      if (fs.existsSync(appSupport)) {
        for (const dirent of fs.readdirSync(appSupport, { withFileTypes: true })) {
          if (dirent.isDirectory()) {
            const dirPath = path.join(appSupport, dirent.name);
            for (const sub of [
              path.join(dirPath, "DevToolsActivePort"),
              path.join(dirPath, "User Data", "DevToolsActivePort")
            ]) {
              if (fs.existsSync(sub) && isBrowserPath(sub)) {
                candidates.push({ name: prettyName(dirent.name), file: sub });
              }
            }
          }
        }
      }
    } catch {}
  } else {
    const configDir = path.join(home, ".config");
    try {
      if (fs.existsSync(configDir)) {
        for (const dirent of fs.readdirSync(configDir, { withFileTypes: true })) {
          if (dirent.isDirectory()) {
            const dirPath = path.join(configDir, dirent.name);
            const p1 = path.join(dirPath, "DevToolsActivePort");
            if (fs.existsSync(p1) && isBrowserPath(p1)) {
              candidates.push({ name: prettyName(dirPath), file: p1 });
            }
            try {
              for (const sub of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (sub.isDirectory()) {
                  const p2 = path.join(dirPath, sub.name, "DevToolsActivePort");
                  if (fs.existsSync(p2) && isBrowserPath(p2)) {
                    candidates.push({ name: prettyName(path.join(dirPath, sub.name)), file: p2 });
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  }
  const detected = [];
  for (const item of candidates) {
    try {
      const raw = fs.readFileSync(item.file, "utf8");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const port = parseInt(lines[0], 10);
        const guid = lines[1];
        const wsUrl = `ws://127.0.0.1:${port}${guid}`;
        if (!detected.some((d) => d.port === port)) {
          detected.push({
            name: item.name,
            port,
            wsUrl,
            activePortFile: item.file
          });
        }
      }
    } catch {}
  }
  return detected;
}
async function verifyCdpPort(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(600)
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function detectBrowserCdpAsync(portOverride) {
  const venv = findPythonVenv();
  const cli = findCliScript();
  const instances = scanChromiumCdpInstances();
  const liveInstances = [];
  for (const inst of instances) {
    if (await verifyCdpPort(inst.port)) {
      liveInstances.push(inst);
    }
  }
  if (liveInstances.length > 1) {
    const selected = portOverride ? liveInstances.find((i) => i.port === portOverride) || liveInstances[0] : liveInstances[0];
    return {
      connected: true,
      browserType: selected.name,
      port: selected.port,
      wsUrl: selected.wsUrl,
      activePortFile: selected.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: true,
      instances: liveInstances,
      error: `偵測到 ${liveInstances.length} 個開啟遠端偵錯的瀏覽器實例（${liveInstances.map((i) => `${i.name}:${i.port}`).join("、")}）。建議關閉多餘實例以避免衝突，或在下方指定埠號。`
    };
  }
  if (liveInstances.length === 1) {
    const item = liveInstances[0];
    return {
      connected: true,
      browserType: item.name,
      port: portOverride || item.port,
      wsUrl: item.wsUrl,
      activePortFile: item.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: false,
      instances: liveInstances
    };
  }
  if (portOverride) {
    if (await verifyCdpPort(portOverride)) {
      return {
        connected: true,
        browserType: `CDP 指定端口 (${portOverride})`,
        port: portOverride,
        wsUrl: `http://127.0.0.1:${portOverride}`,
        activePortFile: null,
        pythonVenv: venv,
        cliScript: cli,
        multipleInstances: false,
        instances: []
      };
    }
  }
  const aiConfigured = isDedicatedAiChromeConfigured();
  return {
    connected: false,
    browserType: aiConfigured ? "Gemini AI Chrome (Auto-Start)" : "None",
    port: aiConfigured ? 9229 : null,
    wsUrl: null,
    activePortFile: null,
    pythonVenv: venv,
    cliScript: cli,
    autoStartAvailable: aiConfigured,
    multipleInstances: false,
    instances: [],
    error: aiConfigured ? "已配置独立 AI Chrome (~/.gemini-web-chrome)，触发通道 B 或 Wave 时将自动唤醒端口 9229" : instances.length > 0 ? "检测到历史浏览器调试文件，但端口未响应 (浏览器可能已退出或关闭)" : "未偵測到開啟遠端偵錯的 Chromium 瀏覽器"
  };
}
function trySpawnAgentLimbBridge() {
  try {
    const home = getEffectiveHome();
    const nodeCandidates = [
      process.execPath,
      path.join(home, ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "node", "bin", "node"),
      "/usr/bin/node"
    ];
    let nodeBin = "";
    for (const n of nodeCandidates) {
      if (fs.existsSync(n)) {
        nodeBin = n;
        break;
      }
    }
    const scriptCandidates = [
      path.join(home, ".agentlimb", "bin", "agentlimb.mjs"),
      path.join(home, "Downloads", "agentlimb-chrome", "bin", "agentlimb.mjs")
    ];
    let cliScript = "";
    for (const s of scriptCandidates) {
      if (fs.existsSync(s)) {
        cliScript = s;
        break;
      }
    }
    if (nodeBin && cliScript) {
      const child = spawn(nodeBin, [cliScript, "bridge"], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    }
  } catch {}
  return false;
}
async function detectAgentLimb(ports = [8765, 8766, 8767, 8768, 8769, 8770], autoSpawn = true, baseUrlOverride) {
  const probe = async () => {
    let fallbackStatus = null;
    const targets = baseUrlOverride ? [{ port: Number(new URL(baseUrlOverride).port || 8765), url: `${baseUrlOverride.replace(/\/+$/, "")}/health` }] : ports.map((port) => ({ port, url: `http://127.0.0.1:${port}/health` }));
    for (const target of targets) {
      const port = target.port;
      try {
        const res = await fetch(target.url, {
          signal: AbortSignal.timeout(600)
        });
        if (!res.ok)
          continue;
        const data = await res.json();
        if (!data.ok)
          continue;
        const browserList = Array.isArray(data.browserList) ? data.browserList : [];
        const hasBrowser = Boolean(data.activeBrowser || typeof data.browsers === "number" && data.browsers > 0 || browserList.length > 0);
        const isDenied = Boolean(data.denied) || data.authorized === false;
        const hasAuthorizedBrowser = Boolean(data.activeBrowser || browserList.some((b) => b && b.authorized !== false && b.active !== false));
        const profile = browserList?.[0]?.label || browserList?.[0]?.id || "Profile";
        if (!hasBrowser) {
          if (!fallbackStatus) {
            fallbackStatus = {
              ready: false,
              port,
              version: data.version || "0.8.2",
              browsers: 0,
              activeProfile: profile,
              paired: Boolean(data.paired),
              stage: data.stage || "waiting-browser",
              error: "AgentLimb 服务在线，但未检测到浏览器连接 (请打开 Chrome / Edge / Brave 浏览器并加载扩展)"
            };
          }
          continue;
        }
        if (isDenied && !hasAuthorizedBrowser) {
          fallbackStatus = {
            ready: false,
            port,
            version: data.version || "0.8.2",
            browsers: data.browsers || browserList.length || 1,
            activeProfile: profile,
            paired: Boolean(data.paired),
            stage: data.stage || "awaiting_authorization",
            error: `AgentLimb 連線尚未授權或已被撤銷 (${String(data.denied || data.stage || "unauthorized")})`
          };
          continue;
        }
        return {
          ready: true,
          port,
          version: data.version || "0.8.2",
          browsers: data.browsers || 1,
          activeProfile: profile,
          paired: Boolean(data.paired),
          stage: data.stage || "ready"
        };
      } catch {}
    }
    return fallbackStatus;
  };
  let status = await probe();
  if (status)
    return status;
  if (autoSpawn) {
    if (trySpawnAgentLimbBridge()) {
      await new Promise((r) => setTimeout(r, 600));
      status = await probe();
      if (status)
        return status;
    }
  }
  return {
    ready: false,
    port: 8765,
    error: "AgentLimb 本地 Bridge 未在線或擴充功能未連線"
  };
}
async function detectDualChannel(cfgMode, cfgPort) {
  const mode = cfgMode || "auto";
  const venv = findPythonVenv();
  const cli = findCliScript();
  const aiChromeConfigured = isDedicatedAiChromeConfigured();
  if (mode === "cdp") {
    const cdp = await detectBrowserCdpAsync(cfgPort);
    return {
      activeChannel: cdp.connected ? "cdp" : "none",
      mode: "cdp",
      agentlimb: { ready: false, port: 8765, error: "使用者手動選擇僅走 CDP 模式" },
      cdp,
      pythonVenv: venv,
      cliScript: cli,
      aiChromeConfigured
    };
  }
  const agentlimb = await detectAgentLimb();
  if (agentlimb.ready) {
    return {
      activeChannel: "agentlimb",
      mode,
      agentlimb,
      cdp: {
        connected: false,
        browserType: "None",
        port: null,
        wsUrl: null,
        activePortFile: null,
        pythonVenv: venv,
        cliScript: cli,
        autoStartAvailable: aiChromeConfigured,
        error: "AgentLimb 已連線，CDP 備用通道完全休眠 (零彈窗保護)"
      },
      pythonVenv: venv,
      cliScript: cli,
      aiChromeConfigured
    };
  }
  if (mode === "auto") {
    const cdp = await detectBrowserCdpAsync(cfgPort);
    return {
      activeChannel: cdp.connected ? "cdp" : "none",
      mode: "auto",
      agentlimb,
      cdp,
      pythonVenv: venv,
      cliScript: cli,
      aiChromeConfigured
    };
  }
  return {
    activeChannel: "none",
    mode: "agentlimb",
    agentlimb,
    cdp: {
      connected: false,
      browserType: "None",
      port: null,
      wsUrl: null,
      activePortFile: null,
      pythonVenv: venv,
      cliScript: cli,
      autoStartAvailable: aiChromeConfigured,
      error: "強制 AgentLimb 模式，不啟用 CDP 備用通道"
    },
    pythonVenv: venv,
    cliScript: cli,
    aiChromeConfigured
  };
}

// src/bridge/runner.ts
import { spawn as spawn2, execFile } from "node:child_process";
import { promisify } from "node:util";

// src/config.ts
import fs2 from "node:fs";
import path2 from "node:path";
import os2 from "node:os";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var DEFAULT_CONFIG = {
  connectionMode: "auto",
  defaultModel: "gemini-4-hydrogen",
  autoFallback: true,
  fallbackMode: "ladder",
  fallbackLadder: [
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini.google.com"
  ],
  thinkingPolicy: "adaptive",
  thinkingLevel: "high",
  timeoutSec: 180,
  port: 9222,
  preferredBrowser: "auto",
  flowCount: 1,
  dispatchMode: "ask_first",
  directorMode: "local",
  directorModel: "gemini-4-hydrogen",
  enableChatSlots: true
};
function getConfigPath() {
  try {
    const dshDir = path2.join(os2.homedir(), ".dsh");
    if (!fs2.existsSync(dshDir))
      fs2.mkdirSync(dshDir, { recursive: true });
    return path2.join(dshDir, "gemini-web-config.json");
  } catch {}
  const __dirname2 = path2.dirname(fileURLToPath2(import.meta.url));
  return path2.resolve(__dirname2, "config.json");
}
function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs2.existsSync(p)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs2.readFileSync(p, "utf-8")) };
    }
    const legacyPath = path2.resolve(os2.homedir(), "Documents/deepseek-harness/default-workspace/config.json");
    if (fs2.existsSync(legacyPath)) {
      const data = JSON.parse(fs2.readFileSync(legacyPath, "utf-8"));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}
function saveConfig(cfg) {
  const merged = { ...loadConfig(), ...cfg };
  try {
    const p = getConfigPath();
    fs2.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save config:", err);
  }
  return merged;
}

// src/bridge/runner.ts
var execFileAsync = promisify(execFile);
async function fetchUsage() {
  const cfg = loadConfig();
  const status = await detectDualChannel(cfg.connectionMode, cfg.port);
  const venv = findPythonVenv();
  if (!venv) {
    return {
      ok: false,
      error: "未找到 Python 虛擬環境 (.venv)"
    };
  }
  if (status.activeChannel === "none") {
    const detail = status.agentlimb?.error || status.cdp?.error || "雙通道皆未連線";
    return {
      ok: false,
      error: `瀏覽器未開啟或通訊中斷：${detail}`
    };
  }
  if (status.activeChannel === "agentlimb") {
    const alScript = findAgentLimbScript();
    if (!alScript) {
      return { ok: false, error: "未找到 AgentLimb 腳本" };
    }
    try {
      const { stdout } = await execFileAsync(venv, [alScript, "usage", "--include-flow"], {
        timeout: 15000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      const parsed = JSON.parse(stdout.trim());
      if (parsed.status === "error") {
        return {
          ok: false,
          error: parsed.error || "AgentLimb 用量探測失敗",
          raw: parsed
        };
      }
      return {
        ok: true,
        geminiPlan: parsed.plan || "FREE",
        geminiUsedPct: parsed.used_pct ?? 0,
        geminiResetTime: parsed.reset_time || "",
        geminiWeeklyPct: parsed.used_pct ?? 0,
        flowCredits: parsed.flow_credits ?? 50,
        flowResetTime: parsed.flow_reset_time || "",
        flowResetPeriod: parsed.flow_reset_period || "",
        raw: parsed
      };
    } catch (err) {
      return {
        ok: false,
        error: `AgentLimb 探測失敗 (瀏覽器未響應或已關閉): ${err.message || String(err)}`
      };
    }
  }
  if (status.activeChannel === "cdp") {
    const cdpScript = findCliScript();
    if (!cdpScript) {
      return { ok: false, error: "未找到 gemini_web.py 腳本" };
    }
    try {
      const args = [cdpScript, "usage", "--include-flow"];
      if (status.cdp.port)
        args.push("--port", String(status.cdp.port));
      const { stdout } = await execFileAsync(venv, args, {
        timeout: 18000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      const parsed = JSON.parse(stdout.trim());
      if (parsed.status === "error") {
        return {
          ok: false,
          error: parsed.error || "CDP 用量探測失敗",
          raw: parsed
        };
      }
      return {
        ok: true,
        geminiPlan: parsed.plan || "FREE",
        geminiUsedPct: parsed.current_usage?.used_pct ?? 0,
        geminiResetTime: parsed.current_usage?.reset_time || "",
        geminiWeeklyPct: parsed.weekly_usage?.used_pct ?? 0,
        flowCredits: parsed.flow?.credits ?? 50,
        flowResetTime: parsed.flow?.reset_time || "",
        flowResetPeriod: parsed.flow?.reset_period || "",
        raw: parsed
      };
    } catch (err) {
      return {
        ok: false,
        error: `CDP 探測失敗 (瀏覽器未響應或已關閉): ${err.message || String(err)}`
      };
    }
  }
  return {
    ok: false,
    error: "雙通道皆未連線，無法讀取用量"
  };
}

// src/bridge/agent-executor.ts
import { execFile as execFile2, spawn as spawn3 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import path4 from "node:path";
import fs4 from "node:fs";
import os3 from "node:os";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/proposal.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var PLAYBOOKS = {
  web_fullstack_app: {
    slug: "web_fullstack_app",
    title: "全栈 Web / SaaS 应用研发编队",
    roles: ["director", "frontend_builder", "backend_coder", "ui_artist", "qa_tester"],
    stages: "Wave 0 (架构定界) -> Wave 1 (并行生产) -> Wave 2 (集成解包) -> Wave 3 (沙盒自测)"
  },
  interactive_game_studio: {
    slug: "interactive_game_studio",
    title: "互动游戏与创意原型工作室",
    roles: ["director", "game_designer", "core_coder", "ui_artist", "audio_engineer", "qa_tester"],
    stages: "Wave 0 (玩法原型) -> Wave 1 (逻辑与美术并行) -> Wave 2 (音效切图) -> Wave 3 (冒烟试玩)"
  },
  data_office_automation: {
    slug: "data_office_automation",
    title: "数据工程、报表与办公自动化工坊",
    roles: ["director", "data_engineer", "chart_formatter", "doc_auditor"],
    stages: "Wave 0 (数据契约) -> Wave 1 (清洗与作图) -> Wave 2 (文档汇总)"
  },
  content_video_media: {
    slug: "content_video_media",
    title: "视觉创意、音视频与自媒体工坊",
    roles: ["director", "script_writer", "visual_artist", "voice_actor", "post_editor"],
    stages: "Wave 0 (剧本策划) -> Wave 1 (生图与配音) -> Wave 2 (视频合成与包装)"
  },
  academic_deep_research: {
    slug: "academic_deep_research",
    title: "学术研报、文献综述与深度调研编队",
    roles: ["director", "deep_researcher", "fact_checker", "paper_writer"],
    stages: "Wave 0 (提纲界定) -> Wave 1 (多源调研) -> Wave 2 (交叉核对) -> Wave 3 (综述成文)"
  }
};
function resolvePlaybooksDir() {
  try {
    const here = path3.dirname(fileURLToPath3(import.meta.url));
    const candidates = [
      path3.resolve(here, "references", "playbooks"),
      path3.resolve(here, "..", "references", "playbooks")
    ];
    for (const dir of candidates) {
      if (fs3.existsSync(dir))
        return dir;
    }
  } catch {}
  return null;
}
function parseCustomPlaybookFile(dir, file) {
  const slug = file.slice(0, -3);
  const content = fs3.readFileSync(path3.join(dir, file), "utf-8");
  const titleLine = content.split(`
`).find((l) => l.trim().startsWith("# "));
  const rawTitle = titleLine ? titleLine.trim().slice(2).trim() : slug;
  const cleanTitle = rawTitle.replace(/\s*\(`[^`]+`\)\s*$/, "").trim();
  const roles = [];
  for (const line of content.split(`
`)) {
    const m = line.match(/^\|\s*`([a-zA-Z0-9_-]+)`\s*\|/);
    if (m && m[1] !== "role")
      roles.push(m[1]);
  }
  return {
    slug,
    title: cleanTitle || slug,
    roles: roles.length > 0 ? roles : ["director", "coder"],
    stages: `自定义编队契约 (references/playbooks/${file})`
  };
}
function findCustomPlaybook(query) {
  const dir = resolvePlaybooksDir();
  if (!dir)
    return;
  try {
    const lower = query.toLowerCase();
    const files = fs3.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const slug = file.slice(0, -3);
      if (PLAYBOOKS[slug])
        continue;
      const parsed = parseCustomPlaybookFile(dir, file);
      if (lower.includes(slug.toLowerCase()) || parsed.title && lower.includes(parsed.title.toLowerCase())) {
        return parsed;
      }
    }
  } catch {}
  return;
}
function extractFilesFromTask(task, explicitFiles) {
  const files = Array.isArray(explicitFiles) ? explicitFiles.map((f) => String(f).trim()).filter(Boolean) : [];
  const pushUnique = (f) => {
    if (f && !files.includes(f))
      files.push(f);
  };
  const atRegex = /@([a-zA-Z0-9_\-\.\/]+)/g;
  let match;
  while ((match = atRegex.exec(task)) !== null) {
    pushUnique(match[1].trim());
  }
  const fileRegex = /\b(?:(?:\.?\.?\/)?[a-zA-Z0-9_\-]+\/)*[a-zA-Z0-9_\-]+\.(?:ts|tsx|js|jsx|py|json|md|txt|pdf|png|jpg|jpeg|gif|webp|csv|log|yaml|yml|rs|go|cpp|c|h|java|html|css|sh)\b/gi;
  while ((match = fileRegex.exec(task)) !== null) {
    const f = match[0].trim();
    if (!f.includes("google.com"))
      pushUnique(f);
  }
  return files;
}
function resolveModelToken(raw) {
  const lower = raw.trim().toLowerCase();
  if (/lyria[- ]?3\.5|lyria[- ]?3[- ]?pro|lyria/i.test(lower)) {
    const id = /pro/i.test(lower) ? "lyria-3-pro-preview" : "lyria-3.5";
    return { model: id, key: id };
  }
  if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite/i.test(lower)) {
    return { model: "gemini-3.5-flash-lite", key: "gemini-3.5-flash-lite" };
  }
  if (/3\.8[- ]?flash|\bflash\b/i.test(lower) && !/flash[- ]?lite/i.test(lower)) {
    return { model: "gemini-3.8-flash", key: "gemini-3.8-flash" };
  }
  if (/neon/i.test(lower)) {
    return { model: "gemini-4-neon", key: "gemini-4-neon" };
  }
  if (/argon/i.test(lower)) {
    return {
      model: "gemini-4-hydrogen",
      key: "gemini-4-hydrogen",
      note: "（注：Google 已将旧 Argon 槽位升级合并至 Hydrogen 深度推理，已自动为您映射）"
    };
  }
  if (/hydrogen|gemini-4/i.test(lower)) {
    return { model: "gemini-4-hydrogen", key: "gemini-4-hydrogen" };
  }
  if (/nano\s*banana/i.test(lower)) {
    return { model: "Nano Banana 2.1", key: "nano-banana" };
  }
  if (/veo|omni/i.test(lower)) {
    return { model: "Omni 1.2 / Veo", key: "omni" };
  }
  return { model: raw.trim(), key: raw.trim() };
}
function matchHeuristicPlaybook(task) {
  if (/(?:全栈|web\s*应用|saas|web_fullstack|全栈编队|看板|web\s*工具)/i.test(task)) {
    return PLAYBOOKS.web_fullstack_app;
  }
  if (/(?:游戏|game|phaser|canvas游戏|interactive_game|游戏编队)/i.test(task)) {
    return PLAYBOOKS.interactive_game_studio;
  }
  if (/(?:数据工程|办公自动化|excel|报表|清洗|data_office|数据编队)/i.test(task)) {
    return PLAYBOOKS.data_office_automation;
  }
  if (/(?:视频|自媒体|音频|配乐|剪辑|content_video|视频编队)/i.test(task)) {
    return PLAYBOOKS.content_video_media;
  }
  if (/(?:学术|文献|综述|深度调研|研报|academic_deep|调研编队)/i.test(task)) {
    return PLAYBOOKS.academic_deep_research;
  }
  return findCustomPlaybook(task) || PLAYBOOKS.web_fullstack_app;
}
function formatAuthorizedConfigBrief(cfg) {
  const ladder = cfg.fallbackLadder?.length ? cfg.fallbackLadder.join(" -> ") : cfg.defaultModel || "gemini-4-hydrogen";
  const fallbackMode = cfg.thinkingPolicy === "strict" || cfg.fallbackMode === "strict" || cfg.autoFallback === false ? `strict (锁定单模型: ${cfg.defaultModel || "gemini-4-hydrogen"})` : `${cfg.thinkingPolicy || "adaptive"} (授权阶梯: ${ladder})`;
  return [
    "【GUI 用户授权配置快照 (~/.dsh/gemini-web-config.json)】",
    `- 连接通道: ${cfg.connectionMode || "auto"} (首选 AgentLimb 免弹窗 -> CDP 备援)`,
    `- 策略与模型阶梯: ${fallbackMode}`,
    `- 默认思考等级: ${cfg.thinkingLevel || "high"} · 超时上限: ${cfg.timeoutSec || 180}s`,
    `- 总监模式: ${cfg.directorMode === "external" ? `external (${cfg.directorModel || "gemini-4-hydrogen"})` : "local (本地宿主 AI 统筹)"}`,
    "- 安全护栏 (代码层强制): 严禁绕过 Paid 过滤、gemini-spark 任务自动剔除密钥文件、Wave 产出隔离至 .gemini-teams/[sessionId]/"
  ].join(`
`);
}
function buildWaveProposal(task, cfg, extractedFiles, overrides) {
  const explicitPb = overrides?.playbook ? PLAYBOOKS[overrides.playbook] || findCustomPlaybook(overrides.playbook) : undefined;
  const pb = explicitPb || matchHeuristicPlaybook(task);
  const customTasks = Array.isArray(overrides?.waveTasks) && overrides.waveTasks.length > 0 ? overrides.waveTasks : undefined;
  const channel = "Wave 多 Tab 并发波次引擎 (Chrome Multi-Tab Cluster)";
  const actionDesc = customTasks ? `启动自定义多角色 Wave 编队 (${customTasks.length} 个子任务)` : `启动虚拟工作室「${pb.title}」并发协作`;
  const rolesList = customTasks ? customTasks.map((t) => t.role || "worker") : pb.roles;
  const directorMode = cfg.directorMode === "external" ? `外包给外部 AI Studio (${cfg.directorModel || "gemini-4-hydrogen"})` : "本地模型掌舵 (推荐 · 保持全局上下文)";
  const thinkingConfig = "各 Tab 错峰 3.5s 派发 · 后台静默轮询 · 自动解包写入会话隔离区";
  const filesLine = extractedFiles.length > 0 ? `- \uD83D\uDCC1 挂载文件：[${extractedFiles.join(", ")}]` : "";
  const matrixLines = customTasks ? customTasks.map((t) => `  - \`${t.role}\` ➔ \`${t.site || "aistudio"}\` (${t.model || cfg.defaultModel || "gemini-4-hydrogen"})`) : [
    "  - \uD83D\uDCD0 架构定界：Google AI Studio (Gemini 4 Hydrogen / Neon 深度长文本)",
    "  - \uD83D\uDEE0️ 研发与自测：Gemini 官网代码沙盒 (云端容器运行测试，无需本地装环境)",
    "  - \uD83C\uDFA8 视觉素材：Google Flow (Nano Banana 2.1 享受 0 扣点特权)"
  ];
  const cardLines = [
    "### \uD83C\uDF10 Gemini Web Agent",
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    "",
    `- \uD83C\uDFAF 执行渠道：${channel}`,
    `- \uD83D\uDCCB 启用编队：${pb.title} (${pb.slug})`,
    `- \uD83E\uDDED 总监模式：${directorMode}`,
    `- \uD83D\uDC65 协同角色：[${rolesList.join(", ")}]`
  ];
  if (filesLine)
    cardLines.push(filesLine);
  cardLines.push("- \uD83D\uDEAA 入口模式：wave (多 Tab 并发外包)", "- \uD83E\uDDE0 协同矩阵：多 Tab 专属工种", ...matrixLines, `- \uD83C\uDF0A 规划波次：${pb.stages}`, `- ⚙️ 推演配置：${thinkingConfig}`, "- \uD83D\uDD04 话题隔离：会话级独立花名册与交付沙盒 (.gemini-teams/[sessionId]/)", "- \uD83D\uDD10 安全提醒：若在 gemini-spark 开启云端联网，请勿向 Task 传入 API Key 或敏感凭据", "", "\uD83D\uDC49 请确认是否启动 Wave 并发外包执行？", "- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化错峰派发多 Tab 并行执行", "- 回复 「花名册」：查阅当前会话团队各角色绑定的标签页状态", "- 回复 「取消」：中止并发外包，改由本地单模型作答");
  return {
    site: "wave",
    entry: "wave",
    channel,
    actionDesc,
    modelLabel: "（多 Tab 角色矩阵）",
    modelTarget: "架构定界 (AI Studio Hydrogen / Neon) + 研发沙盒 (Gemini 官网云端运行) + 视觉资产 (Flow 零点数特权)",
    model: "wave",
    thinkingConfig,
    files: extractedFiles,
    card: cardLines.join(`
`),
    question: "\uD83D\uDC49 请确认是否启动 Wave 并发外包执行？",
    options: [
      "(Recommended) 确认启动 Wave 并发外包",
      "查看该编队花名册契约",
      "取消调度（本地作答）"
    ],
    playbook: pb
  };
}
function parseTaskToProposal(task, config, overrides) {
  const cfg = config || loadConfig();
  const extractedFiles = extractFilesFromTask(task, overrides?.files);
  const hasExplicitNonWaveSite = Boolean(overrides?.site && overrides.site !== "wave");
  const explicitWave = Boolean(overrides?.site === "wave" || overrides?.entry === "wave" || overrides?.playbook || overrides?.waveTasks && overrides.waveTasks.length > 0);
  const heuristicWave = !hasExplicitNonWaveSite && /(?:\bwave\b|并发波次|波次引擎|波次任务|多\s*tab\s*并发|并发外包|虚拟工作室|团队花名册|花名册|\broster\b|\bplaybook\b|工作编队|研发编队|全栈编队|游戏编队|数据编队|视频编队|调研编队|编队|外包团队|全栈开发|任务看板|看板\s*web|web\s*工具)/i.test(task);
  if (explicitWave || heuristicWave) {
    return buildWaveProposal(task, cfg, extractedFiles, overrides);
  }
  let site = "aistudio";
  if (overrides?.site && overrides.site !== "wave") {
    site = overrides.site;
  } else {
    const isAiStudio = /(?:google\s*ai\s*studio|ai\s*studio|aistudio)/i.test(task);
    const isLyria = /(?:\blyria\b|lyria[- ]?3)/i.test(task);
    const isFlow = /(?:google\s*flow|flow\.google\.com|\bflow\b|nano\s*banana|veo|omni\s*1\.2|生图|画一张|生成图片|生成图|做视频|生成视频)/i.test(task);
    const isGeminiWeb = /(?:gemini(?:\.google\.com)?\s*官网|gemini\s*web|gemini\s*网页|task\s*模式|task模式)/i.test(task) || !isAiStudio && /联网调研/i.test(task);
    if (isLyria)
      site = "lyria";
    else if (isAiStudio)
      site = "aistudio";
    else if (isFlow)
      site = "flow";
    else if (isGeminiWeb)
      site = "gemini";
  }
  let entry = "chat";
  if (overrides?.entry && overrides.entry !== "wave") {
    entry = overrides.entry;
  } else if (site === "flow") {
    entry = "canvas";
  } else if (site === "lyria") {
    entry = "music";
  } else if (site === "gemini") {
    entry = /(?:task\s*模式|task模式|联网调研|\btask\b)/i.test(task) ? "task" : "chat";
  }
  const channelMap = {
    aistudio: "Google AI Studio（可选择：Google AI Studio / Gemini Web）",
    gemini: "gemini.google.com（可选择：Google AI Studio / Gemini Web）",
    flow: "Google Flow (flow.google.com)",
    lyria: "Google AI Studio Lyria 音乐台 (aistudio.google.com/new_music)"
  };
  const channel = channelMap[site];
  let actionDesc = "实现任务";
  if (extractedFiles.length > 0)
    actionDesc = "分析本地文件";
  else if (site === "flow")
    actionDesc = "实现多媒体生成";
  else if (site === "lyria")
    actionDesc = "生成 AI 音乐音频";
  else if (site === "gemini" && entry === "task")
    actionDesc = "进行联网调研与深度探索";
  else if (site === "aistudio" && /联网调研/i.test(task))
    actionDesc = "进行联网调研与深度探索";
  let specified;
  if (overrides?.model) {
    specified = resolveModelToken(overrides.model);
  } else if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite|3\.8[- ]?flash|\bflash\b|neon|argon|hydrogen|gemini-4|nano\s*banana|veo|omni|lyria/i.test(task)) {
    specified = resolveModelToken(task);
  }
  let modelLabel = "";
  let modelTarget = "";
  let finalModel = undefined;
  const modelNote = specified?.note || "";
  if (site === "flow") {
    if (specified?.key === "omni") {
      modelLabel = "Omni 1.2 / Veo (视频生成)";
      modelTarget = "Omni 1.2 / Veo";
      finalModel = "omni";
    } else {
      modelLabel = "Nano Banana 2.1 (2K 高清生图)";
      modelTarget = "Nano Banana 2.1";
      finalModel = "nano-banana";
    }
  } else if (site === "lyria") {
    modelLabel = "（音乐生成）";
    modelTarget = specified?.model || "lyria-3-pro-preview";
    finalModel = modelTarget;
  } else if (site === "gemini") {
    modelLabel = "Auto (Gemini 官网原生模型)";
    modelTarget = "Google 官方原生模型";
  } else if (specified) {
    modelLabel = "（用户指定）";
    modelTarget = specified.model;
    finalModel = specified.key;
  } else if (cfg.thinkingPolicy === "strict") {
    modelLabel = "（严格模式）";
    modelTarget = cfg.defaultModel || "gemini-4-hydrogen";
    finalModel = cfg.defaultModel;
  } else {
    modelLabel = "（智能/降级模式）";
    const ladder = cfg.fallbackLadder?.length ? cfg.fallbackLadder : [cfg.defaultModel || "gemini-4-hydrogen"];
    modelTarget = ladder.join(" -> ");
  }
  let thinkingConfig = "";
  if (site === "gemini") {
    thinkingConfig = entry === "task" ? "联网搜索增强 (Task 联网模式)" : "官网标准对话模式";
  } else if (site === "flow") {
    thinkingConfig = "生成数量设为 x1，分辨率设为 2K";
  } else if (site === "lyria") {
    thinkingConfig = "生成音乐并自动保存 .mp3 至本地工作区";
  } else {
    const level = overrides?.thinkingLevel || cfg.thinkingLevel || "high";
    thinkingConfig = /联网调研/i.test(task) ? `Thinking 设为 ${level} (联网搜索增强)` : `Thinking 设为 ${level}`;
  }
  const cardLines = [
    "### \uD83C\uDF10 Gemini Web Agent",
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    "",
    `- \uD83C\uDFAF 执行渠道：${channel}`
  ];
  if (extractedFiles.length > 0) {
    cardLines.push(`- \uD83D\uDCC1 挂载文件：[${extractedFiles.join(", ")}]`);
  }
  cardLines.push(`- \uD83D\uDEAA 入口模式：${entry}`, `- \uD83E\uDDE0 执行模型：${modelLabel}`, `  - ${modelTarget}${modelNote ? ` ${modelNote}` : ""}`, `- ⚙️ 推演配置：${thinkingConfig}`, "- \uD83D\uDD04 话题隔离：new_chat: true（预设开启全新独立对话）", ...site === "gemini" && entry === "task" ? ["- \uD83D\uDD10 安全提醒：若已开启 gemini-spark 云端联网，严禁向 Task 传入 API Key 或敏感凭据"] : [], "", "\uD83D\uDC49 请确认是否发包执行？", "- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行", "- 回复 调整参数（如「改用 Flash Lite」、「改用 Hydrogen」等）：按您的要求调整后直接发包", "- 回复 「取消」：中止外部调度，改由本地作答");
  return {
    site,
    entry,
    channel,
    actionDesc,
    modelLabel,
    modelTarget,
    model: finalModel,
    thinkingConfig,
    files: extractedFiles,
    card: cardLines.join(`
`),
    question: "\uD83D\uDC49 请确认是否发包执行？",
    options: [
      "(Recommended) 确认发包执行",
      "调整参数",
      "取消调度（本地作答）"
    ]
  };
}

// src/bridge/agent-executor.ts
var execFileAsync2 = promisify2(execFile2);
function getWorkspaceDownloadDir() {
  try {
    const wsFile = path4.join(os3.homedir(), ".dsh", "storages", "workspace.json");
    if (fs4.existsSync(wsFile)) {
      const data = JSON.parse(fs4.readFileSync(wsFile, "utf-8"));
      const defId = data?.global?.defaultWorkspaceId;
      const wsPath = data?.tables?.workspaces?.[defId]?.path;
      if (wsPath && fs4.existsSync(wsPath)) {
        return path4.join(wsPath, "downloads");
      }
    }
  } catch {}
  return path4.join(process.cwd(), "downloads");
}
function getWorkspaceRoot() {
  return path4.dirname(getWorkspaceDownloadDir());
}
function sanitizeSessionId(sessionId) {
  const cleaned = (sessionId || "default").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return cleaned || "default";
}
function getSessionTeamDir(sessionId) {
  return path4.join(getWorkspaceRoot(), ".gemini-teams", sanitizeSessionId(sessionId));
}
function getSessionRosterFile(sessionId) {
  return path4.join(getSessionTeamDir(sessionId), "roster.json");
}
function getOrCreateSessionWaveDir(sessionId, resume = false) {
  const teamDir = getSessionTeamDir(sessionId);
  fs4.mkdirSync(teamDir, { recursive: true });
  if (resume) {
    try {
      const existing = fs4.readdirSync(teamDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("wave_")).map((d) => d.name).sort().reverse();
      if (existing.length > 0) {
        return path4.join(teamDir, existing[0]);
      }
    } catch {}
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const waveDir = path4.join(teamDir, `wave_${stamp}`);
  fs4.mkdirSync(waveDir, { recursive: true });
  return waveDir;
}
function isSensitiveSecretFile(filePath) {
  const base = path4.basename(filePath).toLowerCase();
  if (base === ".env" || base.startsWith(".env."))
    return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base))
    return true;
  if (/^(id_rsa|id_ed25519|id_ecdsa|\.netrc|\.npmrc|\.pypirc)/.test(base))
    return true;
  if (/(credential|secret|private[_-]?key|service[_-]?account).*\.json$/i.test(base))
    return true;
  return false;
}
function openLocalDirectory(dirPath) {
  const resolved = path4.resolve(dirPath);
  try {
    fs4.mkdirSync(resolved, { recursive: true });
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    if (process.platform === "linux") {
      delete cleanEnv.LD_LIBRARY_PATH;
      delete cleanEnv.LD_PRELOAD;
      delete cleanEnv.QT_PLUGIN_PATH;
      delete cleanEnv.QML2_IMPORT_PATH;
      delete cleanEnv.GIO_LAUNCHED_DESKTOP_FILE;
      const child = spawn3("xdg-open", [resolved], { detached: true, stdio: "ignore", env: cleanEnv });
      child.on("error", () => {});
      child.unref();
    } else if (process.platform === "darwin") {
      const child = spawn3("open", [resolved], { detached: true, stdio: "ignore", env: cleanEnv });
      child.on("error", () => {});
      child.unref();
    } else {
      const child = spawn3("explorer.exe", [resolved], { detached: true, stdio: "ignore", env: cleanEnv });
      child.on("error", () => {});
      child.unref();
    }
    return { ok: true, path: resolved };
  } catch (err) {
    return { ok: false, path: resolved, error: err?.message || String(err) };
  }
}
function listSessionDeliveries(sessionId) {
  const sid = sanitizeSessionId(sessionId);
  const teamDir = getSessionTeamDir(sid);
  const rosterFile = getSessionRosterFile(sid);
  const waves = [];
  if (!fs4.existsSync(teamDir)) {
    return { ok: true, sessionId: sid, teamDir, rosterFile, waves };
  }
  const walkFiles = (root, dir, acc) => {
    for (const ent of fs4.readdirSync(dir, { withFileTypes: true })) {
      const full = path4.join(dir, ent.name);
      if (ent.isDirectory()) {
        walkFiles(root, full, acc);
      } else if (ent.isFile() && ent.name !== "roster.json" && ent.name !== ".web-team.json") {
        try {
          const st = fs4.statSync(full);
          acc.push({ relPath: path4.relative(root, full), absPath: full, size: st.size });
        } catch {}
      }
    }
  };
  try {
    const waveDirs = fs4.readdirSync(teamDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("wave_")).map((d) => d.name).sort().reverse();
    for (const w of waveDirs) {
      const wPath = path4.join(teamDir, w);
      const files = [];
      walkFiles(wPath, wPath, files);
      waves.push({ name: w, path: wPath, files });
    }
  } catch {}
  return { ok: true, sessionId: sid, teamDir, rosterFile, waves };
}
function mergeSessionDeliveries(sessionId, waveName) {
  const list = listSessionDeliveries(sessionId);
  const targetRoot = getWorkspaceRoot();
  const wave = waveName ? list.waves.find((w) => w.name === waveName && !waveName.includes("..") && !waveName.includes("/") && !waveName.includes("\\")) : list.waves[0];
  if (!wave) {
    return { ok: false, mergedFiles: [], targetRoot, error: "未找到可合并的 Wave 交付目录" };
  }
  const mergedFiles = [];
  for (const f of wave.files) {
    const dest = path4.resolve(targetRoot, f.relPath);
    if (!dest.startsWith(path4.resolve(targetRoot) + path4.sep)) {
      continue;
    }
    fs4.mkdirSync(path4.dirname(dest), { recursive: true });
    fs4.copyFileSync(f.absPath, dest);
    mergedFiles.push(dest);
  }
  return { ok: true, mergedFiles, targetRoot, sourceDir: wave.path };
}
function sanitizeWaveSpec(waveSpec, cfg) {
  const defaultThinking = cfg.thinkingLevel || "high";
  const tasks = Array.isArray(waveSpec?.tasks) ? waveSpec.tasks : Array.isArray(waveSpec) ? waveSpec : [];
  const sanitizedTasks = tasks.map((t) => {
    const taskCopy = { ...t };
    const siteLower = String(taskCopy.site || "aistudio").toLowerCase();
    const isRemoteShared = siteLower.includes("gemini") || siteLower === "task";
    if (Array.isArray(taskCopy.files) && isRemoteShared) {
      taskCopy.files = taskCopy.files.filter((f) => !isSensitiveSecretFile(String(f)));
    }
    if (!taskCopy.thinking_level && (siteLower === "aistudio" || !taskCopy.site)) {
      taskCopy.thinking_level = defaultThinking;
    }
    return taskCopy;
  });
  return Array.isArray(waveSpec) ? { project: "dsh-wave", tasks: sanitizedTasks } : { ...waveSpec, tasks: sanitizedTasks };
}
var lastSessionId = null;
async function executeAgentTask(options) {
  const cfg = loadConfig();
  const status = await detectDualChannel(cfg.connectionMode, cfg.port);
  const canAutoStartB = Boolean(status.aiChromeConfigured && cfg.connectionMode !== "agentlimb");
  if (status.activeChannel === "none" && !canAutoStartB) {
    return {
      ok: false,
      channel: "none",
      error: "雙通道皆未连接：请确认浏览器已打開並啟用 AgentLimb 扩展功能，或已開啟 CDP 偵錯模式。"
    };
  }
  const venv = status.pythonVenv;
  if (!venv || !fs4.existsSync(venv)) {
    return {
      ok: false,
      channel: status.activeChannel,
      error: "未找到 Python 虛擬環境 (.venv)，請先执行一鍵初始化"
    };
  }
  const agentlimbScript = findAgentLimbScript();
  const cdpScript = findCliScript();
  const thinkingPolicy = options.thinkingPolicy || cfg.thinkingPolicy || (cfg.fallbackMode === "strict" ? "strict" : "adaptive");
  const isStrict = thinkingPolicy === "strict" || cfg.fallbackMode === "strict" || cfg.autoFallback === false || options.noFallback;
  const targetModel = options.model || cfg.defaultModel || "gemini-4-hydrogen";
  let targetSite = options.site || "aistudio";
  if (targetModel === "gemini.google.com" || targetModel === "gemini") {
    targetSite = "gemini";
  }
  if (targetSite === "wave" || options.entry === "wave" || Array.isArray(options.waveTasks) && options.waveTasks.length > 0) {
    let waveSpec = null;
    if (Array.isArray(options.waveTasks) && options.waveTasks.length > 0) {
      waveSpec = {
        project: options.waveProject || "dsh-wave",
        tasks: options.waveTasks
      };
    } else {
      try {
        const trimmed = options.task.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) {
          waveSpec = JSON.parse(trimmed);
        }
      } catch {}
    }
    if (!waveSpec) {
      const proposal = parseTaskToProposal(options.task, cfg);
      const pbSlug = proposal.playbook?.slug || "web_fullstack_app";
      const roles = proposal.playbook?.roles || ["director", "coder"];
      const leadRole = roles[0] || "director";
      const workerRole = roles[1] || "coder";
      const isMedia = pbSlug === "content_video_media";
      const tasks = [
        {
          role: leadRole,
          site: "aistudio",
          model: "gemini-4-hydrogen",
          thinking_level: cfg.thinkingLevel || "high",
          out_file: "plan.md",
          prompt: `你是「${proposal.playbook?.title || pbSlug}」的架构总监 (${leadRole})。请针对以下需求输出简洁明确的模块设计与文件清单（Markdown）：

${options.task}`
        },
        {
          role: workerRole,
          site: isMedia ? "flow" : "aistudio",
          model: isMedia ? "Nano Banana 2.1" : "gemini-3.8-flash",
          ...isMedia ? { prompt: options.task } : {
            unpack_json_dir: ".",
            out_file: "deliverable_raw.txt",
            prompt: `你是「${proposal.playbook?.title || pbSlug}」的核心执行员 (${workerRole})。请直接针对以下需求产出可运行的交付物，并严格只输出一个 JSON 对象，键为相对文件名（如 "README.md", "app.py" 或 "index.html"），值为完整文件内容字符串：

${options.task}`
          }
        }
      ];
      waveSpec = { project: pbSlug, tasks };
    }
    if (waveSpec) {
      waveSpec = sanitizeWaveSpec(waveSpec, cfg);
      const waveDir = getOrCreateSessionWaveDir(options.sessionId, Boolean(options.resume));
      const rosterFile = getSessionRosterFile(options.sessionId);
      const res = await executeWave(waveSpec, {
        projectDir: waveDir,
        rosterFile,
        timeoutSec: options.timeoutSec || 360,
        port: status.cdp.connected ? status.cdp.port || undefined : undefined,
        resume: Boolean(options.resume)
      });
      if (!res.ok) {
        return { ok: false, channel: res.channel || "none", site: "wave", error: res.error, waveDir, rosterFile };
      }
      const deliveredFiles = [];
      const resultsArr = Array.isArray(res.data?.results) ? res.data.results : [];
      for (const r of resultsArr) {
        if (r?.saved_text_file && fs4.existsSync(r.saved_text_file))
          deliveredFiles.push(r.saved_text_file);
        if (Array.isArray(r?.unpacked_files)) {
          for (const uf of r.unpacked_files) {
            if (typeof uf === "string" && fs4.existsSync(uf))
              deliveredFiles.push(uf);
          }
        }
        if (Array.isArray(r?.saved_files)) {
          for (const sf of r.saved_files) {
            if (typeof sf === "string" && fs4.existsSync(sf))
              deliveredFiles.push(sf);
          }
        }
        if (Array.isArray(r?.downloaded_files)) {
          for (const df of r.downloaded_files) {
            if (typeof df === "string" && fs4.existsSync(df))
              deliveredFiles.push(df);
          }
        }
      }
      return {
        ok: true,
        channel: res.channel || (res.data?.channel === "agentlimb" ? "agentlimb" : "cdp"),
        site: "wave",
        model: "wave-engine",
        files: Array.from(new Set(deliveredFiles)),
        waveDir,
        rosterFile,
        output: typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2)
      };
    }
  }
  let baseTimeout = options.timeoutSec || cfg.timeoutSec || 180;
  const isHeavyTask = options.task.length > 150 || /(?:c\+\+|cpp|rust|紅黑樹|red-black|算法|演算法|架構|從零|完整實作|生產級|完整代碼|重構)/i.test(options.task);
  if (thinkingPolicy === "adaptive" && isHeavyTask) {
    baseTimeout = Math.max(baseTimeout, 300);
  }
  const timeoutSec = baseTimeout;
  let isNewChat = false;
  if (options.newChat !== undefined) {
    isNewChat = options.newChat;
  } else if (options.sessionId && lastSessionId && options.sessionId !== lastSessionId) {
    isNewChat = true;
  }
  if (options.sessionId) {
    lastSessionId = options.sessionId;
  }
  const downloadDir = options.downloadDir || getWorkspaceDownloadDir();
  try {
    if (!fs4.existsSync(downloadDir)) {
      fs4.mkdirSync(downloadDir, { recursive: true });
    }
  } catch {}
  const cleanAndResolvePath = (raw) => {
    if (!raw || typeof raw !== "string")
      return null;
    let f = raw.trim().replace(/^['"‘“@]|['"’”]$/g, "").trim();
    if (f.startsWith("file://")) {
      try {
        f = fileURLToPath4(f);
      } catch {
        f = f.replace(/^file:\/\//, "");
      }
    }
    if (f.startsWith("~")) {
      f = path4.join(os3.homedir(), f.slice(1));
    }
    const candidates = [
      path4.isAbsolute(f) ? f : null,
      path4.resolve(process.cwd(), f),
      path4.resolve(path4.dirname(downloadDir), f)
    ].filter(Boolean);
    for (const c of candidates) {
      try {
        if (fs4.existsSync(c) && fs4.statSync(c).isFile()) {
          return c;
        }
      } catch {}
    }
    return null;
  };
  const resolvedFiles = [];
  if (options.files && Array.isArray(options.files)) {
    for (const f of options.files) {
      const resolved = cleanAndResolvePath(f);
      if (resolved && !resolvedFiles.includes(resolved)) {
        resolvedFiles.push(resolved);
      } else {
        console.warn(`[dsh-gemini-web] Upload file does not exist, skipped: ${f}`);
      }
    }
  }
  if (resolvedFiles.length === 0 && options.task) {
    const fileMatches = options.task.match(/(?:file:\/\/[^\s"'`\(\)\[\]]+|@?[\w\-./\\]+\.[a-zA-Z0-9]{1,8})/g);
    if (fileMatches) {
      for (const m of fileMatches) {
        const resolved = cleanAndResolvePath(m);
        if (resolved && !resolvedFiles.includes(resolved)) {
          resolvedFiles.push(resolved);
          console.log(`[dsh-gemini-web] Auto-detected local file from prompt: ${resolved}`);
        }
      }
    }
  }
  const skippedSecrets = [];
  const isRemoteSharedHost = targetSite === "gemini" && options.entry === "task" || targetSite === "wave";
  const safeFiles = isRemoteSharedHost ? resolvedFiles.filter((f) => {
    if (isSensitiveSecretFile(f)) {
      skippedSecrets.push(path4.basename(f));
      return false;
    }
    return true;
  }) : resolvedFiles;
  if (skippedSecrets.length > 0) {
    console.warn(`[dsh-gemini-web] Security guardrail skipped sensitive file(s) for remote Task: ${skippedSecrets.join(", ")}`);
  }
  if (status.activeChannel === "agentlimb" && agentlimbScript && fs4.existsSync(agentlimbScript)) {
    try {
      const args = [
        agentlimbScript,
        "task",
        options.task,
        "--model",
        targetModel,
        "--site",
        targetSite,
        "--timeout",
        String(timeoutSec),
        "--thinking-policy",
        thinkingPolicy,
        "--download-dir",
        downloadDir
      ];
      if (options.thinkingTimeout) {
        args.push("--thinking-timeout", String(options.thinkingTimeout));
      }
      let safeThinking = options.thinkingLevel || cfg.thinkingLevel || "high";
      if (safeThinking === "xhigh" || safeThinking === "max") {
        safeThinking = "extra_high";
      }
      args.push("--thinking-level", safeThinking);
      if (isNewChat)
        args.push("--new-chat");
      if (options.entry)
        args.push("--entry", options.entry);
      if (safeFiles.length > 0) {
        for (const f of safeFiles) {
          args.push("--file", f);
        }
      }
      if (isStrict) {
        args.push("--no-fallback");
      } else {
        const isMediaModel = /(?:image|nano|tts|lyria|omni|veo)/i.test(targetModel);
        const ladder = options.fallbackLadder || (isMediaModel ? undefined : cfg.fallbackLadder);
        if (Array.isArray(ladder) && ladder.length > 0) {
          args.push("--fallback-ladder", ladder.join(","));
        }
      }
      const nodeExecTimeout = (timeoutSec + 30) * 1000;
      const { stdout } = await execFileAsync2(venv, args, {
        timeout: nodeExecTimeout,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      const lines = stdout.trim().split(`
`);
      const jsonStart = lines.findIndex((l) => l.trim().startsWith("{"));
      if (jsonStart >= 0) {
        const parsed = JSON.parse(lines.slice(jsonStart).join(`
`));
        return {
          ok: parsed.ok,
          channel: "agentlimb",
          site: parsed.site || targetSite,
          model: parsed.model || targetModel,
          initialModel: parsed.initial_model || targetModel,
          output: parsed.output || "",
          files: parsed.files || [],
          fellBack: parsed.fell_back,
          fallbackChain: parsed.fallback_chain || [],
          fallbackHistory: parsed.fallback_history || "",
          error: parsed.error,
          elapsedSec: parsed.elapsed_sec
        };
      }
      return { ok: true, channel: "agentlimb", model: targetModel, output: stdout.trim() };
    } catch (err) {
      const canUseCdp = Boolean(status.cdp.connected || status.aiChromeConfigured);
      if (cfg.connectionMode !== "auto" || !canUseCdp) {
        const detail = err?.stderr ? String(err.stderr).trim().split(`
`).slice(-3).join(" | ") : "";
        return {
          ok: false,
          channel: "agentlimb",
          error: detail ? `${err.message || String(err)} (${detail})` : err.message || String(err)
        };
      }
    }
  }
  if (cdpScript && fs4.existsSync(cdpScript)) {
    try {
      let args = [];
      if (targetSite === "gemini") {
        args = [
          cdpScript,
          "ask",
          "--entry",
          options.entry === "task" ? "task" : "chat",
          "--prompt",
          options.task,
          "--raw"
        ];
        if (isNewChat)
          args.push("--new-tab");
      } else if (targetSite === "flow") {
        const flowMedia = targetModel.includes("omni") || targetModel.includes("veo") ? "video" : "image";
        args = [
          cdpScript,
          "flow",
          "--media",
          flowMedia,
          "--prompt",
          options.task,
          "--download-dir",
          downloadDir
        ];
      } else {
        let modelArg = "flash-lite";
        if (targetModel.includes("hydrogen"))
          modelArg = "hydrogen";
        else if (targetModel.includes("argon"))
          modelArg = "argon";
        else if (targetModel.includes("neon"))
          modelArg = "neon";
        else if (targetModel.includes("3.8") || targetModel.includes("flash"))
          modelArg = "flash";
        else if (targetModel.includes("lite"))
          modelArg = "flash-lite";
        else if (targetModel.includes("nano"))
          modelArg = "nano2.1";
        else if (targetModel.includes("omni"))
          modelArg = "omni1.2";
        args = [
          cdpScript,
          "playground",
          "--model",
          modelArg,
          "--fallback-model",
          "none",
          "--prompt",
          options.task,
          "--raw",
          "--download-dir",
          downloadDir
        ];
        if (isNewChat)
          args.push("--new-chat");
      }
      if (status.cdp.connected && status.cdp.port) {
        args.push("--port", String(status.cdp.port));
      }
      if (safeFiles.length > 0 && targetSite !== "flow") {
        for (const f of safeFiles) {
          args.push("--file", f);
        }
      }
      const { stdout } = await execFileAsync2(venv, args, {
        timeout: (timeoutSec + 30) * 1000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      return {
        ok: true,
        channel: "cdp",
        site: targetSite,
        model: targetModel,
        output: stdout.trim()
      };
    } catch (err) {
      return { ok: false, channel: "cdp", error: err.message || String(err) };
    }
  }
  return { ok: false, channel: status.activeChannel, error: "未找到执行脚本" };
}
async function getRoster(rosterFile, sessionId) {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile("default"));
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript || !fs4.existsSync(venv) || !fs4.existsSync(cdpScript)) {
    try {
      const p = path4.resolve(targetRoster);
      if (fs4.existsSync(p)) {
        const data = JSON.parse(fs4.readFileSync(p, "utf-8"));
        return { ok: true, file: p, project: data.project || "", count: Object.keys(data.roster || {}).length, roster: data.roster || {} };
      }
      return { ok: true, file: p, project: "", count: 0, roster: {} };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "roster", "list", "--file", targetRoster, "--json"], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    const parsed = JSON.parse(stdout.trim());
    return {
      ok: true,
      file: parsed.file,
      project: parsed.project,
      count: parsed.count,
      roster: parsed.roster
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function clearRoster(rosterFile, sessionId) {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile("default"));
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript || !fs4.existsSync(venv) || !fs4.existsSync(cdpScript)) {
    try {
      const p = path4.resolve(targetRoster);
      if (fs4.existsSync(p)) {
        fs4.writeFileSync(p, JSON.stringify({ project: "", updated_at: new Date().toISOString(), roster: {} }, null, 2), "utf-8");
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  try {
    await execFileAsync2(venv, [cdpScript, "roster", "clear", "--file", targetRoster, "--json"], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function auditRoster(projectDir, rosterFile, sessionId) {
  const targetRoster = rosterFile || (sessionId ? getSessionRosterFile(sessionId) : getSessionRosterFile("default"));
  const deliveries = listSessionDeliveries(sessionId);
  const targetProjectDir = projectDir || deliveries.waves[0]?.path || getWorkspaceRoot();
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "roster", "audit", "--project-dir", targetProjectDir, "--file", targetRoster, "--json"], {
      timeout: 20000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    try {
      return { ok: true, data: JSON.parse(stdout.trim()) };
    } catch {
      return { ok: true, data: stdout.trim() };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function getPlaybooks() {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "playbook", "list", "--json"], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function getPlaybookDetail(name) {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "playbook", "show", "--name", name, "--json"], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function runDoctor() {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "doctor", "--skip-flow", "--json"], {
      timeout: 25000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
function getPlaybooksDirectory() {
  return path4.join(getPluginDir(), "references", "playbooks");
}
function sanitizePlaybookSlug(rawName) {
  const cleaned = (rawName || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (cleaned && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return cleaned.slice(0, 48);
  }
  return `custom_squad_${Date.now().toString(36)}`;
}
function buildPlaybookMarkdown(input) {
  const modelDisplayMap = {
    "aistudio:gemini-4-hydrogen": { site: "`aistudio` (Playground)", model: "`gemini-4-hydrogen`", thinking: "`high`" },
    "aistudio:gemini-3.8-flash": { site: "`aistudio` (Playground)", model: "`gemini-3.8-flash`", thinking: "`high`" },
    "aistudio:gemini-4-neon": { site: "`aistudio` (Playground)", model: "`gemini-4-neon`", thinking: "`high`" },
    "gemini_task:gemini-4-hydrogen": { site: "`gemini_task`", model: "`gemini-4-hydrogen`", thinking: "—" },
    "gemini_task:gemini-4-neon": { site: "`gemini_task`", model: "`gemini-4-neon`", thinking: "—" },
    "flow:nano2.1": { site: "`flow`", model: "`Nano Banana 2.1`", thinking: "—" },
    "flow:omni1.2": { site: "`flow`", model: "`Omni 1.2 Flash`", thinking: "—" }
  };
  const rows = input.roles.map((r) => {
    const spec = modelDisplayMap[r.siteModel] || modelDisplayMap["aistudio:gemini-4-hydrogen"];
    return `| \`${r.role}\` | ${r.label} | ${spec.site} | ${spec.model} | ${spec.thinking} | ${r.duty} |`;
  });
  return [
    `# ${input.title} (\`${input.slug}\`)`,
    "",
    `> **适用场景**：${input.scenarios || "自定义多角色协同工作流"}`,
    "",
    "## 团队花名册（1 Tab = 1 员工）",
    "",
    "| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |",
    "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ...rows,
    "",
    "## 标准并行波次（Wave Execution）",
    "",
    "- **Wave 0（架构定界）**：梳理目标边界、输出文件清单与接口契约。",
    "- **Wave 1（多 Tab 并行生产）**：各选定角色在独立标签页同步执行并解包至会话隔离区。",
    "- **Wave 2（本地审查合并）**：确认产物完整性后一键合并至当前工程目录。",
    ""
  ].join(`
`);
}
async function addPlaybook(input) {
  const title = (input.title || "").trim();
  if (!title) {
    return { ok: false, error: "请填写编队名称" };
  }
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    return { ok: false, error: "请至少勾选 1 名协同员工角色" };
  }
  const slug = sanitizePlaybookSlug(input.name || title);
  const scenarios = (input.scenarios || "自定义多角色协同编队").trim();
  const md = buildPlaybookMarkdown({ slug, title, scenarios, roles: input.roles });
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    const pbDir = getPlaybooksDirectory();
    fs4.mkdirSync(pbDir, { recursive: true });
    const dest = path4.join(pbDir, `${slug}.md`);
    fs4.writeFileSync(dest, md, "utf-8");
    return { ok: true, data: { name: slug, title, scenarios, path: dest } };
  }
  const tmpFile = path4.join(os3.tmpdir(), `dsh_pb_${slug}_${Date.now()}.md`);
  fs4.writeFileSync(tmpFile, md, "utf-8");
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "playbook", "add", "--name", slug, "--title", title, "--scenarios", scenarios, "--from-file", tmpFile, "--json"], {
      timeout: 15000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try {
      if (fs4.existsSync(tmpFile))
        fs4.unlinkSync(tmpFile);
    } catch {}
  }
}
async function executeWave(specPathOrObj, options = {}) {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  const alScript = findAgentLimbScript();
  if (!venv || !cdpScript && !alScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  const cfg = loadConfig();
  const status = await detectDualChannel(cfg.connectionMode, cfg.port);
  let specPath = "";
  let tmpSpec = false;
  if (typeof specPathOrObj === "string" && specPathOrObj.endsWith(".json")) {
    specPath = path4.resolve(specPathOrObj);
  } else {
    tmpSpec = true;
    const tmpFile = path4.join(os3.tmpdir(), `dsh_wave_${Date.now()}.json`);
    fs4.writeFileSync(tmpFile, JSON.stringify(specPathOrObj, null, 2), "utf-8");
    specPath = tmpFile;
  }
  const runWaveScript = async (scriptPath, withPort) => {
    const args = [scriptPath, "wave", "--spec", specPath, "--json"];
    if (options.projectDir)
      args.push("--project-dir", options.projectDir);
    if (options.rosterFile)
      args.push("--roster-file", options.rosterFile);
    if (options.timeoutSec)
      args.push("--timeout", String(options.timeoutSec));
    if (withPort && options.port)
      args.push("--port", String(options.port));
    if (options.resume)
      args.push("--resume");
    const { stdout } = await execFileAsync2(venv, args, {
      timeout: ((options.timeoutSec || 360) + 30) * 1000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    const lines = stdout.trim().split(`
`);
    const jsonStart = lines.findIndex((l) => l.trim().startsWith("{"));
    const jsonText = jsonStart >= 0 ? lines.slice(jsonStart).join(`
`) : stdout.trim();
    try {
      return JSON.parse(jsonText);
    } catch {
      return stdout.trim();
    }
  };
  try {
    const preferAgentLimb = Boolean(alScript && fs4.existsSync(alScript) && status.agentlimb.ready) && (cfg.connectionMode === "agentlimb" || !status.cdp.connected && !status.aiChromeConfigured);
    if (preferAgentLimb && alScript) {
      const data = await runWaveScript(alScript, false);
      return { ok: true, channel: "agentlimb", data };
    }
    const canUseCdp = Boolean(status.cdp.connected || status.aiChromeConfigured);
    if (cdpScript && fs4.existsSync(cdpScript) && (cfg.connectionMode === "cdp" || canUseCdp)) {
      try {
        const data = await runWaveScript(cdpScript, true);
        return { ok: true, channel: "cdp", data };
      } catch (cdpErr) {
        if (cfg.connectionMode === "auto" && alScript && fs4.existsSync(alScript) && status.agentlimb.ready) {
          const data = await runWaveScript(alScript, false);
          return { ok: true, channel: "agentlimb", data };
        }
        throw cdpErr;
      }
    }
    if (alScript && fs4.existsSync(alScript)) {
      const data = await runWaveScript(alScript, false);
      return { ok: true, channel: "agentlimb", data };
    }
    return { ok: false, error: "未找到 Wave 执行脚本" };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    if (tmpSpec && fs4.existsSync(specPath)) {
      try {
        fs4.unlinkSync(specPath);
      } catch {}
    }
  }
}

// src/transport/router.ts
var execFileAsync3 = promisify3(execFile3);
async function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}
function createApiRouter(ctx) {
  let cachedUsage = null;
  let lastUsageTime = 0;
  return async function handler(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const marker = "/api/gemini-web";
    const markerAt = url.pathname.indexOf(marker);
    const routePath = url.pathname.slice(markerAt >= 0 ? markerAt + marker.length : 0).replace(/\/+$/, "") || "/";
    const method = String(req.method ?? "GET").toUpperCase();
    const send = (status, data) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (routePath === "/status" && method === "GET") {
        const cfg = loadConfig();
        const dual = await detectDualChannel(cfg.connectionMode, cfg.port);
        return send(200, {
          ok: true,
          dual,
          cdp: dual.cdp,
          agentlimb: dual.agentlimb,
          activeChannel: dual.activeChannel,
          cachedUsage,
          config: cfg
        });
      }
      if (routePath === "/config" && method === "GET") {
        return send(200, { ok: true, config: loadConfig() });
      }
      if (routePath === "/config" && method === "POST") {
        const body = await readBody(req);
        const updated = saveConfig(body);
        try {
          ctx?.emit?.("gemini-web/config-updated");
        } catch {}
        return send(200, { ok: true, config: updated });
      }
      if (routePath === "/test-agentlimb" && method === "POST") {
        const al = await detectAgentLimb();
        if (!al.ready) {
          return send(400, { ok: false, error: "AgentLimb 未在线，请确认 Brave 中 AgentLimb 扩展功能與 Bridge 已啟動。" });
        }
        try {
          const resp = await fetch(`http://127.0.0.1:${al.port}/api/tool`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tool: "say",
              arguments: { text: "\uD83C\uDF89 來自 DeepSeek Harness 雙通道面板測試：AgentLimb 连接正常！零弹窗调度就緒。" },
              timeoutMs: 5000
            })
          });
          const data = await resp.json();
          return send(200, { ok: true, data });
        } catch (err) {
          return send(500, { ok: false, error: err.message || String(err) });
        }
      }
      if (routePath === "/clear-cache" && method === "POST") {
        cachedUsage = null;
        lastUsageTime = 0;
        return send(200, { ok: true, message: "缓存已清除" });
      }
      if (routePath === "/open-url" && method === "POST") {
        const body = await readBody(req);
        const targetUrl = body.url || "https://accounts.google.com";
        if (process.platform === "linux") {
          spawn4("xdg-open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else if (process.platform === "darwin") {
          spawn4("open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else {
          spawn4("cmd.exe", ["/c", "start", targetUrl], { detached: true, stdio: "ignore" }).unref();
        }
        return send(200, { ok: true, url: targetUrl });
      }
      if (routePath === "/usage" && method === "GET") {
        const force = url.searchParams.get("force") === "1";
        const now = Date.now();
        if (!force && cachedUsage && now - lastUsageTime < 1e4) {
          return send(200, cachedUsage);
        }
        const usage = await fetchUsage();
        if (usage.ok) {
          cachedUsage = usage;
          lastUsageTime = now;
        }
        return send(200, usage);
      }
      if (routePath === "/models" && method === "GET") {
        const venv = findPythonVenv();
        const alScript = findAgentLimbScript();
        let discovered = [];
        if (venv && alScript) {
          try {
            const { stdout } = await execFileAsync3(venv, [alScript, "models"], {
              timeout: 15000,
              env: { ...process.env, PYTHONIOENCODING: "utf-8" }
            });
            const parsed = JSON.parse(stdout.trim());
            if (parsed.status === "ok" && Array.isArray(parsed.models) && parsed.models.length > 0) {
              discovered = parsed.models;
            }
          } catch {}
        }
        if (discovered.length === 0) {
          discovered = [
            { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen", new: true, paid: false },
            { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", new: false, paid: false },
            { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", new: false, paid: false },
            { id: "gemini-4-neon", name: "Gemini 4 Neon", new: true, paid: true },
            { id: "gemini-4-argon", name: "Gemini 4 Argon", new: false, paid: true },
            { id: "gemini-nano-banana-2.1", name: "Nano Banana 2.1", new: true, paid: true },
            { id: "gemini-omni-1.2-flash", name: "Gemini Omni 1.2 Flash", new: true, paid: true }
          ];
        }
        if (!discovered.some((m) => m.id === "gemini.google.com")) {
          discovered.push({ id: "gemini.google.com", name: "gemini.google.com", new: false, paid: false });
        }
        return send(200, { ok: true, models: discovered });
      }
      if (routePath === "/execute" && method === "POST") {
        const body = await readBody(req);
        const task = body.task || "請用一句話打招呼";
        const result = await executeAgentTask({ task, model: body.model });
        return send(200, result);
      }
      if (routePath === "/roster" && method === "GET") {
        const sessionId = url.searchParams.get("sessionId") || undefined;
        const roster = await getRoster(undefined, sessionId);
        return send(200, roster);
      }
      if (routePath === "/roster/clear" && method === "POST") {
        const body = await readBody(req);
        const result = await clearRoster(undefined, body.sessionId || url.searchParams.get("sessionId") || undefined);
        return send(200, result);
      }
      if (routePath === "/roster/audit" && method === "POST") {
        const body = await readBody(req);
        const result = await auditRoster(body.projectDir, undefined, body.sessionId || undefined);
        return send(200, result);
      }
      if (routePath === "/playbooks" && method === "GET") {
        const pb = await getPlaybooks();
        const diskList = pb.ok && Array.isArray(pb.data?.playbooks) ? pb.data.playbooks : [];
        const officialSlugs = new Set(Object.keys(PLAYBOOKS));
        const customPlaybooks = diskList.filter((item) => item?.name && !officialSlugs.has(item.name)).map((item) => ({ ...item, isCustom: true }));
        return send(200, {
          ok: true,
          playbooks: diskList.length > 0 ? diskList : Object.values(PLAYBOOKS),
          customPlaybooks
        });
      }
      if (routePath === "/playbooks" && method === "POST") {
        const body = await readBody(req);
        const result = await addPlaybook(body);
        return send(result.ok ? 200 : 400, result);
      }
      if (routePath.startsWith("/playbook/") && method === "GET") {
        const pbName = decodeURIComponent(routePath.replace("/playbook/", ""));
        const detail = await getPlaybookDetail(pbName);
        return send(200, detail);
      }
      if (routePath === "/wave" && method === "POST") {
        const body = await readBody(req);
        const sessionId = body.sessionId || undefined;
        const resume = Boolean(body.resume);
        const waveDir = body.projectDir || getOrCreateSessionWaveDir(sessionId, resume);
        const rosterFile = body.rosterFile || getSessionRosterFile(sessionId);
        const result = await executeWave(body.spec || body.tasks, {
          projectDir: waveDir,
          rosterFile,
          timeoutSec: body.timeoutSec,
          resume
        });
        return send(200, { ...result, waveDir, rosterFile });
      }
      if (routePath === "/deliveries" && method === "GET") {
        const sessionId = url.searchParams.get("sessionId") || undefined;
        return send(200, listSessionDeliveries(sessionId));
      }
      if (routePath === "/deliveries/merge" && method === "POST") {
        const body = await readBody(req);
        return send(200, mergeSessionDeliveries(body.sessionId, body.waveName));
      }
      if (routePath === "/open-dir" && method === "POST") {
        const body = await readBody(req);
        if (body.target === "playbooks") {
          return send(200, openLocalDirectory(getPlaybooksDirectory()));
        }
        if (body.target === "deliveries") {
          const deliveries = listSessionDeliveries(body.sessionId);
          const wave = body.waveName ? deliveries.waves.find((w) => w.name === body.waveName) : deliveries.waves[0];
          return send(200, openLocalDirectory(wave ? wave.path : deliveries.teamDir));
        }
        return send(400, { ok: false, error: "Unsupported directory target" });
      }
      if (routePath === "/doctor" && method === "GET") {
        return send(200, await runDoctor());
      }
      return send(404, { error: "Not found" });
    } catch (err) {
      return send(500, { error: err.message || String(err) });
    }
  };
}

// src/index.ts
var name = "dsh-gemini-web";
var inject = ["tools", "webServer", "systemPrompt"];
var previewedTaskMap = new Map;
function getTaskKey(t) {
  return (t || "").trim().replace(/\s+/g, " ").slice(0, 100);
}
function buildOverridesFromArgs(args) {
  if (!args || typeof args !== "object")
    return;
  const hasAny = args.site || args.entry || args.model || args.thinking_level || Array.isArray(args.files) && args.files.length > 0 || args.playbook || Array.isArray(args.wave_tasks) && args.wave_tasks.length > 0;
  if (!hasAny)
    return;
  return {
    site: args.site,
    entry: args.entry,
    model: args.model,
    thinkingLevel: args.thinking_level,
    files: args.files,
    playbook: args.playbook,
    waveTasks: args.wave_tasks
  };
}
function buildDynamicCardGuidance() {
  return `【\uD83C\uDF10 Gemini Web Agent 轻量门禁与授权调度规范 (v0.4)】
唯一外部网关：/gemini-web-agent。

1. 【第 1 步・先问后用门禁】：
   当用户请求调用外部 Google 网页端（AI Studio / Flow / Lyria / Gemini 官网 / Wave 多角色编队）或输入 /gemini-web-agent 时：
   - 调用 gemini_preview（可附带结构化 site / model / entry / wave_tasks 参数）生成确认卡并获取用户 GUI 授权配置快照；
   - 原样输出确认卡文本；
   - 立即调用 ask_user_question（或原生 ask_question）呈现确认按钮并停步等待用户点击或回复；
   - 严禁未经确认直接调用 gemini_web_agent 发包。

2. 【第 2 步・确认后自由编排】：
   用户点击确认或回复「确认」/「1」后，按需查阅 SKILL.md 与 references/（director_prompt.md、models.md、agentlimb.md、playbooks/*.md），在 GUI 授权模型与安全护栏内自由组合参数（单任务或结构化 wave_tasks）调用 gemini_web_agent 执行。

3. 【多轮任务重置】：
   每个新任务独立重置门禁，不得因上一轮已确认而跳过确认卡。`;
}
function apply(ctx) {
  ctx.inject(["systemPrompt"], (scoped) => {
    let disposeSection = null;
    const syncPrompt = () => {
      if (disposeSection) {
        try {
          disposeSection();
        } catch {}
        disposeSection = null;
      }
      try {
        if (scoped.systemPrompt?.section) {
          disposeSection = scoped.systemPrompt.section({
            name: "gemini-web:card-guidance",
            order: 600,
            text: buildDynamicCardGuidance()
          });
        }
      } catch (err) {
        console.warn("[dsh-gemini-web] systemPrompt registration warning:", err);
      }
    };
    syncPrompt();
    ctx.on("gemini-web/config-updated", syncPrompt);
  });
  ctx.inject(["tools"], (scoped) => {
    try {
      const previewDef = {
        name: "gemini_preview",
        get description() {
          return `【第 1 步确认门禁与 GUI 授权配置生成器】
调用后返回【\uD83C\uDF10 Gemini Web Agent】确认卡与当前用户在 GUI 中授权的模型阶梯/策略快照。
强模型可直接传入 site / entry / model / wave_tasks 等结构化参数，避免关键词猜测；输出确认卡后请立即调用提问工具并等待用户授权。`;
        },
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "用户提出的任务指令或提示词"
            },
            site: {
              type: "string",
              description: "可选：显式指定站点 (aistudio / flow / gemini / lyria / wave)"
            },
            entry: {
              type: "string",
              description: "可选：入口模式 (chat / task / canvas / music / wave)"
            },
            model: {
              type: "string",
              description: "可选：用户或主 AI 规划的目标模型别名"
            },
            thinking_level: {
              type: "string",
              description: "可选：思考等级 (high / medium / low / extra_high)"
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "可选：待挂载的本地文件路径列表"
            },
            playbook: {
              type: "string",
              description: "可选：指定编队模板 slug（位于 references/playbooks/）"
            },
            wave_tasks: {
              type: "array",
              items: { type: "object" },
              description: "可选：结构化 Wave 子任务矩阵 [{role, site, model, prompt, ...}]"
            }
          }
        },
        output: {
          schema: {
            type: "string",
            description: "提案卡 Markdown 与 GUI 授权配置快照"
          },
          render: (_args, value) => [{
            type: "text",
            text: typeof value === "string" ? value : value ? JSON.stringify(value) : ""
          }]
        },
        async execute(args) {
          const cfg = loadConfig();
          const overrides = buildOverridesFromArgs(args);
          const proposal = parseTaskToProposal(args.task, cfg, overrides);
          const key = getTaskKey(args.task);
          previewedTaskMap.set(key, Date.now());
          const qText = proposal.question || "\uD83D\uDC49 请确认是否发包执行？";
          const rawOptions = proposal.options || ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"];
          const authBrief = formatAuthorizedConfigBrief(cfg);
          return `${proposal.card}

${authBrief}

【下一步操作指引】：原样输出上方确认卡后，立即调用提问工具等待用户确认：
- 原生 ask_question：ask_question(questions: [{"question": "${qText}", "options": ${JSON.stringify(rawOptions)}}])
- MCP ask_user_question：ask_user_question(questions: [{"id": "gemini_confirm", "question": "${qText}", "options": ${JSON.stringify(rawOptions.map((opt) => ({ label: opt })))}}])
确认通过后，可按需查阅 SKILL.md 与 references/ 目录，并在上述 GUI 授权范围内调用 gemini_web_agent 执行。`;
        }
      };
      scoped.tools.register(previewDef);
      scoped.tools.register({ ...previewDef, name: "gemini-preview" });
      const toolDef = {
        name: "gemini_web_agent",
        get description() {
          return `【\uD83C\uDF10 Google 外部算力与多 Agent 执行网关 (v0.4)】
须在 gemini_preview + 用户确认后调用（未确认请求将被门禁拦截）。
支持单任务（aistudio / flow / lyria / gemini）及结构化多角色并发（site: "wave" + wave_tasks）。
受代码层护栏保护：遵守 GUI 模型阶梯与 Paid 过滤、gemini-spark 敏感文件剔除、.gemini-teams/ 会话隔离及 file:/// 本地落盘交付。`;
        },
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "交由 Gemini 网页端执行的任务指令与要求"
            },
            action: {
              type: "string",
              description: "执行动作：execute (默认) 或 preview (仅预览确认卡)"
            },
            model: {
              type: "string",
              description: "指定模型别名（如 hydrogen, flash, flash-lite, neon, nano-banana, lyria-3.5）"
            },
            site: {
              type: "string",
              description: "目标站点：aistudio (默认), flow, lyria, gemini, 或 wave"
            },
            entry: {
              type: "string",
              description: "入口模式：chat (默认), task, canvas, music, 或 wave"
            },
            thinking_level: {
              type: "string",
              description: "思考等级：high (默认), medium, low, extra_high (PRO 账号可用)"
            },
            thinking_policy: {
              type: "string",
              description: "思考策略：adaptive (默认), custom, strict"
            },
            timeout_sec: {
              type: "number",
              description: "任务超时秒数（选填）"
            },
            new_chat: {
              type: "boolean",
              description: "是否开启全新对话窗口（默认 false 延续会话）"
            },
            confirmed: {
              type: "boolean",
              description: "是否已在聊天室获得用户确认（须为 true 才放行；未授权时将被门禁拦截）"
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "待挂载至网页端分析的本地文件路径列表（选填）"
            },
            resume: {
              type: "boolean",
              description: "Wave 断点续传：跳过当前会话花名册中已完成的角色"
            },
            project: {
              type: "string",
              description: "可选：Wave 编队项目名称"
            },
            wave_tasks: {
              type: "array",
              items: { type: "object" },
              description: "可选：由主 AI 自由编排的 Wave 子任务数组 [{role, site, model, prompt, out_file, unpack_json_dir, thinking_level, files}]"
            }
          }
        },
        output: {
          schema: {
            type: "string",
            description: "Gemini 网页端执行产出成果"
          },
          render: (_args, value) => [{
            type: "text",
            text: typeof value === "string" ? value : value ? JSON.stringify(value) : ""
          }]
        },
        async execute(args, exec) {
          const cfg = loadConfig();
          const overrides = buildOverridesFromArgs(args);
          if (args.action === "preview") {
            const proposal = parseTaskToProposal(args.task, cfg, overrides);
            previewedTaskMap.set(getTaskKey(args.task), Date.now());
            return `${proposal.card}

${formatAuthorizedConfigBrief(cfg)}`;
          }
          const key = getTaskKey(args.task);
          const isExplicitConfirmed = args.confirmed === true || args.action === "execute_confirmed";
          const hasBeenPreviewed = previewedTaskMap.has(key) && Date.now() - (previewedTaskMap.get(key) || 0) < 10 * 60 * 1000;
          if (!isExplicitConfirmed && !hasBeenPreviewed && cfg.dispatchMode !== "fast_track") {
            previewedTaskMap.set(key, Date.now());
            const proposal = parseTaskToProposal(args.task, cfg, overrides);
            const qText = proposal.question || "\uD83D\uDC49 请确认是否发包执行？";
            const rawOptions = proposal.options || ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"];
            return `${proposal.card}

${formatAuthorizedConfigBrief(cfg)}

\uD83D\uDED1【安全门禁拦截】尚未向用户展示确认卡并取得授权，本次未向外部发包。请原样输出确认卡并调用提问工具（ask_question / ask_user_question）等待确认。`;
          }
          previewedTaskMap.delete(key);
          let filesToPass = args.files;
          if (!filesToPass || filesToPass.length === 0) {
            const proposal = parseTaskToProposal(args.task, cfg, overrides);
            if (proposal.files && proposal.files.length > 0) {
              filesToPass = proposal.files;
            }
          }
          const sessionId = exec?.agent?.id || exec?.agent?.sessionId || exec?.sessionId;
          const res = await executeAgentTask({
            task: args.task,
            model: args.model,
            site: args.site,
            entry: args.entry,
            thinkingLevel: args.thinking_level,
            thinkingPolicy: args.thinking_policy,
            timeoutSec: args.timeout_sec,
            newChat: args.new_chat,
            sessionId,
            files: filesToPass,
            resume: Boolean(args.resume),
            waveTasks: Array.isArray(args.wave_tasks) ? args.wave_tasks : undefined,
            waveProject: args.project
          });
          if (!res.ok) {
            if (res.error?.includes("CONGESTION_HALT")) {
              return `⚠️ 【Google 免费池排队拥塞警报】
${res.error}

\uD83D\uDCA1 建议：目前 Google AI Studio 免费池处于高负载排队状态，可稍候重试或切换本地模型。`;
            }
            return `❌ Gemini Web Agent 调度失败: ${res.error || "未知错误"}`;
          }
          let notice = "";
          if (res.fellBack) {
            const initial = res.initialModel || "初始模型";
            const current = res.model || "备援模型";
            const pathDisplay = res.fallbackHistory || `\`${initial}\` ➔ 尖峰拥塞 ➔ \`${current}\``;
            notice = `> \uD83D\uDD04 **【模型与渠道降级调度流程通知】**
> - 原选模型/渠道：\`${initial}\`
> - 调度路径：${pathDisplay}
> - 最终交付渠道与模型：\`${current}\`

`;
          } else if (res.site === "wave" || args.site === "wave" || Array.isArray(args.wave_tasks) && args.wave_tasks.length > 0) {
            const waveLocation = res.waveDir ? `
> - \uD83D\uDCC1 会话隔离交付目录：\`${res.waveDir}\`（可在面板确认后一键合并至项目）` : "";
            notice = `> \uD83D\uDC65 **【Wave 虚拟外包工作室通知】**：本次波次已由 **Wave 并发波次引擎** 执行并解包完成。${waveLocation}

`;
          } else if (res.site === "gemini" || args.site === "gemini") {
            notice = `> \uD83C\uDF10 **【执行渠道通知】**：本次任务已由 **Gemini 官网通道 (gemini.google.com)** 执行完成。

`;
          } else if (res.site === "flow" || args.site === "flow") {
            notice = `> \uD83C\uDFA8 **【执行渠道通知】**：本次任务已由 **Google Flow (flow.google.com)** 生成完成。

`;
          } else if (res.site === "lyria" || args.site === "lyria") {
            notice = `> \uD83C\uDFB5 **【执行渠道通知】**：本次任务已由 **Google AI Studio Lyria 音乐台** 生成完成。

`;
          }
          let fileLinks = "";
          if (res.files && res.files.length > 0) {
            const linkItems = res.files.map((f) => {
              const base = path5.basename(f);
              const fileUrl = `file://${f}`;
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(base);
              return isImg ? `- [\uD83D\uDCC1 ${base}](${fileUrl})

  ![${base}](${fileUrl})` : `- [\uD83D\uDCC1 ${base}](${fileUrl})`;
            });
            fileLinks = `\uD83D\uDCC1 **成果文件已落地存档至本地工作区**：
` + linkItems.join(`
`) + `

`;
          }
          const instructionHeader = `【交付提示：请在最终回复中保留降级通知（若有）与 file:/// 落地文件绝对路径链接；若完整源码已存盘，展示关键架构说明并引导点击文件链接即可，无需全量重抄超长代码以防 SSE 截断。】

`;
          let displayOutput = res.output || "";
          if (res.files && res.files.length > 0 && displayOutput.length > 2500) {
            displayOutput = displayOutput.slice(0, 2200) + `

...
> \uD83D\uDCA1 **完整实现与全部代码已完整落盘至上方工作区文件**，请直接点击上方 \`file:///\` 链接查看完整源码与测试用例。`;
          }
          return `${instructionHeader}${notice}${fileLinks}${displayOutput}`;
        }
      };
      scoped.tools.register(toolDef);
      scoped.tools.register({ ...toolDef, name: "gemini-web-agent" });
    } catch (e) {
      console.error("Failed to register gemini_web_agent tool:", e);
    }
  });
  ctx.inject(["webServer"], (scoped) => {
    const router = createApiRouter(ctx);
    scoped.effect(() => scoped.webServer.register({ kind: "prefix", path: "/api/gemini-web", handler: router }), "gemini-web: api routes");
  });
}
export {
  apply,
  buildDynamicCardGuidance,
  inject,
  name
};
