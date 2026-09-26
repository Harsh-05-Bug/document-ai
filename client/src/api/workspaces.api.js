import client from "./axiosClient.js";

export const listWorkspaces = () => client.get("/workspaces").then((r) => r.data);

export const createWorkspace = (name) =>
  client.post("/workspaces", { name }).then((r) => r.data);

export const listMembers = (workspaceId) =>
  client.get(`/workspaces/${workspaceId}/members`).then((r) => r.data);

/** People a document can be shared with: members of this workspace only. */
export const listPeople = (workspaceId) =>
  client.get(`/workspaces/${workspaceId}/people`).then((r) => r.data);

export const updateMemberRole = (workspaceId, userId, role) =>
  client.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }).then((r) => r.data);

export const removeMember = (workspaceId, userId) =>
  client.delete(`/workspaces/${workspaceId}/members/${userId}`);

export const leaveWorkspace = (workspaceId) =>
  client.post(`/workspaces/${workspaceId}/leave`);

export const transferOwnership = (workspaceId, userId) =>
  client.post(`/workspaces/${workspaceId}/transfer`, { userId });

/** Destructive and cascading: the name must be typed to confirm. */
export const deleteWorkspace = (workspaceId, confirmName) =>
  client.delete(`/workspaces/${workspaceId}`, { data: { confirmName } });

export const listInvites = (workspaceId) =>
  client.get(`/workspaces/${workspaceId}/invites`).then((r) => r.data);

export const createInvite = (workspaceId, role) =>
  client.post(`/workspaces/${workspaceId}/invites`, { role }).then((r) => r.data);

export const revokeInvite = (workspaceId, inviteId) =>
  client.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);

export const joinWorkspace = (token) =>
  client.post(`/workspaces/join/${token}`).then((r) => r.data);