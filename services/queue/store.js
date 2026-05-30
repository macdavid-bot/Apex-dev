// DB-backed job queue. Falls back to in-memory if DATABASE_URL is not set.
import { query, queryOne, dbAvailable } from '../db/client.js';

const memQueue = new Map(); // fallback when no DB

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function enqueue(type, payload, priority = 0) {
  const id = makeId();
  const now = new Date().toISOString();

  if (await dbAvailable()) {
    await query(
      `INSERT INTO job_queue (id, type, payload_json, status, priority, created_at)
       VALUES ($1, $2, $3, 'pending', $4, NOW())`,
      [id, type, JSON.stringify(payload), priority]
    );
  } else {
    memQueue.set(id, { id, type, payload, status: 'pending', priority, createdAt: now, progress: '' });
  }
  return id;
}

export async function getJob(id) {
  if (await dbAvailable()) {
    const row = await queryOne('SELECT * FROM job_queue WHERE id = $1', [id]);
    if (!row) return null;
    return normalise(row);
  }
  return memQueue.get(id) || null;
}

export async function listJobs(limit = 50) {
  if (await dbAvailable()) {
    const res = await query(
      'SELECT * FROM job_queue ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return res.rows.map(normalise);
  }
  return [...memQueue.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function claimNextJob() {
  if (await dbAvailable()) {
    const res = await query(
      `UPDATE job_queue SET status='running', started_at=NOW()
       WHERE id = (
         SELECT id FROM job_queue WHERE status='pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`
    );
    return res.rows[0] ? normalise(res.rows[0]) : null;
  }
  // fallback
  for (const job of memQueue.values()) {
    if (job.status === 'pending') {
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      return job;
    }
  }
  return null;
}

export async function completeJob(id, result) {
  if (await dbAvailable()) {
    await query(
      `UPDATE job_queue SET status='completed', completed_at=NOW(), result_json=$1 WHERE id=$2`,
      [JSON.stringify(result), id]
    );
  } else {
    const j = memQueue.get(id);
    if (j) { j.status = 'completed'; j.result = result; j.completedAt = new Date().toISOString(); }
  }
}

export async function failJob(id, error) {
  if (await dbAvailable()) {
    await query(
      `UPDATE job_queue SET status='failed', completed_at=NOW(), error=$1 WHERE id=$2`,
      [String(error), id]
    );
  } else {
    const j = memQueue.get(id);
    if (j) { j.status = 'failed'; j.error = String(error); j.completedAt = new Date().toISOString(); }
  }
}

export async function updateProgress(id, progress) {
  if (await dbAvailable()) {
    await query('UPDATE job_queue SET progress=$1 WHERE id=$2', [progress, id]);
  } else {
    const j = memQueue.get(id);
    if (j) j.progress = progress;
  }
}

function normalise(row) {
  return {
    id:          row.id,
    type:        row.type,
    payload:     typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json,
    status:      row.status,
    priority:    row.priority,
    createdAt:   row.created_at,
    startedAt:   row.started_at,
    completedAt: row.completed_at,
    error:       row.error,
    result:      typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
    progress:    row.progress || ''
  };
}
