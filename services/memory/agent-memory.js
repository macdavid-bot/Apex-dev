// Global structured agent memory — persists across repos and conversations.
// Categories: architecture, instruction, infrastructure, deployment, preference, fact
import { query, dbAvailable } from '../db/client.js';

const memStore = new Map(); // id → entry
let memCounter = 0;

function makeId() { return `mem-${Date.now()}-${++memCounter}`; }

export const CATEGORIES = ['architecture', 'instruction', 'infrastructure', 'deployment', 'preference', 'fact'];

export async function remember({ category = 'fact', key, value, tags = [], repoName = '' } = {}) {
  if (!key || !value) throw new Error('key and value are required');
  const id = makeId();
  const entry = {
    id, category, key, value,
    tags_json: JSON.stringify(Array.isArray(tags) ? tags : [tags]),
    repo_name: repoName || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO agent_memory (id, category, key, value, tags_json, repo_name)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [id, category, key, value, entry.tags_json, repoName]
      );
    }
  } catch {}

  memStore.set(id, entry);
  return entry;
}

export async function recall({ query: searchQuery, category, repoName, limit = 20 } = {}) {
  try {
    if (await dbAvailable()) {
      const conditions = [];
      const params = [];
      if (category)  { conditions.push(`category=$${params.length + 1}`); params.push(category); }
      if (repoName)  { conditions.push(`(repo_name=$${params.length + 1} OR repo_name='')`); params.push(repoName); }
      if (searchQuery) {
        const like = `%${searchQuery.toLowerCase()}%`;
        conditions.push(`(LOWER(key) LIKE $${params.length + 1} OR LOWER(value) LIKE $${params.length + 1})`);
        params.push(like);
      }
      params.push(limit);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await query(
        `SELECT id, category, key, value, tags_json, repo_name, created_at, updated_at
         FROM agent_memory ${where}
         ORDER BY updated_at DESC LIMIT $${params.length}`,
        params
      );
      return res.rows.map(r => ({
        ...r,
        tags: typeof r.tags_json === 'string' ? JSON.parse(r.tags_json || '[]') : (r.tags_json || [])
      }));
    }
  } catch {}

  // In-memory fallback
  let entries = [...memStore.values()];
  if (category) entries = entries.filter(e => e.category === category);
  if (repoName) entries = entries.filter(e => !e.repo_name || e.repo_name === repoName);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    entries = entries.filter(e => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }
  return entries.slice(0, limit);
}

export async function forget(id) {
  try {
    if (await dbAvailable()) await query(`DELETE FROM agent_memory WHERE id=$1`, [id]);
  } catch {}
  memStore.delete(id);
}

export async function formatMemoryForPrompt(repoName = '') {
  const entries = await recall({ repoName, limit: 30 });
  if (entries.length === 0) return null;

  const byCategory = {};
  for (const e of entries) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const lines = ['**Remembered Context**:'];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    for (const item of items) {
      lines.push(`- **${item.key}**: ${item.value}`);
    }
  }
  return lines.join('\n');
}
