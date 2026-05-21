import express from 'express';
import { runTask } from '../../../../services/orchestrator/runtime.js';
import { assembleContext } from '../../../../services/context/assembler.js';

const router = express.Router();

router.post('/run', async (req, res) => {
  const result = await runTask(req.body.task, req.body.context || {});

  res.json(result);
});

router.post('/context', (req, res) => {
  const context = assembleContext(req.body);

  res.json(context);
});

export default router;
