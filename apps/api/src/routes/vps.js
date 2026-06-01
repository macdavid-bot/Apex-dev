import express from 'express';
import { NodeSSH } from 'node-ssh';
import { query, queryOne, dbAvailable } from '../../../../services/db/client.js';
import { sessions as memSessions } from '../../../../services/vps/sessions.js';

const router = express.Router();

// ── DB-backed server storage with in-memory fallback ────────────────────────

async function dbListServers() {
  if (!await dbAvailable()) return [...memSessions.values()];
  const res = await query('SELECT * FROM ssh_sessions ORDER BY created_at');
  return res.rows;
}

async function dbGetServer(id) {
  if (!await dbAvailable()) return memSessions.get(id) || null;
  return queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]);
}

async function dbSaveServer(server) {
  if (!await dbAvailable()) { memSessions.set(server.id, server); return server; }
  const { id, label, host, port, username, private_key, env_file, service_name, deploy_dir, deploy_commands } = server;
  await query(
    `INSERT INTO ssh_sessions (id,label,host,port,username,private_key,env_file,service_name,deploy_dir,deploy_commands)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       label=$2,host=$3,port=$4,username=$5,private_key=$6,
       env_file=$7,service_name=$8,deploy_dir=$9,deploy_commands=$10`,
    [id, label, host, port || 22, username, private_key,
     env_file || '.env', service_name || '', deploy_dir || '', deploy_commands || '']
  );
  memSessions.set(id, server); // keep in-memory cache hot
  return server;
}

async function dbDeleteServer(id) {
  if (!await dbAvailable()) { memSessions.delete(id); return; }
  await query('DELETE FROM ssh_sessions WHERE id=$1', [id]);
  memSessions.delete(id);
}

function makeId() { return Math.random().toString(36).slice(2, 10); }

// ── List servers (no private keys exposed) ────────────────────────────────────

