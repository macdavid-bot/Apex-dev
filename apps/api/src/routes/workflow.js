import express from 'express';
import { createLifecycle } from '../../../../services/workflow/lifecycle.js';
import { orchestrateWorkflow } from '../../../../services/workflow/orchestrator.js';
import { createPipeline } from '../../../../services/workflow/pipeline.js';
import { addWorkflow, updateWorkflow, getWorkflows } from '../../../../services/workflow/store.js';

const router = express.Router();

// GET /workflow — list all tracked workflows (DB-backed)
router.get('/', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json(await getWorkflows(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /workflow — create a workflow entry
router.post('/', async (req, res) => {
  try {
    const wf = await addWorkflow(req.body);
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /workflow/:id — update status
router.patch('/:id', async (req, res) => {
  try {
    const wf = await updateWorkflow(req.params.id, req.body);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lifecycle / orchestration helpers
router.post('/lifecycle', async (req, res) => {
  const lifecycle = createLifecycle(req.body.task);
  await addWorkflow({ title: req.body.task || 'Lifecycle', status: 'running', type: 'lifecycle' });
  res.json(lifecycle);
});

router.post('/orchestrate', async (req, res) => {
  const workflow = await orchestrateWorkflow(req.body.task);
  await addWorkflow({ title: req.body.task || 'Orchestration', status: 'running', type: 'orchestration' });
  res.json(workflow);
});

router.post('/pipeline', async (req, res) => {
  const pipeline = createPipeline(req.body.task);
  await addWorkflow({ title: req.body.task || 'Pipeline', status: 'running', type: 'pipeline' });
  res.json(pipeline);
});

export default router;
