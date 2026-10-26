"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cdm", {
  pickKey: () => ipcRenderer.invoke("cdm:pick-key"),
  install: (config) => ipcRenderer.invoke("cdm:install", config),
  openUrl: (url) => ipcRenderer.invoke("cdm:open-url", url),
  onEvent: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("cdm:event", handler);
    return () => ipcRenderer.removeListener("cdm:event", handler);
  },
});
