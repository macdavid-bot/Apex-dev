---
name: Production deployment infrastructure
description: nginx, PM2, systemd, deploy script, and env template for VPS production deployment
---

# Production Deployment — deploy/ directory

## Files
- `deploy/nginx.conf` — reverse proxy: port 443 SSL, proxies /ws/ as WebSocket, all API routes to port 3000, serves frontend from `apps/web/dist`
- `deploy/apex-dev.service` — systemd unit (fallback if PM2 unavailable)
- `deploy/ecosystem.config.cjs` — PM2 config, single fork instance, logs to /var/log/apex-dev/
- `deploy/deploy.sh` — full deploy script: creates apex user, rsyncs files, installs deps, builds frontend, sets up nginx + PM2/systemd
- `deploy/.env.production.example` — template listing all required env vars

## Key Architecture Decision
**Single-origin production setup**: nginx serves both the built frontend (static files from `apps/web/dist`) and proxies the API — no separate port needed from the browser. All WebSocket, SSE, and REST calls go through the same origin.

In development, Vite's proxy handles the same routing (see `apps/web/vite.config.js`).

## Why This Matters
`TerminalPanel.jsx` uses `buildWsUrl()` which derives the WS URL from `window.location.host` — no hardcoded port. This means it works on both Replit dev (via Vite proxy on port 5000) and VPS production (via nginx on port 443).

## How to Apply
On a VPS:
1. `sudo bash deploy/deploy.sh` from repo root
2. Copy `deploy/.env.production.example` to `/var/www/apex-dev/.env.production` and fill in values
3. Run certbot for TLS: `certbot --nginx -d your-domain.com`
4. Edit `deploy/nginx.conf` to replace `YOUR_DOMAIN` with actual domain
