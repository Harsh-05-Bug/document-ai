import { pool } from "../db/pool.js";

/** Fire-and-forget: an audit write must never fail the user's request. */
export function logAudit({ userId, action, documentId = null, metadata = {} }) {
  pool
    .query(
      `INSERT INTO audit_logs (user_id, action, document_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, documentId, metadata]
    )
    .catch((err) => console.error("audit log failed", err));
}
