// Workflow store — DB-backed with in-memory fallback + ring buffer cache.
import { query, dbAvailable } from '../db/client.js';

const memWorkflows = [];
const MAX = 200;

function makeId() { return Math.random().toString(36).slice(2, 10); }

export async function addWorkflow({ title, description = '', status = 'running', type = 'task', jobId = null } = {}) {
  const id = makeId();
  const now = new Date().toISOString();
  const wf = { id, title: title || 'Workflow', description, status, type, jobId, createdAt: now, updatedAt: now };

  memWorkflows.unshift(wf);
  if (memWorkflows.length > MAX) memWorkflows.pop();

  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO workflows (id, title, description, status, type, job_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [id, wf.title, description, status, type, jobId]
      );
    }
  } catch { /* non-blocking */ }

  return wf;
}

export async function updateWorkflow(id, updates) {
  const mem = memWorkflows.find(w => w.id === id);
  if (mem) Object.assign(mem, { ...updates, updatedAt: new Date().toISOString() });

  try {
    if (await dbAvailable()) {
      const fields = Object.entries(updates)
        .filter(([k]) => ['title','description','status','type','job_id'].includes(k))
        .map(([k], i) => `${k === 'jobId' ? 'job_id' : k}=$${i + 1}`);
      if (fields.length > 0) {
        const vals = Object.entries(updates)
          .filter(([k]) => ['title','description','status','type','job_id'].includes(k))
          .map(([, v]) => v);
        vals.push(id);
        await query(
          `UPDATE workflows SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${vals.length}`,
          vals
        );
      }
    }
  } catch { /* non-blocking */ }

  return mem || null;
}

export async function getWorkflows(limit = 50) {
  try {
    if (await dbAvailable()) {
      const res = await query(
        `SELECT id, title, description, status, type, job_id as "jobId",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM workflows ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      // Sync memory cache
      for (const row of res.rows) {
        if (!memWorkflows.find(w => w.id === row.id)) {
          memWorkflows.push(row);
        }
      }
      return res.rows;
    }
  } catch { /* fall through */ }
  return [...memWorkflows].slice(0, limit);
}
