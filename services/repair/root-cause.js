import { runDeepSeekChat } from '../ai/deepseek-runtime.js';

const SYSTEM = `You are an expert at reading error logs and identifying root causes.
Given the provided logs, identify the root cause and return a JSON object with:
- detected: true/false
- rootCause: concise root cause (1-2 sentences)
- category: "dependency" | "config" | "code" | "resource" | "network" | "permission" | "unknown"
- failingLine: the specific log line most responsible for the failure (if identifiable)
- suggestion: one concrete fix suggestion
Respond ONLY with valid JSON. No markdown or explanation outside the JSON.`;

export async function detectRootCause(logs = '') {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || !logs) {
    return {
      detected: logs.length > 0,
      rootCause: logs || 'No logs provided',
      category: 'unknown',
      suggestion: 'Provide logs for AI-powered root cause analysis',
      detectedAt: new Date().toISOString()
    };
  }

  const truncated = logs.slice(0, 4000) + (logs.length > 4000 ? '\n…(truncated)' : '');

  try {
    const result = await runDeepSeekChat({
      apiKey,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Analyze these logs:\n${truncated}` }
      ]
    });
    const content = result.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    return { ...parsed, detectedAt: new Date().toISOString() };
  } catch (err) {
    return {
      detected: true,
      rootCause: `Root cause detection failed: ${err.message}`,
      category: 'unknown',
      detectedAt: new Date().toISOString()
    };
  }
}
