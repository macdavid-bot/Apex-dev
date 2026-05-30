---
name: Auth & Storage Architecture
description: Single-user JWT auth + VPS PostgreSQL; both have graceful fallbacks
---

## Auth
- Single user: credentials from `AUTH_USERNAME`/`AUTH_PASSWORD` env vars (defaults: mac_david / @Davidluiz4life)
- JWT signed with `JWT_SECRET`; if missing, falls back to insecure hardcoded secret with a console warning
- Token accepted in: `Authorization: Bearer` header → `?token=` query param → `apex_token` httpOnly cookie
- The `?token=` query param path exists specifically for EventSource (SSE) and WebSocket, which can't set headers
- Token expiry: 30 days

## Storage
- `DATABASE_URL` env var → VPS PostgreSQL via `pg` Pool
- `dbAvailable()` probes the pool before every DB operation
- If DB is unavailable: all services fall back to in-memory Maps/arrays — app fully functional without DB
- DB schema is applied via `runMigrations()` on startup (non-blocking if DB unavailable)

**Why:** App must work in dev without DATABASE_URL set, while being production-ready when pointed at a VPS PostgreSQL.

**How to apply:** When adding new persistent data, always check `dbAvailable()` first and provide an in-memory fallback.
