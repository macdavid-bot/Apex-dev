import { runDeepSeekChat } from '../ai/deepseek-runtime.js';

const SYSTEM = `You are an expert software engineer specializing in debugging and repair.
Given a description of an engineering issue, return a JSON object with:
- issue: the issue as understood
- suggestions: array of 3-5 concrete, actionable repair steps (strings)
- priority: which suggestion to try first (0-indexed)
- estimatedComplexity: "simple" | "moderate" | "complex"
Respond ONLY with valid JSON. No markdown or text outside the JSON.`;

export async function generateRepairSuggestions(issue) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      issue,
      suggestions: [
        'Check and update dependencies with pnpm install',
        'Review import paths for missing or incorrect modules',
        'Validate environment variables are correctly set',
        'Run the validation panel to check build and lint errors'
      ],
      priority: 0,
      estimatedComplexity: 'unknown',
      generatedAt: new Date().toISOString()
    };
  }

  try {
    const result = await runDeepSeekChat({
      apiKey,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Generate repair suggestions for: ${issue}` }
      ]
    });
    const content = result.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch (err) {
    return {
      issue,
      suggestions: ['Review the error logs', 'Check imports and dependencies', 'Re-run validation'],
      estimatedComplexity: 'unknown',
      generatedAt: new Date().toISOString()
    };
  }
}
