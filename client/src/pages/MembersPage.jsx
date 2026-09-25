import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listMembers, updateMemberRole, removeMember,
  listInvites, createInvite, revokeInvite,
} from "../api/workspaces.api.js";

const ROLE_NOTE = {
  owner: "manages everyone and everything here",
  admin: "manages documents and invites people",
  member: "uploads documents and asks questions",
  viewer: "reads and asks questions only",
};

export default function MembersPage() {
  const { workspaceId, workspace, role, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);

  const canManagePeople = role === "owner";
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

      <div className="panel">
        <h3>{members.length} {members.length === 1 ? "person" : "people"}</h3>

        <ul className="grant-list">
          {members.map((member) => {
            const isSelf = member.user_id === user?.id;
            const isOwner = member.role === "owner";

            return (
              <li key={member.id} className="spread">
                <span>
                  {member.name || member.email}
                  {isSelf && <span className="meta"> · you</span>}
                  <span className="when">{ROLE_NOTE[member.role]}</span>
                </span>

                <span className="row">
                  {canManagePeople && !isSelf && !isOwner ? (
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

                  {canManagePeople && !isSelf && !isOwner && (
                    <button className="quiet" type="button" onClick={() => remove(member)}>
                      ×
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}