import express from 'express';
import { createApproval, getApprovals, approveAction, rejectAction } from '../../../../services/approval/runtime.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await getApprovals());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const approval = await createApproval(req.body);
    res.json(approval);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const result = await approveAction(req.params.id);
    if (!result) return res.status(404).json({ error: 'Approval not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const result = await rejectAction(req.params.id);
    if (!result) return res.status(404).json({ error: 'Approval not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
