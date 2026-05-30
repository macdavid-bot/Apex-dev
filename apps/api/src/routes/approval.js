import express from 'express';
import { createApproval, getApprovals, approveAction, rejectAction } from '../../../../services/approval/runtime.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getApprovals());
});

router.post('/', (req, res) => {
  const approval = createApproval(req.body);
  res.json(approval);
});

router.post('/:id/approve', (req, res) => {
  const result = approveAction(req.params.id);
  if (!result) return res.status(404).json({ error: 'Approval not found' });
  res.json(result);
});

router.post('/:id/reject', (req, res) => {
  const result = rejectAction(req.params.id);
  if (!result) return res.status(404).json({ error: 'Approval not found' });
  res.json(result);
});

export default router;
