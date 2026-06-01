// Repository Registry — named repos resolved by logical name.
// "Work on Manuskripta" → { owner, repo, branch, ... }
import { query, queryOne, dbAvailable } from '../db/client.js';
import { logActivity } from '../monitoring/activity.js';

const memRepos = new Map(); // name → repo object

function makeId() { return Math.random().toString(36).slice(2, 10); }

function normalize(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function listRepos() {
  try {
    if (await dbAvailable()) {
      const res = await query(
        `SELECT id, name, label, github_url, owner, repo, branch, purpose,
                clone_path, deploy_server_id, env_info, last_indexed_at, created_at, updated_at
         FROM repositories ORDER BY updated_at DESC`
      );
      for (const r of res.rows) memRepos.set(r.name, r);
      return res.rows;
    }
  } catch {}
  return [...memRepos.values()];
}

export async function getRepo(nameOrLabel) {
  const slug = normalize(nameOrLabel);
  // Try exact slug match, then partial label match
  try {
    if (await dbAvailable()) {
      const exact = await queryOne(`SELECT * FROM repositories WHERE name=$1`, [slug]);
      if (exact) return exact;
      // Try label ILIKE search
      const fuzzy = await queryOne(
        `SELECT * FROM repositories WHERE LOWER(label) LIKE $1 OR name LIKE $1 ORDER BY updated_at DESC LIMIT 1`,
        [`%${slug}%`]
      );
      return fuzzy || null;
    }
  } catch {}
  return memRepos.get(slug) ||
    [...memRepos.values()].find(r => normalize(r.label).includes(slug)) || null;
}

export async function addRepo(data) {
  const {
    name, label, githubUrl, owner, repo, branch = 'main',
    purpose = '', clonePath = '', deployServerId = '', envInfo = ''
  } = data;

  if (!name || !label) throw new Error('name and label are required');
  const slug = normalize(name);

  const record = {
    id:               makeId(),
    name:             slug,
    label,
    github_url:       githubUrl || (owner && repo ? `https://github.com/${owner}/${repo}` : ''),
    owner:            owner || '',
    repo:             repo  || '',
    branch,
    purpose,
    clone_path:       clonePath,
    deploy_server_id: deployServerId,
    env_info:         envInfo
  };

  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO repositories (id,name,label,github_url,owner,repo,branch,purpose,clone_path,deploy_server_id,env_info)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (name) DO UPDATE SET
           label=$3,github_url=$4,owner=$5,repo=$6,branch=$7,
           purpose=$8,clone_path=$9,deploy_server_id=$10,env_info=$11,updated_at=NOW()`,
        [record.id, record.name, record.label, record.github_url, record.owner, record.repo,
         record.branch, record.purpose, record.clone_path, record.deploy_server_id, record.env_info]
      );
    }
  } catch (err) {
    throw new Error('DB error saving repo: ' + err.message);
  }

  memRepos.set(slug, record);
  await logActivity('repos', 'registered', { name: slug, label, owner, repo });
  return record;
}

export async function updateRepo(name, updates) {
  const slug = normalize(name);
  const existing = await getRepo(slug);
  if (!existing) return null;

  const fields = [];
  const vals   = [];
  const map = {
    label:            'label',
    githubUrl:        'github_url',
    owner:            'owner',
    repo:             'repo',
    branch:           'branch',
    purpose:          'purpose',
    clonePath:        'clone_path',
    deployServerId:   'deploy_server_id',
    envInfo:          'env_info',
    lastIndexedAt:    'last_indexed_at'
  };
  for (const [key, col] of Object.entries(map)) {
    if (updates[key] !== undefined) {
      fields.push(`${col}=$${vals.length + 1}`);
      vals.push(updates[key]);
    }
  }
  if (fields.length === 0) return existing;
  vals.push(existing.id);

  try {
    if (await dbAvailable()) {
      await query(`UPDATE repositories SET ${fields.join(',')},updated_at=NOW() WHERE id=$${vals.length}`, vals);
    }
  } catch {}

  const updated = { ...existing, ...updates };
  memRepos.set(slug, updated);
  return updated;
}

export async function deleteRepo(name) {
  const slug = normalize(name);
  try {
    if (await dbAvailable()) await query(`DELETE FROM repositories WHERE name=$1`, [slug]);
  } catch {}
  memRepos.delete(slug);
  await logActivity('repos', 'deleted', { name: slug });
}

export async function formatReposForPrompt() {
  const repos = await listRepos();
  if (repos.length === 0) return null;
  const lines = ['**Registered Repositories** (use these names with switch_repo):'];
  for (const r of repos) {
    lines.push(`- \`${r.name}\` — ${r.label}${r.owner ? ` (${r.owner}/${r.repo})` : ''}${r.purpose ? `: ${r.purpose}` : ''}${r.deploy_server_id ? ` [default server: ${r.deploy_server_id}]` : ''}`);
  }
  return lines.join('\n');
}
