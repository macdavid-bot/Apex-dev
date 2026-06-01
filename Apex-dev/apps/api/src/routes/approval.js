import express from 'express';
import { createApproval, getApprovals } from '../../../../services/approval/runtime.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getApprovals());
});

router.post('/', (req, res) => {
  const approval = createApproval(req.body);
  res.json(approval);
});

export default router;
