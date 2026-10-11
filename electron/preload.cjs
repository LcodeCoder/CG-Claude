const { contextBridge, ipcRenderer } = require('electron')
// Expose desktop metadata, window hiding and a directory picker; configuration uses the restricted local API.
contextBridge.exposeInMainWorld(
  'claudeGuardDesktop',
  Object.freeze({
    platform: process.platform,
    syncAppearance: (settings) => ipcRenderer.invoke('cg:appearance', settings),
    chooseProject: () => ipcRenderer.invoke('cg:choose-project'),
    openStartupSettings: () => ipcRenderer.invoke('cg:startup:settings'),
    getStartup: () => ipcRenderer.invoke('cg:startup:get'),
    setStartup: (enabled) => ipcRenderer.invoke('cg:startup:set', enabled),
    hideWindow: () => ipcRenderer.invoke('cg:hide-window'),
    electronVersion: process.versions.electron,
  }),
)
