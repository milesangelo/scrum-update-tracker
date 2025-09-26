const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const systemPrompt = `You are helping prepare daily scrum updates.

Given a chronological list of short work notes for a single day:
- If a work note contains a ticket number, fetch the ticket details from Jira and use the description to add more context to the work note.
- Collapse redundancy and cluster by topic.
- Produce 3-6 concise bullets focused on outcomes, shipped work, blockers, and next steps.
- Prefer clear, non-verbose language suitable for a standup update.
- If there are blockers, include them.
- If work spans multiple items, group them sensibly.
Return only the bullets, prefixed with "- ".`;

async function checkClaudeCodeInstalled() {
  return new Promise((resolve) => {
    exec("claude --version", (error) => {
      resolve(!error);
    });
  });
}

async function summarizeWithClaudeCode(entries) {
  // Check if Claude Code is installed
  const isInstalled = await checkClaudeCodeInstalled();
  if (!isInstalled) {
    return "Claude Code CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code";
  }

  const notes = entries
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    .map((e) => `- [${new Date(e.ts).toLocaleTimeString()}] ${e.text}`)
    .join("\n");

  const fullPrompt = `${systemPrompt}

Work notes for today:
${notes}`;

  return new Promise((resolve, reject) => {
    // Use spawn instead of exec for better handling of stdin
    const { spawn } = require("child_process");

    console.log("🚀 Executing Claude Code with stdin input");

    // Use spawn with stdin pipe
    const claudeProcess = spawn("claude", ["--print"], {
      shell: true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    // Capture stdout
    claudeProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    // Capture stderr
    claudeProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    claudeProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("❌ Claude Code exited with code:", code);
        console.error("  - Stderr:", stderr);
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        return;
      }

      const result = stdout.trim();
      console.log("✅ Claude Code completed successfully");
      console.log(result);
      resolve(result);
    });

    // Handle process errors
    claudeProcess.on("error", (error) => {
      console.error("❌ Process error occurred:");
      console.error("  - Error:", error.message);
      reject(new Error(`Failed to start Claude Code: ${error.message}`));
    });

    // Write the prompt to stdin and close it
    claudeProcess.stdin.write(fullPrompt);
    claudeProcess.stdin.end();
  });
}

module.exports = { summarizeWithClaudeCode, checkClaudeCodeInstalled };
