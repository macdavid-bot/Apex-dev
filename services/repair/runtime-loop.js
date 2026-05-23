import { runBuild, runLint } from '../validation/runtime.js';
import { analyzeFailure } from './failure-analysis.js';
import { generateRepairSuggestions } from './suggestions.js';

export async function executeRepairLoop(cwd) {
  const lint = await runLint(cwd);
  const build = await runBuild(cwd);

  const issues = [];

  if (!lint.success) {
    issues.push({
      analysis: analyzeFailure({
        type: 'lint',
        message: lint.stderr
      }),
      repair: generateRepairSuggestions('Lint failure')
    });
  }

  if (!build.success) {
    issues.push({
      analysis: analyzeFailure({
        type: 'build',
        message: build.stderr
      }),
      repair: generateRepairSuggestions('Build failure')
    });
  }

  return {
    success: issues.length === 0,
    issues,
    executedAt: new Date().toISOString()
  };
}
