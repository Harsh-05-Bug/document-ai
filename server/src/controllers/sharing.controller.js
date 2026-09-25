import { asyncHandler, ApiError } from "../utils/ApiError.js";
import * as perms from "../services/permission.service.js";
import { logAudit } from "../services/audit.service.js";

const LEVELS = ["view", "comment", "edit", "download", "admin"];

export const share = asyncHandler(async (req, res) => {
  const { userId, permission } = req.body;
  if (!userId) throw ApiError.badRequest("Pick someone to share with");
  if (!LEVELS.includes(permission)) {
    throw ApiError.badRequest(`Permission must be one of: ${LEVELS.join(", ")}`);
  }

  // Sharing with someone outside the workspace would grant access
  // without membership — a path straight around the isolation boundary.
  const isMember = await perms.assertShareTargetIsMember(req.params.id, userId);
  if (!isMember) throw ApiError.badRequest("That person isn't in this workspace");

  const row = await perms.shareDocument({
    documentId: req.params.id, userId, permission, grantedBy: req.user.id,
  });

  logAudit({ userId: req.user.id, action: "document.share", documentId: req.params.id,
    metadata: { granted_to: userId, permission } });

  res.status(201).json(row);
});

export const list = asyncHandler(async (req, res) => {
  res.json(await perms.listPermissions(req.params.id));
});

export const revoke = asyncHandler(async (req, res) => {
  await perms.revokePermission(req.params.id, req.params.userId);
  logAudit({ userId: req.user.id, action: "document.unshare", documentId: req.params.id,
    metadata: { revoked_from: req.params.userId } });
  res.status(204).end();
});