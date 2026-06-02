# Apex Dev

A self-hosted AI engineering platform. Chat with an autonomous AI agent that reads, edits, tests, and deploys code — across GitHub repos and your own VPS servers.

## Architecture

```
apex-dev/
├── apps/
│   ├── api/                     Express.js backend (port 3000)
│   │   └── src/
│   │       ├── index.js         App entry point, route registration
│   │       ├── routes/
│   │       │   ├── orchestrator.js   AI agent loop + all action handlers
│   │       │   ├── auth.js           Login / logout / me
│   │       │   ├── vps.js            VPS CRUD + SSH exec + file browser + deploy
│   │       │   ├── domains.js        Domain registry + nginx config deployment
│   │       │   ├── db-admin.js       DB backup import (SSE) + export
│   │       │   ├── repos.js          Repository registry CRUD
│   │       │   ├── rollback.js       Checkpoint + restore
│   │       │   ├── memory.js         Project memory + global agent memory
│   │       │   ├── jobs.js           SSE job stream
│   │       │   ├── deployment.js     PM2 / Docker service manager
│   │       │   ├── validation.js     Code lint / build checks
│   │       │   ├── workflow.js       Workflow timeline
│   │       │   ├── approval.js       Human-in-the-loop approvals
│   │       │   ├── github.js         GitHub API proxy
│   │       │   ├── git.js            Branch / diff helpers
│   │       │   ├── files.js          Local file browser
│   │       │   ├── shell.js          Shell command runner
│   │       │   ├── system.js         System info
│   │       │   ├── terminal.js       Terminal REST shim
│   │       │   └── workspace.js      Workspace context
│   │       └── ws/
│   │           ├── terminal.js  Local shell WebSocket (xterm.js)
│   │           └── vps.js       VPS SSH WebSocket (xterm.js)
│   └── web/                     React + Vite frontend (port 5000)
│       └── src/
│           ├── components/
│           │   ├── ChatWorkspace.jsx      AI chat + streaming steps
│           │   ├── WorkflowTimeline.jsx   Task activity log
│           │   ├── ApprovalPanel.jsx      Human approval queue
│           │   ├── RepositoryRegistry.jsx Named repo registry
│           │   ├── RepositoryExplorer.jsx GitHub file browser + editor
│           │   ├── TerminalPanel.jsx      Local + VPS terminal (xterm.js)
│           │   ├── ValidationPanel.jsx    Code validation runner
│           │   ├── DeploymentPanel.jsx    PM2 / Docker service manager
│           │   ├── VPSManager.jsx         VPS server CRUD
│           │   ├── VPSFileBrowser.jsx     Browse + edit files on VPS
│           │   ├── MemoryPanel.jsx        Global agent memory viewer
│           │   ├── RollbackPanel.jsx      Checkpoint + restore UI
│           │   ├── DomainManager.jsx      Domain registry + nginx deployer
│           │   ├── DatabaseAdmin.jsx      DB backup import / export
│           │   └── SSHKeyManager.jsx      SSH key management
│           ├── pages/
│           │   └── Dashboard.jsx          Main layout + tab router
│           └── hooks/
│               └── useAuth.js             JWT auth hook
└── services/                    Shared Node.js services (workspace root)
    ├── ai/                      DeepSeek streaming client
    ├── auth/                    JWT + bcrypt middleware
    ├── db/                      PostgreSQL client + migrations
    ├── deployment/              PM2, Docker, health, pre-deploy validator
    ├── domains/                 Domain registry + nginx config builder
    ├── embeddings/              Full-text code search (FTS)
    ├── file/                    Local file read / patch / list
    ├── git/                     Branch creation, diff
    ├── memory/                  Project memory + global agent memory
    ├── monitoring/              Activity audit log
    ├── queue/                   Job queue + background worker
    ├── repos/                   Repository registry (named repos)
    ├── rollback/                Checkpoint + restore system
    ├── shell/                   Shell command execution
    ├── validation/              Code validation runner
    ├── vps/                     VPS session store
    └── workflow/                Workflow timeline store
```

## Quick Start

