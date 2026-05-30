import express from 'express';
import { analyzeFailure } from '../../../../services/repair/failure-analysis.js';
import { detectRootCause } from '../../../../services/repair/root-cause.js';
import { generateRepairSuggestions } from '../../../../services/repair/suggestions.js';
import { recoverWorkflow } from '../../../../services/repair/recovery.js';
import { addWorkflow, updateWorkflow } from '../../../../services/workflow/store.js';

const router = express.Router();

router.post('/analyze', async (req, res) => {
  const wf = addWorkflow({ title: 'Failure Analysis', status: 'running', type: 'repair' });
  try {
    const result = await analyzeFailure(req.body.error || {});
    updateWorkflow(wf.id, { status: 'completed', description: result.summary || '' });
    res.json(result);
  } catch (err) {
    updateWorkflow(wf.id, { status: 'failed' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/root-cause', async (req, res) => {
  const wf = addWorkflow({ title: 'Root Cause Detection', status: 'running', type: 'repair' });
  try {
    const result = await detectRootCause(req.body.logs || '');
    updateWorkflow(wf.id, { status: 'completed', description: result.rootCause || '' });
    res.json(result);
  } catch (err) {
    updateWorkflow(wf.id, { status: 'failed' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/suggestions', async (req, res) => {
  try {
    const result = await generateRepairSuggestions(req.body.issue || 'Unknown issue');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/recover', async (req, res) => {
  const wf = addWorkflow({ title: 'Workflow Recovery', status: 'running', type: 'repair' });
  try {
    const result = await recoverWorkflow(req.body.workflow || {});
    updateWorkflow(wf.id, { status: result.recovered ? 'completed' : 'failed' });
    res.json(result);
  } catch (err) {
    updateWorkflow(wf.id, { status: 'failed' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
