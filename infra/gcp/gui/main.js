"use strict";
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
let win = null;
let child = null;
let outputDirectory = "";
let nextPromptId = 0;
let promptQueue = Promise.resolve();
let applying = false;
let stopping = false;
const prompts = new Map();
function send(type, data = {}) {
  if (win && !win.isDestroyed()) win.webContents.send("setup:event", { type, ...data });
}
function createWindow() {
  win = new BrowserWindow({
    width: 940, height: 760, minWidth: 760, minHeight: 620,
    backgroundColor: "#f4f7fb", title: "CDM Google Cloud Setup", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("close", (event) => {
    if (!child) return;
    if (applying) {
      event.preventDefault();
      void dialog.showMessageBox(win, {
        type: "warning", title: "Deployment is running",
        message: "Keep this setup window open while Terraform applies the reviewed plan.",
        detail: "Closing it now could interrupt changes to your Google Cloud project.", buttons: ["Keep setup open"], defaultId: 0
      });
      return;
    }
    event.preventDefault();
    void dialog.showMessageBox(win, {
      type: "warning", title: "Stop setup?",
      message: "The setup process is still running.",
      detail: "Stopping before the final APPLY step will not start a cloud deployment. Any local setup files already created will remain for review.",
      buttons: ["Continue setup", "Stop setup"], defaultId: 0, cancelId: 0
    }).then(({ response }) => {
      if (response === 1) stopSetup();
    });
  });
  win.on("closed", () => { win = null; });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
function parsePrompt(raw) {
  const text = raw.trim();
  if (!text.endsWith(":")) return null;
  const match = text.match(/^(.*?)(?:\s+\[([^\]]*)\])?\s*:\s*$/);
  if (!match) return null;
  const label = match[1].trim();
  if (!label || label.length > 220) return null;
  const secret = /secret|password|api key|client id|client secret/i.test(label);
  const kind = /^Type PLAN\b/i.test(label) ? "plan" : /^Type APPLY\b/i.test(label) ? "apply" : "input";
  return { label, defaultValue: match[2] || "", secret, kind };
}
function issuePrompt(prompt) {
  promptQueue = promptQueue.then(() => new Promise((resolve) => {
    const id = ++nextPromptId;
    prompts.set(id, { resolve: () => { prompts.delete(id); resolve(); } });
    send("prompt", { id, ...prompt });
  }));
}
function startCli() {
  const executable = path.join(process.resourcesPath, "gcp-cli.exe");
  child = spawn(executable, [], {
    cwd: outputDirectory, windowsHide: true, shell: false,
    env: { ...process.env, CDM_GCP_GUI: "1", CDM_GCP_NO_PAUSE: "1" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  stopping = false;
  send("status", { text: "Starting the setup check…" });
  const pending = { out: "", err: "" };
  const consume = (chunk, stream) => {
    pending[stream] += chunk.toString("utf8").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
    let newline;
    while ((newline = pending[stream].indexOf("\n")) >= 0) {
      const line = pending[stream].slice(0, newline).replace(/\r$/, "");
      pending[stream] = pending[stream].slice(newline + 1);
      const prompt = parsePrompt(line);
      if (prompt) issuePrompt(prompt);
      else if (line) send("log", { text: line, stream });
    }
    const prompt = stream === "out" ? parsePrompt(pending.out) : null;
    if (prompt) { pending.out = ""; issuePrompt(prompt); }
    else if (pending[stream].length > 8000) {
      send("log", { text: pending[stream].slice(0, 8000), stream });
      pending[stream] = pending[stream].slice(8000);
    }
  };
  child.stdout.on("data", (chunk) => consume(chunk, "out"));
  child.stderr.on("data", (chunk) => consume(chunk, "err"));
  let spawnError = null;
  child.on("error", (error) => { spawnError = error; send("fatal", { text: `Could not start the setup tool: ${error.message}` }); });
  child.on("close", (code) => {
    const wasStopping = stopping;
    for (const stream of ["out", "err"]) if (pending[stream].trim()) send("log", { text: pending[stream].trim(), stream });
    for (const prompt of prompts.values()) prompt.resolve();
    prompts.clear();
    child = null;
    applying = false;
    stopping = false;
    send("finished", {
      code: wasStopping ? 130 : (spawnError ? 1 : code),
      text: wasStopping ? "Setup stopped. No final apply was started." : spawnError ? "The setup engine could not start. Re-download the installer or contact your administrator." : code === 0 ? "Setup finished." : "Setup stopped. Review the message above; no automatic apply was performed."
    });
  });
}
function stopSetup() {
  if (!child || applying) return false;
  stopping = true;
  const pid = child.pid;
  try { child.kill(); } catch (_) {}
  if (process.platform === "win32" && pid) {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
  }
  return true;
}
ipcMain.handle("setup:choose-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Choose where CDM should create the local setup folder",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  outputDirectory = result.filePaths[0];
  send("folder", { path: outputDirectory });
  return { path: outputDirectory };
});
ipcMain.handle("setup:start", async () => {
  if (child) return { ok: false, error: "Setup is already running." };
  if (!outputDirectory) return { ok: false, error: "Choose a folder first." };
  startCli();
  return { ok: true };
});
ipcMain.handle("setup:answer", (_event, { id, value }) => {
  if (!child || !prompts.has(id)) return { ok: false };
  const prompt = prompts.get(id);
  const answer = String(value ?? "");
  if (prompt.kind === "apply") {
    const required = prompt.label.match(/^Type (APPLY \S+) to apply exactly the plan/);
    if (!required || answer !== required[1]) return { ok: false, error: "The project-specific confirmation did not match." };
    applying = true;
    send("applying", {});
  }
  child.stdin.write(answer + "\n");
  prompt.resolve();
  return { ok: true };
});
ipcMain.handle("setup:open-link", async (_event, url) => {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "https:" || !["developer.hashicorp.com", "releases.hashicorp.com", "checkpoint-api.hashicorp.com", "dl.google.com", "cloud.google.com"].includes(parsed.hostname)) return { ok: false };
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch (_) { return { ok: false }; }
});
ipcMain.handle("setup:cancel", () => ({ ok: stopSetup() }));
