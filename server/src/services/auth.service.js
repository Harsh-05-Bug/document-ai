import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, department: u.department,
});

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, department: user.department },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export async function registerUser({ email, password, name, role = "employee", department }) {
  if (!email || !password) throw ApiError.badRequest("Email and password are required");
  if (password.length < 8) throw ApiError.badRequest("Password must be at least 8 characters");
  if (!["admin", "manager", "employee"].includes(role)) throw ApiError.badRequest("Unknown role");

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email.toLowerCase().trim(), name || null, passwordHash, role, department || null]
    );
    const user = rows[0];
    return { token: issueToken(user), user: publicUser(user) };
  } catch (err) {
    if (err.code === "23505") throw ApiError.conflict("That email is already registered");
    throw err;
  }
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

  return { token: issueToken(user), user: publicUser(user) };
}

export async function getUserById(id) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? publicUser(rows[0]) : null;
}

export async function listUsers() {
  const { rows } = await pool.query(
    `SELECT id, email, name, role, department FROM users ORDER BY email`
  );
  return rows;
}
