import express from 'express';
import { runShellCommand } from '../../../../services/shell/index.js';
import { createSession, deleteSession, getSession, getOrCreate, execInSession } from '../../../../services/shell/session-store.js';

const router = express.Router();

// ── Stateless execute (no cwd tracking) ──────────────────────────────────────
router.post('/execute', async (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });
  const result = await runShellCommand(command, cwd);
  res.json(result);
});

// ── Session management (persistent cwd + history) ─────────────────────────────
router.post('/session', (req, res) => {
  const id = req.body.id || Math.random().toString(36).slice(2);
  res.json(createSession(id));
});

router.get('/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    // Auto-create on first access
    return res.json(createSession(req.params.id));
  }
  res.json(session);
});

router.delete('/session/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ success: true });
});

// ── Execute within a session (handles cd, tracks cwd, history) ───────────────
router.post('/session/:id/exec', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });
  const result = await execInSession(req.params.id, command);
  res.json(result);
});

export default router;
