// Per-project persistent memory: facts + summary stored in PostgreSQL.
// Falls back to in-memory Map when DB is unavailable.
import { query, queryOne, dbAvailable } from '../db/client.js';

const memStore = new Map();

function repoKey(owner, repo) {
  return `${owner}/${repo}`;
}

export async function getMemory(owner, repo) {
  const key = repoKey(owner, repo);
  if (await dbAvailable()) {
    const row = await queryOne('SELECT * FROM project_memory WHERE repo_key=$1', [key]);
    if (!row) return { repoKey: key, summary: '', facts: [] };
    return {
      repoKey: key,
      summary: row.summary || '',
      facts: typeof row.facts_json === 'string' ? JSON.parse(row.facts_json) : (row.facts_json || [])
    };
  }
  return memStore.get(key) || { repoKey: key, summary: '', facts: [] };
}

export async function addFact(owner, repo, fact) {
  const key = repoKey(owner, repo);
  const mem = await getMemory(owner, repo);
  const facts = [...mem.facts, { fact, addedAt: new Date().toISOString() }].slice(-100);

  if (await dbAvailable()) {
    await query(
      `INSERT INTO project_memory (repo_key, facts_json, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (repo_key) DO UPDATE SET facts_json=$2, updated_at=NOW()`,
      [key, JSON.stringify(facts)]
    );
  } else {
    memStore.set(key, { ...mem, facts });
  }
  return facts;
}

export async function updateSummary(owner, repo, summary) {
  const key = repoKey(owner, repo);
  if (await dbAvailable()) {
    await query(
      `INSERT INTO project_memory (repo_key, summary, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (repo_key) DO UPDATE SET summary=$2, updated_at=NOW()`,
      [key, summary]
    );
  } else {
    const mem = memStore.get(key) || { repoKey: key, facts: [] };
    memStore.set(key, { ...mem, summary });
  }
}

export async function formatMemoryForPrompt(owner, repo) {
  const mem = await getMemory(owner, repo);
  if (!mem.summary && mem.facts.length === 0) return null;

  const lines = [];
  if (mem.summary) lines.push(`## Project Summary\n${mem.summary}`);
  if (mem.facts.length > 0) {
    lines.push(`## Remembered Facts (${mem.facts.length})`);
    mem.facts.slice(-20).forEach(f => lines.push(`- ${f.fact}`));
  }
  return lines.join('\n');
}
