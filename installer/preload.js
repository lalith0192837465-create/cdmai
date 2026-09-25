const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  checkDocker: () => ipcRenderer.invoke("check-docker"),
  installAndLaunch: (config) => ipcRenderer.invoke("install-and-launch", config),
  onStatus: (callback) => ipcRenderer.on("status", (_event, status) => callback(status)),
});