router.get('/servers', async (req, res) => {
  try {
    const servers = await dbListServers();
    res.json(servers.map(s => ({
      id: s.id, label: s.label, host: s.host, port: s.port,
      username: s.username, env_file: s.env_file,
      service_name: s.service_name, deploy_dir: s.deploy_dir,
      deploy_commands: s.deploy_commands, created_at: s.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Add server ────────────────────────────────────────────────────────────────

router.post('/servers', async (req, res) => {
  const { label, host, username, privateKey, port = 22,
          envFile = '.env', serviceName = '', deployDir = '', deployCommands = '' } = req.body;
  if (!label || !host || !username || !privateKey)
    return res.status(400).json({ error: 'label, host, username, and privateKey are required' });

  const server = {
    id: makeId(), label, host, port: Number(port),
    username, private_key: privateKey,
    env_file: envFile, service_name: serviceName,
    deploy_dir: deployDir, deploy_commands: deployCommands
  };

  try {
    await dbSaveServer(server);
    res.json({ success: true, id: server.id, label, host, username, port: server.port });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update server ─────────────────────────────────────────────────────────────

router.put('/servers/:id', async (req, res) => {
  const existing = await dbGetServer(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Server not found' });

  const { label, host, username, privateKey, port,
          envFile, serviceName, deployDir, deployCommands } = req.body;
  const updated = {
    id: req.params.id,
    label:           label           || existing.label,
    host:            host            || existing.host,
    port:            Number(port     || existing.port || 22),
    username:        username        || existing.username,
    private_key:     privateKey      || existing.private_key,
    env_file:        envFile         !== undefined ? envFile         : existing.env_file,
    service_name:    serviceName     !== undefined ? serviceName     : existing.service_name,
    deploy_dir:      deployDir       !== undefined ? deployDir       : existing.deploy_dir,
    deploy_commands: deployCommands  !== undefined ? deployCommands  : existing.deploy_commands
  };

  try {
    await dbSaveServer(updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete server ─────────────────────────────────────────────────────────────

router.delete('/servers/:id', async (req, res) => {
  try {
    await dbDeleteServer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Test SSH connection ────────────────────────────────────────────────────────

router.post('/servers/:id/test', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 8000
    });
    const result = await ssh.execCommand('uname -snr && uptime');
    ssh.dispose();
    res.json({ success: true, info: result.stdout.trim() });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(200).json({ success: false, error: err.message });
  }
});

// ── Execute a command ─────────────────────────────────────────────────────────

router.post('/servers/:id/exec', async (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });
    const result = await ssh.execCommand(command, { cwd: cwd || undefined });
    ssh.dispose();
    res.json({ stdout: result.stdout, stderr: result.stderr, code: result.code });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// ── Set env var on VPS ────────────────────────────────────────────────────────
// Writes KEY=value to the server's env file (never logs the value in plain text).

router.post('/servers/:id/set-env', async (req, res) => {
  const { key, value, envFile, restartService } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: 'key and value are required' });

  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const filePath = envFile || server.env_file || '.env';
  const serviceName = restartService || server.service_name || '';

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });

    // Escape the value for shell safety
    const escapedVal = value.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
    const absPath = filePath.startsWith('/') ? filePath : `$HOME/${filePath}`;

    // Update if key exists, append if not
    const writeCmd =
      `touch ${absPath} && ` +
      `if grep -q "^${key}=" "${absPath}" 2>/dev/null; then ` +
      `  sed -i "s|^${key}=.*|${key}=${escapedVal}|" "${absPath}"; ` +
      `else ` +
      `  echo "${key}=${escapedVal}" >> "${absPath}"; ` +
      `fi`;

    const r = await ssh.execCommand(writeCmd);

    if (r.code !== 0 && r.stderr) {
      ssh.dispose();
      return res.status(500).json({ error: r.stderr.slice(0, 300) });
    }

    // Optionally restart service
    if (serviceName) {
      await ssh.execCommand(
        `pm2 restart ${serviceName} 2>/dev/null || systemctl restart ${serviceName} 2>/dev/null || true`
      );
    }

    ssh.dispose();
    res.json({ success: true, key, env_file: absPath });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// ── Deploy to VPS (SSE stream) ────────────────────────────────────────────────
// Runs deploy commands on the server and streams each step back in real-time.

router.get('/servers/:id/deploy', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const rawCmds = req.query.commands || server.deploy_commands || 'git pull\nnpm install --production\npm2 restart all';
  const dir = req.query.dir || server.deploy_dir || '';
  const commands = rawCmds.split('\n').map(c => c.trim()).filter(Boolean);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const ssh = new NodeSSH();
  try {
    send('step', { label: `Connecting to ${server.host}…`, status: 'running', index: 0 });
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 15000
    });
    send('step', { label: `Connected to ${server.host}`, status: 'done', index: 0 });

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      send('step', { label: `Running: \`${cmd}\``, status: 'running', index: i + 1 });
      const r = await ssh.execCommand(cmd, { cwd: dir || undefined });
      if (r.code !== 0) {
        send('step', {
          label: `Failed: \`${cmd}\``, status: 'error', index: i + 1,
          detail: (r.stderr || r.stdout || '').slice(0, 300)
        });
        send('error', { error: `Command failed: ${cmd}\n${r.stderr || r.stdout}` });
        ssh.dispose();
        res.end();
        return;
      }
      send('step', {
        label: `Done: \`${cmd}\``, status: 'done', index: i + 1,
        detail: r.stdout?.slice(0, 200)
      });
    }

    ssh.dispose();
    send('done', { success: true, server: server.label, commandsRun: commands.length });
    res.end();
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    send('error', { error: err.message });
    res.end();
  }
});

// ── VPS File Browser ──────────────────────────────────────────────────────────

// GET /vps/servers/:id/fs/browse?path=/home/user
router.get('/servers/:id/fs/browse', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const dirPath = req.query.path || '~';
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });
    // Use ls -la --time-style=iso to get structured output
    const lsCmd = `ls -la --time-style=iso "${dirPath}" 2>&1`;
    const r = await ssh.execCommand(lsCmd);
    const pwdR = await ssh.execCommand(`cd "${dirPath}" 2>/dev/null && pwd || echo "${dirPath}"`);
    ssh.dispose();

    if (r.code !== 0 && !r.stdout) {
      return res.status(400).json({ error: r.stderr || 'Directory not found' });
    }

    // Parse ls -la output
    const lines = r.stdout.split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      if (line.startsWith('total') || !line.trim()) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      const perms = parts[0];
      const size  = parts[4];
      const date  = parts[5] + ' ' + parts[6];
      const name  = parts.slice(7).join(' ');
      if (name === '.' || name === '..') continue;
      entries.push({
        name,
        type: perms.startsWith('d') ? 'dir' : perms.startsWith('l') ? 'link' : 'file',
        size: parseInt(size) || 0,
        permissions: perms,
        modified: date
      });
    }

    res.json({
      path: pwdR.stdout.trim() || dirPath,
      entries: entries.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      })
    });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// GET /vps/servers/:id/fs/read?path=/home/user/app.js
router.get('/servers/:id/fs/read', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });
    // Size check first (limit to 512KB)
    const sizeR = await ssh.execCommand(`wc -c < "${filePath}" 2>/dev/null || echo 0`);
    const size = parseInt(sizeR.stdout.trim()) || 0;
    if (size > 524288) {
      ssh.dispose();
      return res.status(400).json({ error: `File too large (${Math.round(size / 1024)}KB). Max 512KB.` });
    }
    const r = await ssh.execCommand(`cat "${filePath}"`);
    ssh.dispose();
    if (r.code !== 0) return res.status(400).json({ error: r.stderr || 'Cannot read file' });
    res.json({ path: filePath, content: r.stdout, size });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// POST /vps/servers/:id/fs/write — write file content
router.post('/servers/:id/fs/write', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content are required' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });
    // Write via heredoc to safely handle special chars
    const escaped = content.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    const writeCmd = `cat > "${filePath}" << 'APEX_HEREDOC'\n${content}\nAPEX_HEREDOC`;
    const r = await ssh.execCommand(`mkdir -p "$(dirname "${filePath}")" && cat > "${filePath}"`, {
      stdin: content
    });
    ssh.dispose();
    res.json({ success: true, path: filePath, bytes: Buffer.byteLength(content, 'utf8') });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// POST /vps/servers/:id/fs/delete — delete file or empty directory
router.post('/servers/:id/fs/delete', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { path: filePath, recursive = false } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  // Safety: block deleting / or home root
  if (/^\/+$/.test(filePath) || filePath === '~') return res.status(400).json({ error: 'Cannot delete root' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 10000
    });
    const cmd = recursive ? `rm -rf "${filePath}"` : `rm "${filePath}" 2>/dev/null || rmdir "${filePath}"`;
    const r = await ssh.execCommand(cmd);
    ssh.dispose();
    if (r.code !== 0) return res.status(400).json({ error: r.stderr || 'Delete failed' });
    res.json({ success: true, path: filePath });
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    res.status(500).json({ error: err.message });
  }
});

// POST /vps/servers/:id/validate — pre-deployment validation
router.post('/servers/:id/validate', async (req, res) => {
  const server = await dbGetServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { requiredEnvVars = [] } = req.body;
  try {
    const { validateVpsDeployment } = await import('../../../../services/deployment/validator.js');
    const result = await validateVpsDeployment(server, requiredEnvVars);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy in-memory session compat ───────────────────────────────────────────

router.post('/session', async (req, res) => {
  const { label, host, username, privateKey, port = 22 } = req.body;
  if (!label || !host || !username || !privateKey)
    return res.status(400).json({ error: 'label, host, username, and privateKey are required' });

  const server = {
    id: makeId(), label, host, port: Number(port),
    username, private_key: privateKey,
    env_file: '.env', service_name: '', deploy_dir: '', deploy_commands: ''
  };
  try {
    await dbSaveServer(server);
    res.json({ success: true, id: server.id, label, host, username, port: server.port });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions', async (req, res) => {
  const servers = await dbListServers();
  res.json(servers.map(s => ({ id: s.id, label: s.label, host: s.host, username: s.username, port: s.port })));
});

export default router;
