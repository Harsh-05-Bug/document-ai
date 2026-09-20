import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return next(ApiError.unauthorized("Missing bearer token"));

  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      department: payload.department ?? null,
    };
    next();
  } catch {
    next(ApiError.unauthorized("Session expired — sign in again"));
  }
}
