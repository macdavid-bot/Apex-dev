// Rollback API — manage and restore deployment checkpoints.
import express from 'express';
import {
  createCheckpoint, listCheckpoints, getCheckpoint,
  restoreCheckpoint, deleteCheckpoint
} from '../../../../services/rollback/checkpoints.js';
import { logActivity } from '../../../../services/monitoring/activity.js';

const router = express.Router();

// GET /rollback/checkpoints — list all checkpoints
router.get('/checkpoints', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json(await listCheckpoints(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rollback/checkpoints — create a manual checkpoint
router.post('/checkpoints', async (req, res) => {
  const { label, type = 'manual', serverId = '', repoName = '', metadata = {} } = req.body;
  try {
    const cp = await createCheckpoint({ label: label || 'Manual checkpoint', type, serverId, repoName, metadata });
    res.json(cp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /rollback/checkpoints/:id — get a specific checkpoint
router.get('/checkpoints/:id', async (req, res) => {
  try {
    const cp = await getCheckpoint(req.params.id);
    if (!cp) return res.status(404).json({ error: 'Checkpoint not found' });
    res.json(cp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rollback/checkpoints/:id/restore — restore to a checkpoint
router.post('/checkpoints/:id/restore', async (req, res) => {
  try {
    const result = await restoreCheckpoint(req.params.id);
    await logActivity('rollback', 'restore_requested', { checkpointId: req.params.id, user: req.user?.username });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /rollback/checkpoints/:id — delete a checkpoint
router.delete('/checkpoints/:id', async (req, res) => {
  try {
    await deleteCheckpoint(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
