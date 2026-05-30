const DEEPSEEK_URL  = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ── Non-streaming call ────────────────────────────────────────────────────────

export async function runDeepSeekChat({ apiKey, messages, model = DEFAULT_MODEL }) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: false })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DeepSeek error ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

// ── Streaming call — async generator yielding content tokens ─────────────────
// Usage:
//   for await (const chunk of runDeepSeekStream({ apiKey, messages })) {
//     if (chunk.done) break;
//     process.stdout.write(chunk.content);
//   }

export async function* runDeepSeekStream({ apiKey, messages, model = DEFAULT_MODEL }) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DeepSeek stream error ${response.status}: ${body.slice(0, 200)}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') { yield { done: true }; continue; }
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json   = JSON.parse(trimmed.slice(6));
        const delta  = json.choices?.[0]?.delta;
        const finish = json.choices?.[0]?.finish_reason;
        if (delta?.content) yield { done: false, content: delta.content };
        if (finish === 'stop') yield { done: true, usage: json.usage };
      } catch { /* skip malformed chunk */ }
    }
  }
}

export async function generateEngineeringPlan(prompt, apiKey) {
  return runDeepSeekChat({
    apiKey,
    messages: [
      { role: 'system', content: 'You are Apex Dev, an autonomous engineering system.' },
      { role: 'user',   content: prompt }
    ]
  });
}
