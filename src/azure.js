const systemPrompt = `
You are helping prepare daily scrum updates.

Given a chronological list of short work notes for a single day:
- Collapse redundancy and cluster by topic.
- Produce 3-6 concise bullets focused on outcomes, shipped work, blockers, and next steps.
- Prefer clear, non-verbose language suitable for a standup update.
- If there are blockers, include them.
- If work spans multiple items, group them sensibly.
Return only the bullets, prefixed with "- ".
`;

async function summarizeWithAzure(entries) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

  if (!endpoint || !apiKey || !deployment) {
    return 'Azure OpenAI not configured. Set AZURE_OPENAI_* env vars to enable summarization.';
  }

  const notes = entries
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    .map(e => `- [${new Date(e.ts).toLocaleTimeString()}] ${e.text}`)
    .join('\n');

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: notes }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return `Azure OpenAI error ${res.status}: ${txt}`;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  return content || 'No summary produced.';
}

module.exports = { summarizeWithAzure };

