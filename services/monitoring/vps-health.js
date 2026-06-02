import { Client } from 'ssh2';
import { query, queryOne, dbAvailable } from '../db/client.js';

/* ── VPS Health Monitor — check remote VPS services and send alerts ───
   This is designed to run independently on each VPS, so Apex Dev doesn't
   need to be online for health monitoring to work. */

const inMemConfigs = new Map();
const inMemAlerts = new Map();
let inMemSeq = 1;

function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ── DB: monitor configs (which server + what to check) ───────────────
export async function listMonitorConfigs() {
  if (await dbAvailable()) {
    const r = await query('SELECT * FROM vps_health_monitors ORDER BY created_at DESC').catch(() => ({ rows: [] }));
    return r.rows;
  }
  return [...inMemConfigs.values()];
}

export async function getMonitorConfig(id) {
  if (await dbAvailable()) return queryOne('SELECT * FROM vps_health_monitors WHERE id=$1', [id]).catch(() => null);
  return inMemConfigs.get(id) || null;
}

export async function addMonitorConfig({ server_id, enabled = true, check_interval_sec = 60, alert_webhook = '', alert_email = '', checks = {} }) {
  const id = makeId('mon');
  const defaults = {
    pm2: true, nginx: true, disk: true, db: false,
    disk_threshold_pct: 80, db_url: '', app_port: 3000, ...checks
  };
  if (await dbAvailable()) {
    const r = await queryOne(
      `INSERT INTO vps_health_monitors (id, server_id, enabled, check_interval_sec, alert_webhook, alert_email, checks)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, server_id, enabled, check_interval_sec, alert_webhook, alert_email, JSON.stringify(defaults)]
    );
    return r;
  }
  const rec = { id, server_id, enabled, check_interval_sec, alert_webhook, alert_email, checks: defaults, created_at: new Date().toISOString() };
  inMemConfigs.set(id, rec);
  return rec;
}

export async function updateMonitorConfig(id, fields) {
  const allowed = ['enabled', 'check_interval_sec', 'alert_webhook', 'alert_email', 'checks'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=$${idx++}`); vals.push(v); }
  }
  if (!sets.length) return getMonitorConfig(id);
  if (await dbAvailable()) {
    vals.push(id);
    return queryOne(`UPDATE vps_health_monitors SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, vals).catch(() => null);
  }
  const rec = inMemConfigs.get(id);
  if (rec) { Object.assign(rec, fields); inMemConfigs.set(id, rec); }
  return rec;
}

export async function deleteMonitorConfig(id) {
  if (await dbAvailable()) { await query('DELETE FROM vps_health_monitors WHERE id=$1', [id]).catch(() => {}); return; }
  inMemConfigs.delete(id);
}

// ── DB: alert log ─────────────────────────────────────────────────────
export async function logAlert({ monitor_id, server_id, severity, message, details = {} }) {
  const id = makeId('alt');
  if (await dbAvailable()) {
    await query(
      `INSERT INTO vps_health_alerts (id, monitor_id, server_id, severity, message, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, monitor_id, server_id, severity, message, JSON.stringify(details)]
    ).catch(() => {});
    return id;
  }
  const rec = { id, monitor_id, server_id, severity, message, details, created_at: new Date().toISOString() };
  inMemAlerts.set(id, rec);
  return id;
}

