# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Development**: `npm run dev` - Start the Electron app in development mode
- **Package**: `npm run package` - Build distributables for macOS, Windows, and Linux using electron-builder

## Architecture Overview

This is a cross-platform Electron desktop app that runs in the system tray to track periodic work updates and generate daily summaries using Azure OpenAI.

### Core Components

- **Main Process** (`src/main.js`):
  - Electron main process handling system tray, windows, cron scheduling, and file operations
  - Manages two window types: input window for quick updates and summary window for viewing daily summaries
  - Uses electron-store for persistent settings and file system for storing entries/summaries
  - Schedules periodic prompts and daily summarization via node-cron

- **Azure Integration** (`src/azure.js`):
  - Handles Azure OpenAI API calls for summarizing daily entries
  - Requires environment variables: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`
  - Uses specialized system prompt to format summaries for scrum updates

- **Renderer Process** (`src/renderer/index.html`):
  - Single HTML file handling both input and summary modes
  - Uses IPC communication with main process via preload script
  - Responsive dark/light theme support

- **Preload Script** (`src/preload.js`):
  - Secure bridge between renderer and main process using contextBridge
  - Exposes scrum API for saving entries, getting today's entries, and summarization

### Data Storage

- User data stored in platform-specific directories via `app.getPath('userData')`
- Daily entries: `entries/entries-YYYY-MM-DD.json` (chronological array of timestamped updates)
- Summaries: `summaries/summary-YYYY-MM-DD.txt` (AI-generated daily summaries)

### Configuration

Environment variables control behavior:
- `WORK_HOURS_ONLY=true`: Restricts prompts to 9am-5pm
- `PROMPT_INTERVAL_CRON`: Cron schedule for update prompts (default: every 20 minutes)
- `DAILY_SUMMARY_CRON`: Cron schedule for daily summaries (default: 5pm weekdays)
- Azure OpenAI configuration variables for summarization

### Key Features

- System tray integration with context menu and click handlers
- Automatic positioning of windows near system tray
- Cron-based scheduling for prompts and summaries
- Keyboard shortcuts (Enter to save, Shift+Enter for newline)
- Cross-platform notification system
- Automatic clipboard copying of summaries