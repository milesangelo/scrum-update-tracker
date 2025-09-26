const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scrum', {
  saveEntry: (text) => ipcRenderer.invoke('save-entry', text),
  getToday: () => ipcRenderer.invoke('get-today'),
  summarizeNow: () => ipcRenderer.invoke('summarize-now'),
  hideWindow: () => ipcRenderer.invoke('hide-input'),
  onMode: (cb) => ipcRenderer.on('mode', (_e, payload) => cb(payload))
});

