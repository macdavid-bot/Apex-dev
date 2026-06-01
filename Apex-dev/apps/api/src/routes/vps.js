import express from 'express';
import { NodeSSH } from 'node-ssh';

const router = express.Router();

// In-memory session store: id -> { host, username, privateKey, label }
const sessions = new Map();

// Save a VPS session (key stored in memory only)
router.post('/session', (req, res) => {
  const { label, host, username, privateKey, port = 22 } = req.body;
  if (!label || !host || !username || !privateKey)
    return res.status(400).json({ error: 'label, host, username, and privateKey are required' });

  const id = Math.random().toString(36).slice(2);
  sessions.set(id, { id, label, host, username, privateKey, port });
  res.json({ success: true, id, label, host, username, port });
});

// List sessions (no keys exposed)
router.get('/sessions', (req, res) => {
  const list = [...sessions.values()].map(({ id, label, host, username, port }) => ({
    id, label, host, username, port
  }));
  res.json(list);
});

// Delete a session
router.delete('/session/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ success: true });
});

// Execute a command on a VPS
router.post('/exec', async (req, res) => {
  const { sessionId, command } = req.body;
  if (!sessionId || !command)
    return res.status(400).json({ error: 'sessionId and command are required' });

  const session = sessions.get(sessionId);
  if (!session)
    return res.status(404).json({ error: 'Session not found' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: session.host,
      port: session.port,
      username: session.username,
      privateKey: session.privateKey,
      readyTimeout: 10000
    });

    const result = await ssh.execCommand(command, { execOptions: { pty: false } });
    ssh.dispose();

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// Test connection
router.post('/test', async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: session.host,
      port: session.port,
      username: session.username,
      privateKey: session.privateKey,
      readyTimeout: 8000
    });
    const result = await ssh.execCommand('uname -a');
    ssh.dispose();
    res.json({ success: true, info: result.stdout });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
