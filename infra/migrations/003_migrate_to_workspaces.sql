-- =====================================================================
-- document-ai : move existing data into a default workspace
--
-- Everything that exists today belongs to one implicit organisation,
-- so it all moves into one workspace. The old global roles map onto
-- workspace roles: admin -> owner, manager -> admin, employee -> member.
-- =====================================================================

-- One workspace, owned by the earliest admin (or the earliest user).
INSERT INTO workspaces (id, name, slug, created_by)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'Acme',
  'acme',
  (SELECT id FROM users ORDER BY (role = 'admin') DESC, created_at LIMIT 1)
WHERE EXISTS (SELECT 1 FROM users);

-- Every existing user becomes a member, with their old role translated.
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001',
  id,
  CASE role
    WHEN 'admin'   THEN 'owner'
    WHEN 'manager' THEN 'admin'
    ELSE 'member'
  END
FROM users
WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = '00000000-0000-0000-0000-000000000001')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- All existing content belongs to that workspace.
UPDATE documents     SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE folders       SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE chat_sessions SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;

-- Now that nothing is orphaned, make the scope mandatory. A document
-- without a workspace would be a document outside every boundary.
ALTER TABLE documents     ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE folders       ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE chat_sessions ALTER COLUMN workspace_id SET NOT NULL;

-- Roles are per-workspace now. Departments were a second, overlapping
-- access mechanism; workspaces replace them.
ALTER TABLE users DROP COLUMN role;
ALTER TABLE users DROP COLUMN department;
ALTER TABLE documents DROP COLUMN department;