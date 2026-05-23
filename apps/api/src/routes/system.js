import express from 'express';
import { sanitizeCommand } from '../../../../services/security/sanitizer.js';
import { trackRequest } from '../../../../services/security/rate-limit.js';
import { writeLog, getLogs } from '../../../../services/monitoring/logger.js';
import { validateEnvironment } from '../../../../services/environment/validator.js';

const router = express.Router();

router.post('/sanitize', (req, res) => {
  const result = sanitizeCommand(req.body.command || '');

  res.json(result);
});

router.post('/rate-limit', (req, res) => {
  const result = trackRequest(req.body.key || 'anonymous');

  res.json(result);
});

router.post('/log', (req, res) => {
  const total = writeLog(req.body.level || 'info', req.body.message || '');

  res.json({ logged: true, total });
});

router.get('/logs', (req, res) => {
  res.json(getLogs());
});

router.post('/environment', (req, res) => {
  const result = validateEnvironment(req.body.env || {});

  res.json(result);
});

export default router;
