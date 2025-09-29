const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  clipboard,
  nativeTheme,
  Tray,
  Menu,
  screen,
  nativeImage,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const Store = require("electron-store");
const dayjs = require("dayjs");
require("dotenv").config();

const { AIProvider } = require("./ai-provider");

const store = new Store({ name: "settings" });
let tray, mainWindow;

function getUserDataDir() {
  return app.getPath("userData");
}

function getBaseDir() {
  const configured = store.get("baseDir");
  if (typeof configured === "string" && configured.length) return configured;
  return getUserDataDir();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function setBaseDir(dirPath) {
  try {
    ensureDir(dirPath);
    store.set("baseDir", dirPath);
    return true;
  } catch (e) {
    console.error("Failed to set base directory:", e);
    return false;
  }
}

function openBaseDir() {
  const dir = getBaseDir();
  ensureDir(dir);
  shell.openPath(dir);
}

function initializeBaseDir() {
  const existing = store.get("baseDir");
  if (typeof existing !== "string" || existing.length === 0) {
    setBaseDir(getUserDataDir());
  } else {
    ensureDir(existing);
  }
}

function entriesPathFor(dateStr) {
  const dir = path.join(getBaseDir(), "entries");
  ensureDir(dir);
  return path.join(dir, `entries-${dateStr}.json`);
}

function summariesPath() {
  const dir = path.join(getBaseDir(), "summaries");
  ensureDir(dir);
  return dir;
}

function loadEntries(dateStr) {
  const p = entriesPathFor(dateStr);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function saveEntry(text, ts = new Date().toISOString()) {
  const dateStr = dayjs(ts).format("YYYY-MM-DD");
  const p = entriesPathFor(dateStr);
  const current = loadEntries(dateStr);
  current.push({ ts, text });
  fs.writeFileSync(p, JSON.stringify(current, null, 2));
}

function saveSummary(dateStr, content) {
  const p = path.join(summariesPath(), `summary-${dateStr}.txt`);
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

function withinWorkHours() {
  // If WORK_HOURS_ONLY is not set to "true", always allow
  if (String(process.env.WORK_HOURS_ONLY).toLowerCase() !== "true") return true;

  const h = dayjs().hour();
  return h >= 9 && h < 17;
}

function createTray() {
  let iconPath =
    process.platform === "darwin"
      ? path.join(__dirname, "trayTemplate.png")
      : path.join(__dirname, "tray.png");
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
  if (process.platform === "darwin") {
    try {
      tray.setTitle("📝");
    } catch {}
  }
  const ctx = Menu.buildFromTemplate([
    { label: "Add update now", click: () => showInput() },
    { label: "Show today summary", click: () => showSummary() },
    { type: "separator" },
    {
      label: "Preferences",
      submenu: [
        {
          label: "Choose Data Folder…",
          click: async () => {
            const ret = await dialog.showOpenDialog({
              properties: ["openDirectory", "createDirectory"],
            });
            if (!ret.canceled && ret.filePaths && ret.filePaths[0]) {
              const ok = setBaseDir(ret.filePaths[0]);
              notify(
                "Data Folder",
                ok ? "Folder updated." : "Failed to update folder."
              );
            }
          },
        },
        { label: "Open Data Folder", click: () => openBaseDir() },
        {
          label: "Use Default Folder",
          click: () => {
            const ok = setBaseDir(getUserDataDir());
            notify(
              "Data Folder",
              ok ? "Using default folder." : "Failed to update folder."
            );
          },
        },
      ],
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setToolTip("Scrum Update Tracker");
  tray.on("click", () => showInput());
  tray.on("right-click", () => tray.popUpContextMenu(ctx));
  tray.on("context-menu", () => tray.popUpContextMenu(ctx));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 750,
    height: 520,
    show: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Scrum Update Tracker",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("blur", () => {
    mainWindow.hide();
  });
}

function positionNearTray(win) {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const { width: w, height: h } = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const { workArea } = display;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - w / 2);
  let y;

  if (process.platform === "darwin") {
    y = Math.round(trayBounds.y + trayBounds.height + 6);
  } else {
    y = Math.round(workArea.y + workArea.height - h - (trayBounds.height + 6));
  }

  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - w));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - h));

  win.setPosition(x, y, false);
}

