import express from 'express';
import { runShellCommand } from '../../../../services/shell/index.js';

const router = express.Router();

router.post('/execute', async (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  const result = await runShellCommand(command, cwd);
  res.json(result);
});

export default router;
