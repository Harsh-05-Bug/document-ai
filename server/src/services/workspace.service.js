import crypto from "node:crypto";
import { pool, withTransaction } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Workspaces are the isolation boundary.
 *
 * Every piece of content belongs to exactly one, and a user's role is
 * held per workspace rather than on the user. Owning one workspace
 * grants nothing in another — membership is always checked first.
 */

const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

export const roleAtLeast = (role, minimum) =>
  (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimum] || 0);

/** A short, readable, unique slug for invite URLs. */
async function uniqueSlug(name) {
  const base =
    String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) ||
    "workspace";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
    const { rowCount } = await pool.query(`SELECT 1 FROM workspaces WHERE slug = $1`, [slug]);
    if (!rowCount) return slug;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Create a workspace and make its creator the owner.
 *
 * Both writes happen in one transaction: a workspace with no owner
 * would be unreachable and unmanageable.
 */
export async function createWorkspace({ name, userId }) {
  const clean = String(name || "").trim().slice(0, 80);
  if (!clean) throw ApiError.badRequest("Give your workspace a name");

  const slug = await uniqueSlug(clean);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO workspaces (name, slug, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [clean, slug, userId]
    );
    const workspace = rows[0];

    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspace.id, userId]
    );

    return { ...workspace, role: "owner" };
  });
}

/** Every workspace this user belongs to, with their role in each. */
export async function listWorkspacesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT w.*, m.role,
            (SELECT COUNT(*)::int FROM workspace_members x WHERE x.workspace_id = w.id) AS member_count
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.created_at`,
    [userId]
  );
  return rows;
}

/**
 * The user's role in a workspace, or null if they aren't a member.
 *
 * This single function is the isolation boundary: null means the
 * workspace does not exist as far as this user is concerned.
 */
export async function getMembership(userId, workspaceId) {
  if (!workspaceId) return null;

  const { rows } = await pool.query(
    `SELECT role FROM workspace_members WHERE user_id = $1 AND workspace_id = $2`,
    [userId, workspaceId]
  );
  return rows[0]?.role || null;
}

/** Throws unless the user is a member at or above `minimum`. */
export async function requireMembership(userId, workspaceId, minimum = "viewer") {
  const role = await getMembership(userId, workspaceId);
  // Not found rather than forbidden: a non-member shouldn't be able to
  // discover that a workspace exists.
  if (!role) throw ApiError.notFound("Workspace not found");
  if (!roleAtLeast(role, minimum)) throw ApiError.forbidden("Your role can't perform this action");
  return role;
}

export async function listMembers(workspaceId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.role, m.created_at, u.id AS user_id, u.email, u.name
       FROM workspace_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY m.created_at`,
    [workspaceId]
  );
  return rows;
}

export async function updateMemberRole({ workspaceId, userId, role, actorId }) {
  if (!["admin", "member", "viewer"].includes(role)) {
    throw ApiError.badRequest("Unknown role");
  }
  if (userId === actorId) throw ApiError.badRequest("You can't change your own role");

  const { rows } = await pool.query(
    `UPDATE workspace_members SET role = $3
      WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'
      RETURNING *`,
    [workspaceId, userId, role]
  );
  if (!rows[0]) throw ApiError.notFound("Member not found");
  return rows[0];
}

export async function removeMember({ workspaceId, userId, actorId }) {
  if (userId === actorId) throw ApiError.badRequest("Use 'leave workspace' instead");

  const { rowCount } = await pool.query(
    `DELETE FROM workspace_members
      WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'`,
    [workspaceId, userId]
  );
  if (!rowCount) throw ApiError.notFound("Member not found");
}

/**
 * Leave a workspace.
 *
 * An owner can't: they'd leave it with nobody able to manage it. They
 * transfer ownership first, or delete the workspace.
 */
export async function leaveWorkspace({ workspaceId, userId }) {
  const role = await getMembership(userId, workspaceId);
  if (!role) throw ApiError.notFound("Workspace not found");
  if (role === "owner") {
    throw ApiError.badRequest(
      "Owners can't leave. Transfer ownership to someone else, or delete the workspace."
    );
  }

  await pool.query(
    `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
}

/**
 * Hand ownership to another member.
 *
 * Both writes happen together: a workspace with two owners, or none,
 * would be a worse state than either end of the swap.
 */
export async function transferOwnership({ workspaceId, fromUserId, toUserId }) {
  if (fromUserId === toUserId) throw ApiError.badRequest("They already own it");

  const target = await getMembership(toUserId, workspaceId);
  if (!target) throw ApiError.notFound("That person isn't in this workspace");

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE workspace_members SET role = 'owner'
        WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, toUserId]
    );
    await client.query(
      `UPDATE workspace_members SET role = 'admin'
        WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, fromUserId]
    );
  });
}

/**
 * Delete a workspace and everything in it.
 *
 * Documents, chunks, conversations, members and invites all cascade
 * from the foreign keys. Stored files are removed by the caller, which
 * has access to the storage driver.
 */
export async function deleteWorkspace({ workspaceId, confirmName }) {
  const { rows } = await pool.query(`SELECT name FROM workspaces WHERE id = $1`, [workspaceId]);
  const workspace = rows[0];
  if (!workspace) throw ApiError.notFound("Workspace not found");

  // Typing the name is the last chance to notice what's about to happen.
  if (String(confirmName || "").trim() !== workspace.name) {
    throw ApiError.badRequest("Type the workspace name exactly to confirm");
  }

  // The storage keys are needed before the rows disappear.
  const { rows: files } = await pool.query(
    `SELECT storage_key FROM documents WHERE workspace_id = $1`,
    [workspaceId]
  );

  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  return files.map((f) => f.storage_key);
}

/* ------------------------------------------------------------ invites */

export async function createInvite({ workspaceId, role = "member", userId, expiresInDays = 14 }) {
  if (!["admin", "member", "viewer"].includes(role)) {
    throw ApiError.badRequest("Unknown role");
  }

  // 32 hex characters: long enough that guessing one is not a strategy.
  const token = crypto.randomBytes(16).toString("hex");

  const { rows } = await pool.query(
    `INSERT INTO workspace_invites (workspace_id, token, role, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)
     RETURNING *`,
    [workspaceId, token, role, userId, String(expiresInDays)]
  );
  return rows[0];
}

export async function listInvites(workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM workspace_invites
      WHERE workspace_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function revokeInvite({ workspaceId, inviteId }) {
  const { rowCount } = await pool.query(
    `UPDATE workspace_invites SET revoked_at = now()
      WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL`,
    [inviteId, workspaceId]
  );
  if (!rowCount) throw ApiError.notFound("Invite not found");
}

/**
 * Redeem an invite.
 *
 * Expiry and revocation are checked in the same statement that reads
 * the token, so a link that was revoked a moment ago can't slip
 * through a gap between checking and joining.
 */
export async function acceptInvite({ token, userId }) {
  const { rows } = await pool.query(
    `SELECT i.*, w.name, w.slug
       FROM workspace_invites i
       JOIN workspaces w ON w.id = i.workspace_id
      WHERE i.token = $1
        AND i.revoked_at IS NULL
        AND (i.expires_at IS NULL OR i.expires_at > now())`,
    [token]
  );
  const invite = rows[0];
  if (!invite) throw ApiError.notFound("This invite link is no longer valid");

  // Already a member: joining again shouldn't downgrade an existing role.
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [invite.workspace_id, userId, invite.role, invite.created_by]
  );

  const role = await getMembership(userId, invite.workspace_id);
  return { id: invite.workspace_id, name: invite.name, slug: invite.slug, role };
}