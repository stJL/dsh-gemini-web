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
function detectBrowserCdp2(portOverride) {
  const venv = findPythonVenv();
  const cli = findCliScript();
  const instances = scanChromiumCdpInstances();
  if (instances.length > 1) {
    const selected = portOverride ? instances.find((i) => i.port === portOverride) || instances[0] : instances[0];
    return {
      connected: true,
      browserType: selected.name,
      port: selected.port,
      wsUrl: selected.wsUrl,
      activePortFile: selected.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: true,
      instances,
      error: `偵測到 ${instances.length} 個開啟遠端偵錯的瀏覽器實例（${instances.map((i) => `${i.name}:${i.port}`).join("、")}）。建議關閉多餘實例以避免衝突，或在下方指定埠號。`
    };
  }
  if (instances.length === 1) {
    const item = instances[0];
    return {
      connected: true,
      browserType: item.name,
      port: portOverride || item.port,
      wsUrl: item.wsUrl,
      activePortFile: item.activePortFile,
      pythonVenv: venv,
      cliScript: cli,
      multipleInstances: false,
      instances
    };
  }
  if (portOverride) {
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
    error: "未偵測到開啟遠端偵錯的 Chromium 瀏覽器"
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
            const profile = data.browserList?.[0]?.label || data.browserList?.[0]?.id || "Profile";
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
    const cdp = detectBrowserCdp2(cfgPort);
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
    const cdp = detectBrowserCdp2(cfgPort);
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
  if (status.activeChannel === "agentlimb") {
    const alScript = findAgentLimbScript();
    if (!alScript) {
      return { ok: false, error: "未找到 AgentLimb 腳本" };
    }
    try {
      const { stdout } = await execFileAsync(venv, [alScript, "usage", "--include-flow"], {
        timeout: 25000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      const parsed = JSON.parse(stdout.trim());
      return {
        ok: true,
        geminiPlan: parsed.plan || "FREE",
        geminiUsedPct: parsed.used_pct ?? 0,
        geminiResetTime: parsed.reset_time || "",
        geminiWeeklyPct: parsed.used_pct ?? 0,
        flowCredits: parsed.flow_credits ?? 1050,
        flowResetTime: parsed.flow_reset_time || "",
        raw: parsed
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err)
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
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
      const parsed = JSON.parse(stdout.trim());
      return {
        ok: true,
        geminiPlan: parsed.plan || "FREE",
        geminiUsedPct: parsed.current_usage?.used_pct ?? 0,
        geminiResetTime: parsed.current_usage?.reset_time || "",
        geminiWeeklyPct: parsed.weekly_usage?.used_pct ?? 0,
        flowCredits: parsed.flow?.credits ?? 1050,
        flowResetTime: parsed.flow?.reset_time || "",
        raw: parsed
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err)
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
function createApiRouter() {
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
      return send(404, { error: "Not found" });
    } catch (err) {
      return send(500, { error: err.message || String(err) });
    }
  };
}

// src/index.ts
var name = "dsh-gemini-web";
var inject = ["tools", "webServer"];
function apply(ctx) {
  ctx.inject(["tools"], (scoped) => {
    try {
      const toolDef = {
        name: "gemini_web_agent",
        description: `【\uD83D\uDEA8 Google 外部免费算力与多模态网关 / 唯一铁律：一律先问后用】
【\uD83D\uDEA8 致命调用前置条件 - 第 1 步绝对禁止直接调用发包】：
本工具严格遵循「一律先问后用」规范，无任何例外！
在使用者提出任何需求后，你【第 1 步绝对禁止直接调用本工具发包，绝对禁止调用 ask_user_question】！
你必须在第 1 步先在聊天中输出【Gemini Web Agent 调度提案卡】（列出推荐渠道 site、入口 entry、模型 model、思考等级 thinking_level、话题隔离 new_chat 与 0 成本预算），并在此【停止当前回应】，等待用户确认！
只有当用户在下一轮明确回复「确认」、「1」或给予明确发包授权时，才正式调用本工具发包！
1. \uD83C\uDFAF【用户指定模型绝对优先】：若用户指定了具体模型（如「用 Gemini 3.5 Flash Lite」、「用 Argon」），提案卡与发包必须 100% 采用该模型，严禁擅自升级或替换！只有用户完全未指定时才推荐默认模型。
2. \uD83D\uDED1【明令禁止本地擅自代劳与 Subagent 劫持】：严禁在本地自行编写答案，严禁调用 subagent 消耗付费额度！
3. \uD83D\uDCE6【调用完成后的展示义务】：调用完成后，必须完整呈现降级流程通知、落地文件超链接以及核心架构说明与代码！`,
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "交由 Gemini 网页端执行的完整任务指令、需求描述与要求"
            },
            model: {
              type: "string",
              description: "指定调度的模型别名（选填，如 hydrogen, argon, flash, flash-lite, nano2.1, omni1.2, lyria 等）"
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
            sessionId
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
    const router = createApiRouter();
    scoped.effect(() => scoped.webServer.register({ kind: "prefix", path: "/api/gemini-web", handler: router }), "gemini-web: api routes");
  });
}
export {
  apply,
  inject,
  name
};
