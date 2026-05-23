# Apex Dev

Apex Dev is a private autonomous engineering and VPS operations platform designed to:
- understand repositories intelligently,
- orchestrate engineering workflows,
- validate and repair codebases,
- manage deployments,
- operate VPS infrastructure,
- and coordinate real-world engineering operations autonomously.

Apex Dev combines:
- autonomous engineering,
- repository intelligence,
- deployment orchestration,
- persistent memory,
- realtime terminal systems,
- and workflow automation
into a single lightweight engineering operating environment.

---

# Core Capabilities

## Autonomous Engineering Runtime
- AI-powered engineering workflows
- Approval-aware execution
- Workflow orchestration
- Intelligent repair systems
- Validation-first operations
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
- Deployment monitoring
- Validation diagnostics

## VPS Operations
- Docker orchestration
- PM2 runtime management
- PostgreSQL runtime foundations
- Environment validation
- Deployment scripting
- Infrastructure automation

## Security + Stability
- JWT authentication
- bcrypt password security
- Environment validation
- Rate limiting
- Structured logging
- Command sanitization

---

# Runtime Architecture

## Backend Stack
- Express API
- Socket.IO realtime runtime
- Workflow execution engine
- Repair orchestration system
- Validation runtime
- Deployment runtime
- PostgreSQL + Drizzle foundations

## Frontend Stack
- React
- React Query
- Zustand
- Dashboard foundations
- Approval UI
- Workflow timelines
- Realtime terminal foundations

## Intelligence Layer
- DeepSeek runtime integration
- Context assembly
- Repository intelligence
- Repair intelligence
- Workflow planning
- Persistent memory systems

---

# Current Development Progress

```txt
Core MVP Foundation:      100%
Operational MVP:          100%
Pre-Deployment Runtime:   95%
Production Readiness:     ~90%
```

---

# Completed Development Phases

## PLAN 1 — DeepSeek Brain Integration
- AI orchestration runtime
- Context injection foundations
- Prompt execution runtime

## PLAN 2 — Autonomous Workflow Engine
- Workflow lifecycle orchestration
- Execution coordination
- Approval-aware execution

## PLAN 3 — Workspace + Git Runtime
- Git execution runtime
- Branch orchestration
- Commit runtime
- Repository operations

## PLAN 4 — Validation + Diagnostics Engine
- Real validation execution
- Build orchestration
- Diagnostics parsing
- Validation workflows

## PLAN 5 — VPS Deployment Runtime
- Docker deployment runtime
- PM2 runtime orchestration
- Deployment monitoring
- VPS operational foundations

## PLAN 6 — Manual Shell + Live Terminal
- Shell execution runtime
- Terminal orchestration
- Command history
- Interactive terminal foundations

## PLAN 7 — Frontend Dashboard
- Dashboard runtime foundations
- Approval interfaces
- Deployment visualization
- Repository explorer

## PLAN 8 — Intelligent Repair System
- Failure analysis
- Root-cause diagnostics
- Repair orchestration
- Workflow recovery systems

## PLAN 9 — Persistent Repository Intelligence
- Repository memory
- Symbol persistence
- Context persistence
- Change tracking

## PLAN 10 — Production Hardening
- Security systems
- Logging infrastructure
- Environment validation
- Operational hardening

## PHASE A — Real Runtime Conversion
- DeepSeek runtime integration
- Workflow execution engine
- Repository runtime search
- Validation repair loops

## PHASE B — Persistence + Infrastructure
- PostgreSQL foundations
- Drizzle integration
- JWT authentication
- bcrypt security
- Persistent runtime foundations

## PHASE C — Frontend Operationalization
- React Query integration
- Zustand integration
- Socket.IO foundations
- Approval UI systems
- Workflow visualization

## PHASE D — Pre-Deployment Hardening
- Dockerization
- docker-compose runtime
- PM2 runtime scripts
- Deployment automation
- Production deployment foundations

---

# Comprehensive File Tree

```txt
Apex-dev/
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.js
│   │       ├── routes/
│   │       │   ├── approval.js
│   │       │   ├── context.js
│   │       │   ├── deployment.js
│   │       │   ├── git.js
│   │       │   ├── memory.js
│   │       │   ├── orchestrator.js
│   │       │   ├── repair.js
│   │       │   ├── repository.js
│   │       │   ├── shell.js
│   │       │   ├── system.js
│   │       │   ├── terminal.js
│   │       │   ├── validation-engine.js
│   │       │   ├── validation.js
│   │       │   ├── workflow.js
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
│           │   ├── ApprovalPanel.jsx
│           │   ├── DeploymentPanel.jsx
│           │   ├── RepositoryExplorer.jsx
│           │   ├── TerminalPanel.jsx
│           │   ├── ValidationPanel.jsx
│           │   └── WorkflowTimeline.jsx
│           │
│           ├── lib/
│           │   └── query-client.ts
│           │
│           ├── pages/
│           │   └── Dashboard.jsx
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
│   │   └── deepseek-runtime.js
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
│   │   ├── docker.js
│   │   ├── health.js
│   │   ├── packages.js
│   │   ├── pm2.js
│   │   └── runtime.js
│   │
│   ├── diagnostics/
│   │   └── parser.js
│   │
│   ├── environment/
│   │   ├── runtime.js
│   │   └── validator.js
│   │
│   ├── git/
│   │   ├── branch.js
│   │   ├── clone.js
│   │   ├── commit.js
│   │   ├── diff.js
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
│   ├── planner/
│   │   ├── runtime.js
│   │   └── steps.js
│   │
│   ├── repair/
│   │   ├── failure-analysis.js
│   │   ├── recovery.js
│   │   ├── root-cause.js
│   │   ├── runtime-loop.js
│   │   └── suggestions.js
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
│   │   ├── runtime.js
│   │   ├── session.js
│   │   └── stream.js
│   │
│   ├── validation/
│   │   ├── build.js
│   │   ├── install.js
│   │   ├── lint.js
│   │   └── runtime.js
│   │
│   ├── workflow/
│   │   ├── executor.js
│   │   ├── lifecycle.js
│   │   ├── orchestrator.js
│   │   └── pipeline.js
│   │
│   └── workspace/
│
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── .env.example
```

---

# Deployment Philosophy

Apex Dev is designed so that:
- MOST engineering work is completed before VPS deployment.
- Deployment day focuses primarily on:
  - infrastructure installation,
  - environment configuration,
  - service startup,
  - and operational verification.

This dramatically reduces deployment complexity and operational chaos.

---

# Vision

Apex Dev is evolving into a fully autonomous engineering operating environment capable of:
- engineering repositories,
- orchestrating deployments,
- validating infrastructure,
- repairing failures,
- operating VPS systems,
- and coordinating real-world engineering workflows with minimal manual intervention.

The long-term objective is to create a highly efficient private engineering intelligence platform optimized for autonomous software development and infrastructure operations.
