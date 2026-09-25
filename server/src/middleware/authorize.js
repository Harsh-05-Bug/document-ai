import { ApiError } from "../utils/ApiError.js";
import { getPermissionLevel, atLeast } from "../services/permission.service.js";
import { requireMembership } from "../services/workspace.service.js";

/**
 * Resolve the workspace this request is about, and confirm the caller
 * belongs to it.
 *
 * The id comes from the route, the query string or the body depending
 * on the endpoint. Whichever it is, membership is checked here — before
 * any handler runs — so no route can forget to do it.
 *
 * Attaches req.workspaceId and req.workspaceRole.
 */
export function requireWorkspace(minimum = "viewer") {
  return async (req, res, next) => {
    try {
      const workspaceId =
        req.params.workspaceId || req.query.workspaceId || req.body?.workspaceId;

      if (!workspaceId) {
        return next(ApiError.badRequest("Choose a workspace first"));
      }

      // Throws 404 for a non-member: someone outside a workspace
      // shouldn't be able to learn that it exists.
      req.workspaceRole = await requireMembership(req.user.id, workspaceId, minimum);
      req.workspaceId = workspaceId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Per-document gate. Resolves the caller's effective permission on :id
 * and rejects before the handler ever touches the document.
 *
 * getPermissionLevel reads the document's own workspace and checks
 * membership of *that* workspace, so this also enforces isolation for
 * routes that name a document directly rather than a workspace.
 *
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