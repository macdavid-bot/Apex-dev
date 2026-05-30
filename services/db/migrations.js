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

-- Workflow timeline entries
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

-- Human approval requests
CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  action_json JSONB,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SSH / VPS sessions
CREATE TABLE IF NOT EXISTS ssh_sessions (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  host        TEXT NOT NULL,
  port        INT  NOT NULL DEFAULT 22,
  username    TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Per-project memory (facts + summary)
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
`;

export async function runMigrations() {
  const pool = getPool();
  try {
    await pool.query(DDL);
    console.log('[DB] Migrations applied');
  } catch (err) {
    console.error('[DB] Migration error:', err.message);
    throw err;
  }
}
