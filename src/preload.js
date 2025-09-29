const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true
});

contextBridge.exposeInMainWorld('scrum', {
  saveEntry: (text) => ipcRenderer.invoke('save-entry', text),
  getToday: () => ipcRenderer.invoke('get-today'),
  summarizeNow: () => ipcRenderer.invoke('summarize-now'),
  hideWindow: () => ipcRenderer.invoke('hide-input'),
  onMode: (cb) => ipcRenderer.on('mode', (_e, payload) => cb(payload)),
  getAllSummaries: () => ipcRenderer.invoke('get-all-summaries'),
  updateSummary: (dateStr, newContent) => ipcRenderer.invoke('update-summary', dateStr, newContent),
  deleteSummary: (dateStr) => ipcRenderer.invoke('delete-summary', dateStr),
  getEntriesByDate: () => ipcRenderer.invoke('get-entries-by-date'),
  updateEntry: (dateStr, entryIndex, newText) => ipcRenderer.invoke('update-entry', dateStr, entryIndex, newText),
  deleteEntry: (dateStr, entryIndex) => ipcRenderer.invoke('delete-entry', dateStr, entryIndex),
  // Expose marked for markdown parsing
  parseMarkdown: (text) => marked.parse(text)
});

