import { pool, withTransaction } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";

const SELECT_DOC = `
  SELECT d.*,
         u.email AS owner_email,
         f.name  AS folder_name,
         COALESCE(
           (SELECT json_agg(t.name ORDER BY t.name)
              FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
             WHERE dt.document_id = d.id),
           '[]'::json
         ) AS tags
    FROM documents d
    JOIN users u   ON u.id = d.owner_id
    LEFT JOIN folders f ON f.id = d.folder_id
`;

export async function createDocumentRecord({
  ownerId, workspaceId, filename, storageKey, mimeType, sizeBytes, folderId, category,
}) {
  const { rows } = await pool.query(
    `INSERT INTO documents
       (owner_id, workspace_id, filename, storage_key, mime_type, size_bytes, folder_id, category, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing')
     RETURNING *`,
    [ownerId, workspaceId, filename, storageKey, mimeType, sizeBytes, folderId || null, category || null]
  );
  return rows[0];
}

/**
 * Documents the caller may read, within one workspace.
 *
 * The workspace filter is applied here as well as in the id list it
 * receives — belt and braces, because this query is what the UI shows.
 */
export async function listDocumentsForIds(ids, workspaceId, { folderId, status, tag } = {}) {
  if (!ids.length) return [];
  const params = [ids, workspaceId];
  let sql = `${SELECT_DOC} WHERE d.id = ANY($1::uuid[]) AND d.workspace_id = $2`;

  if (folderId) { params.push(folderId); sql += ` AND d.folder_id = $${params.length}`; }
  if (status)   { params.push(status);   sql += ` AND d.status = $${params.length}`; }
  if (tag) {
    params.push(tag);
    sql += ` AND EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                          WHERE dt.document_id = d.id AND t.name = $${params.length})`;
  }
  sql += ` ORDER BY d.created_at DESC`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getDocument(id) {
  const { rows } = await pool.query(`${SELECT_DOC} WHERE d.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Document not found");
  return rows[0];
}

export async function deleteDocument(id) {
  // chunks, tags and permissions cascade from the FK definitions
  const { rows } = await pool.query(
    `DELETE FROM documents WHERE id = $1 RETURNING storage_key`, [id]
  );
  return rows[0];
}

export async function markFailed(id, message) {
  await pool.query(
    `UPDATE documents SET status='failed', error=$2, updated_at=now() WHERE id=$1`,
    [id, message?.slice(0, 500) || "Processing failed"]
  );
}

/**
 * Move a failed document back to 'processing' so it can be ingested again.
 *
 * The status check is part of the UPDATE itself, so it's atomic: if two
 * retry requests arrive together, only one of them matches the row and
 * the other gets nothing back. Returns null when the document wasn't
 * in the 'failed' state.
 */
export async function markProcessing(id) {
  const { rows } = await pool.query(
    `UPDATE documents
        SET status = 'processing', error = NULL, updated_at = now()
      WHERE id = $1 AND status = 'failed'
      RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Move a document to a folder.
 *
 * The folder must be in the same workspace: otherwise a document could
 * be filed into another group's folder tree.
 */
export async function moveToFolder(id, folderId) {
  if (!folderId) {
    const { rows } = await pool.query(
      `UPDATE documents SET folder_id = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `UPDATE documents d
        SET folder_id = $2, updated_at = now()
      FROM folders f
      WHERE d.id = $1
        AND f.id = $2
        AND f.workspace_id = d.workspace_id
      RETURNING d.*`,
    [id, folderId]
  );
  if (!rows[0]) throw ApiError.badRequest("That folder isn't in this workspace");
  return rows[0];
}

/** Attach tags, creating any that don't exist yet. */
export async function addTags(documentId, tagNames) {
  const names = [...new Set(tagNames.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  if (!names.length) return [];

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tags (name) SELECT unnest($1::text[])
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [names]
    );
    await client.query(
      `INSERT INTO document_tags (document_id, tag_id)
       SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [documentId, rows.map((r) => r.id)]
    );
    return rows.map((r) => r.name);
  });
}

export async function saveSummary(documentId, summary) {
  await pool.query(
    `UPDATE documents SET summary=$2, updated_at=now() WHERE id=$1`,
    [documentId, summary]
  );
}