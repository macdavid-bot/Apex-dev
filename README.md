# Apex Dev

Apex Dev is a private autonomous engineering and VPS operations platform designed to:
- understand repositories intelligently,
- orchestrate engineering workflows,
- validate and repair codebases,
- manage deployments,
- operate VPS infrastructure,
- and coordinate real-world engineering operations autonomously.

Apex Dev combines:
- autonomous AI engineering (DeepSeek agent loop with real shell/git/file actions),
- repository intelligence,
- deployment orchestration,
- persistent memory,
- realtime terminal systems,
- conversational engineering workspaces,
- SSH-aware execution,
- and workflow automation
into a lightweight but highly capable engineering operating environment.

---

# Core Capabilities

## Conversational Engineering Workspace
- Chat-first engineering operations with a real DeepSeek agent loop
- Tool-assisted workflows (read_file, edit_file, create_branch, run_local, run_vps, git_diff)
- Persistent engineering conversations
- SSH-bound chat sessions
- Context-aware engineering execution
- Workflow-aware conversations

## Autonomous Engineering Runtime
- AI-powered engineering workflows (up to 8 action iterations per prompt)
- Approval-aware execution with approve/reject endpoints
- Workflow lifecycle tracking (in-memory store)
- AI-powered repair systems (failure analysis, root cause, suggestions via DeepSeek)
- Validation-first operations (real shell-based checks)
- Deployment coordination

## Repository Intelligence
- Targeted repository search
- Selective rescanning
- Symbol memory
- Context assembly
- Repository indexing
- Persistent architecture memory

## Interactive Engineering Environment
- Interactive dashboard
- Realtime terminal architecture
- Workflow visualization
- Approval management
- Deployment monitoring (PM2 jlist + local health probes + VPS SSH probe)
- Validation diagnostics

## VPS Operations
- Docker Compose orchestration
- PM2 runtime management
- PostgreSQL runtime foundations
- Environment validation
- Deployment scripting
- Infrastructure automation

## Security & Stability
- In-process rate limiting (300 req/min per IP)
- Environment variable validation
- SSH-aware session validation
- Command sanitization
- Structured logging
- 10 MB request body limit

---

# Runtime Architecture

## Backend Stack
- Express API (`apps/api`)
- Real shell executor via `child_process`
- Workflow execution engine with in-memory store
- AI repair orchestration (DeepSeek)
- Real validation runtime (shell-based)
- Real deployment runtime (PM2 + Docker Compose)
- SSH session runtime (node-ssh)

## Frontend Stack
- React + Vite (`apps/web`)
- React Query
- Zustand
- Chat workspace UI with action step pills
- SSH key management UI
- Approval UI (approve/reject)
- Workflow timelines
- Deployment dashboard

## Intelligence Layer
- DeepSeek runtime integration (agent loop, 8-iteration max)
- `apex-action` JSON block parsing and execution
- Context assembly
- Repository intelligence
- AI-powered repair intelligence
- Workflow planning
- Persistent memory systems
- SSH-aware workflow coordination

---

# Deployment

## Development
```bash
pnpm install
pnpm dev                # starts api on :3000 + web on :5000
```

## Docker (production)
```bash
docker build -t apex-dev .
docker run -p 3000:3000 \
  -e DEEPSEEK_API_KEY=sk-... \
  -e GITHUB_TOKEN=ghp_... \
  apex-dev
```

## PM2 (VPS)
```bash
pnpm --filter @apex/web build
pm2 start ecosystem.config.cjs
pm2 save
```

---

# Comprehensive File Tree