function showInput() {
  // Recreate window if it doesn't exist or was destroyed
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    // Wait for new window to load
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send("mode", { mode: "input" });
      positionNearTray(mainWindow);
      mainWindow.show();
      mainWindow.focus();
    });
  } else if (mainWindow.webContents.isLoading()) {
    // Window exists but is still loading
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send("mode", { mode: "input" });
      positionNearTray(mainWindow);
      mainWindow.show();
      mainWindow.focus();
    });
  } else {
    // Window exists and is ready
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.webContents.send("mode", { mode: "input" });
    positionNearTray(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  }
}

function showSummary(content) {
  // Recreate window if it doesn't exist or was destroyed
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    // Wait for new window to load
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send("mode", { mode: "summary", content });
      positionNearTray(mainWindow);
      mainWindow.show();
      mainWindow.focus();
    });
  } else if (mainWindow.webContents.isLoading()) {
    // Window exists but is still loading
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send("mode", { mode: "summary", content });
      positionNearTray(mainWindow);
      mainWindow.show();
      mainWindow.focus();
    });
  } else {
    // Window exists and is ready
    mainWindow.webContents.send("mode", { mode: "summary", content });
    positionNearTray(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  }
}

function notify(title, body, onClick) {
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => onClick && onClick());
  n.show();
}

