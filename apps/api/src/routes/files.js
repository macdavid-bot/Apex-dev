import express from 'express';
import { readLocalFile, writeLocalFile, patchLocalFile, listLocalDir } from '../../../../services/file/editor.js';

const router = express.Router();

router.post('/read', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'path is required' });
    const result = await readLocalFile(path);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/write', async (req, res) => {
  try {
    const { path, content } = req.body;
    if (!path || content === undefined) return res.status(400).json({ error: 'path and content are required' });
    const result = await writeLocalFile(path, content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Surgical str_replace edit — preferred over full rewrite
router.post('/patch', async (req, res) => {
  try {
    const { path, old_str, new_str } = req.body;
    if (!path || old_str === undefined || new_str === undefined)
      return res.status(400).json({ error: 'path, old_str, and new_str are required' });
    const result = await patchLocalFile(path, old_str, new_str);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/list', async (req, res) => {
  try {
    const { path = '.' } = req.body;
    const result = await listLocalDir(path);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
