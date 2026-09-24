-- =====================================================================
-- document-ai : workspaces
--
-- Turns a single-company install into a service where any group — a
-- class, a team, a friend group — has its own isolated space.
--
-- The rule this schema exists to enforce: workspace membership is
-- checked BEFORE role. Being an owner of one workspace grants nothing
-- in another. Every table that holds content carries workspace_id so
-- that isolation can be applied in the same WHERE clause as the query
-- itself, never as a filter afterwards.
-- =====================================================================

CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  -- Short URL-safe id for invite links, e.g. /join/ab12cd34
  slug       TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user's role lives here, not on the user: the same person can be an
-- owner of their own workspace and a viewer in someone else's.
CREATE TABLE workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','member','viewer')),
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx      ON workspace_members(user_id);
CREATE INDEX workspace_members_workspace_idx ON workspace_members(workspace_id);

-- Invite links. A token is revocable and can expire, so sharing a link
-- is not a permanent grant.
CREATE TABLE workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('admin','member','viewer')),
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_invites_workspace_idx ON workspace_invites(workspace_id);

-- ------------------------------------------------- scope the content
-- Nullable for now so the existing rows survive; 003 backfills them
-- and makes them NOT NULL.
ALTER TABLE documents     ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE folders       ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE chat_sessions ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX documents_workspace_idx     ON documents(workspace_id);
CREATE INDEX folders_workspace_idx       ON folders(workspace_id);
CREATE INDEX chat_sessions_workspace_idx ON chat_sessions(workspace_id);

-- The global role on users is replaced by per-workspace roles. Kept for
-- now so 003 can migrate from it; dropped there.