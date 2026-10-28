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

function parseAwsCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const values = lines[1].split(",").map((v) => v.replace(/^"|"$/g, "").trim());
  const idIdx = headers.findIndex((h) => h.includes("access key id") || h === "aws_access_key_id");
  const secIdx = headers.findIndex((h) => h.includes("secret access key") || h === "aws_secret_access_key");
  if (idIdx >= 0 && secIdx >= 0 && values[idIdx] && values[secIdx]) {
    return { accessKeyId: values[idIdx], secretAccessKey: values[secIdx] };
  }
  return null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 740,
    height: 800,
    minWidth: 680,
    minHeight: 700,
    backgroundColor: "#0B0B0F",
    title: "CDM — Install on AWS",
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
      message: "CDM is still deploying to your AWS account.",
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

ipcMain.handle("cdm:pick-csv", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Select AWS IAM Access Keys CSV",
    properties: ["openFile"],
    filters: [{ name: "CSV Credentials", extensions: ["csv"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf8");
    const parsed = parseAwsCsv(raw);
    if (!parsed) {
      return { ok: false, error: "Could not find AWS Access Key ID and Secret Access Key columns in that CSV file." };
    }
    return {
      ok: true,
      fileName: path.basename(result.filePaths[0]),
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
    };
  } catch {
    return { ok: false, error: "Could not read CSV file." };
  }
});

ipcMain.handle("cdm:install", async (_event, config) => {
  if (child) return { ok: false, error: "Installation is already running." };

  const tempDir = app.getPath("userData");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, `aws-deploy-${Date.now()}.json`);
  fs.writeFileSync(tempConfigPath, JSON.stringify(config), { mode: 0o600 });

  const bundledExe = path.join(process.resourcesPath, "aws-cli.exe");
  const devScript = path.join(__dirname, "..", "aws-cli.js");
  const useBundled = fs.existsSync(bundledExe);

  child = useBundled
    ? spawn(bundledExe, ["--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, CDM_AWS_NO_PAUSE: "1" },
      })
    : spawn(process.execPath, [devScript, "--deploy-json", tempConfigPath], {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", CDM_AWS_NO_PAUSE: "1" },
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
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    await shell.openExternal(url);
  }
  return { ok: true };
});
