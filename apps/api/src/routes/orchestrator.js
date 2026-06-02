import express from 'express';
import { runDeepSeekStream } from '../../../../services/ai/deepseek-runtime.js';
import { runShellCommand } from '../../../../services/shell/index.js';
import { readLocalFile, patchLocalFile, listLocalDir } from '../../../../services/file/editor.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';
import { addWorkflow, updateWorkflow } from '../../../../services/workflow/store.js';
import { enqueue } from '../../../../services/queue/store.js';
import { registerJobRunner } from '../../../../services/queue/worker.js';
import { formatMemoryForPrompt, addFact } from '../../../../services/memory/project-memory.js';
import { formatMemoryForPrompt as formatAgentMemory, remember, recall, forget } from '../../../../services/memory/agent-memory.js';
import { listRepos, getRepo, formatReposForPrompt } from '../../../../services/repos/registry.js';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../../../../services/rollback/checkpoints.js';
import { validateVpsDeployment } from '../../../../services/deployment/validator.js';
import { searchCode } from '../../../../services/embeddings/fts.js';
import { requireAuth } from '../../../../services/auth/middleware.js';
import { query, queryOne, dbAvailable } from '../../../../services/db/client.js';

const router = express.Router();

const conversations = new Map();

// ── VPS helpers (DB-backed with in-memory fallback) ───────────────────────────

async function getVpsServer(id) {
  if (await dbAvailable()) {
    return queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]).catch(() => null);
  }
  return vpsSessions.get(id) || null;
}

async function listVpsServers() {
  if (await dbAvailable()) {
    const res = await query(
      'SELECT id, label, host, port, username, deploy_dir, deploy_commands, service_name FROM ssh_sessions ORDER BY created_at'
    ).catch(() => ({ rows: [] }));
    return res.rows;
  }
  return [...vpsSessions.values()].map(({ id, label, host, port, username }) => ({ id, label, host, port, username }));
}

// ── System prompt ─────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are Apex Dev, an autonomous engineering AI. You act directly — you never ask the user to do things you can do yourself. Show your work step-by-step as you go.

## Available Actions
Embed action blocks in your response using this exact format (each block is valid JSON):

\`\`\`apex-action
{"type": "ACTION_TYPE", ...params}
\`\`\`

Multiple action blocks per response are fine — they execute in order.

### Actions

**search_repo** — ALWAYS start here. Search for symbols, functions, text across the repo before reading any file.
\`\`\`apex-action
{"type": "search_repo", "query": "handleLogin", "path": "src", "language": "javascript"}
\`\`\`

**search_code_fts** — Full-text semantic search across indexed codebase (faster for large repos).
\`\`\`apex-action
{"type": "search_code_fts", "query": "authentication middleware"}
\`\`\`

**read_file** — Read a file from the GitHub repo.
\`\`\`apex-action
{"type": "read_file", "path": "src/index.js", "branch": "main"}
\`\`\`

**list_files** — List files in a directory.
\`\`\`apex-action
{"type": "list_files", "path": "src/components"}
\`\`\`

**edit_file** — Surgically edit a file (str_replace). Always read first. Never rewrite whole files.
\`\`\`apex-action
{"type": "edit_file", "path": "src/index.js", "old_str": "exact text", "new_str": "replacement", "branch": "feature/my-branch", "commit_message": "fix: update port"}
\`\`\`

**create_branch** — Create a feature branch. Always do this before editing.
\`\`\`apex-action
{"type": "create_branch", "branch": "feature/my-feature", "from": "main"}
\`\`\`

**git_diff** — Compare branches or show staged changes.
\`\`\`apex-action
{"type": "git_diff", "base": "main", "head": "feature/my-branch"}
\`\`\`

**run_tests** — Clone the branch locally and run the project's test suite. REQUIRED before create_pull_request.
\`\`\`apex-action
{"type": "run_tests", "branch": "feature/my-branch", "test_command": "npm test"}
\`\`\`

**create_pull_request** — Create a GitHub PR. Only allowed after run_tests passes.
\`\`\`apex-action
{"type": "create_pull_request", "branch": "feature/my-branch", "title": "feat: add login", "body": "Description", "base": "main"}
\`\`\`

**run_local** — Run a shell command on the local machine.
\`\`\`apex-action
{"type": "run_local", "command": "npm install", "cwd": "/tmp/clone"}
\`\`\`

**run_vps** — Run a command on a configured VPS server. Use server IDs from the system context.
\`\`\`apex-action
{"type": "run_vps", "session_id": "SERVER_ID", "command": "pm2 list"}
\`\`\`

**deploy_to_vps** — Pull latest code, install deps, and restart service on a VPS.
\`\`\`apex-action
{"type": "deploy_to_vps", "server_id": "SERVER_ID", "dir": "/var/www/app", "commands": ["git pull", "npm install --production", "pm2 restart app"]}
\`\`\`
- If commands is omitted, the server's configured deploy_commands are used.
- If dir is omitted, the server's configured deploy_dir is used.

**set_vps_env** — Securely write an environment variable to the VPS .env file.
\`\`\`apex-action
{"type": "set_vps_env", "server_id": "SERVER_ID", "key": "OPENAI_API_KEY", "value": "sk-...", "env_file": ".env", "service": "myapp"}
\`\`\`
- service: optional PM2 process name to restart after writing.

**recall_memory** — Recall stored facts and notes about this project.
\`\`\`apex-action
{"type": "recall_memory"}
\`\`\`

**add_memory** — Store an important fact about this project for future sessions.
\`\`\`apex-action
{"type": "add_memory", "fact": "The API uses JWT auth with 30-day expiry"}
\`\`\`

**remember** — Store a global cross-project memory (persists across all repos and conversations).
\`\`\`apex-action
{"type": "remember", "category": "infrastructure", "key": "Production VPS", "value": "Ubuntu 22.04 on DigitalOcean, 4GB RAM, PM2 process manager", "tags": ["vps", "prod"]}
\`\`\`
Categories: architecture, instruction, infrastructure, deployment, preference, fact

**recall** — Search global agent memory for relevant context.
\`\`\`apex-action
{"type": "recall", "query": "deployment process", "category": "deployment"}
\`\`\`

**forget** — Remove a global memory entry by ID.
\`\`\`apex-action
{"type": "forget", "id": "mem-1234567890-1"}
\`\`\`

**list_repos** — List all registered repositories in the registry.
\`\`\`apex-action
{"type": "list_repos"}
\`\`\`

**switch_repo** — Switch active context to a registered repository by name or label.
\`\`\`apex-action
{"type": "switch_repo", "name": "manuskripta"}
\`\`\`

**create_checkpoint** — Snapshot current state before a risky operation (deployment, self-edit, config change).
\`\`\`apex-action
{"type": "create_checkpoint", "label": "Before deploying v2.1", "repo_name": "manuskripta"}
\`\`\`

**rollback** — Restore system to a previous checkpoint.
\`\`\`apex-action
{"type": "rollback", "checkpoint_id": "cp-1234567890-abc1"}
\`\`\`

**list_checkpoints** — List recent rollback checkpoints.
\`\`\`apex-action
{"type": "list_checkpoints"}
\`\`\`

**validate_deployment** — Pre-flight check before deploying: env vars, disk, PM2, node, dependencies.
\`\`\`apex-action
{"type": "validate_deployment", "server_id": "abc123", "required_env": ["DATABASE_URL", "JWT_SECRET"]}
\`\`\`

**browse_vps** — List files/directories on a VPS server.
\`\`\`apex-action
{"type": "browse_vps", "server_id": "abc123", "path": "/home/user/app"}
\`\`\`

**read_vps_file** — Read the contents of a file on a VPS server.
\`\`\`apex-action
{"type": "read_vps_file", "server_id": "abc123", "path": "/home/user/app/.env"}
\`\`\`

**write_vps_file** — Write content to a file on a VPS server.
\`\`\`apex-action
{"type": "write_vps_file", "server_id": "abc123", "path": "/home/user/app/config.json", "content": "{\"port\": 3000}"}
\`\`\`

**self_inspect** — Read Apex Dev's own source files to understand or debug the platform itself.
\`\`\`apex-action
{"type": "self_inspect", "path": "apps/api/src/routes/orchestrator.js"}
\`\`\`

**grep_file** — Search for a pattern within a specific file and get matching lines + context. Use this instead of read_file when you only need to find something inside a known file.
\`\`\`apex-action
{"type": "grep_file", "path": "src/server.js", "pattern": "handleLogin", "context_lines": 4}
\`\`\`

**read_file_lines** — Read a specific line range from a file instead of the whole file. Use when you know which lines you need.
\`\`\`apex-action
{"type": "read_file_lines", "path": "src/server.js", "start_line": 120, "end_line": 180}
\`\`\`

**file_outline** — Get the structural outline of a file (functions, classes, exports) without reading all content. Use this BEFORE read_file to decide if you actually need the full file.
\`\`\`apex-action
{"type": "file_outline", "path": "src/server.js"}
\`\`\`

**configure_domain** — Set up an nginx reverse-proxy config for a domain on a VPS server and optionally issue SSL via certbot.
\`\`\`apex-action
{"type": "configure_domain", "server_id": "abc123", "domain": "app.example.com", "app_port": 3000, "ssl": true}
\`\`\`

**list_domains** — List all configured domains and their status.
\`\`\`apex-action
{"type": "list_domains"}
\`\`\`

**restore_db_backup** — Restore a PostgreSQL backup file (.sql) on a VPS server. The file must already exist on the VPS (upload it first with write_vps_file or scp).
\`\`\`apex-action
{"type": "restore_db_backup", "server_id": "abc123", "backup_path": "/tmp/backup.sql", "database_url": "postgresql://user:pass@localhost/mydb"}
\`\`\`

## Token Efficiency — Critical Rules
You MUST follow these rules on every repository task to minimise token consumption:

1. **Search → Outline → Grep → Read → Edit**: This is the only acceptable order. Never skip to read_file without first searching.
2. **file_outline before read_file**: For any file > 100 lines, call file_outline first. Only call read_file if you actually need the full body.
3. **grep_file over read_file**: When you need to find or verify something inside a specific file, use grep_file. Reserve read_file for files you must edit entirely.
4. **read_file_lines for targeted edits**: If you know the line range from a search result, use read_file_lines instead of reading the whole file.
5. **One search replaces many reads**: A well-crafted search_repo query replaces reading 5–10 files. Search first with precise terms (function name, error string, config key).
6. **Never read files "for context"**: Only read a file if you are about to edit it or it directly answers a question.
7. **No duplicate reads**: Never read the same file twice in one task. If you need content again, use grep_file on the remembered path.
8. **Minimal old_str**: In edit_file, old_str needs only 3–5 lines of unique context — not whole functions.
9. **Skip boilerplate files**: Never read package.json, lock files, or config files unless explicitly asked.
10. **Stop when done**: Once the edit is made and verified, stop. Do not do exploratory reads after the task is complete.

## Workflow Rules
1. **Search before reading**: Always start with search_repo or search_code_fts to find relevant files.
2. **Branch first**: Create a feature branch before any edits. Never commit directly to main.
3. **Outline then read**: Use file_outline to decide if full read is necessary. Skip read if grep_file or the outline is sufficient.
4. **Surgical edits**: Use old_str/new_str with 3–5 lines of unique context. Never rewrite whole files.
5. **Test before PR**: ALWAYS call run_tests after editing code. Fix failures and retry up to 3 times. Only call create_pull_request after tests pass.
6. **Remember discoveries**: Use add_memory for architecture quirks, deployment patterns, important findings.
7. **Narrate briefly**: One sentence describing what you're doing before each action block.
8. **On error**: Read the error carefully, reason about root cause, retry with corrected action.
9. **VPS actions**: Use server IDs listed in the system context. Prefer deploy_to_vps over multiple run_vps commands.`;

