import express from 'express';
import { runTask } from '../../../../services/orchestrator/runtime.js';
import { assembleContext } from '../../../../services/context/assembler.js';
import { runDeepSeekChat } from '../../../../services/ai/deepseek-runtime.js';
import { runShellCommand } from '../../../../services/shell/index.js';
import { readLocalFile, patchLocalFile, listLocalDir } from '../../../../services/file/editor.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';
import { addWorkflow, updateWorkflow } from '../../../../services/workflow/store.js';

const router = express.Router();

// conversationId -> { messages: Message[], repoCtx: object|null }
const conversations = new Map();

const BASE_SYSTEM = `You are Apex Dev, an autonomous engineering AI. You can directly take actions — you do not need to ask the user to do things you are capable of doing yourself.

## Available Actions
Embed action blocks in your response using this exact format:

\`\`\`apex-action
{"type": "ACTION_TYPE", ...params}
\`\`\`

You can include multiple action blocks in one response. They execute in order. Results are fed back to you automatically.

### Action Types

**read_file** — Read a file from the loaded GitHub repo
\`\`\`apex-action
{"type": "read_file", "path": "src/index.js"}
\`\`\`

**edit_file** — Edit a file surgically using str_replace. Always read the file first. NEVER rewrite the whole file unless it is new.
\`\`\`apex-action
{"type": "edit_file", "path": "src/index.js", "old_str": "exact text to replace", "new_str": "replacement text", "branch": "feature/my-branch", "commit_message": "fix: update port config"}
\`\`\`

**create_branch** — Create a feature branch before making any code changes. Always do this first.
\`\`\`apex-action
{"type": "create_branch", "branch": "feature/my-feature", "from": "main"}
\`\`\`

**run_local** — Run a shell command on the local machine
\`\`\`apex-action
{"type": "run_local", "command": "npm test", "cwd": "/path/to/project"}
\`\`\`

**run_vps** — Run a command on a connected VPS session
\`\`\`apex-action
{"type": "run_vps", "session_id": "SESSION_ID", "command": "pm2 restart app"}
\`\`\`

**list_files** — List files in a GitHub repo directory
\`\`\`apex-action
{"type": "list_files", "path": "src/components"}
\`\`\`

**git_diff** — Get the diff between two branches or staged changes
\`\`\`apex-action
{"type": "git_diff", "base": "main", "head": "feature/my-branch"}
\`\`\`

## Workflow Rules
1. **Branch first**: Always create a feature branch before editing any file. Never edit main directly.
2. **Read before editing**: Always read a file before editing it — use read_file to get the exact current content.
3. **Surgical edits**: Use edit_file with old_str/new_str. Make the old_str as specific as possible (include 2–3 lines of context around the change). Never rewrite a whole file unless it is brand new.
4. **Test before committing**: After editing, run tests or build commands to verify the change works.
5. **Explain actions**: Briefly explain what you're about to do before each action block.
6. **VPS tasks**: When the user asks to run something on VPS, use run_vps. List the session ID if known.

## Code Style
- Use fenced code blocks with language tags for all code snippets.
- Be concise. Skip boilerplate explanations.
- If an action fails, read the error, reason about the fix, and retry with a corrected action.`;

// ── Action executor ──────────────────────────────────────────────────────────

