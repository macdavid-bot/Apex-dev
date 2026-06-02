---
name: Domain + DB Admin Services
description: Domain registry with nginx deployer, and DB backup import/export via SSE
---

## Domain Manager (services/domains/manager.js)
- DB table: `domains` (id, server_id, domain, app_port, ssl, notes, status, nginx_path)
- `buildNginxConfig({domain, app_port, ssl})` — generates nginx reverse-proxy config with WebSocket upgrade support
- SSL path: `/etc/letsencrypt/live/{domain}/fullchain.pem`
- `formatDomainsForPrompt(domains)` — injected into every buildSystemPrompt

## Domain Route (routes/domains.js)
- GET/POST/PATCH/DELETE `/domains`
- POST `/domains/:id/deploy` — SSH into VPS, write nginx config via SFTP, run `nginx -t && systemctl reload nginx`, optionally run certbot
- Uses `ssh2` Client directly (not node-ssh) for SFTP file writing
- **`ssh2` must be installed at workspace root**: `pnpm add -w ssh2`

## DB Admin Route (routes/db-admin.js)
- POST `/db-admin/import` — local DB restore via `psql` or `pg_restore`, responses via SSE
- POST `/db-admin/import-to-vps` — upload via multer → SFTP to VPS → run psql/pg_restore on VPS
- GET `/db-admin/export` — streams `pg_dump` output as download
- Uses `multer` for file upload (`pnpm add -w multer`)
- File size limit: 500 MB
- Both import endpoints use SSE (`text/event-stream`) so restore runs while user chats

## AI Actions
- `configure_domain` — sets up nginx on VPS and registers in domains table
- `list_domains` — returns all registered domains
- `restore_db_backup` — SSHes to VPS and runs psql/pg_restore on an existing file

**Why:** Domain configs are structural decisions that should persist alongside VPS definitions. DB restores can be long-running and need to work while the user is chatting (hence SSE).
