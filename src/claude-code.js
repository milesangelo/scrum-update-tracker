const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { systemPrompt } = require("./ai-config");

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
    const { spawn } = require("child_process");

    console.log("🚀 Executing Claude Code with spawn and stdin");

    // Use spawn with proper stdio handling and ensure proper environment
    const claudeProcess = spawn("claude", ["--print"], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      cwd: process.cwd(), // Ensure we're in the right directory
      env: { ...process.env }, // Pass through all environment variables
    });

    let stdout = "";
    let stderr = "";

    // Set up timeout
    const timeout = setTimeout(() => {
      console.log("⏰ Claude Code process timed out");
      claudeProcess.kill('SIGTERM');
      reject(new Error("Claude Code process timed out after 120 seconds"));
    }, 120000);

    // Capture stdout
    claudeProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("📥 Received stdout chunk:", data.toString().substring(0, 100));
    });

    // Capture stderr
    claudeProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      console.log("📥 Received stderr chunk:", data.toString());
    });

    // Handle process completion
    claudeProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        console.error("❌ Claude Code exited with code:", code);
        console.error("  - Stderr:", stderr);
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        return;
      }

      const result = stdout.trim();
      console.log("✅ Claude Code completed successfully");
      resolve(result);
    });

    // Handle process errors
    claudeProcess.on("error", (error) => {
      clearTimeout(timeout);
      console.error("❌ Process error occurred:", error.message);
      reject(new Error(`Failed to start Claude Code: ${error.message}`));
    });

    // Write the prompt to stdin and close it
    console.log("✍️ Writing prompt to stdin...");
    claudeProcess.stdin.write(fullPrompt);
    claudeProcess.stdin.end();
    console.log("✍️ Prompt written, stdin closed");
  });
}

module.exports = { summarizeWithClaudeCode, checkClaudeCodeInstalled };