async function executeAction(action, conv) {
  const { repoCtx } = conv;

  switch (action.type) {

    case 'read_file': {
      const { path, branch } = action;
      if (!path) return { error: 'path is required' };

      if (repoCtx?.owner) {
        // Read from GitHub API
        const b = branch || repoCtx.branch || 'main';
        const ghRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!ghRes.ok) return { error: `GitHub: ${ghRes.status} for ${path}` };
        const data = await ghRes.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { path, content, sha: data.sha, branch: b, lines: content.split('\n').length };
      } else {
        // Local filesystem fallback
        return readLocalFile(path);
      }
    }

    case 'edit_file': {
      const { path, old_str, new_str, branch, commit_message } = action;
      if (!path || old_str === undefined || new_str === undefined)
        return { error: 'path, old_str, and new_str are required' };

      if (repoCtx?.owner) {
        // 1. Fetch current file content + sha
        const b = branch || repoCtx.branch || 'main';
        const getRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}?ref=${b}`,
          { headers: ghHeaders() }
        );
        if (!getRes.ok) return { error: `Cannot read ${path} from GitHub: ${getRes.status}` };
        const fileData = await getRes.json();
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // 2. Apply str_replace
        if (!currentContent.includes(old_str)) {
          const preview = old_str.slice(0, 60).replace(/\n/g, '↵');
          return { error: `old_str not found in ${path}. Searched for: "${preview}". Read the file first.` };
        }
        const updatedContent = currentContent.replace(old_str, new_str);

        // 3. Commit to branch via GitHub API
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { error: 'GITHUB_TOKEN not configured' };

        const putRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/contents/${path}`,
          {
            method: 'PUT',
            headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: commit_message || `edit: update ${path}`,
              content: Buffer.from(updatedContent).toString('base64'),
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
        return {
          success: true,
          path,
          branch: b,
          commitSha: result.commit?.sha,
          commitUrl: result.commit?.html_url,
          replacements: 1
        };
      } else {
        // Local filesystem
        return patchLocalFile(path, old_str, new_str);
      }
    }

    case 'create_branch': {
      const { branch, from = 'main' } = action;
      if (!branch) return { error: 'branch name is required' };

      if (repoCtx?.owner) {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { error: 'GITHUB_TOKEN not configured' };

        // Get SHA of source branch
        const refRes = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/git/ref/heads/${from}`,
          { headers: ghHeaders() }
        );
        if (!refRes.ok) return { error: `Source branch "${from}" not found` };
        const refData = await refRes.json();
        const sha = refData.object.sha;

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
          // Branch may already exist — that's fine
          if (err.message?.includes('already exists')) return { success: true, branch, from, note: 'branch already existed' };
          return { error: err.message || `GitHub branch creation failed: ${createRes.status}` };
        }
        return { success: true, branch, from, sha };
      } else {
        // Local git
        const { createBranch } = await import('../../../../services/git/branch.js');
        return createBranch(branch);
      }
    }

    case 'run_local': {
      const { command, cwd } = action;
      if (!command) return { error: 'command is required' };
      const result = await runShellCommand(command, cwd);
      // Trim long output
      const trim = s => s && s.length > 3000 ? s.slice(0, 3000) + '\n…(truncated)' : s;
      return { ...result, stdout: trim(result.stdout), stderr: trim(result.stderr) };
    }

    case 'run_vps': {
      const { session_id, command } = action;
      if (!session_id || !command) return { error: 'session_id and command are required' };

      const session = vpsSessions.get(session_id);
      if (!session) return { error: `VPS session "${session_id}" not found. Check active sessions.` };

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      try {
        await ssh.connect({
          host: session.host,
          port: session.port || 22,
          username: session.username,
          privateKey: session.privateKey,
          readyTimeout: 10000
        });
        const r = await ssh.execCommand(command);
        ssh.dispose();
        const trim = s => s && s.length > 3000 ? s.slice(0, 3000) + '\n…(truncated)' : s;
        return { stdout: trim(r.stdout), stderr: trim(r.stderr), code: r.code };
      } catch (err) {
        if (ssh.isConnected()) ssh.dispose();
        return { error: err.message };
      }
    }

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
      } else {
        return listLocalDir(path || '.');
      }
    }

    case 'git_diff': {
      const { base = 'main', head, cwd } = action;
      if (repoCtx?.owner) {
        const h = head || repoCtx.branch || 'main';
        const res = await fetch(
          `https://api.github.com/repos/${repoCtx.owner}/${repoCtx.repo}/compare/${base}...${h}`,
          { headers: { ...ghHeaders(), Accept: 'application/vnd.github.diff' } }
        );
        if (!res.ok) return { error: `GitHub compare failed: ${res.status}` };
        const diff = await res.text();
        return { diff: diff.slice(0, 5000), base, head: h };
      } else {
        const { generateDiff } = await import('../../../../services/git/diff.js');
        return generateDiff(base, head, cwd);
      }
    }

    default:
      return { error: `Unknown action type: "${action.type}"` };
  }
}

// ── Action parser ────────────────────────────────────────────────────────────

