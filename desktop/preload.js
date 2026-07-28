const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
  getPanelOpacity: () => ipcRenderer.invoke('get-panel-opacity'),
  setPanelOpacity: (value) => ipcRenderer.send('set-panel-opacity', value),
});
