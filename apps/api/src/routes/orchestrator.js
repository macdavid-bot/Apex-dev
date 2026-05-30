import express from 'express';
import { runDeepSeekStream } from '../../../../services/ai/deepseek-runtime.js';
import { runShellCommand } from '../../../../services/shell/index.js';
import { readLocalFile, patchLocalFile, listLocalDir } from '../../../../services/file/editor.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';
import { addWorkflow, updateWorkflow } from '../../../../services/workflow/store.js';
import { enqueue } from '../../../../services/queue/store.js';
import { registerJobRunner } from '../../../../services/queue/worker.js';
import { formatMemoryForPrompt, addFact } from '../../../../services/memory/project-memory.js';
import { searchCode } from '../../../../services/embeddings/fts.js';
import { requireAuth } from '../../../../services/auth/middleware.js';
import { query, queryOne, dbAvailable } from '../../../../services/db/client.js';

const router = express.Router();

// in-memory conversation cache (also written to DB when available)
const conversations = new Map();

// ── System prompt ─────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are Apex Dev, an autonomous engineering AI. You act directly — you never ask the user to do things you can do yourself.

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
- test_command is optional — auto-detected from package.json / pytest.ini / go.mod if omitted.

**create_pull_request** — Create a GitHub PR. Only allowed after run_tests passes.
\`\`\`apex-action
{"type": "create_pull_request", "branch": "feature/my-branch", "title": "feat: add login", "body": "Description of changes", "base": "main"}
\`\`\`

**run_local** — Run a shell command on the local machine.
\`\`\`apex-action
{"type": "run_local", "command": "npm install", "cwd": "/tmp/clone"}
\`\`\`

**run_vps** — Run a command on a connected VPS session.
\`\`\`apex-action
{"type": "run_vps", "session_id": "SESSION_ID", "command": "pm2 restart app"}
\`\`\`

**recall_memory** — Recall stored facts and notes about this project.
\`\`\`apex-action
{"type": "recall_memory"}
\`\`\`

**add_memory** — Store an important fact about this project for future sessions.
\`\`\`apex-action
{"type": "add_memory", "fact": "The API uses JWT auth with 30-day expiry"}
\`\`\`

## Workflow Rules
1. **Search before reading**: Always start with search_repo or search_code_fts to find relevant files. Never guess paths.
2. **Branch first**: Create a feature branch before any edits. Never commit directly to main.
3. **Read before editing**: Read the current file content before calling edit_file.
4. **Surgical edits**: Use old_str/new_str with 2-3 lines of context. Never rewrite whole files.
5. **Test before PR**: ALWAYS call run_tests after editing code. If tests fail, fix the code and run tests again. Repeat up to 3 times. Only call create_pull_request after tests pass.
6. **Remember**: Use add_memory for important discoveries (architecture decisions, quirks, patterns).
7. **Explain**: Briefly describe each action before executing it.
8. **On error**: Read the error, reason about the fix, retry with corrected action.

## Code Style
- Concise explanations. Skip boilerplate.
- Use fenced code blocks with language tags.
- Prefer existing patterns in the codebase.`;

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
        return { path, content, sha: data.sha, branch: b, lines: content.split('\n').length };
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
        conv.testsPassed = false; // edits invalidate previous test results
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
        // Local: just run the command
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

      // Clone or update
      const { existsSync } = await import('fs');
      if (existsSync(`${cloneDir}/.git`)) {
        await runShellCommand(`git fetch origin && git checkout ${b} && git reset --hard origin/${b}`, cloneDir);
      } else {
        const cloneUrl = `https://${token}@github.com/${repoCtx.owner}/${repoCtx.repo}.git`;
        const cloneRes = await runShellCommand(
          `git clone --depth 10 --branch ${b} ${cloneUrl} ${cloneDir}`,
          '/tmp'
        );
        if (!cloneRes.success) return { error: `Clone failed: ${cloneRes.stderr}` };
      }

      // Detect test command
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
        if (!cmd) {
          const pytest = await runShellCommand('which pytest', cloneDir);
          if (pytest.success) cmd = 'pytest';
        }
        if (!cmd) {
          const gomod = await runShellCommand('test -f go.mod && echo yes', cloneDir);
          if (gomod.stdout.trim() === 'yes') cmd = 'go test ./...';
        }
        if (!cmd) return { error: 'Could not detect test command. Specify test_command explicitly.', cloneDir };

        // Install deps first
        const hasPnpm2 = (await runShellCommand('which pnpm', cloneDir)).success;
        const installCmd = hasPnpm2 ? 'pnpm install --frozen-lockfile 2>&1 || pnpm install' : 'npm install';
        await runShellCommand(installCmd, cloneDir);
      }

      const result = await runShellCommand(cmd, cloneDir);
      const passed = result.exitCode === 0;
      conv.testsPassed = passed;

      return {
        branch: b,
        command: cmd,
        passed,
        exitCode: result.exitCode,
        stdout: trim4k(result.stdout),
        stderr: trim4k(result.stderr)
      };
    }

    // ── create_pull_request ──────────────────────────────────────────────────
    case 'create_pull_request': {
      const { branch, title, body = '', base = 'main' } = action;
      if (!branch || !title) return { error: 'branch and title are required' };

      if (!repoCtx?.owner) return { error: 'create_pull_request requires a loaded GitHub repository' };

      // Enforce test requirement
      if (!conv.testsPassed) {
        return {
          error: 'Tests have not passed. You must call run_tests first and they must pass before creating a pull request.',
          hint: 'Call run_tests with the feature branch, ensure all tests pass, then call create_pull_request.'
        };
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
      conv.testsPassed = false; // reset after PR
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
      const session = vpsSessions.get(session_id);
      if (!session) return { error: `VPS session "${session_id}" not found` };
      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({ host: session.host, port: session.port || 22, username: session.username, privateKey: session.privateKey, readyTimeout: 10000 });
        const r = await ssh.execCommand(command);
        ssh.dispose();
        return { stdout: trim4k(r.stdout), stderr: trim4k(r.stderr), code: r.code };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

    // ── recall_memory ────────────────────────────────────────────────────────
    case 'recall_memory': {
      if (!repoCtx?.owner) return { error: 'No repo loaded — memory is per-project' };
      const { getMemory } = await import('../../../../services/memory/project-memory.js');
      const mem = await getMemory(repoCtx.owner, repoCtx.repo);
      return mem;
    }

    // ── add_memory ───────────────────────────────────────────────────────────
    case 'add_memory': {
      const { fact } = action;
      if (!fact) return { error: 'fact is required' };
      if (!repoCtx?.owner) return { error: 'No repo loaded — memory is per-project' };
      const facts = await addFact(repoCtx.owner, repoCtx.repo, fact);
      return { success: true, totalFacts: facts.length };
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
  if (repoCtx?.owner) {
    system += `\n\n---\n**Loaded repo**: ${repoCtx.owner}/${repoCtx.repo} (branch: ${repoCtx.branch || 'main'})\n`;
    if (repoCtx.description) system += `Description: ${repoCtx.description}\n`;
    if (repoCtx.language)    system += `Primary language: ${repoCtx.language}\n`;
    if (repoCtx.files?.length) {
      system += `\nFile tree (${repoCtx.fileCount} files):\n${repoCtx.files.map(f => f.path).join('\n')}\n`;
    }
    if (repoCtx.readme) system += `\nREADME (excerpt):\n${repoCtx.readme}\n`;

    const memPrompt = await formatMemoryForPrompt(repoCtx.owner, repoCtx.repo);
    if (memPrompt) system += `\n\n---\n${memPrompt}\n---`;
  }
  return system;
}

// ── Core agent loop (streaming) ───────────────────────────────────────────────

const MAX_ITERATIONS = 8;
const MAX_TEST_RETRIES = 3;

async function runAgentLoop(apiKey, conv, initialUserMessage, emitters = {}) {
  const { emitToken = () => {}, emitAction = () => {}, emitProgress = () => {} } = emitters;

  conv.messages.push({ role: 'user', content: initialUserMessage });
  await dbSaveMessage(conv.id, 'user', initialUserMessage);

  const executedActions = [];
  let finalResponse = '';
  let iterations = 0;
  let testRetries = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    emitProgress(`Thinking (iteration ${iterations})…`);

    // Stream tokens from DeepSeek
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

    // Execute actions
    const actionResults = [];
    for (const { raw, action, parseError } of parsedActions) {
      if (parseError) {
        actionResults.push({ type: 'parse_error', error: parseError });
        executedActions.push({ type: 'parse_error', error: parseError });
        continue;
      }

      emitProgress(`Executing ${action.type}…`);
      emitAction({ type: action.type, params: action });

      const result = await executeAction(action, conv);
      actionResults.push({ type: action.type, params: action, result });
      executedActions.push({ type: action.type, params: action, result });

      // If run_tests failed and we have retries, allow AI to fix
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
    // Try to restore from DB
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

  // Create conversation if new
  if (!conversations.has(id)) {
    const systemContent = await buildSystemPrompt(repoContext || null);
    conversations.set(id, {
      id,
      messages: [{ role: 'system', content: systemContent }],
      repoCtx: repoContext || null,
      testsPassed: false,
      lastEditBranch: null,
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

// GET /orchestrator/conversations/:id — fetch conversation history
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
  const summary = `[Repo updated: ${repoContext.owner}/${repoContext.repo}]`;
  conv.messages.push({ role: 'user', content: summary });
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