function parseActions(text) {
  const actions = [];
  const regex = /```apex-action\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const action = JSON.parse(match[1].trim());
      actions.push({ raw: match[0], action });
    } catch (e) {
      actions.push({ raw: match[0], parseError: `Invalid JSON in action block: ${e.message}` });
    }
  }
  return actions;
}

// ── GitHub helper ─────────────────────────────────────────────────────────────

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// ── Agent loop ───────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;

async function runAgentLoop(apiKey, conv, initialUserMessage) {
  const { messages } = conv;
  messages.push({ role: 'user', content: initialUserMessage });

  const executedActions = [];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const result = await runDeepSeekChat({ apiKey, messages });
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Empty response from DeepSeek');

    const parsedActions = parseActions(reply);

    if (parsedActions.length === 0) {
      // No actions — this is the final answer
      messages.push({ role: 'assistant', content: reply });
      finalResponse = reply;
      break;
    }

    // Execute all actions and collect results
    const actionResults = [];
    for (const { raw, action, parseError } of parsedActions) {
      if (parseError) {
        actionResults.push({ type: 'parse_error', error: parseError });
        executedActions.push({ type: 'parse_error', error: parseError });
        continue;
      }

      const result = await executeAction(action, conv);
      actionResults.push({ type: action.type, params: action, result });
      executedActions.push({ type: action.type, params: action, result });
    }

    // Add AI's response (with action blocks) to history
    messages.push({ role: 'assistant', content: reply });

    // Inject action results back into the conversation
    const resultSummary = actionResults.map((r, i) => {
      const label = `[Action ${i + 1}: ${r.type}]`;
      if (r.error) return `${label}\nError: ${r.error}`;
      if (r.type === 'read_file' && r.result?.content) {
        return `${label}\nFile: ${r.result.path} (${r.result.lines} lines)\n\`\`\`\n${r.result.content.slice(0, 4000)}${r.result.content.length > 4000 ? '\n…(truncated)' : ''}\n\`\`\``;
      }
      return `${label}\n${JSON.stringify(r.result, null, 2)}`;
    }).join('\n\n');

    messages.push({ role: 'user', content: `[Action Results]\n${resultSummary}\n\nContinue based on these results.` });
  }

  if (!finalResponse && iterations >= MAX_ITERATIONS) {
    finalResponse = 'Reached maximum action iterations. Review the executed actions above.';
    messages.push({ role: 'assistant', content: finalResponse });
  }

  return { finalResponse, executedActions, iterations };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, conversationId, repoContext, fileContext } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured' });

  const id = conversationId || Math.random().toString(36).slice(2);

  if (!conversations.has(id)) {
    let systemContent = BASE_SYSTEM;

    if (repoContext) {
      systemContent += `\n\n---\nLoaded repository: ${repoContext.owner}/${repoContext.repo} (branch: ${repoContext.branch})\n`;
      if (repoContext.description) systemContent += `Description: ${repoContext.description}\n`;
      if (repoContext.language)    systemContent += `Primary language: ${repoContext.language}\n`;
      systemContent += `\nFile tree (${repoContext.fileCount} files):\n${repoContext.files.map(f => f.path).join('\n')}\n`;
      if (repoContext.readme)      systemContent += `\nREADME (excerpt):\n${repoContext.readme}\n`;
      systemContent += `---`;
    }

    conversations.set(id, {
      messages: [{ role: 'system', content: systemContent }],
      repoCtx: repoContext || null
    });
  }

  const conv = conversations.get(id);

  // Update repoCtx if a new one was provided (repo reload)
  if (repoContext && !conv.repoCtx) conv.repoCtx = repoContext;

  // Prepend file context to the user message if provided
  let userMessage = message;
  if (fileContext) {
    userMessage = `[File loaded: ${fileContext.path}]\n\`\`\`\n${fileContext.content}\n\`\`\`\n\n${message}`;
  }

  const wf = addWorkflow({
    title: message.slice(0, 72) + (message.length > 72 ? '…' : ''),
    description: repoContext ? `repo: ${repoContext.owner}/${repoContext.repo}` : 'local',
    status: 'running',
    type: 'ai-task'
  });

  try {
    const { finalResponse, executedActions, iterations } = await runAgentLoop(apiKey, conv, userMessage);

    updateWorkflow(wf.id, {
      status: 'completed',
      description: `${executedActions.length} action(s) in ${iterations} iteration(s)`
    });

    res.json({
      response: finalResponse,
      conversationId: id,
      executedActions,
      iterations,
      workflowId: wf.id
    });
  } catch (err) {
    console.error('Agent loop error:', err.message);
    updateWorkflow(wf.id, { status: 'failed', description: err.message });
    // Pop the last user message if AI never responded
    if (conv.messages.at(-1)?.role === 'user') conv.messages.pop();
    res.status(500).json({ error: err.message });
  }
});

// Inject a new repo context into an existing conversation
router.post('/context/repo', (req, res) => {
  const { conversationId, repoContext } = req.body;
  const conv = conversations.get(conversationId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  conv.repoCtx = repoContext;
  const summary = `[Repository context updated: ${repoContext.owner}/${repoContext.repo}]\nFiles: ${repoContext.files.map(f => f.path).join(', ')}`;
  conv.messages.push({ role: 'user', content: summary });
  conv.messages.push({
    role: 'assistant',
    content: `Got it. I now have context for \`${repoContext.owner}/${repoContext.repo}\` (${repoContext.fileCount} files on branch \`${repoContext.branch}\`). What would you like me to do?`
  });

  res.json({ success: true });
});

router.post('/run', async (req, res) => {
  const result = await runTask(req.body.task, req.body.context || {});
  res.json(result);
});

router.post('/context', (req, res) => {
  const context = assembleContext(req.body);
  res.json(context);
});

export default router;
