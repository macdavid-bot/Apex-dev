import express from 'express';
import { createWorkspace } from '../../../../services/workspace/runtime.js';

const router = express.Router();

router.post('/create', (req, res) => {
  const workspace = createWorkspace(req.body.name || 'default-workspace');
  res.json(workspace);
});

export default router;