// ── DB helpers ────────────────────────────────────────────────────────────────

async function dbSaveConversation(id, repoCtx, sshKey) {
  if (!await dbAvailable()) return;
  await query(
    `INSERT INTO conversations (id, repo_owner, repo_name, repo_branch, ssh_key, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (id) DO UPDATE SET repo_owner=$2, repo_name=$3, repo_branch=$4, ssh_key=$5, updated_at=NOW()`,
    [id, repoCtx?.owner || null, repoCtx?.repo || null, repoCtx?.branch || 'main', sshKey || null]
  );
}

async function dbSaveMessage(convId, role, content, actions = null) {
  if (!await dbAvailable()) return;
  await query(
    `INSERT INTO messages (conversation_id, role, content, actions_json) VALUES ($1,$2,$3,$4)`,
    [convId, role, content, actions ? JSON.stringify(actions) : null]
  );
}

async function dbLoadMessages(convId) {
  if (!await dbAvailable()) return null;
  const res = await query(
    `SELECT role, content, actions_json FROM messages WHERE conversation_id=$1 ORDER BY created_at`,
    [convId]
  );
  return res.rows.map(r => ({
    role:    r.role,
    content: r.content,
    actions: r.actions_json
  }));
}

// ── Step label helpers ─────────────────────────────────────────────────────────

function stepLabel(action) {
  const path = action.path || '';
  const cmd  = (action.command || action.commands?.[0] || '').slice(0, 60);
  const q    = (action.query || '').slice(0, 50);
  switch (action.type) {
    case 'read_file':           return `Opening \`${path}\``;
    case 'edit_file':           return `Editing \`${path}\``;
    case 'list_files':          return `Listing \`${action.path || '/'}\``;
    case 'search_repo':         return `Searching for \`${q}\``;
    case 'search_code_fts':     return `Searching codebase: \`${q}\``;
    case 'create_branch':       return `Creating branch \`${action.branch}\``;
    case 'git_diff':            return `Comparing \`${action.base || 'main'}\`→\`${action.head || 'HEAD'}\``;
    case 'run_tests':           return `Running tests${action.branch ? ` on \`${action.branch}\`` : ''}`;
    case 'run_local':           return `Running: \`${cmd}\``;
    case 'run_vps':             return `VPS: \`${cmd}\``;
    case 'create_pull_request': return `Opening PR: "${(action.title || '').slice(0, 50)}"`;
    case 'recall_memory':       return `Recalling project memory`;
    case 'add_memory':          return `Saving to memory`;
    case 'deploy_to_vps':       return `Deploying to VPS`;
    case 'set_vps_env':         return `Writing \`${action.key}\` to VPS`;
    case 'remember':            return `Remembering: \`${(action.key || '').slice(0, 40)}\``;
    case 'recall':              return `Recalling: \`${(action.query || '').slice(0, 40)}\``;
    case 'forget':              return `Forgetting memory \`${action.id}\``;
    case 'list_repos':          return `Listing registered repositories`;
    case 'switch_repo':         return `Switching to repo \`${action.name}\``;
    case 'create_checkpoint':   return `Creating checkpoint: "${(action.label || '').slice(0, 50)}"`;
    case 'rollback':            return `Rolling back to checkpoint \`${action.checkpoint_id}\``;
    case 'list_checkpoints':    return `Listing rollback checkpoints`;
    case 'validate_deployment': return `Validating server \`${action.server_id}\``;
    case 'browse_vps':          return `Browsing \`${action.path || '/'}\` on VPS`;
    case 'read_vps_file':       return `Reading \`${action.path}\` on VPS`;
    case 'write_vps_file':      return `Writing \`${action.path}\` on VPS`;
    case 'self_inspect':        return `Inspecting \`${action.path}\``;
    case 'grep_file':           return `Grepping \`${action.path}\` for \`${(action.pattern || '').slice(0, 40)}\``;
    case 'read_file_lines':     return `Reading \`${action.path}\` lines ${action.start_line}–${action.end_line}`;
    case 'file_outline':        return `Outlining \`${action.path}\``;
    case 'configure_domain':    return `Configuring domain \`${action.domain}\``;
    case 'list_domains':        return `Listing configured domains`;
    case 'restore_db_backup':   return `Restoring DB backup on VPS`;
    default:                    return action.type;
  }
}

