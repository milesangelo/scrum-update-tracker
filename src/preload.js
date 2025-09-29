const { contextBridge, ipcRenderer } = require('electron');

// Simple markdown parser function (basic implementation)
function simpleMarkdownParse(text) {
  if (!text) return '';

  return text
    // Headers
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Line breaks
    .replace(/\n/g, '<br>')
    // Lists (basic)
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
}

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
  parseMarkdown: (text) => simpleMarkdownParse(text)
});

