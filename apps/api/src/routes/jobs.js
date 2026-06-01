import express from 'express';
import { getJob, listJobs } from '../../../../services/queue/store.js';
import { requireAuth } from '../../../../services/auth/middleware.js';
import { jobEvents } from '../../../../services/queue/worker.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const jobs = await listJobs(50);
  res.json(jobs);
});

router.get('/:id', requireAuth, async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.get('/:id/stream', requireAuth, (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const onToken    = ({ jobId, token })    => { if (jobId === id) send('token',    { token }); };
  const onAction   = ({ jobId, action })   => { if (jobId === id) send('action',   { action }); };
  const onStep     = ({ jobId, step })     => { if (jobId === id) send('step',     { step }); };
  const onProgress = ({ jobId, progress }) => { if (jobId === id) send('progress', { progress }); };
  const onDone     = ({ jobId, result })   => { if (jobId === id) { send('done', result); cleanup(); res.end(); } };
  const onError    = ({ jobId, error })    => { if (jobId === id) { send('error', { error }); cleanup(); res.end(); } };

  function cleanup() {
    jobEvents.off('token',    onToken);
    jobEvents.off('action',   onAction);
    jobEvents.off('step',     onStep);
    jobEvents.off('progress', onProgress);
    jobEvents.off('done',     onDone);
    jobEvents.off('error',    onError);
  }

  jobEvents.on('token',    onToken);
  jobEvents.on('action',   onAction);
  jobEvents.on('step',     onStep);
  jobEvents.on('progress', onProgress);
  jobEvents.on('done',     onDone);
  jobEvents.on('error',    onError);

  req.on('close', cleanup);

  send('connected', { jobId: id });
});

export default router;