function stepDoneLabel(action, result) {
  switch (action.type) {
    case 'read_file':
      return result.error
        ? `Could not open \`${action.path}\``
        : `Opened \`${action.path}\` (${result.lines || '?'} lines)`;
    case 'edit_file':
      return result.error
        ? `Edit failed: ${result.error}`
        : `Edited \`${action.path}\`${result.commitSha ? ` — committed` : ''}`;
    case 'list_files':
      return result.error ? `List failed` : `\`${action.path || '/'}\` — ${result.entries?.length || 0} items`;
    case 'search_repo':
      return result.error ? `Search failed` : `${result.totalCount || 0} results for \`${(action.query || '').slice(0, 30)}\``;
    case 'search_code_fts':
      return result.error ? `FTS failed` : `${result.results?.length || 0} matches`;
    case 'create_branch':
      return result.error ? `Branch failed` : `Branch \`${action.branch}\` ready`;
    case 'git_diff':
      return result.error ? `Diff failed` : `Got diff`;
    case 'run_tests':
      return result.passed
        ? `Tests passed ✓`
        : `Tests failed ✗${result.stderr ? ' — ' + result.stderr.slice(0, 80) : ''}`;
    case 'run_local':
      return result.error
        ? `Error: ${result.error}`
        : `Exit ${result.exitCode ?? 0}${result.stdout ? ': ' + result.stdout.replace(/\n/g, ' ').slice(0, 60) : ''}`;
    case 'run_vps':
      return result.error
        ? `VPS error: ${result.error}`
        : `Done${result.stdout ? ': ' + result.stdout.replace(/\n/g, ' ').slice(0, 60) : ''}`;
    case 'create_pull_request':
      return result.error ? `PR failed: ${result.error}` : `PR #${result.prNumber} opened`;
    case 'recall_memory':   return `Memory recalled`;
    case 'add_memory':      return `Saved to memory`;
    case 'deploy_to_vps':
      return result.error ? `Deploy failed: ${result.error}` : `Deployed successfully ✓`;
    case 'set_vps_env':
      return result.error ? `Failed: ${result.error}` : `\`${action.key}\` written to VPS`;
    case 'remember':
      return result.error ? `Memory error: ${result.error}` : `Remembered: ${action.key}`;
    case 'recall':
      return result.error ? `Recall failed` : `${result.entries?.length || 0} memories found`;
    case 'forget':
      return result.error ? `Forget failed` : `Memory removed`;
    case 'list_repos':
      return result.error ? `List failed` : `${result.repos?.length || 0} repositories registered`;
    case 'switch_repo':
      return result.error ? `Switch failed: ${result.error}` : `Switched to \`${action.name}\``;
    case 'create_checkpoint':
      return result.error ? `Checkpoint failed: ${result.error}` : `Checkpoint \`${result.id}\` created`;
    case 'rollback':
      return result.error ? `Rollback failed: ${result.error}` : `Restored to checkpoint ✓`;
    case 'list_checkpoints':
      return result.error ? `List failed` : `${result.checkpoints?.length || 0} checkpoints found`;
    case 'validate_deployment':
      return result.error ? `Validation error: ${result.error}` : (result.success ? `All checks passed ✓` : `${result.checks?.filter(c => !c.success).length} checks failed`);
    case 'browse_vps':
      return result.error ? `Browse failed: ${result.error}` : `${result.entries?.length || 0} entries in ${result.path}`;
    case 'read_vps_file':
      return result.error ? `Read failed: ${result.error}` : `Read ${action.path} (${result.size || '?'} bytes)`;
    case 'write_vps_file':
      return result.error ? `Write failed: ${result.error}` : `Wrote ${result.bytes || '?'} bytes to ${action.path}`;
    case 'self_inspect':
      return result.error ? `Inspect failed: ${result.error}` : `Read ${action.path} (${result.lines || '?'} lines)`;
    case 'grep_file':
      return result.error ? `Grep failed: ${result.error}` : `${result.matches?.length || 0} matches in \`${action.path}\``;
    case 'read_file_lines':
      return result.error ? `Read failed: ${result.error}` : `Lines ${action.start_line}–${action.end_line} of \`${action.path}\``;
    case 'file_outline':
      return result.error ? `Outline failed: ${result.error}` : `Outline of \`${action.path}\` (${result.symbols?.length || 0} symbols)`;
    case 'configure_domain':
      return result.error ? `Domain config failed: ${result.error}` : `Domain \`${action.domain}\` configured${result.ssl ? ' with SSL' : ''}`;
    case 'list_domains':
      return result.error ? `List failed` : `${result.domains?.length || 0} domains configured`;
    case 'restore_db_backup':
      return result.error ? `Restore failed: ${result.error}` : `DB restore complete ✓`;
    default:                return action.type;
  }
}

// ── Action executor ───────────────────────────────────────────────────────────

