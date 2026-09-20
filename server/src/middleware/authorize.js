import { ApiError } from "../utils/ApiError.js";
import { getPermissionLevel, atLeast } from "../services/permission.service.js";

/** Coarse role gate: authorize("admin", "manager") */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden("Your role can't perform this action"));
    }
    next();
  };
}

/**
 * Per-document gate. Resolves the caller's effective permission on
 * :id and rejects before the handler ever touches the document.
 * Attaches req.documentPermission for handlers that need the level.
 */
export function requireDocumentPermission(minimum = "view") {
  return async (req, res, next) => {
    try {
      const level = await getPermissionLevel(req.user, req.params.id);
      if (!level || !atLeast(level, minimum)) return next(ApiError.forbidden());
      req.documentPermission = level;
      next();
    } catch (err) {
      next(err);
    }
  };
}
