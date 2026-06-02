#!/usr/bin/env bash
# VPS Health Monitor — install a standalone health checker on any VPS
# This script runs independently of Apex Dev, so monitoring works even when Apex Dev is offline.
# Usage: SSH into your VPS as root, then run:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/apex-dev/main/deploy/vps-health-monitor.sh | bash
# Or copy this file to the VPS and run: bash vps-health-monitor.sh

set -euo pipefail

SCRIPT_URL="https://raw.githubusercontent.com/YOUR_USER/apex-dev/main/deploy/vps-health-monitor.sh"
INSTALL_DIR="/opt/apex-health-monitor"
CONFIG_FILE="/etc/apex-health-monitor.json"
SERVICE_FILE="/etc/systemd/system/apex-health-monitor.service"

log()  { echo "[vps-health] $*"; }
warn() { echo "[vps-health] WARN: $*" >&2; }
die()  { echo "[vps-health] ERROR: $*" >&2; exit 1; }

# ── Detect OS ──────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS="$ID"
else
  die "Cannot detect OS"
fi

# ── Install Node.js if missing ───────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing Node.js 20"
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  elif [[ "$OS" == "alpine" ]]; then
    apk add --no-cache nodejs npm
  else
    die "Unsupported OS: $OS"
  fi
fi

NODE_VERSION=$(node --version)
log "Node.js version: $NODE_VERSION"

# ── Create monitor script ───────────────────────────────────────
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/monitor.js" << 'MONITOR_EOF'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = '/etc/apex-health-monitor.json';
const LOG_PATH = '/var/log/apex-health-monitor.log';
const STATE_PATH = '/var/run/apex-health-monitor.json';

// Load config
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('[monitor] Config not found at', CONFIG_PATH);
  process.exit(1);
}

const INTERVAL = (config.check_interval_sec || 60) * 1000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {}
}

function runCheck(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    return { ok: true, stdout: out };
  } catch (e) {
    return { ok: false, error: e.message, stdout: e.stdout || '' };
  }
}

function sendWebhook(url, payload) {
  if (!url) return;
  try {
    execSync(`curl -fsSL -X POST -H "Content-Type: application/json" -d '${JSON.stringify(payload).replace(/'/g, "'\"'\"'")}' "${url}" 2>/dev/null`, { timeout: 15000 });
  } catch (e) {
    log(`Webhook failed: ${e.message}`);
  }
}

function sendEmail(email, subject, body) {
  if (!email) return;
  try {
    execSync(`echo "${body}" | mail -s "${subject}" "${email}" 2>/dev/null || true`, { timeout: 10000 });
  } catch {}
}

function doCheck() {
  const checks = config.checks || {};
  const results = [];

  // PM2
  if (checks.pm2 !== false) {
    const r = runCheck('pm2 jlist 2>/dev/null || echo "PM2_NOT_FOUND"');
    const ok = r.stdout.includes('PM2_NOT_FOUND') ? false : r.stdout.includes('"name"');
    results.push({ name: 'pm2', ok, message: ok ? 'PM2 running' : 'PM2 not found or empty' });
  }

  // Nginx
  if (checks.nginx !== false) {
    const r = runCheck('systemctl is-active nginx 2>/dev/null || echo "inactive"');
    const ok = r.stdout.trim() === 'active';
    results.push({ name: 'nginx', ok, message: ok ? 'nginx active' : 'nginx not active' });
  }

  // Disk
  if (checks.disk !== false) {
    const thresh = checks.disk_threshold_pct || 80;
    const r = runCheck('df -h / | tail -1');
    const m = r.stdout.match(/(\d+)%/);
    const used = m ? parseInt(m[1]) : 100;
    const ok = used < thresh;
    results.push({ name: 'disk', ok, message: `Disk usage: ${used}%`, used });
  }

  // DB
  if (checks.db) {
    const dbUrl = checks.db_url || 'postgresql://localhost/app';
    const r = runCheck(`psql "${dbUrl}" -c "SELECT 1;" 2>&1 || echo "DB_FAILED"`);
    const ok = r.stdout.includes('1 row');
    results.push({ name: 'db', ok, message: ok ? 'DB reachable' : 'DB check failed' });
  }

  // App port
  if (checks.app_port) {
    const port = checks.app_port || 3000;
    const r = runCheck(`ss -tlnp | grep ':${port} ' || echo "PORT_NOT_LISTENING"`);
    const ok = !r.stdout.includes('PORT_NOT_LISTENING');
    results.push({ name: 'app_port', ok, message: ok ? `Port ${port} listening` : `Port ${port} not listening` });
  }

  const failed = results.filter(c => !c.ok);
  const ok = results.filter(c => c.ok);

  // Save state
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  } catch {}

  // Log
  if (failed.length) {
    log(`FAIL: ${failed.map(f => f.message).join('; ')}`);
  } else {
    log(`OK: ${ok.map(f => f.name).join(', ')}`);
  }

  // Alert
  const critical = failed.some(f => f.name === 'pm2' || f.name === 'app_port');
  if (critical && (config.alert_webhook || config.alert_email)) {
    const payload = {
      severity: 'critical',
      message: `VPS ${require('os').hostname()} — ${failed.map(f => f.message).join('; ')}`,
      timestamp: new Date().toISOString()
    };
    sendWebhook(config.alert_webhook, payload);
    sendEmail(config.alert_email, `[CRITICAL] VPS ${require('os').hostname()} health alert`, JSON.stringify(payload, null, 2));
  }

  return results;
}

// Run immediately, then on interval
log('VPS Health Monitor starting');
doCheck();
const timer = setInterval(doCheck, INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => { clearInterval(timer); log('Shutting down'); process.exit(0); });
process.on('SIGINT', () => { clearInterval(timer); log('Shutting down'); process.exit(0); });
MONITOR_EOF

log "Monitor script written to $INSTALL_DIR/monitor.js"

# ── Create default config if not present ───────────────────────────
if [[ ! -f "$CONFIG_FILE" ]]; then
  log "Creating default config at $CONFIG_FILE"
  cat > "$CONFIG_FILE" << 'CONFIG_EOF'
{
  "check_interval_sec": 60,
  "alert_webhook": "",
  "alert_email": "",
  "checks": {
    "pm2": true,
    "nginx": true,
    "disk": true,
    "db": false,
    "disk_threshold_pct": 80,
    "app_port": 3000,
    "db_url": ""
  }
}
CONFIG_EOF
fi

# ── Create systemd service ─────────────────────────────────
log "Installing systemd service"
cat > "$SERVICE_FILE" << 'SERVICE_EOF'
[Unit]
Description=Apex Dev VPS Health Monitor
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/apex-health-monitor/monitor.js
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apex-health-monitor

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# ── Start service ─────────────────────────────────────────
systemctl daemon-reload
systemctl enable apex-health-monitor
systemctl start apex-health-monitor

log "VPS Health Monitor installed and running!"
log "Config:  $CONFIG_FILE"
log "Log:     journalctl -u apex-health-monitor -f"
log "State:   /var/run/apex-health-monitor.json"
log ""
log "Edit $CONFIG_FILE to set your webhook/email, then run:"
log "  systemctl restart apex-health-monitor"
