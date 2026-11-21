// src/index.ts
import path4 from "node:path";

// src/transport/router.ts
import { spawn as spawn3, execFile as execFile3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";

// src/bridge/detector.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  return {
    connected: false,
    browserType: "None",
    port: null,
    wsUrl: null,
    activePortFile: null,
    pythonVenv: venv,
    cliScript: cli,
    multipleInstances: false,
    instances: [],
    error: instances.length > 0 ? "检测到历史浏览器调试文件，但端口未响应 (浏览器可能已退出或关闭)" : "未偵測到開啟遠端偵錯的 Chromium 瀏覽器"
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
async function detectAgentLimb(ports = [8765, 8766, 8767, 8768], autoSpawn = true) {
  const probe = async () => {
    for (const port of ports) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(600)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            const hasBrowser = Boolean(data.activeBrowser || typeof data.browsers === "number" && data.browsers > 0 || Array.isArray(data.browserList) && data.browserList.length > 0);
            const profile = data.browserList?.[0]?.label || data.browserList?.[0]?.id || "Profile";
            if (!hasBrowser) {
              return {
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
            return {
              ready: true,
              port,
              version: data.version || "0.8.2",
              browsers: data.browsers || 1,
              activeProfile: profile,
              paired: Boolean(data.paired),
              stage: data.stage || "ready"
            };
          }
        }
      } catch {}
    }
    return null;
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
  if (mode === "cdp") {
    const cdp = await detectBrowserCdpAsync(cfgPort);
    return {
      activeChannel: cdp.connected ? "cdp" : "none",
      mode: "cdp",
      agentlimb: { ready: false, port: 8765, error: "使用者手動選擇僅走 CDP 模式" },
      cdp,
      pythonVenv: venv,
      cliScript: cli
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
        error: "AgentLimb 已連線，CDP 備用通道完全休眠 (零彈窗保護)"
      },
      pythonVenv: venv,
      cliScript: cli
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
      cliScript: cli
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
      error: "強制 AgentLimb 模式，不啟用 CDP 備用通道"
    },
    pythonVenv: venv,
    cliScript: cli
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
  defaultModel: "gemini-3.5-flash-lite",
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
  dispatchMode: "ask_first"
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
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import path3 from "node:path";
import fs3 from "node:fs";
import os3 from "node:os";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var execFileAsync2 = promisify2(execFile2);
function getWorkspaceDownloadDir() {
  try {
    const wsFile = path3.join(os3.homedir(), ".dsh", "storages", "workspace.json");
    if (fs3.existsSync(wsFile)) {
      const data = JSON.parse(fs3.readFileSync(wsFile, "utf-8"));
      const defId = data?.global?.defaultWorkspaceId;
      const wsPath = data?.tables?.workspaces?.[defId]?.path;
      if (wsPath && fs3.existsSync(wsPath)) {
        return path3.join(wsPath, "downloads");
      }
    }
  } catch {}
  return path3.join(process.cwd(), "downloads");
}
var lastSessionId = null;
async function executeAgentTask(options) {
  const cfg = loadConfig();
  const status = await detectDualChannel(cfg.connectionMode, cfg.port, cfg.preferredBrowser);
  if (status.activeChannel === "none") {
    return {
      ok: false,
      channel: "none",
      error: "雙通道皆未连接：请确认 Brave 已打開並啟用 AgentLimb 扩展功能，或已開啟 CDP 偵錯模式。"
    };
  }
  const venv = status.pythonVenv;
  if (!venv || !fs3.existsSync(venv)) {
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
  const targetModel = options.model || cfg.defaultModel || "gemini-3.5-flash-lite";
  let targetSite = options.site || "aistudio";
  if (targetModel === "gemini.google.com" || targetModel === "gemini") {
    targetSite = "gemini";
  }
  if (targetSite === "wave" || options.entry === "wave") {
    let waveSpec = null;
    try {
      const trimmed = options.task.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) {
        waveSpec = JSON.parse(trimmed);
      }
    } catch {}
    if (waveSpec) {
      const res = await executeWave(waveSpec, { projectDir: process.cwd(), timeoutSec: options.timeoutSec || 360 });
      if (!res.ok) {
        return { ok: false, channel: "cdp", site: "wave", error: res.error };
      }
      return {
        ok: true,
        channel: "cdp",
        site: "wave",
        model: "wave-engine",
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
    if (!fs3.existsSync(downloadDir)) {
      fs3.mkdirSync(downloadDir, { recursive: true });
    }
  } catch {}
  const cleanAndResolvePath = (raw) => {
    if (!raw || typeof raw !== "string")
      return null;
    let f = raw.trim().replace(/^['"‘“@]|['"’”]$/g, "").trim();
    if (f.startsWith("file://")) {
      try {
        f = fileURLToPath3(f);
      } catch {
        f = f.replace(/^file:\/\//, "");
      }
    }
    if (f.startsWith("~")) {
      f = path3.join(os3.homedir(), f.slice(1));
    }
    const candidates = [
      path3.isAbsolute(f) ? f : null,
      path3.resolve(process.cwd(), f),
      path3.resolve(path3.dirname(downloadDir), f)
    ].filter(Boolean);
    for (const c of candidates) {
      try {
        if (fs3.existsSync(c) && fs3.statSync(c).isFile()) {
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
  if (status.activeChannel === "agentlimb" && agentlimbScript && fs3.existsSync(agentlimbScript)) {
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
      if (safeThinking.includes("extra") || safeThinking === "xhigh" || safeThinking === "max") {
        safeThinking = "high";
      }
      args.push("--thinking-level", safeThinking);
      if (isNewChat)
        args.push("--new-chat");
      if (options.entry)
        args.push("--entry", options.entry);
      if (resolvedFiles.length > 0) {
        for (const f of resolvedFiles) {
          args.push("--file", f);
        }
      }
      if (isStrict) {
        args.push("--no-fallback");
      } else {
        const ladder = options.fallbackLadder || cfg.fallbackLadder;
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
      if (cfg.connectionMode !== "auto") {
        return { ok: false, channel: "agentlimb", error: err.message || String(err) };
      }
    }
  }
  if (cdpScript && fs3.existsSync(cdpScript)) {
    try {
      let modelArg = "flash-lite";
      if (targetModel.includes("hydrogen"))
        modelArg = "hydrogen";
      else if (targetModel.includes("argon"))
        modelArg = "argon";
      else if (targetModel.includes("3.8") || targetModel.includes("flash"))
        modelArg = "flash";
      else if (targetModel.includes("lite"))
        modelArg = "flash-lite";
      else if (targetModel.includes("nano"))
        modelArg = "nano2.1";
      else if (targetModel.includes("omni"))
        modelArg = "omni1.2";
      const args = [
        cdpScript,
        "playground",
        "--model",
        modelArg,
        "--prompt",
        options.task,
        "--raw",
        "--download-dir",
        downloadDir
      ];
      if (isNewChat)
        args.push("--new-chat");
      if (status.cdp.port)
        args.push("--port", String(status.cdp.port));
      if (resolvedFiles.length > 0) {
        for (const f of resolvedFiles) {
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
        model: targetModel,
        output: stdout.trim()
      };
    } catch (err) {
      return { ok: false, channel: "cdp", error: err.message || String(err) };
    }
  }
  return { ok: false, channel: status.activeChannel, error: "未找到执行脚本" };
}
async function getRoster(rosterFile = ".web-team.json") {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript || !fs3.existsSync(venv) || !fs3.existsSync(cdpScript)) {
    try {
      const p = path3.resolve(rosterFile);
      if (fs3.existsSync(p)) {
        const data = JSON.parse(fs3.readFileSync(p, "utf-8"));
        return { ok: true, file: p, project: data.project || "", count: Object.keys(data.roster || {}).length, roster: data.roster || {} };
      }
      return { ok: true, file: p, project: "", count: 0, roster: {} };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "roster", "list", "--roster-file", rosterFile], {
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
async function clearRoster(rosterFile = ".web-team.json") {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript || !fs3.existsSync(venv) || !fs3.existsSync(cdpScript)) {
    try {
      const p = path3.resolve(rosterFile);
      if (fs3.existsSync(p)) {
        fs3.writeFileSync(p, JSON.stringify({ project: "", updated_at: new Date().toISOString(), roster: {} }, null, 2), "utf-8");
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  try {
    await execFileAsync2(venv, [cdpScript, "roster", "clear", "--roster-file", rosterFile], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function auditRoster(projectDir = ".", rosterFile = ".web-team.json") {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  try {
    const { stdout } = await execFileAsync2(venv, [cdpScript, "roster", "audit", "--project-dir", projectDir, "--roster-file", rosterFile], {
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
    const { stdout } = await execFileAsync2(venv, [cdpScript, "playbook", "list"], {
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
    const { stdout } = await execFileAsync2(venv, [cdpScript, "playbook", "show", "--name", name], {
      timeout: 1e4,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    return { ok: true, data: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
async function executeWave(specPathOrObj, options = {}) {
  const venv = findPythonVenv();
  const cdpScript = findCliScript();
  if (!venv || !cdpScript) {
    return { ok: false, error: "未找到 Python 执行环境" };
  }
  let specPath = "";
  let tmpSpec = false;
  if (typeof specPathOrObj === "string" && specPathOrObj.endsWith(".json")) {
    specPath = path3.resolve(specPathOrObj);
  } else {
    tmpSpec = true;
    const tmpFile = path3.join(os3.tmpdir(), `dsh_wave_${Date.now()}.json`);
    fs3.writeFileSync(tmpFile, JSON.stringify(specPathOrObj, null, 2), "utf-8");
    specPath = tmpFile;
  }
  try {
    const args = [cdpScript, "wave", "--spec", specPath];
    if (options.projectDir)
      args.push("--project-dir", options.projectDir);
    if (options.timeoutSec)
      args.push("--timeout", String(options.timeoutSec));
    if (options.port)
      args.push("--port", String(options.port));
    const { stdout } = await execFileAsync2(venv, args, {
      timeout: ((options.timeoutSec || 360) + 30) * 1000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    try {
      return { ok: true, data: JSON.parse(stdout.trim()) };
    } catch {
      return { ok: true, data: stdout.trim() };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    if (tmpSpec && fs3.existsSync(specPath)) {
      try {
        fs3.unlinkSync(specPath);
      } catch {}
    }
  }
}

// src/proposal.ts
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
function parseTaskToProposal(task, config) {
  const cfg = config || loadConfig();
  const extractedFiles = [];
  const atRegex = /@([a-zA-Z0-9_\-\.\/]+)/g;
  let match;
  while ((match = atRegex.exec(task)) !== null) {
    const f = match[1].trim();
    if (f && !extractedFiles.includes(f)) {
      extractedFiles.push(f);
    }
  }
  const fileRegex = /\b(?:(?:\.?\.?\/)?[a-zA-Z0-9_\-]+\/)*[a-zA-Z0-9_\-]+\.(?:ts|tsx|js|jsx|py|json|md|txt|pdf|png|jpg|jpeg|gif|webp|csv|log|yaml|yml|rs|go|cpp|c|h|java|html|css|sh)\b/gi;
  while ((match = fileRegex.exec(task)) !== null) {
    const f = match[0].trim();
    if (f && !f.includes("google.com") && !extractedFiles.includes(f)) {
      extractedFiles.push(f);
    }
  }
  const isWave = /(?:\bwave\b|并发波次|波次引擎|波次任务|多\s*tab\s*并发|并发外包|虚拟工作室|团队花名册|花名册|\broster\b|\bplaybook\b|工作编队|研发编队|全栈编队|游戏编队|数据编队|视频编队|调研编队|编队|外包团队|全栈开发|任务看板|看板\s*web|web\s*工具)/i.test(task);
  if (isWave) {
    let matchedPlaybook = undefined;
    if (/(?:全栈|web\s*应用|saas|web_fullstack|全栈编队|看板|web\s*工具)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.web_fullstack_app;
    } else if (/(?:游戏|game|phaser|canvas游戏|interactive_game|游戏编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.interactive_game_studio;
    } else if (/(?:数据工程|办公自动化|excel|报表|清洗|data_office|数据编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.data_office_automation;
    } else if (/(?:视频|自媒体|音频|配乐|剪辑|content_video|视频编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.content_video_media;
    } else if (/(?:学术|文献|综述|深度调研|研报|academic_deep|调研编队)/i.test(task)) {
      matchedPlaybook = PLAYBOOKS.academic_deep_research;
    }
    if (!matchedPlaybook) {
      matchedPlaybook = PLAYBOOKS.web_fullstack_app;
    }
    const pb = matchedPlaybook;
    const channel = "Wave 多 Tab 并发波次引擎 (Chrome Multi-Tab Cluster)";
    const actionDesc = `启动虚拟工作室「${pb.title}」并发协作`;
    const modelLabel = "（多 Tab 角色矩阵）";
    const modelTarget = "架构定界 (AI Studio Hydrogen / Neon) + 研发沙盒 (Gemini 官网云端运行) + 视觉资产 (Flow 零点数特权)";
    const thinkingConfig = "各 Tab 错峰 3.5s 派发 · 后台静默轮询 · 自动解包写入工作区";
    const filesLine = extractedFiles.length > 0 ? `- \uD83D\uDCC1 挂载文件：[${extractedFiles.join(", ")}]` : "";
    const cardLines = [
      "### \uD83C\uDF10 Gemini Web Agent",
      `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
      "",
      `- \uD83C\uDFAF 执行渠道：${channel}`,
      `- \uD83D\uDCCB 启用编队：${pb.title} (${pb.slug})`,
      `- \uD83D\uDC65 协同角色：[${pb.roles.join(", ")}]`
    ];
    if (filesLine) {
      cardLines.push(filesLine);
    }
    cardLines.push(`- \uD83D\uDEAA 入口模式：wave (多 Tab 并发外包)`, `- \uD83E\uDDE0 协同矩阵：多 Tab 专属工种`, `  - \uD83D\uDCD0 架构定界：Google AI Studio (Gemini 4 Hydrogen / Neon 深度长文本)`, `  - \uD83D\uDEE0️ 研发与自测：Gemini 官网代码沙盒 (云端容器运行测试，无需本地装环境)`, `  - \uD83C\uDFA8 视觉素材：Google Flow (Nano Banana 2.1 享受 0 扣点特权)`, `- \uD83C\uDF0A 规划波次：${pb.stages}`, `- ⚙️ 推演配置：${thinkingConfig}`, "- \uD83D\uDD04 话题隔离：各角色独立 Tab 绑定 (.web-team.json 持久化)", "", "\uD83D\uDC49 请确认是否启动 Wave 并发外包执行？", "- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化错峰派发多 Tab 并行执行", "- 回复 「花名册」：查阅当前项目团队各角色绑定的标签页与 Google Drive 状态", "- 回复 「取消」：中止并发外包，改由本地单模型作答");
    const card = cardLines.join(`
`);
    const question = "\uD83D\uDC49 请确认是否启动 Wave 并发外包执行？";
    const options = [
      "(Recommended) 确认启动 Wave 并发外包",
      "查看该编队花名册契约",
      "取消调度（本地作答）"
    ];
    return {
      site: "wave",
      entry: "wave",
      channel,
      actionDesc,
      modelLabel,
      modelTarget,
      model: "wave",
      thinkingConfig,
      files: extractedFiles,
      card,
      question,
      options,
      playbook: pb
    };
  }
  const isAiStudio = /(?:google\s*ai\s*studio|ai\s*studio|aistudio)/i.test(task);
  const isFlow = /(?:google\s*flow|flow\.google\.com|\bflow\b|nano\s*banana|veo|omni\s*1\.2|生图|画一张|生成图片|生成图|做视频|生成视频)/i.test(task);
  const isGeminiWeb = /(?:gemini(?:\.google\.com)?\s*官网|gemini\s*web|gemini\s*网页|task\s*模式|task模式)/i.test(task) || !isAiStudio && /联网调研/i.test(task);
  let site = "aistudio";
  if (isAiStudio) {
    site = "aistudio";
  } else if (isFlow) {
    site = "flow";
  } else if (isGeminiWeb) {
    site = "gemini";
  }
  let entry = "chat";
  if (site === "flow") {
    entry = "canvas";
  } else if (site === "gemini") {
    if (/(?:task\s*模式|task模式|联网调研|\btask\b)/i.test(task)) {
      entry = "task";
    } else {
      entry = "chat";
    }
  }
  let channel = "Google AI Studio（可选择：Google AI Studio / Gemini Web）";
  if (site === "gemini") {
    channel = "gemini.google.com（可选择：Google AI Studio / Gemini Web）";
  } else if (site === "flow") {
    channel = "Google Flow (flow.google.com)";
  }
  let actionDesc = "实现任务";
  if (extractedFiles.length > 0) {
    actionDesc = "分析本地文件";
  } else if (site === "flow") {
    actionDesc = "实现多媒体生成";
  } else if (site === "gemini" && entry === "task") {
    actionDesc = "进行联网调研与深度探索";
  } else if (site === "aistudio" && /联网调研/i.test(task)) {
    actionDesc = "进行联网调研与深度探索";
  }
  let userSpecifiedModel;
  let userSpecifiedModelKey;
  let modelNote = "";
  if (/flash[- ]?lite|3\.5[- ]?flash[- ]?lite/i.test(task)) {
    userSpecifiedModel = "gemini-3.5-flash-lite";
    userSpecifiedModelKey = "gemini-3.5-flash-lite";
  } else if (/3\.8[- ]?flash|\bflash\b/i.test(task) && !/flash[- ]?lite/i.test(task)) {
    userSpecifiedModel = "gemini-3.8-flash";
    userSpecifiedModelKey = "gemini-3.8-flash";
  } else if (/neon/i.test(task)) {
    userSpecifiedModel = "gemini-4-neon";
    userSpecifiedModelKey = "gemini-4-neon";
  } else if (/argon/i.test(task)) {
    userSpecifiedModel = "gemini-4-hydrogen";
    userSpecifiedModelKey = "gemini-4-hydrogen";
    modelNote = "（注：Google 已将旧 Argon 槽位升级合并至 Hydrogen 深度推理，已自动为您映射）";
  } else if (/hydrogen|gemini-4/i.test(task)) {
    userSpecifiedModel = "gemini-4-hydrogen";
    userSpecifiedModelKey = "gemini-4-hydrogen";
  } else if (/nano\s*banana/i.test(task)) {
    userSpecifiedModel = "Nano Banana 2.1";
    userSpecifiedModelKey = "nano-banana";
  } else if (/veo|omni/i.test(task)) {
    userSpecifiedModel = "Omni 1.2 / Veo";
    userSpecifiedModelKey = "omni";
  }
  let modelLabel = "";
  let modelTarget = "";
  let finalModel = undefined;
  if (site === "flow") {
    if (userSpecifiedModelKey === "omni") {
      modelLabel = "Omni 1.2 / Veo (视频生成)";
      modelTarget = "Omni 1.2 / Veo";
      finalModel = "omni";
    } else {
      modelLabel = "Nano Banana 2.1 (2K 高清生图)";
      modelTarget = "Nano Banana 2.1";
      finalModel = "nano-banana";
    }
  } else if (site === "gemini") {
    modelLabel = "Auto (Gemini 官网原生模型)";
    modelTarget = "Google 官方原生模型";
  } else if (userSpecifiedModel) {
    modelLabel = "（用户指定）";
    modelTarget = userSpecifiedModel;
    finalModel = userSpecifiedModelKey;
  } else {
    const isStrict = cfg.thinkingPolicy === "strict";
    if (isStrict) {
      modelLabel = "（严格模式）";
      modelTarget = cfg.defaultModel || "gemini-4-hydrogen";
      finalModel = cfg.defaultModel;
    } else {
      modelLabel = "（智能/降级模式）";
      const ladder = cfg.fallbackLadder && cfg.fallbackLadder.length > 0 ? cfg.fallbackLadder : [cfg.defaultModel || "gemini-4-hydrogen"];
      modelTarget = ladder.join(" -> ");
    }
  }
  let thinkingConfig = "";
  if (site === "gemini") {
    thinkingConfig = entry === "task" ? "联网搜索增强 (Task 联网模式)" : "官网标准对话模式";
  } else if (site === "flow") {
    thinkingConfig = "生成数量设为 x1，分辨率设为 2K";
  } else {
    const level = cfg.thinkingLevel || "high";
    thinkingConfig = /联网调研/i.test(task) ? `Thinking 设为 ${level} (联网搜索增强)` : `Thinking 设为 ${level}`;
  }
  const filesLine = extractedFiles.length > 0 ? `- \uD83D\uDCC1 挂载文件：[${extractedFiles.join(", ")}]` : "";
  const cardLines = [
    "### \uD83C\uDF10 Gemini Web Agent",
    `检测到您欲调用外部 Google 网页端${actionDesc}，相关配置如下：`,
    "",
    `- \uD83C\uDFAF 执行渠道：${channel}`
  ];
  if (filesLine) {
    cardLines.push(filesLine);
  }
  cardLines.push(`- \uD83D\uDEAA 入口模式：${entry}`, `- \uD83E\uDDE0 执行模型：${modelLabel}`, `  - ${modelTarget}${modelNote ? ` ${modelNote}` : ""}`, `- ⚙️ 推演配置：${thinkingConfig}`, "- \uD83D\uDD04 话题隔离：new_chat: true（预设开启全新独立对话）", "", "\uD83D\uDC49 请确认是否发包执行？", "- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行", "- 回复 调整参数（如「改用 Flash Lite」、「改用 Hydrogen」等）：按您的要求调整后直接发包", "- 回复 「取消」：中止外部调度，改由本地作答");
  const card = cardLines.join(`
`);
  const question = "\uD83D\uDC49 请确认是否发包执行？";
  const options = [
    "(Recommended) 确认发包执行",
    "调整参数",
    "取消调度（本地作答）"
  ];
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
    card,
    question,
    options
  };
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
          spawn3("xdg-open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else if (process.platform === "darwin") {
          spawn3("open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
        } else {
          spawn3("cmd.exe", ["/c", "start", targetUrl], { detached: true, stdio: "ignore" }).unref();
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
            { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", new: false, paid: false },
            { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", new: false, paid: false },
            { id: "gemini-4-neon", name: "Gemini 4 Neon", new: true, paid: false },
            { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen", new: true, paid: false },
            { id: "gemini-4-argon", name: "Gemini 4 Argon", new: false, paid: false },
            { id: "gemini-nano-banana-2.1", name: "Nano Banana 2.1", new: true, paid: false },
            { id: "gemini-omni-1.2-flash", name: "Gemini Omni 1.2 Flash", new: true, paid: false }
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
        const roster = await getRoster();
        return send(200, roster);
      }
      if (routePath === "/roster/clear" && method === "POST") {
        const result = await clearRoster();
        return send(200, result);
      }
      if (routePath === "/roster/audit" && method === "POST") {
        const body = await readBody(req);
        const result = await auditRoster(body.projectDir || ".");
        return send(200, result);
      }
      if (routePath === "/playbooks" && method === "GET") {
        const pb = await getPlaybooks();
        return send(200, {
          ok: true,
          playbooks: pb.ok && pb.data?.playbooks ? pb.data.playbooks : Object.values(PLAYBOOKS)
        });
      }
      if (routePath.startsWith("/playbook/") && method === "GET") {
        const pbName = decodeURIComponent(routePath.replace("/playbook/", ""));
        const detail = await getPlaybookDetail(pbName);
        return send(200, detail);
      }
      if (routePath === "/wave" && method === "POST") {
        const body = await readBody(req);
        const result = await executeWave(body.spec || body.tasks, {
          projectDir: body.projectDir,
          timeoutSec: body.timeoutSec
        });
        return send(200, result);
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
function buildDynamicCardGuidance() {
  return `【\uD83C\uDF10 Gemini Web Agent 单一门禁与先问后用铁律】
唯一合法调度指令：/gemini-web-agent。

【核心交互流程规范】：
当用户在对话中提到需要使用外部 Google 网页端（AI Studio / Flow / Gemini 官网 / Wave 编队 / 虚拟工作室）执行任务，或直接使用了 /gemini-web-agent 指令时：
1. 严禁宿主 AI 本地代劳作答！严禁在未向用户展示确认卡前擅自执行代码！必须立即执行第 1 步先问后用（调用 gemini_preview 工具）；
2. 在聊天中原样输出 gemini_preview 返回的标准确认卡；
3. 必须立即调用交互提问工具 ask_user_question（或 ask_question），展示交互选择栏供用户点击：
   - questions: [{ id: "gemini_confirm", question: "\uD83D\uDC49 请确认是否发包执行？", options: [{ label: "(Recommended) 确认发包执行" }, { label: "调整参数" }, { label: "取消调度（本地作答）" }] }]
4. 严禁直接调用 gemini_web_agent 发包，严禁调用 subagent！必须立即停步等待用户点击确认！

【授权发包执行】：
当用户在交互选择栏中点击「确认发包执行」或回复「确认」/「1」后：
正式调用 gemini_web_agent 发包执行！

\uD83D\uDEA8【多轮任务循环铁律（Multi-Turn Anti-Inertia）】：
每个新任务都是一个全新独立的循环（Cycle），绝非整个聊天会话只确认一次！
即使同一对话中上一轮刚刚成功执行完毕，只要用户再次发起新的任务指令，本轮依然必须 100% 重新重置回确认流程，必须再次输出确认卡并调用提问工具！
绝对严禁因为历史上上一轮已经确认过就自作聪明跳过确认卡直接作答或偷跑发包！`;
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
          return `【第 1 步确定性确认卡与交互选项生成器】
必须在第 1 步调用！输入用户的任务指令，100% 由代码确定性解析并生成标准的【\uD83C\uDF10 Gemini Web Agent】确认卡与交互选项定义（彻底规避排版幻觉与阶梯错误）。
在第 1 步调用本工具获取卡片后，在聊天中原样输出卡片文本，并立即调用选择栏工具 ask_user_question 呈现确认按钮供用户点击！`;
        },
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "用户提出的任务指令或提示词"
            }
          }
        },
        output: {
          schema: {
            type: "string",
            description: "确定性生成的提案卡 Markdown 文本"
          },
          render: (_args, value) => [{
            type: "text",
            text: typeof value === "string" ? value : value ? JSON.stringify(value) : ""
          }]
        },
        async execute(args) {
          const proposal = parseTaskToProposal(args.task, loadConfig());
          const key = getTaskKey(args.task);
          previewedTaskMap.set(key, Date.now());
          const qText = proposal.question || "\uD83D\uDC49 请确认是否发包执行？";
          const rawOptions = proposal.options || ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"];
          return `${proposal.card}

【下一步操作指引】：请宿主 AI 立即在当前聊天窗口原样输出上方确认卡，并调用提问工具弹出交互选项栏：
- 原生 ask_question 工具（Antigravity 规范）：ask_question(questions: [{"question": "${qText}", "options": ${JSON.stringify(rawOptions)}}])
- MCP ask_user_question 工具：ask_user_question(questions: [{"id": "gemini_confirm", "question": "${qText}", "options": ${JSON.stringify(rawOptions.map((opt) => ({ label: opt })))}}])
\uD83D\uDED1【铁律】：调用完提问工具后必须彻底停步，严禁调用任何后续工具（严禁调用 run_command、gemini_web_agent 或本地代劳），直接结束本次回答，等待用户点击或回复！`;
        }
      };
      scoped.tools.register(previewDef);
      scoped.tools.register({ ...previewDef, name: "gemini-preview" });
      const toolDef = {
        name: "gemini_web_agent",
        get description() {
          return `【\uD83D\uDEA8 Google 外部免费算力与多模态网关 / 核心铁律：两步走・先问后用】
【第 1 步先问后用，第 2 步授权发包】：
在使用者提出任何需求后，第 1 步必须先调用 gemini_preview 工具确定性生成【\uD83C\uDF10 Gemini Web Agent】确认卡，并调用 ask_user_question 呈现原生按钮供用户点击，并在此停止等待！
只有当用户确认（点击按钮、回复「确认」或「1」）后，才在第 2 步正式调用本工具发包执行！

${buildDynamicCardGuidance()}

1. \uD83C\uDFAF【用户指定模型绝对优先】：若用户指定了具体模型（如「用 Gemini 3.5 Flash Lite」、「用 Argon」），必须 100% 采用该模型，严禁擅自升级或替换！
2. \uD83D\uDED1【明令禁止本地擅自代劳、Subagent 劫持与本地 read 工具拦截】：严禁在本地自行编写答案，严禁调用 read、cat、bash 等本地工具预先读取文件，严禁调用 subagent 消耗付费额度！当用户要求分析本地文件或输入了 @文件 时，直接将该文件路径交由外部网页端挂载分析！
3. \uD83D\uDCE6【调用完成后的展示义务】：调用完成后，必须完整呈现降级流程通知、落地文件超链接以及核心架构说明与代码！`;
        },
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "交由 Gemini 网页端执行的完整任务指令、需求描述与要求"
            },
            action: {
              type: "string",
              description: "执行动作：execute (默认，正式发包执行) 或 preview (仅确定性预览并返回确认卡)"
            },
            model: {
              type: "string",
              description: "指定调度的模型别名（选填，如 hydrogen, flash, flash-lite 等）"
            },
            site: {
              type: "string",
              description: "目标站点：aistudio (默认，代码与长文本), flow (生图生视频，Nano 2.1 享 0 点数), 或 gemini (官网对话与 task 模式)"
            },
            entry: {
              type: "string",
              description: "入口模式：chat (默认对话), task (Gemini 官网任务与画布模式)"
            },
            thinking_level: {
              type: "string",
              description: "思考等级：high (默认稳定), medium, 或 low。注意：extra-high 已封印，避免免费池引发 Permission Denied 错误"
            },
            thinking_policy: {
              type: "string",
              description: "思考阈值策略：adaptive (自适应，默认), custom (自定义超时), strict (严格模式不降级)"
            },
            timeout_sec: {
              type: "number",
              description: "任务超时限制秒数 (自定义模式下生效，如 240)"
            },
            new_chat: {
              type: "boolean",
              description: "是否开启全新对话窗口（若为 true 则重置为全新聊天室，默认为 false 延续对话）"
            },
            confirmed: {
              type: "boolean",
              description: "是否已在聊天室获得用户明确点击授权（必须为 true 才能正式发包；未授权时将被门禁拦截并自动返回确认卡）"
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "待上传至 Google 网页端分析的本地文件、图片、日志或论文 PDF 绝对/相对路径列表（选填，支持多文件）"
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
          if (args.action === "preview") {
            const proposal = parseTaskToProposal(args.task, loadConfig());
            const key = getTaskKey(args.task);
            previewedTaskMap.set(key, Date.now());
            return proposal.card;
          }
          const cfg = loadConfig();
          const key = getTaskKey(args.task);
          const isExplicitConfirmed = args.confirmed === true || args.action === "execute_confirmed";
          const hasBeenPreviewed = previewedTaskMap.has(key) && Date.now() - (previewedTaskMap.get(key) || 0) < 10 * 60 * 1000;
          if (!isExplicitConfirmed && !hasBeenPreviewed && cfg.dispatchMode !== "fast_track") {
            previewedTaskMap.set(key, Date.now());
            const proposal = parseTaskToProposal(args.task, cfg);
            const qText = proposal.question || "\uD83D\uDC49 请确认是否发包执行？";
            const rawOptions = proposal.options || ["(Recommended) 确认发包执行", "调整参数", "取消调度（本地作答）"];
            return `${proposal.card}

\uD83D\uDED1【系统安全门禁拦截：先问后用强制生效中】
检测到尚未在聊天窗口向用户展示上方【\uD83C\uDF10 Gemini Web Agent】确认卡并获取点击授权！本次调度已被底层代码强制拦截挂起，未向外部发包。

\uD83D\uDC49 宿主 AI 必须：
1. 立即在当前聊天窗口中原样输出上方确认卡；
2. 立即调用提问工具弹出交互选项供用户点击：
   - 原生 ask_question 工具：ask_question(questions: [{"question": "${qText}", "options": ${JSON.stringify(rawOptions)}}])
   - MCP ask_user_question 工具：ask_user_question(questions: [{"id": "gemini_confirm", "question": "${qText}", "options": ${JSON.stringify(rawOptions.map((opt) => ({ label: opt })))}}])
3. 彻底停步！严禁调用 run_command 或再次发包！直接结束本次回答，等待用户在交互栏中点击或回复！`;
          }
          previewedTaskMap.delete(key);
          let filesToPass = args.files;
          if (!filesToPass || filesToPass.length === 0) {
            const proposal = parseTaskToProposal(args.task, loadConfig());
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
            files: filesToPass
          });
          if (!res.ok) {
            if (res.error?.includes("CONGESTION_HALT")) {
              return `⚠️ 【Google 免费池排队拥塞警报】
${res.error}

\uD83D\uDCA1 建议：目前 Google AI Studio 免费池处于高负载排队状态。您可以稍候几分钟后重试，或者切换为本地模型继续进行。`;
            }
            return `❌ Gemini Web Agent 调度失败: ${res.error || "未知错误"}`;
          }
          let notice = "";
          if (res.fellBack) {
            const initial = res.initialModel || "初始模型";
            const current = res.model || "备援模型";
            const pathDisplay = res.fallbackHistory || `\`${initial}\` ➔ 尖峰拥塞 ➔ \`${current}\``;
            notice = `> \uD83D\uDD04 **【模型与渠道降级调度流程通知】**
> - 原选模型/渠道：\`${initial}\`（遭遇 Google AI Studio 免费池尖峰排队）
> - 调度路径：${pathDisplay}
> - 最终交付渠道与模型：\`${current}\`（推演与生成成功）

`;
          } else if (res.site === "wave" || args.site === "wave") {
            notice = `> \uD83D\uDC65 **【Wave 虚拟外包工作室通知】**：本次波次已由 **Wave 并发波次引擎** 顺利派发至多 Tab 并发执行并解包完成。

`;
          } else if (res.site === "gemini" || args.site === "gemini") {
            notice = `> \uD83C\uDF10 **【执行渠道通知】**：本次任务已由 **Gemini 官网通道 (gemini.google.com)** 顺利执行完成。

`;
          } else if (res.site === "flow" || args.site === "flow") {
            notice = `> \uD83C\uDFA8 **【执行渠道通知】**：本次任务已由 **Google Flow (flow.google.com)** 顺利生成完成。

`;
          }
          let fileLinks = "";
          if (res.files && res.files.length > 0) {
            const linkItems = res.files.map((f) => {
              const base = path4.basename(f);
              const fileUrl = `file://${f}`;
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(base);
              if (isImg) {
                return `- [\uD83D\uDCC1 ${base}](${fileUrl})

  ![${base}](${fileUrl})`;
              }
              return `- [\uD83D\uDCC1 ${base}](${fileUrl})`;
            });
            fileLinks = `\uD83D\uDCC1 **成果文件已落地存档至本地工作区**：
` + linkItems.join(`
`) + `

`;
          }
          const instructionHeader = `【系统核心指令：请宿主 AI 在最终回复中务必完整呈现：
1. \uD83D\uDD04【模型降级调度流程通知】（若有降级）；
2. \uD83D\uDCC1【落地文件存档链接与图片预览】（必须原样保留 file:/// 绝对路径，严禁改为相对路径 downloads/，否则前端无法预览）；
3. \uD83D\uDCBB【核心架构说明与实现精华】（展示关键设计思路、核心类与使用方法。完整源码已落盘至上方工作区文件，引导用户直接点击文件链接查看完整源码，无需在回复中全量重抄超长代码，防止 SSE 串流中断）！】

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
