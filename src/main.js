const { app, BrowserWindow, ipcMain, Notification, clipboard, nativeTheme, Tray, Menu, screen, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const Store = require('electron-store');
const dayjs = require('dayjs');
require('dotenv').config();

const { summarizeWithAzure } = require('./azure');

const store = new Store({ name: 'settings' });
let tray, mainWindow;

function getUserDataDir() {
  return app.getPath('userData');
}

function getBaseDir() {
  const configured = store.get('baseDir');
  if (typeof configured === 'string' && configured.length) return configured;
  return getUserDataDir();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function setBaseDir(dirPath) {
  try {
    ensureDir(dirPath);
    store.set('baseDir', dirPath);
    return true;
  } catch (e) {
    console.error('Failed to set base directory:', e);
    return false;
  }
}

function openBaseDir() {
  const dir = getBaseDir();
  ensureDir(dir);
  shell.openPath(dir);
}

function initializeBaseDir() {
  const existing = store.get('baseDir');
  if (typeof existing !== 'string' || existing.length === 0) {
    setBaseDir(getUserDataDir());
  } else {
    ensureDir(existing);
  }
}

function entriesPathFor(dateStr) {
  const dir = path.join(getBaseDir(), 'entries');
  ensureDir(dir);
  return path.join(dir, `entries-${dateStr}.json`);
}

function summariesPath() {
  const dir = path.join(getBaseDir(), 'summaries');
  ensureDir(dir);
  return dir;
}

function loadEntries(dateStr) {
  const p = entriesPathFor(dateStr);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function saveEntry(text, ts = new Date().toISOString()) {
  const dateStr = dayjs(ts).format('YYYY-MM-DD');
  const p = entriesPathFor(dateStr);
  const current = loadEntries(dateStr);
  current.push({ ts, text });
  fs.writeFileSync(p, JSON.stringify(current, null, 2));
}

function saveSummary(dateStr, content) {
  const p = path.join(summariesPath(), `summary-${dateStr}.txt`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function withinWorkHours() {
  if (String(process.env.WORK_HOURS_ONLY).toLowerCase() !== 'true') return true;
  const h = dayjs().hour();
  return h >= 9 && h < 17;
}

function createTray() {
  let iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'trayTemplate.png')
    : path.join(__dirname, 'tray.png');
  let image;
  try {
    if (fs.existsSync(iconPath)) {
      image = nativeImage.createFromPath(iconPath);
    } else {
      image = nativeImage.createEmpty();
    }
  } catch {
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  if (process.platform === 'darwin') {
    try { tray.setTitle('📝'); } catch {}
  }
  const ctx = Menu.buildFromTemplate([
    { label: 'Add update now', click: () => showInput() },
    { label: 'Show today summary', click: () => showSummary() },
    { type: 'separator' },
    {
      label: 'Preferences',
      submenu: [
        {
          label: 'Choose Data Folder…',
          click: async () => {
            const ret = await dialog.showOpenDialog({
              properties: ['openDirectory', 'createDirectory']
            });
            if (!ret.canceled && ret.filePaths && ret.filePaths[0]) {
              const ok = setBaseDir(ret.filePaths[0]);
              notify('Data Folder', ok ? 'Folder updated.' : 'Failed to update folder.');
            }
          }
        },
        { label: 'Open Data Folder', click: () => openBaseDir() },
        {
          label: 'Use Default Folder',
          click: () => {
            const ok = setBaseDir(getUserDataDir());
            notify('Data Folder', ok ? 'Using default folder.' : 'Failed to update folder.');
          }
        }
      ]
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]);
  tray.setToolTip('Scrum Update Tracker');
  tray.on('click', () => showInput());
  tray.on('right-click', () => tray.popUpContextMenu(ctx));
  tray.on('context-menu', () => tray.popUpContextMenu(ctx));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 520,
    show: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Scrum Update Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function positionNearTray(win) {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const { width: w, height: h } = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const { workArea } = display;

  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (w / 2));
  let y;

  if (process.platform === 'darwin') {
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  } else {
    y = Math.round(workArea.y + workArea.height - h - (trayBounds.height + 6));
  }

  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - w));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - h));

  win.setPosition(x, y, false);
}

function showInput() {
  if (!withinWorkHours()) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  mainWindow.webContents.send('mode', { mode: 'input' });
  positionNearTray(mainWindow);
  mainWindow.show();
  mainWindow.focus();
}

function showSummary(content) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  mainWindow.webContents.send('mode', { mode: 'summary', content });
  positionNearTray(mainWindow);
  mainWindow.show();
  mainWindow.focus();
}

function notify(title, body, onClick) {
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => onClick && onClick());
  n.show();
}

function scheduleJobs() {
  const intervalCron = process.env.PROMPT_INTERVAL_CRON || '*/20 * * * *';
  cron.schedule(intervalCron, () => {
    if (app.isReady() && withinWorkHours()) {
      notify('Time for a quick update', 'Jot down what you’re working on', showInput);
      showInput();
    }
  });

  const dailyCron = process.env.DAILY_SUMMARY_CRON || '0 17 * * 1-5';
  cron.schedule(dailyCron, async () => {
    try {
      const dateStr = dayjs().format('YYYY-MM-DD');
      const entries = loadEntries(dateStr);
      if (entries.length === 0) return;

      const summary = await summarizeWithAzure(entries);
      const filePath = saveSummary(dateStr, summary);
      clipboard.writeText(summary);
      notify('Daily summary ready', 'Copied to clipboard. Click to view.', () => showSummary(summary));
      console.log('Summary saved at:', filePath);
    } catch (e) {
      console.error('Summary failed:', e);
      notify('Summary failed', 'Check console/logs for details.');
    }
  }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  nativeTheme.themeSource = 'system';
  initializeBaseDir();
  createTray();
  createMainWindow();
  scheduleJobs();

  ipcMain.handle('save-entry', (_e, text) => {
    if (text && text.trim().length) saveEntry(text.trim());
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return true;
  });

  ipcMain.handle('get-today', () => {
    const dateStr = dayjs().format('YYYY-MM-DD');
    return loadEntries(dateStr);
  });

  ipcMain.handle('summarize-now', async () => {
    const dateStr = dayjs().format('YYYY-MM-DD');
    const entries = loadEntries(dateStr);
    if (entries.length === 0) return 'No entries for today.';
    const summary = await summarizeWithAzure(entries);
    clipboard.writeText(summary);
    return summary;
  });

  ipcMain.handle('hide-input', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return true;
  });

  // Show an input window on first launch so user sees it working
  setTimeout(() => {
    showInput();
  }, 500);

  app.on('activate', () => { /* tray app; nothing to do */ });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

