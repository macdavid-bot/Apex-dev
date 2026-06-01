import express from 'express';
import { runShellCommand } from '../../../../services/shell/index.js';

const router = express.Router();

router.post('/execute', async (req, res) => {
  const { command } = req.body;

  const result = await runShellCommand(command);

  res.json(result);
});

export default router;
