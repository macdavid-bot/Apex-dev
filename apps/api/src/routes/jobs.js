import express from 'express';
import { getJob, listJobs } from '../../../../services/queue/store.js';
import { requireAuth } from '../../../../services/auth/middleware.js';
import { jobEvents } from '../../../../services/queue/worker.js';

const router = express.Router();

// GET /jobs — list recent jobs
router.get('/', requireAuth, async (req, res) => {
  const jobs = await listJobs(50);
  res.json(jobs);
});

// GET /jobs/:id — get job status and result
router.get('/:id', requireAuth, async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /jobs/:id/stream — SSE stream of live job events
router.get('/:id/stream', requireAuth, (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onToken    = ({ jobId, token })    => { if (jobId === id) send('token', { token }); };
  const onAction   = ({ jobId, action })   => { if (jobId === id) send('action', { action }); };
  const onProgress = ({ jobId, progress }) => { if (jobId === id) send('progress', { progress }); };
  const onDone     = ({ jobId, result })   => { if (jobId === id) { send('done', result); res.end(); } };
  const onError    = ({ jobId, error })    => { if (jobId === id) { send('error', { error }); res.end(); } };

  jobEvents.on('token',    onToken);
  jobEvents.on('action',   onAction);
  jobEvents.on('progress', onProgress);
  jobEvents.on('done',     onDone);
  jobEvents.on('error',    onError);

  req.on('close', () => {
    jobEvents.off('token',    onToken);
    jobEvents.off('action',   onAction);
    jobEvents.off('progress', onProgress);
    jobEvents.off('done',     onDone);
    jobEvents.off('error',    onError);
  });

  send('connected', { jobId: id });
});

export default router;
