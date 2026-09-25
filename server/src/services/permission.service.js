import { pool } from "../db/pool.js";
import { getMembership } from "./workspace.service.js";

/**
 * Permission model
 * ----------------
 * Two boundaries, always in this order:
 *
 *   1. WORKSPACE — is this user a member of the workspace that owns
 *      the document? If not, nothing else is considered. Being an
 *      owner of another workspace grants nothing here.
 *
 *   2. DOCUMENT — within that workspace:
 *        workspace owner/admin -> 'admin' on every document in it
 *        document owner        -> 'admin' on their own documents
 *        explicit share        -> whatever level the share grants
 *        any member            -> 'view', by default
 *
 * A workspace is a shared room: everyone inside can read what's in it.
 * That is what makes the product work for a class or a team — a teacher
 * uploads notes once rather than sharing them with thirty students.
 * Shares are additive, granting more than view. Something that must
 * not be seen belongs in a different workspace, not a hidden corner
 * of this one.
 *
 * Viewers are the exception on the write side: they can read and ask,
 * but never upload or change anything.
 */
const RANK = { view: 1, comment: 2, download: 3, edit: 4, admin: 5 };

export const atLeast = (level, minimum) => (RANK[level] || 0) >= (RANK[minimum] || 0);

const strongest = (...levels) =>
  levels.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] || null;

/**
 * Document IDs the user may read inside one workspace.
 * Used to scope lists, search and RAG.
 *
 * Returns an empty list for a workspace the user doesn't belong to,
 * so a caller that forgets to check membership still leaks nothing.
 */
export async function getAccessibleDocumentIds(user, workspaceId) {
  const role = await getMembership(user.id, workspaceId);
  if (!role) return [];

  // Every member reads everything in their own workspace — and nothing
  // outside it. The workspace, not the document, is the boundary.
  const { rows } = await pool.query(
    `SELECT id FROM documents WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows.map((r) => r.id);
}

/**
 * The caller's effective permission on one document, or null.
 *
 * The document's own workspace is read from the row, so a caller can't
 * gain access by naming a workspace they happen to belong to.
 */
export async function getPermissionLevel(user, documentId) {
  const { rows } = await pool.query(
    `SELECT d.owner_id, d.workspace_id, p.permission
       FROM documents d
       LEFT JOIN document_permissions p
              ON p.document_id = d.id AND p.user_id = $2
      WHERE d.id = $1`,
    [documentId, user.id]
  );
  const doc = rows[0];
  if (!doc) return null;

  // Boundary one: membership of the document's workspace.
  const role = await getMembership(user.id, doc.workspace_id);
  if (!role) return null;

  // Boundary two: role and shares within that workspace.
  if (role === "owner" || role === "admin") return "admin";
  if (doc.owner_id === user.id) return "admin";

  // Everyone else reads by default; a share can grant more.
  return strongest(doc.permission, "view");
}

export async function shareDocument({ documentId, userId, permission, grantedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO document_permissions (document_id, user_id, permission, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, user_id)
       DO UPDATE SET permission = EXCLUDED.permission, granted_by = EXCLUDED.granted_by
     RETURNING *`,
    [documentId, userId, permission, grantedBy]
  );
  return rows[0];
}

/**
 * Sharing only makes sense inside a workspace: granting access to
 * someone who isn't a member would create a path around the boundary.
 */
export async function assertShareTargetIsMember(documentId, userId) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM documents d
       JOIN workspace_members m
         ON m.workspace_id = d.workspace_id AND m.user_id = $2
      WHERE d.id = $1`,
    [documentId, userId]
  );
  return rows.length > 0;
}

export async function listPermissions(documentId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.permission, p.created_at,
            u.id AS user_id, u.email, u.name
       FROM document_permissions p
       JOIN users u ON u.id = p.user_id
      WHERE p.document_id = $1
      ORDER BY p.created_at`,
    [documentId]
  );
  return rows;
}

export async function revokePermission(documentId, userId) {
  await pool.query(
    `DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId]
  );
}