async function executeAction(action, conv) {
  const { repoCtx } = conv;

  switch (action.type) {

    // ── search_repo ──────────────────────────────────────────────────────────
    case 'search_repo': {
      const { query: q, path: searchPath, language } = action;
      if (!q) return { error: 'query is required' };

      if (repoCtx?.owner) {
        const repoFilter = `repo:${repoCtx.owner}/${repoCtx.repo}`;
        const langFilter = language ? `+language:${language}` : '';
        const pathFilter = searchPath ? `+path:${searchPath}` : '';
        const encoded = encodeURIComponent(`${q} ${repoFilter}${langFilter}${pathFilter}`.trim());
        const res = await fetch(
          `https://api.github.com/search/code?q=${encoded}&per_page=15`,
          { headers: ghHeaders() }
        );
        if (!res.ok) return { error: `GitHub code search failed (${res.status}) — use list_files then read_file`, query: q };
        const data = await res.json();
        return {
          query: q, totalCount: data.total_count,
          results: data.items.slice(0, 15).map(i => ({ path: i.path, name: i.name, score: i.score }))
        };
      } else {
        const dir = searchPath || '.';
        const escaped = q.replace(/"/g, '\\"');
        const includes = '--include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.sh" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.md"';
        const filesRes = await runShellCommand(`grep -r ${includes} -l "${escaped}" "${dir}" 2>/dev/null | head -20`, process.cwd());
        const files = filesRes.stdout.trim().split('\n').filter(Boolean);
        const matches = await Promise.all(files.slice(0, 8).map(async file => {
          const linesRes = await runShellCommand(`grep -n "${escaped}" "${file}" 2>/dev/null | head -6`, process.cwd());
          return { path: file, lines: linesRes.stdout.trim().split('\n').filter(Boolean) };
        }));
        return { query: q, totalCount: files.length, results: matches };
      }
    }

    // ── search_code_fts ──────────────────────────────────────────────────────
    case 'search_code_fts': {
      if (!repoCtx?.owner) return { error: 'search_code_fts requires a loaded GitHub repository' };
      const repoKey = `${repoCtx.owner}/${repoCtx.repo}`;
      return searchCode(repoKey, action.query || '', 15);
    }

    // ── read_file ────────────────────────────────────────────────────────────
    case 'read_file': {
      const { path, branch } = action;
      if (!path) return { error: 'path is required' };
      if (repoCtx?.owner) {
        const b = branch || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!res.ok) return { error: `GitHub: ${res.status} for ${path}` };
        const data = await res.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const allLines = content.split('\n');
        const MAX_LINES = 400;
        if (allLines.length > MAX_LINES) {
          const truncated = allLines.slice(0, MAX_LINES).join('\n');
          return { path, content: truncated + `\n\n…[TRUNCATED — file has ${allLines.length} lines, showing first ${MAX_LINES}. Use read_file_lines or grep_file for specific sections]`, sha: data.sha, branch: b, lines: allLines.length, truncated: true };
        }
        return { path, content, sha: data.sha, branch: b, lines: allLines.length };
      }
      return readLocalFile(path);
    }

    // ── edit_file ────────────────────────────────────────────────────────────
    case 'edit_file': {
      const { path, old_str, new_str, branch, commit_message } = action;
      if (!path || old_str === undefined || new_str === undefined)
        return { error: 'path, old_str, and new_str are required' };

      if (repoCtx?.owner) {
        const b = branch || repoCtx.branch || 'main';
        const getRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!getRes.ok) return { error: `Cannot read ${path}: ${getRes.status}` };
        const fileData = await getRes.json();
        const current = Buffer.from(fileData.content, 'base64').toString('utf-8');
        if (!current.includes(old_str)) {
          const preview = old_str.slice(0, 60).replace(/\n/g, '↵');
          return { error: `old_str not found in ${path}. Searched for: "${preview}". Read the file first.` };
        }
        const updated = current.replace(old_str, new_str);
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { error: 'GITHUB_TOKEN not configured' };
        const putRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}`,
          {
            method: 'PUT',
            headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: commit_message || `edit: update ${path}`,
              content: Buffer.from(updated).toString('base64'),
              sha: fileData.sha,
              branch: b
            })
          }
        );
        if (!putRes.ok) {
          const err = await putRes.json();
          return { error: err.message || `GitHub PUT failed: ${putRes.status}` };
        }
        const result = await putRes.json();
        conv.lastEditBranch = b;
        conv.testsPassed = false;
        return { success: true, path, branch: b, commitSha: result.commit?.sha, commitUrl: result.commit?.html_url };
      }
      conv.testsPassed = false;
      return patchLocalFile(path, old_str, new_str);
    }

    // ── create_branch ────────────────────────────────────────────────────────
    case 'create_branch': {
      const { branch, from = 'main' } = action;
      if (!branch) return { error: 'branch name is required' };
      if (repoCtx?.owner) {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { error: 'GITHUB_TOKEN not configured' };
        const refRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/git/ref/heads/${from}`,
          { headers: ghHeaders() }
        );
        if (!refRes.ok) return { error: `Source branch "${from}" not found` };
        const sha = (await refRes.json()).object.sha;
        const createRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/git/refs`,
          {
            method: 'POST',
            headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
          }
        );
        if (!createRes.ok) {
          const err = await createRes.json();
          if (err.message?.includes('already exists')) return { success: true, branch, from, note: 'already existed' };
          return { error: err.message || `Branch creation failed: ${createRes.status}` };
        }
        return { success: true, branch, from, sha };
      }
      const { createBranch } = await import('../../../../services/git/branch.js');
      return createBranch(branch);
    }

    // ── run_tests ────────────────────────────────────────────────────────────
    case 'run_tests': {
      const { branch, test_command } = action;
      if (!repoCtx?.owner) {
        if (!test_command) return { error: 'test_command required for local repos' };
        const r = await runShellCommand(test_command, process.cwd());
        const passed = r.exitCode === 0 && !r.stderr?.includes('FAIL');
        conv.testsPassed = passed;
        return { ...r, passed, stdout: trim4k(r.stdout), stderr: trim4k(r.stderr) };
      }

      const token = process.env.GITHUB_TOKEN;
      if (!token) return { error: 'GITHUB_TOKEN required to clone for testing' };

      const b = branch || conv.lastEditBranch || repoCtx.branch || 'main';
      const cloneDir = `/tmp/apex-clones/${repoCtx.owner}-${repoCtx.repo}`;

      const { existsSync } = await import('fs');
      if (existsSync(`${cloneDir}/.git`)) {
        await runShellCommand(`git fetch origin && git checkout ${b} && git reset --hard origin/${b}`, cloneDir);
      } else {
        const cloneUrl = `https://${token}@github.com/${repoCtx.owner}/${repoCtx.repo}.git`;
        const cloneRes = await runShellCommand(`git clone --depth 10 --branch ${b} ${cloneUrl} ${cloneDir}`, '/tmp');
        if (!cloneRes.success) return { error: `Clone failed: ${cloneRes.stderr}` };
      }

      let cmd = test_command;
      if (!cmd) {
        const pkgRes = await runShellCommand('cat package.json 2>/dev/null', cloneDir);
        if (pkgRes.success && pkgRes.stdout) {
          try {
            const pkg = JSON.parse(pkgRes.stdout);
            if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified"') {
              const hasPnpm = (await runShellCommand('which pnpm', cloneDir)).success;
              cmd = hasPnpm ? 'pnpm test' : 'npm test';
            }
          } catch {}
        }
        if (!cmd) { const p = await runShellCommand('which pytest', cloneDir); if (p.success) cmd = 'pytest'; }
        if (!cmd) { const g = await runShellCommand('test -f go.mod && echo yes', cloneDir); if (g.stdout.trim() === 'yes') cmd = 'go test ./...'; }
        if (!cmd) return { error: 'Could not detect test command. Specify test_command explicitly.', cloneDir };
        const hasPnpm2 = (await runShellCommand('which pnpm', cloneDir)).success;
        await runShellCommand(hasPnpm2 ? 'pnpm install --frozen-lockfile 2>&1 || pnpm install' : 'npm install', cloneDir);
      }

      const result = await runShellCommand(cmd, cloneDir);
      const passed = result.exitCode === 0;
      conv.testsPassed = passed;
      return { branch: b, command: cmd, passed, exitCode: result.exitCode, stdout: trim4k(result.stdout), stderr: trim4k(result.stderr) };
    }

    // ── create_pull_request ──────────────────────────────────────────────────
    case 'create_pull_request': {
      const { branch, title, body = '', base = 'main' } = action;
      if (!branch || !title) return { error: 'branch and title are required' };
      if (!repoCtx?.owner) return { error: 'create_pull_request requires a loaded GitHub repository' };
      if (!conv.testsPassed) {
        return { error: 'Tests have not passed. You must call run_tests first and they must pass before creating a pull request.' };
      }
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { error: 'GITHUB_TOKEN not configured' };
      const res = await fetch(
        `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/pulls`,
        {
          method: 'POST',
          headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, head: branch, base })
        }
      );
      if (!res.ok) {
        const err = await res.json();
        return { error: err.message || `PR creation failed: ${res.status}` };
      }
      const pr = await res.json();
      conv.testsPassed = false;
      conv.lastPR = { number: pr.number, url: pr.html_url, branch };
      return { success: true, prNumber: pr.number, url: pr.html_url, title: pr.title, branch, base };
    }

    // ── git_diff ─────────────────────────────────────────────────────────────
    case 'git_diff': {
      const { base = 'main', head, cwd } = action;
      if (repoCtx?.owner) {
        const h = head || conv.lastEditBranch || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/compare/${base}...${h}`,
          { headers: { ...ghHeaders(), Accept: 'application/vnd.github.diff' } }
        );
        if (!res.ok) return { error: `GitHub compare failed: ${res.status}` };
        const diff = await res.text();
        return { diff: diff.slice(0, 6000), base, head: h };
      }
      const { generateDiff } = await import('../../../../services/git/diff.js');
      return generateDiff(base, head, cwd);
    }

    // ── list_files ───────────────────────────────────────────────────────────
    case 'list_files': {
      const { path = '' } = action;
      if (repoCtx?.owner) {
        const b = repoCtx.branch || 'main';
        const url = path
          ? `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}?ref=${b}`
          : `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents?ref=${b}`;
        const res = await fetch(url, { headers: ghHeaders() });
        if (!res.ok) return { error: `GitHub: ${res.status}` };
        const data = await res.json();
        const entries = Array.isArray(data)
          ? data.map(e => ({ name: e.name, type: e.type, path: e.path, size: e.size }))
          : [{ name: data.name, type: data.type }];
        return { path: path || '/', entries };
      }
      return listLocalDir(path || '.');
    }

    // ── run_local ────────────────────────────────────────────────────────────
    case 'run_local': {
      const { command, cwd } = action;
      if (!command) return { error: 'command is required' };
      const r = await runShellCommand(command, cwd);
      return { ...r, stdout: trim4k(r.stdout), stderr: trim4k(r.stderr) };
    }

    // ── run_vps ──────────────────────────────────────────────────────────────
    case 'run_vps': {
      const { session_id, command } = action;
      if (!session_id || !command) return { error: 'session_id and command are required' };
      const server = await getVpsServer(session_id);
      if (!server) return { error: `VPS server "${session_id}" not found. Check available servers in the system prompt.` };
      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 10000
        });
        const r = await ssh.execCommand(command);
        ssh.dispose();
        return { stdout: trim4k(r.stdout), stderr: trim4k(r.stderr), code: r.code };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── deploy_to_vps ────────────────────────────────────────────────────────
    case 'deploy_to_vps': {
      const { server_id, dir, commands } = action;
      if (!server_id) return { error: 'server_id is required' };
      const server = await getVpsServer(server_id);
      if (!server) return { error: `VPS server "${server_id}" not found` };

      const deployDir = dir || server.deploy_dir || '';
      const defaultCmds = server.deploy_commands
        ? server.deploy_commands.split('\n').filter(Boolean)
        : ['git pull', 'npm install --production', 'pm2 restart all'];
      const deployCommands = commands || defaultCmds;

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 15000
        });
        const results = [];
        for (const cmd of deployCommands) {
          const r = await ssh.execCommand(cmd, { cwd: deployDir || undefined });
          results.push({ command: cmd, stdout: r.stdout?.slice(0, 500), stderr: r.stderr?.slice(0, 200), code: r.code });
          if (r.code !== 0 && r.stderr) {
            ssh.dispose();
            return { error: `Command failed: ${cmd}`, output: r.stderr.slice(0, 300), results };
          }
        }
        ssh.dispose();
        return { success: true, server: server.label, commandsRun: deployCommands.length, results };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── set_vps_env ──────────────────────────────────────────────────────────
    case 'set_vps_env': {
      const { server_id, key, value, env_file = '.env', service } = action;
      if (!server_id || !key || value === undefined) return { error: 'server_id, key, and value are required' };
      const server = await getVpsServer(server_id);
      if (!server) return { error: `VPS server "${server_id}" not found` };

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 10000
        });
        const absPath = env_file.startsWith('/') ? env_file : `$HOME/${env_file}`;
        const escapedVal = value.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        const writeCmd =
          `touch ${absPath} && ` +
          `if grep -q "^${key}=" ${absPath} 2>/dev/null; then ` +
          `  sed -i "s|^${key}=.*|${key}=${escapedVal}|" ${absPath}; ` +
          `else echo "${key}=${escapedVal}" >> ${absPath}; fi`;
        const r = await ssh.execCommand(writeCmd);
        const svcName = service || server.service_name || '';
        if (svcName && !r.stderr) {
          await ssh.execCommand(`pm2 restart ${svcName} 2>/dev/null || systemctl restart ${svcName} 2>/dev/null || true`);
        }
        ssh.dispose();
        if (r.code !== 0 && r.stderr) return { error: r.stderr.slice(0, 200) };
        return { success: true, key, env_file: absPath, restarted: !!svcName };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── recall_memory ────────────────────────────────────────────────────────
    case 'recall_memory': {
      if (!repoCtx?.owner) return { error: 'No repo loaded — memory is per-project' };
      const { getMemory } = await import('../../../../services/memory/project-memory.js');
      return getMemory(repoCtx.owner, repoCtx.repo);
    }

    // ── add_memory ───────────────────────────────────────────────────────────
    case 'add_memory': {
      const { fact } = action;
      if (!fact) return { error: 'fact is required' };
      if (!repoCtx?.owner) return { error: 'No repo loaded — memory is per-project' };
      const facts = await addFact(repoCtx.owner, repoCtx.repo, fact);
      return { success: true, totalFacts: facts.length };
    }

    // ── remember ─────────────────────────────────────────────────────────────
    case 'remember': {
      const { category = 'fact', key, value, tags = [], repo_name: repoName = '' } = action;
      if (!key || !value) return { error: 'key and value are required' };
      const entry = await remember({ category, key, value, tags, repoName });
      return { success: true, id: entry.id, category, key };
    }

    // ── recall ────────────────────────────────────────────────────────────────
    case 'recall': {
      const { query: q, category, repo_name: repoName, limit = 20 } = action;
      const entries = await recall({ query: q, category, repoName: repoName || conv.repoCtx?.repo, limit });
      return { entries, total: entries.length };
    }

    // ── forget ────────────────────────────────────────────────────────────────
    case 'forget': {
      const { id } = action;
      if (!id) return { error: 'id is required' };
      await forget(id);
      return { success: true };
    }

    // ── list_repos ────────────────────────────────────────────────────────────
    case 'list_repos': {
      const repos = await listRepos();
      return {
        repos: repos.map(r => ({
          name: r.name, label: r.label,
          owner: r.owner, repo: r.repo, branch: r.branch,
          purpose: r.purpose, deploy_server_id: r.deploy_server_id
        })),
        total: repos.length
      };
    }

    // ── switch_repo ───────────────────────────────────────────────────────────
    case 'switch_repo': {
      const { name } = action;
      if (!name) return { error: 'name is required' };
      const repo = await getRepo(name);
      if (!repo) return { error: `Repository "${name}" not found in registry. Use list_repos to see available repositories.` };
      if (!repo.owner || !repo.repo) return { error: `Repository "${name}" has no GitHub URL configured. Please update it in the Repository Registry.` };

      const prevRepo = conv.repoCtx?.repo;
      conv.repoCtx = {
        owner: repo.owner, repo: repo.repo, branch: repo.branch || 'main',
        description: repo.purpose, name: repo.name, label: repo.label
      };
      // Rebuild system prompt with new repo context
      conv.messages[0].content = await buildSystemPrompt(conv.repoCtx);
      conv.testsPassed = false;
      return {
        success: true,
        switched: true,
        from: prevRepo || null,
        to: `${repo.owner}/${repo.repo}`,
        branch: repo.branch || 'main',
        purpose: repo.purpose || ''
      };
    }

    // ── create_checkpoint ─────────────────────────────────────────────────────
    case 'create_checkpoint': {
      const { label, type = 'deployment', server_id: serverId = '', repo_name: repoName = '' } = action;
      const cp = await createCheckpoint({
        label: label || 'AI checkpoint',
        type,
        serverId: serverId || '',
        repoName: repoName || conv.repoCtx?.repo || ''
      });
      return { success: true, id: cp.id, label: cp.label, createdAt: cp.created_at };
    }

    // ── rollback ──────────────────────────────────────────────────────────────
    case 'rollback': {
      const { checkpoint_id: checkpointId } = action;
      if (!checkpointId) return { error: 'checkpoint_id is required' };
      try {
        const result = await restoreCheckpoint(checkpointId);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── list_checkpoints ──────────────────────────────────────────────────────
    case 'list_checkpoints': {
      const checkpoints = await listCheckpoints(15);
      return { checkpoints, total: checkpoints.length };
    }

    // ── validate_deployment ───────────────────────────────────────────────────
    case 'validate_deployment': {
      const { server_id: serverId, required_env: requiredEnv = [] } = action;
      if (!serverId) return { error: 'server_id is required' };
      const server = await getVpsServer(serverId);
      if (!server) return { error: `VPS server "${serverId}" not found` };
      try {
        const result = await validateVpsDeployment(server, requiredEnv);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── browse_vps ────────────────────────────────────────────────────────────
    case 'browse_vps': {
      const { server_id: serverId, path: dirPath = '~' } = action;
      if (!serverId) return { error: 'server_id is required' };
      const server = await getVpsServer(serverId);
      if (!server) return { error: `VPS server "${serverId}" not found` };

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 10000
        });
        const r = await ssh.execCommand(`ls -la --time-style=iso "${dirPath}" 2>&1`);
        const pwdR = await ssh.execCommand(`cd "${dirPath}" 2>/dev/null && pwd || echo "${dirPath}"`);
        ssh.dispose();

        const lines = r.stdout.split('\n').filter(Boolean);
        const entries = [];
        for (const line of lines) {
          if (line.startsWith('total') || !line.trim()) continue;
          const parts = line.split(/\s+/);
          if (parts.length < 8) continue;
          const perms = parts[0]; const name = parts.slice(7).join(' ');
          if (name === '.' || name === '..') continue;
          entries.push({ name, type: perms.startsWith('d') ? 'dir' : 'file', permissions: perms });
        }
        return { path: pwdR.stdout.trim() || dirPath, entries, count: entries.length };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── read_vps_file ──────────────────────────────────────────────────────────
    case 'read_vps_file': {
      const { server_id: serverId, path: filePath } = action;
      if (!serverId || !filePath) return { error: 'server_id and path are required' };
      const server = await getVpsServer(serverId);
      if (!server) return { error: `VPS server "${serverId}" not found` };

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 10000
        });
        const sizeR = await ssh.execCommand(`wc -c < "${filePath}" 2>/dev/null || echo 0`);
        const size = parseInt(sizeR.stdout.trim()) || 0;
        if (size > 524288) { ssh.dispose(); return { error: `File too large (${Math.round(size/1024)}KB). Max 512KB.` }; }
        const r = await ssh.execCommand(`cat "${filePath}"`);
        ssh.dispose();
        if (r.code !== 0) return { error: r.stderr || 'Cannot read file' };
        const content = r.stdout;
        return { path: filePath, content: trim4k(content), lines: content.split('\n').length, size };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── write_vps_file ────────────────────────────────────────────────────────
    case 'write_vps_file': {
      const { server_id: serverId, path: filePath, content } = action;
      if (!serverId || !filePath || content === undefined) return { error: 'server_id, path, and content are required' };
      const server = await getVpsServer(serverId);
      if (!server) return { error: `VPS server "${serverId}" not found` };

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: server.host, port: server.port || 22,
          username: server.username, privateKey: server.private_key,
          readyTimeout: 10000
        });
        const mkdirR = await ssh.execCommand(`mkdir -p "$(dirname "${filePath}")"`);
        const r = await ssh.execCommand(`cat > "${filePath}"`, { stdin: content });
        ssh.dispose();
        return { success: true, path: filePath, bytes: Buffer.byteLength(content, 'utf8') };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── self_inspect ──────────────────────────────────────────────────────────
    case 'self_inspect': {
      const { path: filePath } = action;
      if (!filePath) return { error: 'path is required' };
      const resolvedPath = filePath.replace(/\.\.\//g, '').replace(/^\//, '');
      return readLocalFile(resolvedPath);
    }

    // ── grep_file ─────────────────────────────────────────────────────────────
    case 'grep_file': {
      const { path: gfPath, pattern, context_lines = 3 } = action;
      if (!gfPath || !pattern) return { error: 'path and pattern are required' };
      const ctx = Math.min(parseInt(context_lines) || 3, 10);

      if (repoCtx?.owner) {
        // GitHub: fetch file and grep in memory
        const b = action.branch || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${gfPath}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!res.ok) return { error: `GitHub: ${res.status} for ${gfPath}` };
        const data = await res.json();
        const lines = Buffer.from(data.content, 'base64').toString('utf-8').split('\n');
        const re = new RegExp(pattern, 'gi');
        const matches = [];
        lines.forEach((line, i) => {
          if (re.test(line)) {
            const start = Math.max(0, i - ctx);
            const end   = Math.min(lines.length - 1, i + ctx);
            matches.push({ line: i + 1, context: lines.slice(start, end + 1).map((l, j) => `${start + j + 1}: ${l}`).join('\n') });
          }
        });
        return { path: gfPath, pattern, totalLines: lines.length, matches: matches.slice(0, 20) };
      }

      // Local
      const escaped = pattern.replace(/"/g, '\\"');
      const r = await runShellCommand(`grep -n -C ${ctx} "${escaped}" "${gfPath}" 2>/dev/null | head -200`, process.cwd());
      const lines_r = await runShellCommand(`wc -l < "${gfPath}" 2>/dev/null`, process.cwd());
      const rawMatches = r.stdout.trim().split(/\n--\n/).filter(Boolean).slice(0, 20).map(block => ({ context: block }));
      return { path: gfPath, pattern, totalLines: parseInt(lines_r.stdout.trim()) || 0, matches: rawMatches };
    }

    // ── read_file_lines ───────────────────────────────────────────────────────
    case 'read_file_lines': {
      const { path: rflPath, start_line = 1, end_line } = action;
      if (!rflPath) return { error: 'path is required' };
      const s = Math.max(1, parseInt(start_line));
      const e = end_line ? Math.min(parseInt(end_line), s + 500) : s + 200;

      if (repoCtx?.owner) {
        const b = action.branch || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${rflPath}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!res.ok) return { error: `GitHub: ${res.status} for ${rflPath}` };
        const data = await res.json();
        const allLines = Buffer.from(data.content, 'base64').toString('utf-8').split('\n');
        const slice   = allLines.slice(s - 1, e);
        const content = slice.map((l, i) => `${s + i}: ${l}`).join('\n');
        return { path: rflPath, start_line: s, end_line: Math.min(e, allLines.length), total_lines: allLines.length, content };
      }

      const r = await runShellCommand(`sed -n '${s},${e}p' "${rflPath}" 2>/dev/null`, process.cwd());
      const totalR = await runShellCommand(`wc -l < "${rflPath}" 2>/dev/null`, process.cwd());
      const numbered = r.stdout.split('\n').map((l, i) => `${s + i}: ${l}`).join('\n');
      return { path: rflPath, start_line: s, end_line: e, total_lines: parseInt(totalR.stdout.trim()) || 0, content: numbered };
    }

    // ── file_outline ──────────────────────────────────────────────────────────
    case 'file_outline': {
      const { path: foPath } = action;
      if (!foPath) return { error: 'path is required' };
      const ext = foPath.split('.').pop().toLowerCase();

      let raw = '';
      let totalLines = 0;

      if (repoCtx?.owner) {
        const b = action.branch || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${foPath}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!res.ok) return { error: `GitHub: ${res.status} for ${foPath}` };
        const data = await res.json();
        raw = Buffer.from(data.content, 'base64').toString('utf-8');
      } else {
        const r = await readLocalFile(foPath);
        if (r.error) return r;
        raw = r.content;
      }

      const lines = raw.split('\n');
      totalLines = lines.length;

      // Extract symbols: functions, classes, exports, top-level consts
      const patterns = [
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /^(?:export\s+)?class\s+(\w+)/,
        /^(?:export\s+(?:const|let|var)\s+)(\w+)\s*=/,
        /^(?:module\.exports|exports)\s*[.=]/,
        /^(?:export default)/,
        /^\s{0,2}(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
        /^def\s+(\w+)/,       // Python
        /^class\s+(\w+)/,     // Python
        /^func\s+(\w+)/,      // Go
        /^pub\s+fn\s+(\w+)/,  // Rust
      ];

      const symbols = [];
      lines.forEach((line, i) => {
        for (const pat of patterns) {
          const m = line.match(pat);
          if (m) {
            symbols.push({ line: i + 1, text: line.trim().slice(0, 100) });
            break;
          }
        }
      });

      return { path: foPath, total_lines: totalLines, language: ext, symbols: symbols.slice(0, 60) };
    }

    // ── configure_domain ──────────────────────────────────────────────────────
    case 'configure_domain': {
      const { server_id, domain, app_port = 3000, ssl = false, notes = '' } = action;
      if (!server_id || !domain) return { error: 'server_id and domain are required' };

      try {
        const { addDomain: addDomainFn, buildNginxConfig: buildConf, updateDomain: updateDomFn } = await import('../../../../services/domains/manager.js');
        const { Client: SshClient } = await import('ssh2');
        const server = await getVpsServer(server_id);
        if (!server) return { error: `VPS server ${server_id} not found` };

        const rec = await addDomainFn({ server_id, domain, app_port: parseInt(app_port), ssl, notes });
        const nginxConf = buildConf({ domain, app_port: parseInt(app_port), ssl });
        const confPath  = `/etc/nginx/sites-available/${domain}`;

        // Write nginx config via SSH
        await new Promise((resolve, reject) => {
          const conn = new SshClient();
          conn.on('ready', () => {
            conn.sftp((err, sftp) => {
              if (err) { conn.end(); return reject(err); }
              const stream = sftp.createWriteStream(confPath);
              stream.on('close', () => {
                conn.exec(`ln -sf ${confPath} /etc/nginx/sites-enabled/${domain} && nginx -t && systemctl reload nginx`, (e2, s2) => {
                  let out = '';
                  s2.on('data', d => { out += d; });
                  s2.on('close', () => { conn.end(); resolve(out); });
                  if (e2) { conn.end(); reject(e2); }
                });
              });
              stream.on('error', err2 => { conn.end(); reject(err2); });
              stream.end(nginxConf);
            });
          }).on('error', reject).connect({
            host: server.host, port: server.port || 22,
            username: server.username,
            ...(server.private_key ? { privateKey: server.private_key } : { password: server.password || '' })
          });
        });

        await updateDomFn(rec.id, { status: 'active', nginx_path: confPath });
        return { success: true, domain, server_id, app_port, ssl, nginx_path: confPath };
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── list_domains ──────────────────────────────────────────────────────────
    case 'list_domains': {
      try {
        const { listDomains: listDomsFn } = await import('../../../../services/domains/manager.js');
        const domains = await listDomsFn();
        return { domains: domains.map(d => ({ id: d.id, domain: d.domain, app_port: d.app_port, ssl: d.ssl, status: d.status, server_id: d.server_id })) };
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── restore_db_backup ─────────────────────────────────────────────────────
    case 'restore_db_backup': {
      const { server_id, backup_path, database_url } = action;
      if (!server_id || !backup_path) return { error: 'server_id and backup_path are required' };
      const server = await getVpsServer(server_id);
      if (!server) return { error: `VPS server ${server_id} not found` };

      const isCustom = backup_path.endsWith('.dump');
      const dbUrl = database_url || 'postgresql://localhost/app';
      const cmd = isCustom
        ? `pg_restore --no-owner --no-privileges -d "${dbUrl}" "${backup_path}" 2>&1`
        : `psql "${dbUrl}" < "${backup_path}" 2>&1`;

      try {
        const { NodeSSH } = await import('node-ssh');
        const ssh = new NodeSSH();
        await ssh.connect({ host: server.host, port: server.port || 22, username: server.username, privateKey: server.private_key, readyTimeout: 10000 });
        const r = await ssh.execCommand(cmd);
        ssh.dispose();
        if (r.code !== 0 && r.code !== null) {
          return { error: `Exit ${r.code}: ${(r.stderr || r.stdout || '').slice(0, 500)}` };
        }
        return { success: true, output: (r.stdout || '').slice(0, 500), database_url: dbUrl };
      } catch (err) {
        return { error: err.message };
      }
    }

    default:
      return { error: `Unknown action type: "${action.type}"` };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trim4k(s) {
  if (!s) return s;
  return s.length > 4000 ? s.slice(0, 4000) + '\n…(truncated)' : s;
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function parseActions(text) {
  const actions = [];
  const regex = /```apex-action\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push({ raw: match[0], action: JSON.parse(match[1].trim()) });
    } catch (e) {
      actions.push({ raw: match[0], parseError: `Invalid JSON: ${e.message}` });
    }
  }
  return actions;
}

