---
name: Apex Dev wiring status
description: Which routes/services are real vs stub, and what the AI agent loop does
---

## AI agent loop (routes/orchestrator.js)
- POST /orchestrator/chat → DeepSeek agent loop, up to 8 iterations
- Parses `apex-action` JSON blocks from AI responses and executes them in order
- Action types: read_file, edit_file, create_branch, run_local, run_vps, list_files, git_diff
- Uses GitHub API when repoContext.owner is set; falls back to local filesystem
- Registers a workflow entry on each task start; updates to completed/failed when done

## Wired endpoints (all real, no stubs)
- GET /health — version + AI/GitHub config status
- GET/POST /approvals — CRUD with IDs; POST /:id/approve and POST /:id/reject
- GET /deployment/list — PM2 jlist + local port health probe + VPS SSH ping
- GET /workflow — in-memory workflow list (populated by orchestrator + repair routes)
- POST /validation/run — real shell checks: path, package.json, node_modules, lint, env vars
- POST /git/branch|checkout|commit|diff|push — all async, pass cwd from body
- POST /repair/analyze|root-cause|suggestions|recover — all call DeepSeek API
- POST /shell/execute — supports cwd param
- POST /deployment/docker|pm2|package — real docker compose / pm2 / pnpm add

## Repair services
All four services (failure-analysis, root-cause, suggestions, recovery) call runDeepSeekChat.
They gracefully degrade (static response) when DEEPSEEK_API_KEY is not set.

## Rate limiting
In-process: 300 req/min per IP, no external dependency.
Body limit: 10 MB.

## What is NOT yet persistent
- Approvals, workflows — in-memory only (lost on restart)
- Conversations — in-memory Map in orchestrator (lost on restart)
- No PostgreSQL/Drizzle wired yet (schema exists in services/database/schema.js but no DB connected)
