import { getPool } from './client.js';

const DDL = `
-- Conversations (each chat session)
CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  repo_owner   TEXT,
  repo_name    TEXT,
  repo_branch  TEXT DEFAULT 'main',
  ssh_key      TEXT,
  summary      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content         TEXT NOT NULL,
  actions_json    JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, created_at);

-- Background job queue
CREATE TABLE IF NOT EXISTS job_queue (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'ai-task',
  payload_json JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  priority     INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error        TEXT,
  result_json  JSONB,
  progress     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS job_queue_status_idx ON job_queue(status, priority DESC, created_at);

-- Workflow timeline entries (persisted)
CREATE TABLE IF NOT EXISTS workflows (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'running',
  type        TEXT NOT NULL DEFAULT 'ai-task',
  job_id      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workflows_created_idx ON workflows(created_at DESC);

-- Human approval requests (persisted)
CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  action_json JSONB,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status, created_at DESC);

-- SSH / VPS servers
CREATE TABLE IF NOT EXISTS ssh_sessions (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  host             TEXT NOT NULL,
  port             INT  NOT NULL DEFAULT 22,
  username         TEXT NOT NULL,
  private_key      TEXT NOT NULL,
  env_file         TEXT DEFAULT '.env',
  service_name     TEXT DEFAULT '',
  deploy_dir       TEXT DEFAULT '',
  deploy_commands  TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Per-project memory (facts + summary, keyed by owner/repo)
CREATE TABLE IF NOT EXISTS project_memory (
  repo_key    TEXT PRIMARY KEY,
  summary     TEXT DEFAULT '',
  facts_json  JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Code chunks for FTS indexing
CREATE TABLE IF NOT EXISTS code_chunks (
  id          BIGSERIAL PRIMARY KEY,
  repo_key    TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  chunk_index INT  NOT NULL DEFAULT 0,
  content     TEXT NOT NULL,
  content_tsv TSVECTOR,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS code_chunks_repo_idx ON code_chunks(repo_key);
CREATE INDEX IF NOT EXISTS code_chunks_tsv_idx  ON code_chunks USING GIN(content_tsv);
CREATE UNIQUE INDEX IF NOT EXISTS code_chunks_unique ON code_chunks(repo_key, file_path, chunk_index);

-- Activity / audit log
CREATE TABLE IF NOT EXISTS activity_log (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  action     TEXT NOT NULL,
  meta_json  JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_created_idx  ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_category_idx ON activity_log(category, action);

-- ── NEW: Repository Registry ──────────────────────────────────────────────────
-- Named repo registry so AI resolves "Manuskripta" → github.com/owner/repo
CREATE TABLE IF NOT EXISTS repositories (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,   -- slug: "manuskripta", "apex-dev"
  label            TEXT NOT NULL,           -- display: "Manuskripta", "Apex Dev"
  github_url       TEXT DEFAULT '',
  owner            TEXT DEFAULT '',
  repo             TEXT DEFAULT '',
  branch           TEXT DEFAULT 'main',
  purpose          TEXT DEFAULT '',         -- one-line project description
  clone_path       TEXT DEFAULT '',         -- local/VPS clone path
  deploy_server_id TEXT DEFAULT '',         -- default VPS server id for deployment
  env_info         TEXT DEFAULT '',         -- notes about env / required vars
  last_indexed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS repositories_name_idx ON repositories(name);

-- ── NEW: Global Agent Memory ──────────────────────────────────────────────────
-- Structured long-term memory not tied to a single conversation
CREATE TABLE IF NOT EXISTS agent_memory (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL DEFAULT 'fact',
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  tags_json  JSONB DEFAULT '[]',
  repo_name  TEXT DEFAULT '',    -- optional: scoped to a repo name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_memory_category_idx ON agent_memory(category);
CREATE INDEX IF NOT EXISTS agent_memory_repo_idx     ON agent_memory(repo_name);

-- ── NEW: Rollback Checkpoints ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rollback_checkpoints (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'deployment',
  server_id      TEXT DEFAULT '',
  repo_name      TEXT DEFAULT '',
  git_sha        TEXT DEFAULT '',
  pm2_state_json JSONB DEFAULT '[]',
  metadata_json  JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rollback_checkpoints_created_idx ON rollback_checkpoints(created_at DESC);

-- ── NEW: Deployment Resource Limits ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployment_resources (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL,
  service_name TEXT NOT NULL,
  ram_limit    TEXT DEFAULT '512MB',
  cpu_limit    INT  DEFAULT 100,
  max_restarts INT  DEFAULT 10,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, service_name)
);
`;

// Safe column additions for existing deployments (idempotent)
const ALTER_DDL = `
DO $$ BEGIN
  BEGIN ALTER TABLE ssh_sessions ADD COLUMN env_file        TEXT DEFAULT '.env'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE ssh_sessions ADD COLUMN service_name    TEXT DEFAULT '';     EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE ssh_sessions ADD COLUMN deploy_dir      TEXT DEFAULT '';     EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE ssh_sessions ADD COLUMN deploy_commands TEXT DEFAULT '';     EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;
`;

export async function runMigrations() {
  const pool = getPool();
  try {
    await pool.query(DDL);
    await pool.query(ALTER_DDL);
    console.log('[DB] Migrations applied');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
    throw err;
  }
}
