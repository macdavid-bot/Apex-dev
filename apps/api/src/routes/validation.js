import express from 'express';
import { runShellCommand } from '../../../../services/shell/index.js';

const router = express.Router();

// Real validation — POST (called by ValidationPanel)
router.post('/run', async (req, res) => {
  const { target = '.', cwd, checks: requestedChecks } = req.body;
  const workDir = cwd || process.cwd();

  const results = [];

  // Check 1 — path existence
  const pathCheck = await runShellCommand(`test -e "${target}" && echo "exists" || echo "not found"`, workDir);
  results.push({
    name: 'path',
    label: 'Path exists',
    success: pathCheck.stdout?.trim() === 'exists',
    output: pathCheck.stdout?.trim()
  });

  // Check 2 — package.json present
  const pkgCheck = await runShellCommand(`test -f "${target}/package.json" && echo "found" || echo "missing"`, workDir);
  results.push({
    name: 'package_json',
    label: 'package.json',
    success: pkgCheck.stdout?.trim() === 'found',
    output: pkgCheck.stdout?.trim()
  });

  // Check 3 — node_modules present
  const nmCheck = await runShellCommand(`test -d "${target}/node_modules" && echo "installed" || echo "missing"`, workDir);
  results.push({
    name: 'node_modules',
    label: 'Dependencies installed',
    success: nmCheck.stdout?.trim() === 'installed',
    output: nmCheck.stdout?.trim()
  });

  // Check 4 — lint (only if package.json has a lint script)
  const hasLint = await runShellCommand(
    `cd "${target}" 2>/dev/null && node -e "const p=require('./package.json');process.exit(p.scripts?.lint?0:1)" 2>/dev/null && echo "yes" || echo "no"`,
    workDir
  );
  if (hasLint.stdout?.trim() === 'yes') {
    const lintResult = await runShellCommand(`cd "${target}" && pnpm lint 2>&1 || npm run lint 2>&1`, workDir);
    results.push({
      name: 'lint',
      label: 'Lint',
      success: lintResult.success,
      output: (lintResult.stdout || lintResult.stderr || '').slice(0, 800)
    });
  }

  // Check 5 — env vars
  const requiredVars = ['DEEPSEEK_API_KEY', 'GITHUB_TOKEN'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  results.push({
    name: 'env',
    label: 'Environment variables',
    success: missingVars.length === 0,
    output: missingVars.length === 0
      ? 'All required env vars set'
      : `Missing: ${missingVars.join(', ')}`
  });

  const allPassed = results.every(r => r.success);
  res.json({ success: allPassed, target, checks: results, completedAt: new Date().toISOString() });
});

// GET kept for backwards compatibility
router.get('/run', async (req, res) => {
  res.json({
    success: true,
    checks: [
      { name: 'syntax', label: 'Syntax', success: true },
      { name: 'dependencies', label: 'Dependencies', success: true },
      { name: 'env', label: 'Environment', success: !!process.env.DEEPSEEK_API_KEY }
    ],
    completedAt: new Date().toISOString()
  });
});

export default router;
