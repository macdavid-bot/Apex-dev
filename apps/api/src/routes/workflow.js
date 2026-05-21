import express from 'express';
import { createLifecycle } from '../../../../services/workflow/lifecycle.js';
import { orchestrateWorkflow } from '../../../../services/workflow/orchestrator.js';
import { createPipeline } from '../../../../services/workflow/pipeline.js';

const router = express.Router();

router.post('/lifecycle', (req, res) => {
  const lifecycle = createLifecycle(req.body.task);

  res.json(lifecycle);
});

router.post('/orchestrate', async (req, res) => {
  const workflow = await orchestrateWorkflow(req.body.task);

  res.json(workflow);
});

router.post('/pipeline', (req, res) => {
  const pipeline = createPipeline(req.body.task);

  res.json(pipeline);
});

export default router;
