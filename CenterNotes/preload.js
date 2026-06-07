const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notesAPI", {
  list: () => ipcRenderer.invoke("notes:list"),
  create: () => ipcRenderer.invoke("notes:new"),
  load: (fileName) => ipcRenderer.invoke("notes:load", fileName),
  save: (fileName, html) => ipcRenderer.invoke("notes:save", fileName, html),
  backup: (fileName, html) => ipcRenderer.invoke("notes:backup", fileName, html),
  delete: (fileName) => ipcRenderer.invoke("notes:delete", fileName),
  pin: (fileName, pinned) => ipcRenderer.invoke("notes:pin", fileName, pinned),
  secret: (fileName, secret) => ipcRenderer.invoke("notes:secret", fileName, secret),
  toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  setWindowOpacity: (opacity) => ipcRenderer.invoke("window:set-opacity", opacity),
  setOpenNote: (fileName) => ipcRenderer.invoke("app:set-open-note", fileName),
  getOpenNote: () => ipcRenderer.invoke("app:get-open-note"),
  closeApp: () => ipcRenderer.invoke("app:close"),
  path: () => ipcRenderer.invoke("notes:path")
});
