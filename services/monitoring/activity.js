// Persistent activity / audit log — DB-backed with in-memory fallback
import { query, dbAvailable } from '../db/client.js';

const memLog = [];
const MAX_MEM = 500;

export async function logActivity(category, action, meta = {}) {
  const entry = {
    id:         Math.random().toString(36).slice(2),
    category,
    action,
    meta:       JSON.stringify(meta),
    created_at: new Date().toISOString()
  };

  // Always keep in-memory ring buffer
  memLog.unshift(entry);
  if (memLog.length > MAX_MEM) memLog.pop();

  // Persist to DB when available (non-blocking)
  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO activity_log (id, category, action, meta_json, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [entry.id, category, action, entry.meta]
      );
    }
  } catch {
    // Silently ignore DB errors — log is also in memory
  }

  return entry;
}

export async function getActivityLog({ limit = 100, category, action } = {}) {
  try {
    if (await dbAvailable()) {
      const conditions = [];
      const params = [];
      if (category) { conditions.push(`category = $${params.length + 1}`); params.push(category); }
      if (action)   { conditions.push(`action = $${params.length + 1}`); params.push(action); }
      params.push(limit);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await query(
        `SELECT id, category, action, meta_json, created_at
         FROM activity_log ${where}
         ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      return res.rows.map(r => ({
        ...r,
        meta: typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : (r.meta_json || {})
      }));
    }
  } catch { /* fall through to memory */ }

  let log = [...memLog];
  if (category) log = log.filter(e => e.category === category);
  if (action)   log = log.filter(e => e.action === action);
  return log.slice(0, limit).map(e => ({ ...e, meta: JSON.parse(e.meta || '{}') }));
}
