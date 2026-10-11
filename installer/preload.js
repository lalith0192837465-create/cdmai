const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openCloudPackage: (target) => ipcRenderer.invoke("open-cloud-package", target),
  saveGcpPlan: (data) => ipcRenderer.invoke("save-gcp-plan", data),
  checkDocker: () => ipcRenderer.invoke("check-docker"),
  installAndLaunch: (config) => ipcRenderer.invoke("install-and-launch", config),
  onStatus: (callback) => ipcRenderer.on("status", (_event, status) => callback(status)),
});
