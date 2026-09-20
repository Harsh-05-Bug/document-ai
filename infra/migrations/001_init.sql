-- =====================================================================
-- document-ai : initial schema
-- Postgres 15+ with the pgvector extension.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy filename search

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee'
                CHECK (role IN ('admin','manager','employee')),
  department    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- folders
CREATE TABLE folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  parent_id  UUID REFERENCES folders(id) ON DELETE CASCADE,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_owner_idx ON folders(owner_id);

-- ------------------------------------------------------------ documents
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES folders(id) ON DELETE SET NULL,
  filename    TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  BIGINT,
  -- processing | ready | failed
  status      TEXT NOT NULL DEFAULT 'processing'
              CHECK (status IN ('processing','ready','failed')),
  error       TEXT,
  category    TEXT,
  -- denormalised from the owner so managers can scope by department
  department  TEXT,
  summary     TEXT,
  page_count  INT,
  chunk_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_owner_idx      ON documents(owner_id);
CREATE INDEX documents_folder_idx     ON documents(folder_id);
CREATE INDEX documents_department_idx ON documents(department);
CREATE INDEX documents_filename_trgm  ON documents USING gin (filename gin_trgm_ops);

-- ------------------------------------------------------------- tagging
CREATE TABLE tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE document_tags (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES tags(id)      ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- -------------------------------------------------------------- chunks
CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT  NOT NULL,
  page_number INT,
  content     TEXT NOT NULL,
  token_count INT,
  embedding   VECTOR(1536),            -- must match EMBEDDING_DIM
  -- generated column powering keyword search over chunk bodies
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX chunks_document_idx ON document_chunks(document_id);
CREATE INDEX chunks_tsv_idx      ON document_chunks USING gin (content_tsv);

-- HNSW beats ivfflat here: it needs no training data, so it works on an
-- empty table and stays accurate as documents are added one at a time.
CREATE INDEX chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- --------------------------------------------------------- permissions
CREATE TABLE document_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  permission  TEXT NOT NULL
              CHECK (permission IN ('view','comment','edit','download','admin')),
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);
CREATE INDEX permissions_user_idx ON document_permissions(user_id);

-- ---------------------------------------------------------------- chat
CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_sessions_user_idx ON chat_sessions(user_id);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  sources     JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, created_at);

-- ---------------------------------------------------------- audit logs
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,          -- document.view, document.delete, chat.query ...
  document_id UUID,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_action_idx   ON audit_logs(action, created_at DESC);
CREATE INDEX audit_document_idx ON audit_logs(document_id);
