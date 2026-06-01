// Approval system — DB-backed with in-memory fallback.
import { query, queryOne, dbAvailable } from '../db/client.js';
import { logActivity } from '../monitoring/activity.js';

const memApprovals = new Map();

function makeId() { return Math.random().toString(36).slice(2, 10); }

export async function createApproval({ title, description, action, requestedBy } = {}) {
  const id = makeId();
  const approval = {
    id,
    title:       title       || 'Action Approval Required',
    description: description || '',
    action:      action      || {},
    requestedBy: requestedBy || 'apex-ai',
    status:      'pending',
    createdAt:   new Date().toISOString(),
    resolvedAt:  null
  };

  memApprovals.set(id, approval);

  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO approvals (id, title, description, action_json, status, created_at)
         VALUES ($1,$2,$3,$4,'pending',NOW())`,
        [id, approval.title, approval.description, JSON.stringify(approval.action)]
      );
    }
  } catch { /* non-blocking */ }

  await logActivity('approval', 'created', { id, title: approval.title, requestedBy });
  return approval;
}

export async function getApprovals() {
  try {
    if (await dbAvailable()) {
      const res = await query(
        `SELECT id, title, description, action_json, status, created_at, updated_at
         FROM approvals ORDER BY created_at DESC LIMIT 100`
      );
      return res.rows.map(r => ({
        id:          r.id,
        title:       r.title,
        description: r.description,
        action:      typeof r.action_json === 'string' ? JSON.parse(r.action_json) : (r.action_json || {}),
        status:      r.status,
        createdAt:   r.created_at,
        resolvedAt:  r.updated_at
      }));
    }
  } catch { /* fall through */ }
  return [...memApprovals.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function approveAction(id) {
  const mem = memApprovals.get(id);
  const now = new Date().toISOString();

  if (mem) { mem.status = 'approved'; mem.resolvedAt = now; }

  try {
    if (await dbAvailable()) {
      const row = await queryOne(
        `UPDATE approvals SET status='approved', updated_at=NOW() WHERE id=$1 RETURNING *`, [id]
      );
      if (row) {
        await logActivity('approval', 'approved', { id });
        return { ...row, action: row.action_json };
      }
    }
  } catch { /* fall through */ }

  if (!mem) return null;
  await logActivity('approval', 'approved', { id });
  return mem;
}

export async function rejectAction(id) {
  const mem = memApprovals.get(id);
  const now = new Date().toISOString();

  if (mem) { mem.status = 'rejected'; mem.resolvedAt = now; }

  try {
    if (await dbAvailable()) {
      const row = await queryOne(
        `UPDATE approvals SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING *`, [id]
      );
      if (row) {
        await logActivity('approval', 'rejected', { id });
        return { ...row, action: row.action_json };
      }
    }
  } catch { /* fall through */ }

  if (!mem) return null;
  await logActivity('approval', 'rejected', { id });
  return mem;
}
