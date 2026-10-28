"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let win = null;
let child = null;

function sendEvent(payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("cdm:event", payload);
  }
}

function parseServicePrincipalJson(text) {
  const j = JSON.parse(text.replace(/^\uFEFF/, ""));
  const subscriptionId = String(j.subscriptionId || j.subscription_id || "").trim();
  const tenantId = String(j.tenantId || j.tenant_id || j.tenant || "").trim();
  const clientId = String(j.clientId || j.client_id || j.appId || "").trim();
  const clientSecret = String(j.clientSecret || j.client_secret || j.password || "").trim();
  if (!clientId || !clientSecret || !tenantId) return null;
  return { subscriptionId, tenantId, clientId, clientSecret };
}

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 820,
    minWidth: 680,
    minHeight: 720,
    backgroundColor: "#0B0B0F",
    title: "CDM — Install on Azure",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("close", (event) => {
    if (!child) return;
    event.preventDefault();
    void dialog.showMessageBox(win, {
      type: "warning",
      title: "Deployment in progress",
      message: "CDM is still deploying to your Azure subscription.",
      detail: "Keep this window open until deployment completes.",
      buttons: ["Keep open"],
      defaultId: 0,
    });
  });

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("cdm:pick-sp-json", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Azure Service Principal JSON",
    properties: ["openFile"],
    filters: [{ name: "JSON Credentials", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf8");
    const parsed = parseServicePrincipalJson(raw);
    if (!parsed) {
      return {
        ok: false,
        error: "Could not find clientId/appId, clientSecret/password, and tenantId/tenant in that JSON file.",
      };
    }
    return {
      ok: true,
      fileName: path.basename(result.filePaths[0]),
      ...parsed,
    };
  } catch {
    return { ok: false, error: "Could not parse JSON credentials file." };
  }
});

ipcMain.handle("cdm:install", async (_event, config) => {
  if (child) return { ok: false, error: "Installation is already running." };

  const tempDir = app.getPath("userData");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, `azure-deploy-${Date.now()}.json`);
  fs.writeFileSync(tempConfigPath, JSON.stringify(config), { mode: 0o600 });

  const bundledExe = path.join(process.resourcesPath, "azure-cli.exe");
  const devScript = path.join(__dirname, "..", "azure-cli.js");
  const useBundled = fs.existsSync(bundledExe);

  child = useBundled
    ? spawn(bundledExe, ["--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, CDM_AZURE_NO_PAUSE: "1" },
      })
    : spawn(process.execPath, [devScript, "--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", CDM_AZURE_NO_PAUSE: "1" },
      });

  let buffer = "";
  const parseChunk = (chunk) => {
    buffer += chunk.toString("utf8");
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("CDM_EVENT:")) {
        try {
          sendEvent({ kind: "progress", ...JSON.parse(line.slice(10)) });
        } catch (_) {}
      } else if (line.startsWith("CDM_RESULT:")) {
        try {
          sendEvent({ kind: "result", ...JSON.parse(line.slice(11)) });
        } catch (_) {}
      } else if (line) {
        sendEvent({ kind: "progress", line });
      }
    }
  };

  child.stdout.on("data", parseChunk);
  child.stderr.on("data", parseChunk);
  child.on("close", (code) => {
    child = null;
    if (code !== 0) {
      sendEvent({ kind: "closed", code });
    }
  });

  return { ok: true };
});

ipcMain.handle("cdm:open-url", async (_event, url) => {
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    await shell.openExternal(url);
  }
  return { ok: true };
});
