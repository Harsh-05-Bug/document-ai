import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listMembers, updateMemberRole, removeMember,
  listInvites, createInvite, revokeInvite,
  leaveWorkspace, transferOwnership, deleteWorkspace,
} from "../api/workspaces.api.js";

const ROLE_NOTE = {
  owner: "manages everyone and everything here",
  admin: "manages documents and invites people",
  member: "uploads documents and asks questions",
  viewer: "reads and asks questions only",
};

export default function MembersPage() {
  const { workspaceId, workspace, role, user, refreshWorkspaces } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);

  const isOwner = role === "owner";
  const canInvite = role === "owner" || role === "admin";

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setMembers(await listMembers(workspaceId));
      if (canInvite) setInvites(await listInvites(workspaceId));
    } catch (err) {
      setError(err.message);
    }
  }, [workspaceId, canInvite]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setConfirmName(""); }, [workspaceId]);

  const linkFor = (token) => `${window.location.origin}/join/${token}`;

  async function makeInvite() {
    setError("");
    try {
      const invite = await createInvite(workspaceId, inviteRole);
      setInvites((prev) => [invite, ...prev]);
      await copy(invite.token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(token) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen regardless.
    }
  }

  async function changeRole(member, newRole) {
    const previous = members;
    setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role: newRole } : m)));
    try {
      await updateMemberRole(workspaceId, member.user_id, newRole);
    } catch (err) {
      setError(err.message);
      setMembers(previous);
    }
  }

  async function remove(member) {
    if (!confirm(`Remove ${member.name || member.email} from ${workspace?.name}?`)) return;

    const previous = members;
    setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    try {
      await removeMember(workspaceId, member.user_id);
    } catch (err) {
      setError(err.message);
      setMembers(previous);
    }
  }

  async function revoke(invite) {
    const previous = invites;
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    try {
      await revokeInvite(workspaceId, invite.id);
    } catch (err) {
      setError(err.message);
      setInvites(previous);
    }
  }

  async function handOver(member) {
    if (!confirm(
      `Make ${member.name || member.email} the owner of ${workspace?.name}? ` +
      `You'll become an admin.`
    )) return;

    setError("");
    try {
      await transferOwnership(workspaceId, member.user_id);
      await refreshWorkspaces();
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function leave() {
    if (!confirm(`Leave ${workspace?.name}? You'll need a new invite to come back.`)) return;

    setError("");
    try {
      await leaveWorkspace(workspaceId);
      await refreshWorkspaces();
      navigate("/ask", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  async function destroy() {
    setError("");
    try {
      await deleteWorkspace(workspaceId, confirmName);
      await refreshWorkspaces();
      navigate("/ask", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p>
            Everyone here can read every document in {workspace?.name || "this workspace"} and
            ask questions about them. Anything that shouldn't be shared belongs in a
            separate workspace.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {canInvite && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3>Invite people</h3>
          <p className="notice">
            Create a link and send it to anyone. They'll join at the role you pick.
          </p>

          <div className="row" style={{ marginBottom: 14 }}>
            <select
              style={{ maxWidth: 180 }}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="member">Member — can upload</option>
              <option value="viewer">Viewer — read only</option>
              <option value="admin">Admin — can manage</option>
            </select>
            <button className="primary" type="button" onClick={makeInvite}>
              Create invite link
            </button>
          </div>

          {invites.length > 0 && (
            <ul className="grant-list">
              {invites.map((invite) => (
                <li key={invite.id} className="spread">
                  <span className="invite-link" title={linkFor(invite.token)}>
                    {linkFor(invite.token)}
                  </span>
                  <span className="row">
                    <span className="meta">{invite.role}</span>
                    <button className="quiet" type="button" onClick={() => copy(invite.token)}>
                      {copied === invite.token ? "Copied" : "Copy"}
                    </button>
                    <button className="quiet" type="button" onClick={() => revoke(invite)}>
                      Revoke
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3>{members.length} {members.length === 1 ? "person" : "people"}</h3>

        <ul className="grant-list">
          {members.map((member) => {
            const isSelf = member.user_id === user?.id;
            const memberIsOwner = member.role === "owner";

            return (
              <li key={member.id} className="spread">
                <span>
                  {member.name || member.email}
                  {isSelf && <span className="meta"> · you</span>}
                  <span className="when">{ROLE_NOTE[member.role]}</span>
                </span>

                <span className="row">
                  {isOwner && !isSelf && !memberIsOwner ? (
                    <select
                      style={{ maxWidth: 130 }}
                      value={member.role}
                      onChange={(e) => changeRole(member, e.target.value)}
                    >
                      <option value="viewer">viewer</option>
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className="meta">{member.role}</span>
                  )}

                  {isOwner && !isSelf && !memberIsOwner && (
                    <>
                      <button
                        className="quiet"
                        type="button"
                        title="Make owner"
                        onClick={() => handOver(member)}
                      >
                        Make owner
                      </button>
                      <button className="quiet" type="button" onClick={() => remove(member)}>
                        ×
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Leaving and deleting are separate: one affects only you, the
          other destroys everyone's documents. */}
      <div className="panel danger-zone">
        <h3>Leaving this workspace</h3>

        {isOwner ? (
          <>
            <p className="notice">
              You own {workspace?.name}. To leave, make someone else the owner first.
              Deleting removes every document, conversation and person in it, for
              everyone. It can't be undone.
            </p>

            <div className="row">
              <input
                placeholder={`Type "${workspace?.name}" to confirm`}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
              <button
                className="danger-outline"
                type="button"
                onClick={destroy}
                disabled={confirmName.trim() !== workspace?.name}
              >
                Delete workspace
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="notice">
              You'll lose access to its documents and need a new invite to come back.
              Nothing is deleted for anyone else.
            </p>
            <button className="danger-outline" type="button" onClick={leave}>
              Leave {workspace?.name}
            </button>
          </>
        )}
      </div>
    </>
  );
}