async function buildSystemPrompt(repoCtx) {
  let system = BASE_SYSTEM;

  // Inject registered repo registry
  try {
    const reposPrompt = await formatReposForPrompt();
    if (reposPrompt) system += `\n\n---\n${reposPrompt}\n---`;
  } catch {}

  // Inject global agent memory
  try {
    const agentMemPrompt = await formatAgentMemory(repoCtx?.repo || '');
    if (agentMemPrompt) system += `\n\n---\n${agentMemPrompt}\n---`;
  } catch {}

  if (repoCtx?.owner) {
    system += `\n\n---\n**Active repo**: ${repoCtx.owner}/${repoCtx.repo} (branch: ${repoCtx.branch || 'main'})`;
    if (repoCtx.name)        system += `  |  registry name: \`${repoCtx.name}\``;
    system += '\n';
    if (repoCtx.description) system += `Description: ${repoCtx.description}\n`;
    if (repoCtx.language)    system += `Primary language: ${repoCtx.language}\n`;
    if (repoCtx.files?.length) {
      system += `\nFile tree (${repoCtx.fileCount} files):\n${repoCtx.files.map(f => f.path).join('\n')}\n`;
    }
    if (repoCtx.readme) system += `\nREADME (excerpt):\n${repoCtx.readme}\n`;
    const memPrompt = await formatMemoryForPrompt(repoCtx.owner, repoCtx.repo);
    if (memPrompt) system += `\n\n---\n${memPrompt}\n---`;
  }

  // Inject configured domains
  try {
    const { listDomains: listDomsFn, formatDomainsForPrompt } = await import('../../../../services/domains/manager.js');
    const domains = await listDomsFn();
    if (domains.length > 0) {
      system += `\n\n---\n${formatDomainsForPrompt(domains)}\n---`;
    }
  } catch {}

  // Inject available VPS servers so AI knows what IDs to use
  try {
    const servers = await listVpsServers();
    if (servers.length > 0) {
      system += `\n\n---\n**Available VPS Servers** (use these IDs with run_vps, deploy_to_vps, set_vps_env, browse_vps, etc.):\n`;
      servers.forEach(s => {
        system += `- ID: \`${s.id}\`  |  ${s.label}  |  ${s.username}@${s.host}:${s.port || 22}`;
        if (s.deploy_dir) system += `  |  deploy_dir: ${s.deploy_dir}`;
        if (s.service_name) system += `  |  service: ${s.service_name}`;
        system += '\n';
      });
      system += '---';
    }
  } catch {}

  return system;
}