```txt
apex-dev/
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.js                    # Express entry — CORS, rate limit, routes
│   │       ├── routes/
│   │       │   ├── approval.js             # GET / POST / POST /:id/approve|reject
│   │       │   ├── context.js
│   │       │   ├── deployment.js           # GET /list, POST /docker|pm2|package|health
│   │       │   ├── files.js                # read/write/list file operations
│   │       │   ├── git.js                  # clone/branch/checkout/commit/diff/push
│   │       │   ├── github.js
│   │       │   ├── memory.js
│   │       │   ├── orchestrator.js         # AI agent loop — parses apex-action blocks
│   │       │   ├── repair.js               # analyze/root-cause/suggestions/recover
│   │       │   ├── repository.js
│   │       │   ├── shell.js                # POST /execute (with cwd support)
│   │       │   ├── system.js
│   │       │   ├── terminal.js
│   │       │   ├── validation-engine.js
│   │       │   ├── validation.js           # POST /run + GET /run
│   │       │   ├── vps.js                  # SSH session management
│   │       │   ├── workflow.js             # GET / list, POST /, PATCH /:id
│   │       │   └── workspace.js
│   │       │
│   │       └── socket/
│   │           └── terminal-stream.js
│   │
│   └── web/
│       └── src/
│           ├── api/
│           │   └── workflows.ts
│           │
│           ├── components/
│           │   ├── ApprovalCard.jsx
│           │   ├── ApprovalCard.css
│           │   ├── ApprovalPanel.jsx
│           │   ├── ChatToolbar.jsx
│           │   ├── ChatWorkspace.jsx       # renders markdown + action step pills
│           │   ├── DeploymentPanel.jsx     # calls GET /deployment/list
│           │   ├── Panel.css
│           │   ├── RepositoryExplorer.jsx
│           │   ├── SSHKeyManager.jsx
│           │   ├── SSHSelector.jsx
│           │   ├── TerminalPanel.jsx
│           │   ├── ValidationPanel.jsx     # calls POST /validation/run
│           │   └── WorkflowTimeline.jsx    # calls GET /workflow
│           │
│           ├── lib/
│           │   └── query-client.ts
│           │
│           ├── pages/
│           │   └── Dashboard.jsx           # wires actions from orchestrator → messages
│           │
│           └── store/
│               └── workflow-store.ts
│
├── scripts/
│   ├── deploy.sh
│   └── restart.sh
│
├── services/
│   ├── ai/
│   │   ├── client.js
│   │   └── deepseek-runtime.js            # runDeepSeekChat — used by orchestrator + repair
│   │
│   ├── approval/
│   │   └── runtime.js                     # createApproval / approveAction / rejectAction
│   │
│   ├── auth/
│   │   ├── jwt.js
│   │   └── password.js
│   │
│   ├── context/
│   │   └── assembler.js
│   │
│   ├── database/
│   │   ├── drizzle-client.js
│   │   ├── memory-store.js
│   │   └── schema.js
│   │
│   ├── deployment/
│   │   ├── docker.js                      # docker compose up/stop/status
│   │   ├── health.js                      # HTTP health probe
│   │   ├── monitor.js                     # PM2 jlist + local port probe + VPS ping
│   │   ├── packages.js                    # pnpm add / pnpm install
│   │   ├── pm2.js                         # pm2 restart/start/save
│   │   └── runtime.js
│   │
│   ├── diagnostics/
│   │   └── parser.js
│   │
│   ├── environment/
│   │   ├── runtime.js
│   │   └── validator.js
│   │
│   ├── file/
│   │   └── editor.js                      # surgical old_str/new_str patch
│   │
│   ├── git/
│   │   ├── branch.js                      # createBranch / checkoutBranch / listBranches
│   │   ├── clone.js
│   │   ├── commit.js                      # createCommit / getStatus
│   │   ├── diff.js                        # generateDiff / diffUnstaged / pushBranch
│   │   └── runtime.js
│   │
│   ├── memory/
│   │   ├── change-tracker.js
│   │   ├── context-store.js
│   │   ├── repository-cache.js
│   │   └── symbol-memory.js
│   │
│   ├── monitoring/
│   │   └── logger.js
│   │
│   ├── orchestrator/
│   │   └── runtime.js
│   │
│   ├── repair/
│   │   ├── failure-analysis.js            # AI-powered — calls DeepSeek
│   │   ├── recovery.js                    # AI-powered — calls DeepSeek
│   │   ├── root-cause.js                  # AI-powered — calls DeepSeek
│   │   ├── runtime-loop.js
│   │   └── suggestions.js                 # AI-powered — calls DeepSeek
│   │
│   ├── repository/
│   │   ├── context-loader.js
│   │   ├── indexer.js
│   │   ├── runtime-search.js
│   │   ├── search.js
│   │   └── symbols.js
│   │
│   ├── security/
│   │   ├── rate-limit.js
│   │   └── sanitizer.js
│   │
│   ├── shell/
│   │   ├── assistant.js
│   │   ├── history.js
│   │   ├── index.js                       # runShellCommand — main shell executor
│   │   ├── runtime.js                     # executeCommand (child_process spawn)
│   │   ├── session.js
│   │   └── stream.js
│   │
│   ├── ssh/
│   │   └── session-runtime.js
│   │
│   ├── validation/
│   │   ├── build.js
│   │   ├── install.js
│   │   ├── lint.js
│   │   └── runtime.js
│   │
│   ├── vps/
│   │   └── sessions.js                    # shared Map of active VPS SSH sessions
│   │
│   └── workflow/
│       ├── executor.js
│       ├── lifecycle.js
│       ├── orchestrator.js
│       ├── pipeline.js
│       └── store.js                       # addWorkflow / updateWorkflow / getWorkflows
│
├── Dockerfile                             # multi-stage: deps → builder → production
├── docker-compose.yml
├── ecosystem.config.cjs                   # PM2 config (cjs — avoids ESM conflict)
├── package.json                           # "type":"module", pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.json
├── .env.example
└── README.md

# New files since last tree update

apps/web/public/favicon.png              # App icon (custom brand mark)
services/shell/session-store.js          # Shell sessions: persistent cwd tracking, cd support, history
```

---

# Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes | AI agent loop, repair analysis |
| `GITHUB_TOKEN` | Yes | GitHub API integration |
| `PORT` | No | API port (default: 3000) |
| `HOST` | No | API bind host (default: 0.0.0.0) |
| `NODE_ENV` | No | `production` enables strict CORS |
| `ALLOWED_ORIGINS` | Prod | Comma-separated allowed CORS origins |

---

# Deployment Philosophy

Apex Dev is designed so that:
- Most engineering work is completed before VPS deployment.
- Deployment day focuses primarily on:
  - infrastructure installation,
  - environment configuration,
  - service startup,
  - and operational verification.

This dramatically reduces deployment complexity and operational chaos.

---

# Vision

Apex Dev is evolving into a fully autonomous conversational engineering operating environment capable of:
- engineering repositories,
- orchestrating deployments,
- validating infrastructure,
- repairing failures,
- operating VPS systems,
- coordinating SSH-aware workflows,
- and managing real-world engineering operations through conversational interfaces with minimal manual intervention.

The long-term objective is to create a highly efficient private engineering intelligence platform optimized for autonomous software development, infrastructure orchestration, and conversational engineering operations.
