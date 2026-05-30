---
name: Apex Dev architecture
description: Monorepo layout, key constraints, and how frontend/backend/services connect
---

## Structure
- `apps/api` — Express backend (ESM, `"type":"module"` in root package.json)
- `apps/web` — React + Vite frontend
- `services/` — shared JS services imported by the API routes (no separate package.json)
- `pnpm-workspace.yaml` — workspaces: `apps/*`

## Key constraints
- Root `package.json` has `"type":"module"` → ecosystem config must be `ecosystem.config.cjs` (CommonJS), NOT `ecosystem.config.js`
- PM2 config uses `module.exports` syntax even though all app code is ESM
- Vite dev server runs on port 5000; Express API on port 3000
- `apps/web/dist` only exists after `pnpm --filter @apex/web build` — the API's catch-all static route is gated on `existsSync(distPath)` so it doesn't crash in dev

## Services shared between routes
- `services/vps/sessions.js` — shared Map of active VPS SSH sessions (imported by both `routes/vps.js` and `routes/orchestrator.js`)
- `services/workflow/store.js` — in-memory workflow log (imported by `routes/orchestrator.js`, `routes/repair.js`, `routes/workflow.js`)
- `services/approval/runtime.js` — in-memory approval Map with createApproval/approveAction/rejectAction

## Docker
Multi-stage Dockerfile: `deps` → `builder` (builds web) → `production` (node only, copies dist)
