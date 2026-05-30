import { runDeepSeekChat } from '../ai/deepseek-runtime.js';

const SYSTEM = `You are an expert software engineer and failure analyst.
Analyze the provided error and return a structured JSON response with these exact keys:
- type: error classification ("syntax" | "runtime" | "dependency" | "network" | "config" | "permission" | "unknown")
- severity: "low" | "medium" | "high" | "critical"
- summary: one-sentence description of what failed
- cause: root cause explanation (2-3 sentences max)
- affectedArea: which part of the system is affected
Respond ONLY with valid JSON. No markdown, no code fences, no text outside the JSON object.`;

export async function analyzeFailure(error) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      detected: true,
      type: error?.type || 'unknown',
      severity: 'unknown',
      summary: error?.message || 'Unknown failure',
      cause: 'AI analysis unavailable — DEEPSEEK_API_KEY not set',
      analyzedAt: new Date().toISOString()
    };
  }

  try {
    const result = await runDeepSeekChat({
      apiKey,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Analyze this error:\n${JSON.stringify(error, null, 2)}` }
      ]
    });
    const content = result.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    return { detected: true, ...parsed, analyzedAt: new Date().toISOString() };
  } catch (err) {
    return {
      detected: true,
      type: error?.type || 'unknown',
      summary: error?.message || 'Unknown failure',
      cause: `Analysis failed: ${err.message}`,
      analyzedAt: new Date().toISOString()
    };
  }
}
