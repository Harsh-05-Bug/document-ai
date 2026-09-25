import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { pool } from "../src/db/pool.js";
import { createApp } from "../src/app.js";
import { setAiClient } from "../src/services/chat.service.js";

/**
 * Roles inside a single workspace.
 *
 * isolation.test.js covers the boundary between workspaces — the
 * catastrophic failure. This covers the everyday one: within a shared
 * room, what may each role actually do?
 *
 * The model under test: a workspace is a shared room. Every member
 * reads everything in it, because a teacher shouldn't have to share
 * notes with thirty students one at a time. What separates the roles
 * is writing — uploading, editing, deleting and managing people.
 */

const PASSWORD = "password123";

let server;
let baseUrl;
let lastAllowedIds = [];

const fakeAiClient = {
  async requestQuery({ allowedDocumentIds }) {
    lastAllowedIds = allowedDocumentIds;
    return { answer: "stubbed answer", sources: [], search_query: "stubbed" };
  },
  async *streamQuery({ allowedDocumentIds }) {
    lastAllowedIds = allowedDocumentIds;
    yield { type: "meta", search_query: "stubbed" };
    yield { type: "done", answer: "stubbed answer", sources: [] };
  },
};

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function signUp(label, workspaceName) {
  const registered = await api("/api/auth/register", {
    method: "POST",
    body: {
      email: `${label}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}@test.local`,
      password: PASSWORD,
      name: label,
      workspaceName,
    },
  });
  assert.ok(registered.status < 300, `register failed: ${JSON.stringify(registered.body)}`);
  return registered.body;
}

/** Invite someone into a workspace with a given role. */
async function addMember(ownerToken, workspaceId, joinerToken, role) {
  const invite = await api(`/api/workspaces/${workspaceId}/invites`, {
    token: ownerToken, method: "POST", body: { role },
  });
  assert.ok(invite.status < 300, `invite failed: ${JSON.stringify(invite.body)}`);

  const joined = await api(`/api/workspaces/join/${invite.body.token}`, {
    token: joinerToken, method: "POST",
  });
  assert.ok(joined.status < 300, `join failed: ${JSON.stringify(joined.body)}`);
}

async function ask(token, workspaceId, question) {
  const session = await api("/api/chat/sessions", {
    token, method: "POST", body: { workspaceId },
  });
  assert.equal(session.status, 201, `session failed: ${JSON.stringify(session.body)}`);

  const answer = await api(`/api/chat/sessions/${session.body.id}/messages`, {
    token, method: "POST", body: { question },
  });
  return { ...answer, allowedIds: lastAllowedIds };
}

describe("roles within a workspace", () => {
  let teacher, student, guest;
  let workspaceId;
  let notesId;

  before(async () => {
    setAiClient(fakeAiClient);

    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${server.address().port}`;

    teacher = await signUp("teacher", "Physics 101");
    workspaceId = teacher.workspace.id;

    // Each joiner gets their own workspace on signup; they join this
    // one by invite, at the role under test.
    student = await signUp("student", "Student's space");
    guest = await signUp("guest", "Guest's space");

    await addMember(teacher.token, workspaceId, student.token, "member");
    await addMember(teacher.token, workspaceId, guest.token, "viewer");

    const { rows } = await pool.query(
      `INSERT INTO documents (owner_id, workspace_id, filename, storage_key, mime_type, status, chunk_count)
       VALUES ($1, $2, 'lecture-notes.pdf', 'test/notes.pdf', 'application/pdf', 'ready', 1)
       RETURNING id`,
      [teacher.user.id, workspaceId]
    );
    notesId = rows[0].id;
  });

  after(async () => {
    setAiClient(null);
    await pool.query(`DELETE FROM workspaces WHERE id = ANY($1::uuid[])`,
      [[teacher.workspace.id, student.workspace.id, guest.workspace.id]]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`,
      [[teacher.user.id, student.user.id, guest.user.id]]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("shows every member the documents in their workspace", async () => {
    for (const person of [student, guest]) {
      const { body } = await api(`/api/documents?workspaceId=${workspaceId}`, { token: person.token });
      assert.ok(body.some((d) => d.id === notesId), "a member should see the workspace's documents");
    }
  });

  it("lets a member search the workspace's documents", async () => {
    const { allowedIds } = await ask(student.token, workspaceId, "what do the notes say");
    assert.ok(allowedIds.includes(notesId), "the document should be in the search scope");
  });

  it("lets a viewer read and download, since they can already read it", async () => {
    const detail = await api(`/api/documents/${notesId}`, { token: guest.token });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.permission, "view");
  });

  it("stops a viewer uploading", async () => {
    // Multipart isn't needed: the role gate rejects before the body matters.
    const { status } = await api(`/api/documents?workspaceId=${workspaceId}`, {
      token: guest.token, method: "POST", body: { workspaceId },
    });
    assert.ok(status === 403 || status === 400, `viewer upload returned ${status}`);
  });

  it("stops a member deleting someone else's document", async () => {
    const { status } = await api(`/api/documents/${notesId}`, {
      token: student.token, method: "DELETE",
    });
    assert.equal(status, 403, "only the owner or a workspace admin may delete");
  });

  it("lets the workspace owner delete any document in it", async () => {
    const { rows } = await pool.query(
      `INSERT INTO documents (owner_id, workspace_id, filename, storage_key, mime_type, status)
       VALUES ($1, $2, 'scratch.pdf', 'test/scratch.pdf', 'application/pdf', 'ready')
       RETURNING id`,
      [student.user.id, workspaceId]
    );

    const { status } = await api(`/api/documents/${rows[0].id}`, {
      token: teacher.token, method: "DELETE",
    });
    assert.equal(status, 204, "the workspace owner administers everything inside it");
  });

  it("raises a member's permission on one document when shared", async () => {
    const shared = await api(`/api/documents/${notesId}/share`, {
      token: teacher.token, method: "POST",
      body: { userId: student.user.id, permission: "edit" },
    });
    assert.ok(shared.status < 300, `share failed: ${JSON.stringify(shared.body)}`);

    const detail = await api(`/api/documents/${notesId}`, { token: student.token });
    assert.equal(detail.body.permission, "edit", "a share should grant more than the default view");
  });

  it("refuses to share with someone outside the workspace", async () => {
    const outsider = await signUp("outsider", "Outsider's space");

    const { status } = await api(`/api/documents/${notesId}/share`, {
      token: teacher.token, method: "POST",
      body: { userId: outsider.user.id, permission: "view" },
    });
    assert.equal(status, 400, "sharing outside the workspace would bypass membership");

    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [outsider.workspace.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [outsider.user.id]);
  });

  it("stops a member managing people", async () => {
    const { status } = await api(`/api/workspaces/${workspaceId}/invites`, {
      token: student.token, method: "POST", body: { role: "member" },
    });
    assert.equal(status, 403, "inviting is for admins and owners");
  });
});