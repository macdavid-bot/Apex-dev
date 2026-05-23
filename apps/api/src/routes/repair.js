import express from 'express';
import { analyzeFailure } from '../../../../services/repair/failure-analysis.js';
import { detectRootCause } from '../../../../services/repair/root-cause.js';
import { generateRepairSuggestions } from '../../../../services/repair/suggestions.js';
import { recoverWorkflow } from '../../../../services/repair/recovery.js';

const router = express.Router();

router.post('/analyze', (req, res) => {
  const result = analyzeFailure(req.body.error || {});

  res.json(result);
});

router.post('/root-cause', (req, res) => {
  const result = detectRootCause(req.body.logs || '');

  res.json(result);
});

router.post('/suggestions', (req, res) => {
  const result = generateRepairSuggestions(req.body.issue || 'Unknown issue');

  res.json(result);
});

router.post('/recover', (req, res) => {
  const result = recoverWorkflow(req.body.workflow || {});

  res.json(result);
});

export default router;
