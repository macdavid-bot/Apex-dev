import { generateEngineeringPlan } from '../ai/deepseek-runtime.js';
import { runBuild, runLint } from '../validation/runtime.js';
import { analyzeFailure } from '../repair/failure-analysis.js';

export async function executeWorkflow({ prompt, apiKey, cwd }) {
  const plan = await generateEngineeringPlan(prompt, apiKey);

  const lint = await runLint(cwd);
  const build = await runBuild(cwd);

  const failures = [];

  if (!lint.success) {
    failures.push(analyzeFailure({
      type: 'lint',
      message: lint.stderr
    }));
  }

  if (!build.success) {
    failures.push(analyzeFailure({
      type: 'build',
      message: build.stderr
    }));
  }

  return {
    success: failures.length === 0,
    plan,
    lint,
    build,
    failures,
    executedAt: new Date().toISOString()
  };
}
