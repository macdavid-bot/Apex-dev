import { EventEmitter } from 'events';
import { claimNextJob, completeJob, failJob, updateProgress } from './store.js';

export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);

let _runJob = null;

export function registerJobRunner(fn) {
  _runJob = fn;
}

let running = false;

async function tick() {
  if (running || !_runJob) return;

  let job = null;
  try {
    job = await claimNextJob();
  } catch {
    return;
  }
  if (!job) return;

  running = true;
  console.log(`[Worker] Starting job ${job.id} (${job.type})`);

  try {
    await updateProgress(job.id, 'Initializing…');
    const result = await _runJob(job, {
      emitToken:    (token)    => jobEvents.emit('token',    { jobId: job.id, token }),
      emitAction:   (action)   => jobEvents.emit('action',   { jobId: job.id, action }),
      emitStep:     (step)     => jobEvents.emit('step',     { jobId: job.id, step }),
      emitProgress: (progress) => {
        updateProgress(job.id, progress).catch(() => {});
        jobEvents.emit('progress', { jobId: job.id, progress });
      }
    });
    await completeJob(job.id, result);
    jobEvents.emit('done', { jobId: job.id, result });
    console.log(`[Worker] Job ${job.id} completed`);
  } catch (err) {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
    await failJob(job.id, err.message);
    // Emit 'job_error' instead of 'error' to avoid unhandled EventEmitter crash
    jobEvents.emit('job_error', { jobId: job.id, error: err.message });
  } finally {
    running = false;
  }
}

export function startWorker(intervalMs = 2000) {
  console.log('[Worker] Background job worker started');
  setInterval(tick, intervalMs);
  tick();
}
