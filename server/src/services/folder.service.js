import { pool } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Folders belong to a workspace, like the documents in them.
 *
 * owner_id records who made the folder, but it no longer decides who
 * sees it: a shared room with private folders inside would be confusing
 * and would hide documents the workspace can otherwise read.
 */

export async function createFolder({ name, parentId, ownerId, workspaceId }) {
  if (!name?.trim()) throw ApiError.badRequest("Folder name is required");

  // A parent from another workspace would graft this workspace's tree
  // onto someone else's.
  if (parentId) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM folders WHERE id = $1 AND workspace_id = $2`,
      [parentId, workspaceId]
    );
    if (!rowCount) throw ApiError.badRequest("That parent folder isn't in this workspace");
  }

  const { rows } = await pool.query(
    `INSERT INTO folders (name, parent_id, owner_id, workspace_id)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [name.trim(), parentId || null, ownerId, workspaceId]
  );
  return rows[0];
}

/** Folders in a workspace, with a live document count. */
export async function listFolders(workspaceId) {
  const { rows } = await pool.query(
    `SELECT f.*, COUNT(d.id)::int AS document_count
       FROM folders f
       LEFT JOIN documents d ON d.folder_id = f.id
      WHERE f.workspace_id = $1
      GROUP BY f.id
      ORDER BY f.name`,
    [workspaceId]
  );
  return rows;
}

/**
 * Delete a folder.
 *
 * The workspace is part of the WHERE clause, so a folder id from
 * another workspace matches nothing rather than being deleted.
 * Documents inside are not removed: the FK sets their folder_id to
 * NULL, so they return to the top level rather than disappearing.
 */
export async function deleteFolder(id, workspaceId) {
  const { rowCount } = await pool.query(
    `DELETE FROM folders WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  if (!rowCount) throw ApiError.notFound("Folder not found");
}