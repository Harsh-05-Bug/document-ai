import { asyncHandler } from "../utils/ApiError.js";
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