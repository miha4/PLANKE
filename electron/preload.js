const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  getConfig: () => ipcRenderer.invoke('app-config:get'),
  setConfig: (config) => ipcRenderer.invoke('app-config:set', config),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
});