// ── Core agent loop (streaming) ───────────────────────────────────────────────

const MAX_ITERATIONS  = 8;
const MAX_TEST_RETRIES = 3;

async function runAgentLoop(apiKey, conv, initialUserMessage, emitters = {}) {
  const {
    emitToken    = () => {},
    emitAction   = () => {},
    emitStep     = () => {},
    emitProgress = () => {}
  } = emitters;

  conv.messages.push({ role: 'user', content: initialUserMessage });
  await dbSaveMessage(conv.id, 'user', initialUserMessage);

  const executedActions = [];
  let finalResponse = '';
  let iterations    = 0;
  let testRetries   = 0;
  let globalStepIdx = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    emitProgress(`Thinking…`);

    let replyContent = '';
    for await (const chunk of runDeepSeekStream({ apiKey, messages: conv.messages })) {
      if (chunk.done) break;
      replyContent += chunk.content;
      emitToken(chunk.content);
    }

    if (!replyContent) throw new Error('Empty response from DeepSeek');

    const parsedActions = parseActions(replyContent);

    if (parsedActions.length === 0) {
      conv.messages.push({ role: 'assistant', content: replyContent });
      await dbSaveMessage(conv.id, 'assistant', replyContent);
      finalResponse = replyContent;
      break;
    }

    const actionResults = [];
    for (const { raw, action, parseError } of parsedActions) {
      if (parseError) {
        actionResults.push({ type: 'parse_error', error: parseError });
        executedActions.push({ type: 'parse_error', error: parseError });
        continue;
      }

      // Emit step: starting
      const startLabel = stepLabel(action);
      emitStep({ label: startLabel, actionType: action.type, status: 'running', index: globalStepIdx });
      emitAction({ type: action.type, params: action });

      const result = await executeAction(action, conv);

      // Emit step: done/error
      const doneLabel = stepDoneLabel(action, result);
      emitStep({
        label:      doneLabel,
        actionType: action.type,
        status:     result.error ? 'error' : 'done',
        index:      globalStepIdx,
        detail:     result.error
          ? result.error
          : (action.type === 'run_tests' && !result.passed)
            ? (result.stderr || result.stdout || '').slice(0, 200)
            : undefined
      });
      globalStepIdx++;

      actionResults.push({ type: action.type, params: action, result });
      executedActions.push({ type: action.type, params: action, result });

      if (action.type === 'run_tests' && !result.passed && testRetries < MAX_TEST_RETRIES) {
        testRetries++;
        emitProgress(`Tests failed — retry ${testRetries}/${MAX_TEST_RETRIES}…`);
      }
    }

    conv.messages.push({ role: 'assistant', content: replyContent });
    await dbSaveMessage(conv.id, 'assistant', replyContent, executedActions.slice(-parsedActions.length));

    const resultSummary = actionResults.map((r, i) => {
      const label = `[Action ${i + 1}: ${r.type}]`;
      if (r.error) return `${label}\nError: ${r.error}`;
      if (r.type === 'read_file' && r.result?.content) {
        return `${label}\nFile: ${r.result.path} (${r.result.lines} lines)\n\`\`\`\n${r.result.content.slice(0, 4000)}${r.result.content.length > 4000 ? '\n…(truncated)' : ''}\n\`\`\``;
      }
      return `${label}\n${JSON.stringify(r.result, null, 2)}`;
    }).join('\n\n');

    conv.messages.push({ role: 'user', content: `[Action Results]\n${resultSummary}\n\nContinue.` });
  }

  if (!finalResponse && iterations >= MAX_ITERATIONS) {
    finalResponse = 'Reached maximum iterations. Review the executed actions above.';
    conv.messages.push({ role: 'assistant', content: finalResponse });
  }

  return { finalResponse, executedActions, iterations };
}

