import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Identify the caller. Nothing more.
 *
 * The token carries no role, because roles are per-workspace and can
 * be changed or revoked at any time — a role baked into a week-long
 * token would outlive the membership it describes. Authorisation is
 * resolved per request by requireWorkspace and requireDocumentPermission.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return next(ApiError.unauthorized("Missing bearer token"));

  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(ApiError.unauthorized("Session expired — sign in again"));
  }
}