const { contextBridge, ipcRenderer } = require('electron')
// Expose desktop metadata, window hiding and a directory picker; configuration uses the restricted local API.
contextBridge.exposeInMainWorld(
  'claudeGuardDesktop',
  Object.freeze({
    platform: process.platform,
    chooseProject: () => ipcRenderer.invoke('cg:choose-project'),
    hideWindow: () => ipcRenderer.invoke('cg:hide-window'),
    electronVersion: process.versions.electron,
  }),
)
