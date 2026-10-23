"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cdm", {
  chooseFolder: () => ipcRenderer.invoke("setup:choose-folder"),
  start: () => ipcRenderer.invoke("setup:start"),
  answer: (id, value) => ipcRenderer.invoke("setup:answer", { id, value }),
  openLink: (url) => ipcRenderer.invoke("setup:open-link", url),
  cancel: () => ipcRenderer.invoke("setup:cancel"),
  onEvent: (callback) => { const handler = (_event, data) => callback(data); ipcRenderer.on("setup:event", handler); return () => ipcRenderer.removeListener("setup:event", handler); }
});
