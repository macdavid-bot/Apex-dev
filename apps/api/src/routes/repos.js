// Repository Registry API — named repos that the AI resolves by name.
import express from 'express';
import {
  listRepos, getRepo, addRepo, updateRepo, deleteRepo
} from '../../../../services/repos/registry.js';
import { logActivity } from '../../../../services/monitoring/activity.js';

const router = express.Router();

// GET /repos — list all registered repositories
router.get('/', async (req, res) => {
  try {
    res.json(await listRepos());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /repos/:name — get a single repo by slug or label
router.get('/:name', async (req, res) => {
  try {
    const repo = await getRepo(req.params.name);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /repos — register a new repository
router.post('/', async (req, res) => {
  try {
    const repo = await addRepo(req.body);
    res.json(repo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /repos/:name — update repo metadata
router.patch('/:name', async (req, res) => {
  try {
    const updated = await updateRepo(req.params.name, req.body);
    if (!updated) return res.status(404).json({ error: 'Repository not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /repos/:name — remove a registered repository
router.delete('/:name', async (req, res) => {
  try {
    await deleteRepo(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
