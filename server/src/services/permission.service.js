import { pool } from "../db/pool.js";

/**
 * Permission model
 * ----------------
 *  admin role      -> 'admin' on every document
 *  document owner  -> 'admin' on their own documents
 *  manager role    -> 'download' on documents in their department
 *  explicit share  -> whatever level the share grants
 *
 * The strongest of those wins. Everything runs server-side: the client
 * never decides what it's allowed to see, and the vector search is
 * filtered by this list *before* retrieval (see chat.service.js).
 */
const RANK = { view: 1, comment: 2, download: 3, edit: 4, admin: 5 };

export const atLeast = (level, minimum) => (RANK[level] || 0) >= (RANK[minimum] || 0);

const strongest = (...levels) =>
  levels.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] || null;

/** Document IDs the user may read. Used to scope lists, search and RAG. */
export async function getAccessibleDocumentIds(user) {
  if (user.role === "admin") {
    const { rows } = await pool.query(`SELECT id FROM documents`);
    return rows.map((r) => r.id);
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT d.id
       FROM documents d
       LEFT JOIN document_permissions p
              ON p.document_id = d.id AND p.user_id = $1
      WHERE d.owner_id = $1
         OR p.user_id IS NOT NULL
         OR ($2::text = 'manager' AND d.department IS NOT NULL AND d.department = $3)`,
    [user.id, user.role, user.department]
  );
  return rows.map((r) => r.id);
}

/** The caller's effective permission on one document, or null. */
export async function getPermissionLevel(user, documentId) {
  const { rows } = await pool.query(
    `SELECT d.owner_id, d.department, p.permission
       FROM documents d
       LEFT JOIN document_permissions p
              ON p.document_id = d.id AND p.user_id = $2
      WHERE d.id = $1`,
    [documentId, user.id]
  );
  const doc = rows[0];
  if (!doc) return null;

  if (user.role === "admin") return "admin";
  if (doc.owner_id === user.id) return "admin";

  const departmental =
    user.role === "manager" && doc.department && doc.department === user.department
      ? "download"
      : null;

  return strongest(doc.permission, departmental);
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
