const { contextBridge, ipcRenderer } = require('electron')
// Expose desktop metadata and a directory picker; configuration uses the restricted local API.
contextBridge.exposeInMainWorld(
  'claudeGuardDesktop',
  Object.freeze({
    platform: process.platform,
    chooseProject: () => ipcRenderer.invoke('cg:choose-project'),
    electronVersion: process.versions.electron,
  }),
)
