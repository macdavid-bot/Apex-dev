import express from 'express';
import { createShellSession } from '../../../../services/shell/session.js';
import { saveCommand, getHistory } from '../../../../services/shell/history.js';
import { createStream } from '../../../../services/shell/stream.js';
import { explainShellResult } from '../../../../services/shell/assistant.js';

const router = express.Router();

router.post('/session', (req, res) => {
  const session = createShellSession(req.body.id || 'default-session');

  res.json(session);
});

router.post('/history', (req, res) => {
  const total = saveCommand(req.body.command);

  res.json({ saved: true, total });
});

router.get('/history', (req, res) => {
  res.json(getHistory());
});

router.post('/stream', (req, res) => {
  const stream = createStream(req.body.command);

  res.json(stream);
});

router.post('/explain', (req, res) => {
  const explanation = explainShellResult(req.body.result || {});

  res.json(explanation);
});

export default router;
