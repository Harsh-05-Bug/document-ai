import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { createWorkspace, listWorkspacesForUser } from "./workspace.service.js";

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

/**
 * The token identifies the user and nothing else.
 *
 * Roles are per-workspace and can change or be revoked at any moment;
 * baking one into a token that lives for days would keep a removed
 * member's access alive until it expired. Membership is read from the
 * database on every request instead.
 */
function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export async function registerUser({ email, password, name, workspaceName }) {
  if (!email || !password) throw ApiError.badRequest("Email and password are required");
  if (password.length < 8) throw ApiError.badRequest("Password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *`,
      [email.toLowerCase().trim(), name || null, passwordHash]
    );
    user = rows[0];
  } catch (err) {
    if (err.code === "23505") throw ApiError.conflict("That email is already registered");
    throw err;
  }

  // Signing up without a workspace name still gets you one — an account
  // with nowhere to put documents is a dead end.
  const workspace = await createWorkspace({
    name: workspaceName || `${name || email.split("@")[0]}'s workspace`,
    userId: user.id,
  });

  return { token: issueToken(user), user: publicUser(user), workspace };
}

export async function loginUser({ email, password }) {
  if (!email || !password) throw ApiError.badRequest("Email and password are required");

  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase().trim(),
  ]);
  const user = rows[0];

  // Compare against a dummy hash when the user doesn't exist so the
  // response time doesn't reveal which emails are registered.
  const hash = user?.password_hash || "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO";
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) throw ApiError.unauthorized("Incorrect email or password");

  const workspaces = await listWorkspacesForUser(user.id);
  return { token: issueToken(user), user: publicUser(user), workspaces };
}

export async function getUserById(id) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? publicUser(rows[0]) : null;
}

/**
 * People you can share a document with: members of that workspace only.
 *
 * Listing every user of the service would leak the membership of other
 * workspaces through an autocomplete box.
 */
export async function listUsersInWorkspace(workspaceId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, m.role
       FROM workspace_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY u.email`,
    [workspaceId]
  );
  return rows;
}