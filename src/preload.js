const { contextBridge, ipcRenderer } = require('electron');

// Enhanced markdown parser function
function simpleMarkdownParse(text) {
  if (!text) return '';

  // Split into lines for better processing
  let lines = text.split('\n');
  let result = [];
  let inList = false;
  let listLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headers
    if (line.startsWith('## ')) {
      if (inList) {
        result.push('</ul>');
        inList = false;
        listLevel = 0;
      }
      result.push(`<h2>${line.substring(3)}</h2>`);
    }
    else if (line.startsWith('# ')) {
      if (inList) {
        result.push('</ul>');
        inList = false;
        listLevel = 0;
      }
      result.push(`<h1>${line.substring(2)}</h1>`);
    }
    // List items
    else if (line.match(/^(\s*)[-*] (.+)$/)) {
      const match = line.match(/^(\s*)[-*] (.+)$/);
      const indentLevel = Math.floor(match[1].length / 2);
      const content = match[2];

      // Handle bold formatting within list items
      const formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      if (!inList) {
        result.push('<ul>');
        inList = true;
        listLevel = indentLevel;
      } else if (indentLevel > listLevel) {
        result.push('<ul>');
        listLevel = indentLevel;
      } else if (indentLevel < listLevel) {
        result.push('</ul>');
        listLevel = indentLevel;
      }

      result.push(`<li>${formattedContent}</li>`);
    }
    // Empty lines
    else if (line.trim() === '') {
      if (inList) {
        // Keep list open for potential continuation
        continue;
      }
      result.push('<br>');
    }
    // Regular text
    else {
      if (inList) {
        result.push('</ul>');
        inList = false;
        listLevel = 0;
      }
      // Handle bold formatting
      const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      result.push(`<p>${formattedLine}</p>`);
    }
  }

  // Close any open lists
  if (inList) {
    result.push('</ul>');
  }

  return result.join('');
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
  createSummaryForDate: (dateStr) => ipcRenderer.invoke('create-summary-for-date', dateStr),
  parseMarkdown: (text) => simpleMarkdownParse(text)
});

