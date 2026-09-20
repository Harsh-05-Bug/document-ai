import { pool } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";

export async function createFolder({ name, parentId, ownerId }) {
  if (!name?.trim()) throw ApiError.badRequest("Folder name is required");
  const { rows } = await pool.query(
    `INSERT INTO folders (name, parent_id, owner_id) VALUES ($1,$2,$3) RETURNING *`,
    [name.trim(), parentId || null, ownerId]
  );
  return rows[0];
}

/** Folders the user owns, with a live document count. */
export async function listFolders(ownerId) {
  const { rows } = await pool.query(
    `SELECT f.*, COUNT(d.id)::int AS document_count
       FROM folders f
       LEFT JOIN documents d ON d.folder_id = f.id
      WHERE f.owner_id = $1
      GROUP BY f.id
      ORDER BY f.name`,
    [ownerId]
  );
  return rows;
}

export async function deleteFolder(id, ownerId) {
  const { rowCount } = await pool.query(
    `DELETE FROM folders WHERE id=$1 AND owner_id=$2`, [id, ownerId]
  );
  if (!rowCount) throw ApiError.notFound("Folder not found");
}