export async function listAlerts(limit = 50) {
  if (await dbAvailable()) {
    const r = await query('SELECT * FROM vps_health_alerts ORDER BY created_at DESC LIMIT $1', [limit]).catch(() => ({ rows: [] }));
    return r.rows;
  }
  return [...inMemAlerts.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

// ── Run a health check on a remote VPS via SSH ────────────────────────
export async function runHealthCheck(server, config) {
  const checks = config.checks || {};
  const results = [];

  const conn = new Client();
  const connect = () => new Promise((resolve, reject) => {
    conn.on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: server.host, port: server.port || 22,
        username: server.username,
        ...(server.private_key ? { privateKey: server.private_key } : { password: server.password || '' }),
        readyTimeout: 10000
      });
  });

  const exec = (cmd) => new Promise((res, rej) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return rej(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', () => res({ stdout: out, stderr: errOut }));
    });
  });

  try {
    await connect();

    // PM2 check
    if (checks.pm2 !== false) {
      const r = await exec('pm2 jlist 2>/dev/null || echo "PM2_NOT_FOUND"');
      const ok = r.stdout.includes('PM2_NOT_FOUND') ? false : r.stdout.includes('"name"');
      results.push({ name: 'pm2', ok, message: ok ? 'PM2 running' : 'PM2 not found or empty', output: r.stdout.slice(0, 200) });
    }

    // Nginx check
    if (checks.nginx !== false) {
      const r = await exec('systemctl is-active nginx 2>/dev/null || echo "inactive"');
      const ok = r.stdout.trim() === 'active';
      results.push({ name: 'nginx', ok, message: ok ? 'nginx active' : 'nginx not active', output: r.stdout.trim() });
    }

    // Disk check
    if (checks.disk !== false) {
      const thresh = checks.disk_threshold_pct || 80;
      const r = await exec('df -h / | tail -1');
      const m = r.stdout.match(/(\d+)%/);
      const used = m ? parseInt(m[1]) : 100;
      const ok = used < thresh;
      results.push({ name: 'disk', ok, message: `Disk usage: ${used}%`, output: r.stdout.trim(), used });
    }

    // Database check
    if (checks.db) {
      const dbUrl = checks.db_url || 'postgresql://localhost/app';
      const r = await exec(`psql "${dbUrl}" -c "SELECT 1;" 2>&1 || echo "DB_FAILED"`);
      const ok = r.stdout.includes('1 row');
      results.push({ name: 'db', ok, message: ok ? 'DB reachable' : 'DB check failed', output: r.stdout.slice(0, 200) });
    }

    // App port check
    if (checks.app_port) {
      const port = checks.app_port || 3000;
      const r = await exec(`ss -tlnp | grep ':${port} ' || echo "PORT_NOT_LISTENING"`);
      const ok = !r.stdout.includes('PORT_NOT_LISTENING');
      results.push({ name: 'app_port', ok, message: ok ? `Port ${port} listening` : `Port ${port} not listening`, output: r.stdout.trim() });
    }

    conn.end();
    return { success: true, checks: results, timestamp: new Date().toISOString() };
  } catch (err) {
    conn.end();
    return { success: false, error: err.message, checks: results, timestamp: new Date().toISOString() };
  }
}

// ── Send alert (webhook or simple console) ───────────────────────────
export async function dispatchAlert({ webhook, email, severity, message, details }) {
  const payload = { severity, message, details, timestamp: new Date().toISOString() };

  // Webhook
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('[HealthMonitor] Webhook alert failed:', e.message);
    }
  }

  // Email — stub for SMTP integration (requires mail provider like Resend, SendGrid, etc)
  if (email) {
    console.log('[HealthMonitor] Email alert would send to:', email, 'Body:', JSON.stringify(payload));
  }

  return payload;
}

// ── Full monitor check (config + server + alert) ───────────────────
export async function checkMonitor(config, server) {
  const result = await runHealthCheck(server, config);

  // Log failures as alerts
  const failed = result.checks?.filter(c => !c.ok) || [];
  for (const f of failed) {
    await logAlert({
      monitor_id: config.id,
      server_id: config.server_id,
      severity: f.name === 'pm2' || f.name === 'app_port' ? 'critical' : 'warning',
      message: f.message,
      details: { check: f.name, output: f.output, used: f.used }
    });
  }

  // If any critical, dispatch alert
  const critical = failed.some(f => f.name === 'pm2' || f.name === 'app_port');
  if (critical && (config.alert_webhook || config.alert_email)) {
    await dispatchAlert({
      webhook: config.alert_webhook,
      email: config.alert_email,
      severity: 'critical',
      message: `VPS ${server.host} — ${failed.map(f => f.message).join('; ')}`,
      details: { failed }
    });
  }

  return result;
}