// ── Job runner (registered with worker) ──────────────────────────────────────

async function runAiJob(job, emitters) {
  const { message, conversationId, repoContext, fileContext, sshKey } = job.payload;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const id = conversationId;
  let conv = conversations.get(id);

  if (!conv) {
    const dbMessages = await dbLoadMessages(id);
    const dbConv = await queryOne('SELECT * FROM conversations WHERE id=$1', [id]).catch(() => null);
    const savedRepoCtx = dbConv ? {
      owner: dbConv.repo_owner, repo: dbConv.repo_name, branch: dbConv.repo_branch
    } : null;
    const repoCtx = repoContext || savedRepoCtx;
    const systemContent = await buildSystemPrompt(repoCtx);
    conv = {
      id,
      messages: dbMessages && dbMessages.length > 0
        ? [{ role: 'system', content: systemContent }, ...dbMessages]
        : [{ role: 'system', content: systemContent }],
      repoCtx,
      testsPassed: false,
      lastEditBranch: null,
      lastPR: null,
      sshKey: sshKey || dbConv?.ssh_key || null
    };
    conversations.set(id, conv);
  }

  if (repoContext && !conv.repoCtx) {
    conv.repoCtx = repoContext;
    conv.messages[0].content = await buildSystemPrompt(repoContext);
  }

  let userMessage = message;
  if (fileContext) {
    userMessage = `[File: ${fileContext.path}]\n\`\`\`\n${fileContext.content}\n\`\`\`\n\n${message}`;
  }

  const { finalResponse, executedActions, iterations } = await runAgentLoop(
    apiKey, conv, userMessage, emitters
  );

  return { response: finalResponse, executedActions, iterations, conversationId: id };
}

