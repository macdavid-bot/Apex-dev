import express from 'express';
import { installDependencies } from '../../../../services/validation/install.js';
import { runBuild } from '../../../../services/validation/build.js';
import { runLint } from '../../../../services/validation/lint.js';
import { parseDiagnostics } from '../../../../services/diagnostics/parser.js';

const router = express.Router();

router.post('/install', async (req, res) => {
  const result = await installDependencies(req.body.manager);

  res.json(result);
});

router.post('/build', async (req, res) => {
  const result = await runBuild(req.body.command);

  res.json(result);
});

router.post('/lint', async (req, res) => {
  const result = await runLint(req.body.command);

  res.json(result);
});

router.post('/diagnostics', (req, res) => {
  const result = parseDiagnostics(req.body.stderr || '');

  res.json(result);
});

export default router;