```bash
# Install all dependencies
pnpm install

# Copy and configure environment
cp deploy/.env.production.example .env
# Edit .env with your credentials

# Start backend (port 3000)
pnpm --filter @apex/api dev

# Start frontend (port 5000)
pnpm --filter @apex/web dev
```

Open http://localhost:5000 and log in with the credentials from `AUTH_USERNAME` / `AUTH_PASSWORD`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AUTH_USERNAME` | ✅ | Login username |
| `AUTH_PASSWORD` | ✅ | Login password |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `GITHUB_TOKEN` | ✅ | GitHub PAT (repo + code search scopes) |
| `DATABASE_URL` | Recommended | PostgreSQL connection string |
| `PORT` | — | API port (default: 3000) |
| `NODE_ENV` | — | Set to `production` in prod |
| `ALLOWED_ORIGINS` | Prod | Comma-separated CORS origins |

## AI Actions

The orchestrator agent runs an autonomous loop with these actions:

| Action | Description |
|---|---|
| `search_repo` | GitHub code search or local grep |
| `read_file` | Read from GitHub or local filesystem |
| `edit_file` | Surgical patch (old_str → new_str) with auto-commit |
| `create_branch` | Create a feature branch |
| `run_tests` | Clone, install, and run the test suite |
| `create_pull_request` | Open a PR (only after tests pass) |
| `git_diff` | Compare branches |
| `list_files` | Browse directory tree |
| `run_local` | Run shell commands locally |
| `run_vps` | Execute commands on a VPS via SSH |
| `deploy_to_vps` | Full deploy pipeline: pull → install → restart |
| `set_vps_env` | Write env vars to a VPS .env file |
| `recall_memory` | Recall per-project facts |
| `add_memory` | Store per-project facts |
| `remember` | Store global cross-project memory |
| `recall` | Search global memory by query/category |
| `forget` | Remove a global memory entry |
| `list_repos` | List registered repository names |
| `switch_repo` | Switch active context to a named repo |
| `create_checkpoint` | Snapshot git SHA + PM2 state before risky ops |
| `rollback` | Restore to a previous checkpoint |
| `list_checkpoints` | List recent snapshots |
| `validate_deployment` | Pre-flight check before deploying |
| `browse_vps` | List files on a VPS server |
| `read_vps_file` | Read file content from VPS |
| `write_vps_file` | Write file content to VPS |
| `self_inspect` | Read Apex Dev's own source files |

## Dashboard Tabs

| Tab | Description |
|---|---|
| Chat | AI assistant — send engineering tasks |
| Workflows | Timeline of AI task activity |
| Approvals | Human-in-the-loop approval queue |
| Repos | Repository registry — register named repos |
| File Browser | GitHub repo file browser + editor |
| Terminal | Local interactive shell (xterm.js) |
| Validation | Code lint/build checks |
| Deployment | PM2 + Docker service manager |
| VPS Servers | Register and manage VPS servers |
| VPS Files | Browse and edit files on VPS over SSH |
| Memory | View and manage global agent memory |
| Rollback | Deployment checkpoints + one-click restore |
| SSH Keys | SSH key management |

## Features

### Repository Registry
Register named repos so the AI resolves them by name:
- "Work on Manuskripta" → looks up `owner/repo` from registry
- Each entry: GitHub URL, default VPS server, clone path, env notes, purpose
- Injected into every system prompt automatically

### Global Agent Memory
Structured long-term memory across all repos and conversations:
- Categories: `architecture`, `instruction`, `infrastructure`, `deployment`, `preference`, `fact`
- Optionally scoped to a specific repo
- Persisted in PostgreSQL; AI can `remember`, `recall`, `forget`

### Rollback & Checkpoints
Snapshot system state before risky operations:
- Captures: git HEAD SHA, PM2 process state
- Auto-triggered before deployments
- Manual creation from UI or by the AI
- One-click restore in the Rollback tab

### VPS File Browser
Browse, view, and edit files on VPS servers over SSH:
- Directory navigation with breadcrumbs
- In-browser file editor with save
- File deletion with safety guard on root paths

### Deployment Safety Validation
Pre-flight check before every deploy:
- Verifies deploy directory exists
- Checks required env vars are present
- Confirms PM2 and Node are available
- Checks free disk space
- Verifiable via the `validate_deployment` AI action

