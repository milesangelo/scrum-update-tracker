const { summarizeWithAzure } = require('./azure');
const { summarizeWithClaudeCode } = require('./claude-code');
const Store = require('electron-store');

const store = new Store();

class AIProvider {
  static async summarize(entries) {
    const provider = store.get('aiProvider', process.env.AI_PROVIDER || 'azure');

    switch (provider) {
      case 'azure':
        return await summarizeWithAzure(entries);
      case 'claude-code':
        return await summarizeWithClaudeCode(entries);
      default:
        return 'No AI provider configured. Please select an AI provider in preferences.';
    }
  }

  static getAvailableProviders() {
    const providers = [];

    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
      providers.push({ id: 'azure', name: 'Azure OpenAI', configured: true });
    } else {
      providers.push({ id: 'azure', name: 'Azure OpenAI', configured: false });
    }

    if (process.env.CLAUDE_CODE_API_KEY) {
      providers.push({ id: 'claude-code', name: 'Claude Code', configured: true });
    } else {
      providers.push({ id: 'claude-code', name: 'Claude Code', configured: false });
    }

    return providers;
  }

  static getCurrentProvider() {
    return store.get('aiProvider', process.env.AI_PROVIDER || 'azure');
  }

  static setProvider(providerId) {
    const providers = AIProvider.getAvailableProviders();
    const provider = providers.find(p => p.id === providerId);

    if (provider && provider.configured) {
      store.set('aiProvider', providerId);
      return true;
    }
    return false;
  }
}

module.exports = { AIProvider };