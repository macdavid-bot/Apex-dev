import { runDeepSeekChat } from '../ai/deepseek-runtime.js';

const SYSTEM = `You are an expert at workflow recovery and orchestration.
Given a failed workflow, return a JSON recovery plan with:
- recovered: boolean
- strategy: "retry" | "rollback" | "skip" | "manual" | "restart"
- nextStep: the immediate next action to take
- recoverySteps: ordered array of recovery actions (strings)
- riskLevel: "low" | "medium" | "high"
Respond ONLY with valid JSON. No markdown or text outside the JSON.`;

export async function recoverWorkflow(workflow) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      workflow,
      recovered: false,
      strategy: 'manual',
      nextStep: 're-validation',
      recoverySteps: ['Review workflow logs', 'Fix the identified error', 'Re-run the workflow'],
      riskLevel: 'medium',
      recoveredAt: new Date().toISOString()
    };
  }

  try {
    const result = await runDeepSeekChat({
      apiKey,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Create a recovery plan for this failed workflow:\n${JSON.stringify(workflow, null, 2)}` }
      ]
    });
    const content = result.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    return { workflow, ...parsed, recoveredAt: new Date().toISOString() };
  } catch (err) {
    return {
      workflow,
      recovered: false,
      strategy: 'manual',
      nextStep: 'Review error and retry',
      recoveredAt: new Date().toISOString()
    };
  }
}
