import express from 'express';
import { createLifecycle } from '../../../../services/workflow/lifecycle.js';
import { orchestrateWorkflow } from '../../../../services/workflow/orchestrator.js';
import { createPipeline } from '../../../../services/workflow/pipeline.js';
import { addWorkflow, updateWorkflow, getWorkflows } from '../../../../services/workflow/store.js';

const router = express.Router();

// List all tracked workflows (used by WorkflowTimeline)
router.get('/', (req, res) => {
  res.json(getWorkflows());
});

// Create a new tracked workflow entry
router.post('/', (req, res) => {
  const wf = addWorkflow(req.body);
  res.json(wf);
});

// Update workflow status
router.patch('/:id', (req, res) => {
  const wf = updateWorkflow(req.params.id, req.body);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });
  res.json(wf);
});

// Lifecycle / orchestration helpers
router.post('/lifecycle', (req, res) => {
  const lifecycle = createLifecycle(req.body.task);
  // Also register as a tracked workflow
  addWorkflow({ title: req.body.task || 'Lifecycle', status: 'running', type: 'lifecycle' });
  res.json(lifecycle);
});

router.post('/orchestrate', async (req, res) => {
  const workflow = await orchestrateWorkflow(req.body.task);
  addWorkflow({ title: req.body.task || 'Orchestration', status: 'running', type: 'orchestration' });
  res.json(workflow);
});

router.post('/pipeline', (req, res) => {
  const pipeline = createPipeline(req.body.task);
  addWorkflow({ title: req.body.task || 'Pipeline', status: 'running', type: 'pipeline' });
  res.json(pipeline);
});

export default router;
