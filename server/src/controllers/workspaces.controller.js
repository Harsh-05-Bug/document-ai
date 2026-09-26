import { asyncHandler } from "../utils/ApiError.js";
import { storage } from "../storage/index.js";
import * as ws from "../services/workspace.service.js";
import { listUsersInWorkspace } from "../services/auth.service.js";
import { logAudit } from "../services/audit.service.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await ws.listWorkspacesForUser(req.user.id));
});

export const create = asyncHandler(async (req, res) => {
  const workspace = await ws.createWorkspace({ name: req.body.name, userId: req.user.id });
  logAudit({ userId: req.user.id, action: "workspace.create", metadata: { name: workspace.name } });
  res.status(201).json(workspace);
});

export const members = asyncHandler(async (req, res) => {
  res.json(await ws.listMembers(req.workspaceId));
});

/** People a document can be shared with: members of this workspace only. */
export const people = asyncHandler(async (req, res) => {
  res.json(await listUsersInWorkspace(req.workspaceId));
});

export const updateMember = asyncHandler(async (req, res) => {
  res.json(await ws.updateMemberRole({
    workspaceId: req.workspaceId,
    userId: req.params.userId,
    role: req.body.role,
    actorId: req.user.id,
  }));
});

export const removeMember = asyncHandler(async (req, res) => {
  await ws.removeMember({
    workspaceId: req.workspaceId,
    userId: req.params.userId,
    actorId: req.user.id,
  });
  logAudit({ userId: req.user.id, action: "workspace.member.remove",
    metadata: { workspace_id: req.workspaceId, removed: req.params.userId } });
  res.status(204).end();
});

export const leave = asyncHandler(async (req, res) => {
  await ws.leaveWorkspace({ workspaceId: req.workspaceId, userId: req.user.id });
  logAudit({ userId: req.user.id, action: "workspace.leave",
    metadata: { workspace_id: req.workspaceId } });
  res.status(204).end();
});

export const transfer = asyncHandler(async (req, res) => {
  await ws.transferOwnership({
    workspaceId: req.workspaceId,
    fromUserId: req.user.id,
    toUserId: req.body.userId,
  });
  logAudit({ userId: req.user.id, action: "workspace.transfer",
    metadata: { workspace_id: req.workspaceId, to: req.body.userId } });
  res.status(204).end();
});

export const remove = asyncHandler(async (req, res) => {
  const keys = await ws.deleteWorkspace({
    workspaceId: req.workspaceId,
    confirmName: req.body.confirmName,
  });

  // The rows are already gone; failing to delete a file shouldn't turn
  // a successful delete into an error the user can't act on.
  for (const key of keys) {
    await storage.remove(key).catch((err) => console.error("orphaned file", key, err));
  }

  logAudit({ userId: req.user.id, action: "workspace.delete",
    metadata: { workspace_id: req.workspaceId, files: keys.length } });
  res.status(204).end();
});

export const createInvite = asyncHandler(async (req, res) => {
  const invite = await ws.createInvite({
    workspaceId: req.workspaceId,
    role: req.body.role,
    userId: req.user.id,
  });
  res.status(201).json(invite);
});

export const listInvites = asyncHandler(async (req, res) => {
  res.json(await ws.listInvites(req.workspaceId));
});

export const revokeInvite = asyncHandler(async (req, res) => {
  await ws.revokeInvite({ workspaceId: req.workspaceId, inviteId: req.params.inviteId });
  res.status(204).end();
});

/**
 * Redeem an invite. Deliberately not behind requireWorkspace — the
 * whole point is that the caller isn't a member yet.
 */
export const join = asyncHandler(async (req, res) => {
  const workspace = await ws.acceptInvite({ token: req.params.token, userId: req.user.id });
  logAudit({ userId: req.user.id, action: "workspace.join",
    metadata: { workspace_id: workspace.id } });
  res.json(workspace);
});