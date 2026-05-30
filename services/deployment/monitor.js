import { exec } from 'child_process';
import { promisify } from 'util';
import { sessions as vpsSessions } from '../vps/sessions.js';

const execAsync = promisify(exec);

// Real PM2 process list via `pm2 jlist` (JSON output)
export async function getPM2Processes() {
  try {
    const { stdout } = await execAsync('pm2 jlist', { timeout: 10000 });
    const procs = JSON.parse(stdout);
    return procs.map(p => ({
      id: `pm2-${p.pm_id}`,
      name: p.name,
      status: mapPM2Status(p.pm2_env?.status),
      type: 'pm2',
      server: 'localhost',
      cpu: p.monit?.cpu !== undefined ? `${p.monit.cpu}%` : null,
      memory: p.monit?.memory ? `${Math.round(p.monit.memory / 1024 / 1024)}MB` : null,
      restarts: p.pm2_env?.restart_time ?? 0,
      pid: p.pid,
      createdAt: p.pm2_env?.created_at
        ? new Date(p.pm2_env.created_at).toISOString()
        : new Date().toISOString()
    }));
  } catch {
    // PM2 not installed or no processes — return empty
    return [];
  }
}

function mapPM2Status(s) {
  if (s === 'online')   return 'running';
  if (s === 'stopped')  return 'stopped';
  if (s === 'errored')  return 'failed';
  return s || 'unknown';
}

// Probe local ports that Apex Dev typically listens on
export async function getLocalServices() {
  const targets = [
    { name: 'Apex Dev API', port: 3000, path: '/health' },
    { name: 'Apex Dev Web', port: 5000, path: '/' },
  ];

  return Promise.all(targets.map(async ({ name, port, path }) => {
    try {
      const { stdout } = await execAsync(
        `curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://localhost:${port}${path}`,
        { timeout: 5000 }
      );
      const code = parseInt(stdout.trim(), 10);
      const status = code >= 200 && code < 400 ? 'running' : 'failed';
      return { id: `local-${port}`, name, type: 'local', server: 'localhost', port, status, createdAt: new Date().toISOString() };
    } catch {
      return { id: `local-${port}`, name, type: 'local', server: 'localhost', port, status: 'stopped', createdAt: new Date().toISOString() };
    }
  }));
}

// Probe registered VPS sessions with a quick SSH test
export async function getVPSServices() {
  const list = [...vpsSessions.values()];
  if (list.length === 0) return [];

  return Promise.all(list.map(async session => {
    let status = 'unknown';
    try {
      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      await ssh.connect({
        host: session.host,
        port: session.port || 22,
        username: session.username,
        privateKey: session.privateKey,
        readyTimeout: 5000
      });
      ssh.dispose();
      status = 'running';
    } catch {
      status = 'failed';
    }
    return {
      id: `vps-${session.id}`,
      name: session.label,
      type: 'vps',
      server: `${session.username}@${session.host}:${session.port || 22}`,
      status,
      createdAt: new Date().toISOString()
    };
  }));
}
