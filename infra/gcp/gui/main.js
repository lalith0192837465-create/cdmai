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

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 780,
    minWidth: 680,
    minHeight: 680,
    backgroundColor: "#0B0B0F",
    title: "CDM — Install on Google Cloud",
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
      message: "CDM is still deploying to your Google Cloud project.",
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

ipcMain.handle("cdm:pick-key", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Google Cloud Service Account JSON Key",
    properties: ["openFile"],
    filters: [{ name: "JSON Key", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      return { ok: false, error: "Selected JSON file is not a Google Cloud Service Account key." };
    }
    return {
      ok: true,
      fileName: path.basename(result.filePaths[0]),
      clientEmail: parsed.client_email,
      projectId: parsed.project_id || "",
      rawJson: raw,
    };
  } catch {
    return { ok: false, error: "Could not read JSON file." };
  }
});

ipcMain.handle("cdm:install", async (_event, config) => {
  if (child) return { ok: false, error: "Installation is already running." };

  const tempDir = app.getPath("userData");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, `deploy-${Date.now()}.json`);
  fs.writeFileSync(tempConfigPath, JSON.stringify(config), { mode: 0o600 });

  const bundledExe = path.join(process.resourcesPath, "gcp-cli.exe");
  const devScript = path.join(__dirname, "..", "gcp-cli.js");
  const useBundled = fs.existsSync(bundledExe);

  child = useBundled
    ? spawn(bundledExe, ["--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, CDM_GCP_NO_PAUSE: "1" },
      })
    : spawn(process.execPath, [devScript, "--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", CDM_GCP_NO_PAUSE: "1" },
      });

  let buffer = "";
  const parseChunk = (chunk) => {
    buffer += chunk.toString("utf8");
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("CDM_EVENT:")) {
        try { sendEvent({ kind: "progress", ...JSON.parse(line.slice(10)) }); } catch (_) {}
      } else if (line.startsWith("CDM_RESULT:")) {
        try { sendEvent({ kind: "result", ...JSON.parse(line.slice(11)) }); } catch (_) {}
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
  if (typeof url === "string" && url.startsWith("https://")) {
    await shell.openExternal(url);
  }
  return { ok: true };
});
