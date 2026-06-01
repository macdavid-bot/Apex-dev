---
name: New Services Architecture
description: Repository registry, global agent memory, rollback checkpoints, deployment validator — added in batch build
---

## Repository Registry (services/repos/registry.js)
- DB table: `repositories` with name (slug), label, owner, repo, branch, purpose, clone_path, deploy_server_id, env_info
- Key functions: `listRepos()`, `getRepo(nameOrLabel)` (fuzzy slug match), `addRepo()`, `updateRepo()`, `deleteRepo()`, `formatReposForPrompt()`
- `getRepo` tries exact slug match first, then ILIKE fuzzy match on label
- Injected into every buildSystemPrompt call so AI always sees registered repos
- API: GET/POST/PATCH/DELETE `/repos`

## Global Agent Memory (services/memory/agent-memory.js)
- DB table: `agent_memory` with category, key, value, tags_json, repo_name (optional scope)
- Categories: architecture, instruction, infrastructure, deployment, preference, fact
- Key functions: `remember()`, `recall({ query, category, repoName, limit })`, `forget(id)`, `formatMemoryForPrompt(repoName)`
- AI actions: `remember`, `recall`, `forget` (distinct from per-project `add_memory`/`recall_memory`)
- Injected into buildSystemPrompt before per-repo memory

## Rollback Checkpoints (services/rollback/checkpoints.js)
- DB table: `rollback_checkpoints` with type, server_id, repo_name, git_sha, pm2_state_json, metadata_json
- Types: deployment, self_edit, config_change, manual, vps_change
- `createCheckpoint()` captures git HEAD SHA + PM2 jlist output
- `restoreCheckpoint()` does git checkout SHA + pm2 restart/stop each process
- API: GET/POST/DELETE `/rollback/checkpoints`, POST `/rollback/checkpoints/:id/restore`

## Deployment Validator (services/deployment/validator.js)
- `validateVpsDeployment(server, requiredEnvVars)` — SSH in and check: deploy dir, env vars, node/npm, PM2, disk space (>500MB), node_modules
- Returns `{ success, server, checks: [{label, success, output}], completedAt }`
- VPS route: POST `/vps/servers/:id/validate`

**Why:** These services needed persistent state and structured access patterns; using the same DB-backed + in-memory fallback pattern as the rest of the codebase ensures the app runs without a DB.