### Streaming AI Jobs
- POST to `/orchestrator/chat` enqueues background job
- SSE stream at `/jobs/:id/stream` delivers live token/step/progress events
- Per-step progress displayed in real time

### SSH Terminal
- Local shell via `/ws/terminal` (xterm.js)
- SSH into any registered VPS via `/ws/vps/:id`

### Security
- bcrypt password hashing
- JWT auth (httpOnly cookie + Bearer header)
- All routes protected with `requireAuth`
- Rate limiting: 300 req/min per IP
- Full audit log in `activity_log` table

## Production Deployment

### Setup on VPS

```bash
# Install Node 20 + pnpm + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx
npm install -g pnpm pm2

# Clone and install
git clone https://github.com/YOUR_USER/apex-dev.git /opt/apex-dev
cd /opt/apex-dev
pnpm install

# Configure
cp deploy/.env.production.example .env
nano .env  # fill in credentials

# Build frontend
pnpm --filter @apex/web build

# Configure nginx
cp deploy/nginx.conf /etc/nginx/sites-available/apex-dev
# edit server_name
ln -s /etc/nginx/sites-available/apex-dev /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Start with PM2
cp deploy/ecosystem.config.cjs /opt/apex-dev/
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### Updates

```bash
cd /opt/apex-dev
git pull
pnpm install
pnpm --filter @apex/web build
pm2 restart apex-dev
```

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Get JWT |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/me` | Current user |

### Orchestrator
| Method | Path | Description |
|---|---|---|
| POST | `/orchestrator/chat` | Enqueue AI task |
| GET | `/orchestrator/conversations` | List conversations |
| GET | `/orchestrator/conversations/:id` | Load conversation |

### Repository Registry
| Method | Path | Description |
|---|---|---|
| GET | `/repos` | List registered repos |
| POST | `/repos` | Register a repo |
| PATCH | `/repos/:name` | Update repo metadata |
| DELETE | `/repos/:name` | Remove from registry |

### VPS
| Method | Path | Description |
|---|---|---|
| GET | `/vps/servers` | List servers |
| POST | `/vps/servers` | Add server |
| PUT | `/vps/servers/:id` | Update server |
| DELETE | `/vps/servers/:id` | Remove server |
| POST | `/vps/servers/:id/test` | Test SSH |
| POST | `/vps/servers/:id/exec` | Run command |
| POST | `/vps/servers/:id/set-env` | Write env var |
| GET | `/vps/servers/:id/deploy` | Deploy (SSE) |
| GET | `/vps/servers/:id/fs/browse` | Browse directory |
| GET | `/vps/servers/:id/fs/read` | Read file |
| POST | `/vps/servers/:id/fs/write` | Write file |
| POST | `/vps/servers/:id/fs/delete` | Delete file |
| POST | `/vps/servers/:id/validate` | Pre-deploy validation |

### Memory
| Method | Path | Description |
|---|---|---|
| GET | `/memory/agent` | Search global memory |
| POST | `/memory/agent` | Store memory |
| DELETE | `/memory/agent/:id` | Forget memory |

### Rollback
| Method | Path | Description |
|---|---|---|
| GET | `/rollback/checkpoints` | List checkpoints |
| POST | `/rollback/checkpoints` | Create checkpoint |
| POST | `/rollback/checkpoints/:id/restore` | Restore |
| DELETE | `/rollback/checkpoints/:id` | Delete |

## Database Schema

Auto-migrated tables:

| Table | Purpose |
|---|---|
| `conversations` | AI chat sessions |
| `messages` | Chat messages |
| `job_queue` | Background AI tasks |
| `workflows` | Task timeline |
| `approvals` | Human-in-the-loop |
| `ssh_sessions` | VPS server credentials |
| `project_memory` | Per-repo AI facts |
| `code_chunks` | FTS search index |
| `activity_log` | Audit trail |
| `repositories` | Named repo registry |
| `agent_memory` | Global structured memory |
| `rollback_checkpoints` | Deployment snapshots |
| `deployment_resources` | RAM/CPU limits per service |

## License

MIT