function scheduleJobs() {
  const intervalCron = process.env.PROMPT_INTERVAL_CRON || "*/20 * * * *";
  cron.schedule(intervalCron, () => {
    if (app.isReady() && withinWorkHours()) {
      notify(
        "Time for a quick update",
        "Jot down what you’re working on",
        showInput
      );
      showInput();
    }
  });

  const dailyCron = process.env.DAILY_SUMMARY_CRON || "0 17 * * 1-5";
  cron.schedule(
    dailyCron,
    async () => {
      try {
        const dateStr = dayjs().format("YYYY-MM-DD");
        const entries = loadEntries(dateStr);
        if (entries.length === 0) return;

        const summary = await AIProvider.summarize(entries);
        const filePath = saveSummary(dateStr, summary);
        clipboard.writeText(summary);
        notify(
          "Daily summary ready",
          "Copied to clipboard. Click to view.",
          () => showSummary(summary)
        );
        console.log("Summary saved at:", filePath);
      } catch (e) {
        console.error("Summary failed:", e);
        notify("Summary failed", "Check console/logs for details.");
      }
    },
    { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  );
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) app.dock.hide();
  nativeTheme.themeSource = "system";
  initializeBaseDir();
  createTray();
  createMainWindow();
  scheduleJobs();

  ipcMain.handle("save-entry", (_e, text) => {
    if (text && text.trim().length) saveEntry(text.trim());
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return true;
  });

  ipcMain.handle("get-today", () => {
    const dateStr = dayjs().format("YYYY-MM-DD");
    return loadEntries(dateStr);
  });

  ipcMain.handle("summarize-now", async () => {
    console.log("📋 Starting summarization...");
    const dateStr = dayjs().format("YYYY-MM-DD");
    const entries = loadEntries(dateStr);
    console.log("📊 Found entries for", dateStr, ":", entries.length);

    if (entries.length === 0) return "No entries for today.";

    console.log("🤖 Calling AI provider...");
    const summary = await AIProvider.summarize(entries);
    console.log("📝 AI summary received:", JSON.stringify(summary));
    console.log("📝 Summary length:", summary ? summary.length : 0);

    clipboard.writeText(summary);
    return summary;
  });

  ipcMain.handle("hide-input", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return true;
  });

  ipcMain.handle("get-all-summaries", () => {
    const summariesDir = summariesPath();
    if (!fs.existsSync(summariesDir)) return [];

    const files = fs
      .readdirSync(summariesDir)
      .filter((f) => f.startsWith("summary-") && f.endsWith(".txt"))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first

    return files.map((file) => {
      const dateStr = file.replace("summary-", "").replace(".txt", "");
      const content = fs.readFileSync(path.join(summariesDir, file), "utf-8");
      return {
        id: dateStr,
        date: dateStr,
        content: content,
        displayDate: dayjs(dateStr).format("MMM D, YYYY"),
      };
    });
  });

  ipcMain.handle("update-summary", (_e, dateStr, newContent) => {
    try {
      saveSummary(dateStr, newContent);
      return { success: true };
    } catch (error) {
      console.error("Failed to update summary:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("delete-summary", (_e, dateStr) => {
    try {
      const summaryPath = path.join(summariesPath(), `summary-${dateStr}.txt`);
      if (fs.existsSync(summaryPath)) {
        fs.unlinkSync(summaryPath);
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to delete summary:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-entries-by-date", () => {
    const entriesDir = path.join(getBaseDir(), "entries");
    const summariesDir = summariesPath();

    if (!fs.existsSync(entriesDir)) return {};

    const entryFiles = fs
      .readdirSync(entriesDir)
      .filter((f) => f.startsWith("entries-") && f.endsWith(".json"));

    const result = {};

    // Load entries for each date
    entryFiles.forEach((file) => {
      const dateStr = file.replace("entries-", "").replace(".json", "");
      const entries = loadEntries(dateStr);

      // Check if there's a summary for this date
      const summaryPath = path.join(summariesDir, `summary-${dateStr}.txt`);
      let summary = null;
      if (fs.existsSync(summaryPath)) {
        summary = fs.readFileSync(summaryPath, "utf-8");
      }

      result[dateStr] = {
        date: dateStr,
        displayDate: dayjs(dateStr).format("MMM D, YYYY"),
        entries: entries,
        summary: summary,
      };
    });

    return result;
  });

  ipcMain.handle("update-entry", (_e, dateStr, entryIndex, newText) => {
    try {
      const entries = loadEntries(dateStr);
      if (entryIndex >= 0 && entryIndex < entries.length) {
        entries[entryIndex].text = newText;
        const p = entriesPathFor(dateStr);
        fs.writeFileSync(p, JSON.stringify(entries, null, 2));
        return { success: true };
      }
      return { success: false, error: "Invalid entry index" };
    } catch (error) {
      console.error("Failed to update entry:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("delete-entry", (_e, dateStr, entryIndex) => {
    try {
      const entries = loadEntries(dateStr);
      if (entryIndex >= 0 && entryIndex < entries.length) {
        entries.splice(entryIndex, 1);
        const p = entriesPathFor(dateStr);
        fs.writeFileSync(p, JSON.stringify(entries, null, 2));
        return { success: true };
      }
      return { success: false, error: "Invalid entry index" };
    } catch (error) {
      console.error("Failed to delete entry:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("create-summary-for-date", async (_e, dateStr) => {
    try {
      const entries = loadEntries(dateStr);
      if (entries.length === 0) return null;

      console.log("🤖 Creating summary for", dateStr, "with", entries.length, "entries");
      const summary = await AIProvider.summarize(entries);
      console.log("📝 AI summary received for", dateStr);

      if (summary) {
        saveSummary(dateStr, summary);
        clipboard.writeText(summary);
        console.log("Summary saved and copied to clipboard");
      }

      return summary;
    } catch (error) {
      console.error("Failed to create summary for date:", error);
      throw error;
    }
  });

  // Show an input window on first launch so user sees it working
  setTimeout(() => {
    showInput();
  }, 500);

  app.on("activate", () => {
    /* tray app; nothing to do */
  });
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
