// Rollback checkpoint system — snapshot state before risky operations.
// Types: 'deployment', 'self_edit', 'config_change', 'vps_change'
import { exec } from 'child_process';
import { promisify } from 'util';
import { query, queryOne, dbAvailable } from '../db/client.js';
import { logActivity } from '../monitoring/activity.js';

const execAsync = promisify(exec);
const memCheckpoints = new Map();

function makeId() { return `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// Capture current PM2 state
async function capturePM2State(ssh = null) {
  try {
    if (ssh) {
      const r = await ssh.execCommand('pm2 jlist 2>/dev/null || echo "[]"');
      return JSON.parse(r.stdout || '[]');
    }
    const { stdout } = await execAsync('pm2 jlist 2>/dev/null || echo "[]"', { timeout: 5000 });
    return JSON.parse(stdout || '[]');
  } catch {
    return [];
  }
}

// Capture current git HEAD SHA
async function captureGitSha(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD 2>/dev/null || echo ""', { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function createCheckpoint({ label, type = 'deployment', serverId = '', repoName = '', ssh = null, metadata = {} } = {}) {
  const id = makeId();
  const pm2State = await capturePM2State(ssh);
  const gitSha   = await captureGitSha();

  const checkpoint = {
    id,
    label:          label || `${type} checkpoint`,
    type,
    server_id:      serverId,
    repo_name:      repoName,
    git_sha:        gitSha,
    pm2_state_json: JSON.stringify(pm2State),
    metadata_json:  JSON.stringify(metadata),
    created_at:     new Date().toISOString()
  };

  try {
    if (await dbAvailable()) {
      await query(
        `INSERT INTO rollback_checkpoints (id, label, type, server_id, repo_name, git_sha, pm2_state_json, metadata_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, checkpoint.label, type, serverId, repoName, gitSha,
         checkpoint.pm2_state_json, checkpoint.metadata_json]
      );
    }
  } catch {}

  memCheckpoints.set(id, checkpoint);
  await logActivity('rollback', 'checkpoint_created', { id, label: checkpoint.label, type, repoName });
  return checkpoint;
}

export async function listCheckpoints(limit = 50) {
  try {
    if (await dbAvailable()) {
      const res = await query(
        `SELECT id, label, type, server_id, repo_name, git_sha, created_at
         FROM rollback_checkpoints
         ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    }
  } catch {}
  return [...memCheckpoints.values()]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export async function getCheckpoint(id) {
  try {
    if (await dbAvailable()) {
      return await queryOne(`SELECT * FROM rollback_checkpoints WHERE id=$1`, [id]);
    }
  } catch {}
  return memCheckpoints.get(id) || null;
}

export async function restoreCheckpoint(id, { NodeSSH } = {}) {
  const checkpoint = await getCheckpoint(id);
  if (!checkpoint) throw new Error(`Checkpoint ${id} not found`);

  const results = [];

  // Restore git state locally (if git SHA is known)
  if (checkpoint.git_sha) {
    try {
      await execAsync(`git checkout ${checkpoint.git_sha} -- . 2>&1 || true`, { timeout: 30000 });
      results.push({ step: 'git_restore', status: 'done', sha: checkpoint.git_sha });
    } catch (e) {
      results.push({ step: 'git_restore', status: 'error', error: e.message });
    }
  }

  // Restore PM2 processes
  const pm2State = typeof checkpoint.pm2_state_json === 'string'
    ? JSON.parse(checkpoint.pm2_state_json || '[]')
    : (checkpoint.pm2_state_json || []);

  if (pm2State.length > 0) {
    for (const proc of pm2State) {
      if (!proc.name) continue;
      try {
        const action = proc.pm2_env?.status === 'online' ? 'restart' : 'stop';
        await execAsync(`pm2 ${action} "${proc.name}" 2>/dev/null || true`, { timeout: 10000 });
        results.push({ step: `pm2_${action}_${proc.name}`, status: 'done' });
      } catch (e) {
        results.push({ step: `pm2_${proc.name}`, status: 'error', error: e.message });
      }
    }
  }

  await logActivity('rollback', 'restored', { checkpointId: id, label: checkpoint.label, type: checkpoint.type });
  return { success: true, checkpointId: id, label: checkpoint.label, results };
}

export async function deleteCheckpoint(id) {
  try {
    if (await dbAvailable()) await query(`DELETE FROM rollback_checkpoints WHERE id=$1`, [id]);
  } catch {}
  memCheckpoints.delete(id);
}
