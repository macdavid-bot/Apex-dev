#!/usr/bin/env bash
# Apex Dev — production deploy script
# Run from the repository root on your VPS:
#   bash deploy/deploy.sh
set -euo pipefail

APP_DIR="/var/www/apex-dev"
LOG_DIR="/var/log/apex-dev"
APP_USER="apex"

# ── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Checks ───────────────────────────────────────────────────────────────────
[[ "$(id -u)" == "0" ]] || die "Run as root (sudo bash deploy/deploy.sh)"
command -v node  >/dev/null || die "Node.js not found. Install Node.js 20+"
command -v pnpm  >/dev/null || die "pnpm not found. Run: npm install -g pnpm"
command -v nginx >/dev/null || warn "nginx not found — skipping nginx reload"

# ── Create app user / directories ────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  log "Creating user $APP_USER"
  useradd --system --home-dir "$APP_DIR" --no-create-home --shell /bin/bash "$APP_USER" || true
fi

mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$APP_USER:$APP_USER" "$LOG_DIR"

# ── Copy files ───────────────────────────────────────────────────────────────
log "Syncing application files to $APP_DIR"
rsync -a --delete \
  --exclude='.env*' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='deploy/*.sh' \
  . "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── Install dependencies ──────────────────────────────────────────────────────
log "Installing dependencies"
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile

# ── Build frontend ────────────────────────────────────────────────────────────
log "Building frontend"
sudo -u "$APP_USER" pnpm --filter @apex/web build

# ── Validate environment ──────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env.production" ]]; then
  warn ".env.production not found at $APP_DIR/.env.production"
  warn "Copy deploy/.env.production.example and fill in the values"
fi

# ── nginx ─────────────────────────────────────────────────────────────────────
if [[ -f "deploy/nginx.conf" ]] && command -v nginx >/dev/null; then
  log "Installing nginx config"
  cp deploy/nginx.conf /etc/nginx/sites-available/apex-dev
  ln -sf /etc/nginx/sites-available/apex-dev /etc/nginx/sites-enabled/apex-dev
  nginx -t && systemctl reload nginx && log "nginx reloaded" || warn "nginx reload failed — check config"
fi

# ── PM2 ───────────────────────────────────────────────────────────────────────
if command -v pm2 >/dev/null; then
  log "Starting/restarting PM2 processes"
  sudo -u "$APP_USER" pm2 startOrRestart deploy/ecosystem.config.cjs --env production
  sudo -u "$APP_USER" pm2 save
  log "Run 'pm2 startup' to enable auto-start on boot"
elif command -v systemctl >/dev/null; then
  log "Installing systemd service"
  cp deploy/apex-dev.service /etc/systemd/system/apex-dev.service
  systemctl daemon-reload
  systemctl enable apex-dev
  systemctl restart apex-dev
  log "apex-dev.service started"
else
  warn "Neither PM2 nor systemd found — start manually: NODE_ENV=production node apps/api/src/index.js"
fi

log "Deploy complete!"
log "API:      http://127.0.0.1:3000/health"
[[ -f /etc/nginx/sites-enabled/apex-dev ]] && log "Frontend: https://your-domain.com (after DNS + cert)"