registerJobRunner(runAiJob);

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /orchestrator/chat — enqueue AI task as background job
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversationId, repoContext, fileContext, sshKey } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured' });

  const id = conversationId || Math.random().toString(36).slice(2);

  if (!conversations.has(id)) {
    const systemContent = await buildSystemPrompt(repoContext || null);
    conversations.set(id, {
      id,
      messages: [{ role: 'system', content: systemContent }],
      repoCtx: repoContext || null,
      testsPassed: false,
      lastEditBranch: null,
      lastPR: null,
      sshKey: sshKey || null
    });
    await dbSaveConversation(id, repoContext || null, sshKey || null);
  }

  const conv = conversations.get(id);
  if (repoContext && !conv.repoCtx) conv.repoCtx = repoContext;
  if (sshKey) conv.sshKey = sshKey;

  const wf = addWorkflow({
    title: message.slice(0, 72) + (message.length > 72 ? '…' : ''),
    description: repoContext ? `repo: ${repoContext.owner}/${repoContext.repo}` : 'local',
    status: 'running',
    type: 'ai-task'
  });

  const jobId = await enqueue('ai-task', { message, conversationId: id, repoContext, fileContext, sshKey });
  updateWorkflow(wf.id, { status: 'running', description: `Job ${jobId}` });

  res.json({ jobId, conversationId: id, workflowId: wf.id });
});

// GET /orchestrator/conversations — list all conversations (most recent first)
router.get('/conversations', requireAuth, async (req, res) => {
  if (await dbAvailable()) {
    const result = await query(
      `SELECT id, repo_owner, repo_name, repo_branch, summary, created_at, updated_at
       FROM conversations ORDER BY updated_at DESC LIMIT 50`
    ).catch(() => ({ rows: [] }));
    return res.json(result.rows);
  }
  // In-memory fallback
  const list = [...conversations.values()].map(c => ({
    id: c.id,
    repo_owner:  c.repoCtx?.owner  || null,
    repo_name:   c.repoCtx?.repo   || null,
    repo_branch: c.repoCtx?.branch || 'main',
    summary:     '',
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString()
  }));
  res.json(list);
});

// GET /orchestrator/conversations/:id — fetch conversation messages
router.get('/conversations/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const dbMessages = await dbLoadMessages(id).catch(() => null);
  if (dbMessages) return res.json({ conversationId: id, messages: dbMessages });
  const conv = conversations.get(id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversationId: id, messages: conv.messages.filter(m => m.role !== 'system') });
});

// POST /orchestrator/context/repo — inject repo context into existing conversation
router.post('/context/repo', requireAuth, (req, res) => {
  const { conversationId, repoContext } = req.body;
  const conv = conversations.get(conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  conv.repoCtx = repoContext;
  conv.messages.push({ role: 'user', content: `[Repo updated: ${repoContext.owner}/${repoContext.repo}]` });
  conv.messages.push({ role: 'assistant', content: `Got it. I now have context for \`${repoContext.owner}/${repoContext.repo}\` (${repoContext.fileCount} files on \`${repoContext.branch}\`). What would you like me to do?` });
  res.json({ success: true });
});

// POST /orchestrator/run — legacy
router.post('/run', requireAuth, async (req, res) => {
  const { runTask } = await import('../../../../services/orchestrator/runtime.js');
  const result = await runTask(req.body.task, req.body.context || {});
  res.json(result);
});

export default router;
