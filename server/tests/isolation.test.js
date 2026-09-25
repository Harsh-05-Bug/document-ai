import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { pool } from "../src/db/pool.js";
import { createApp } from "../src/app.js";
import { setAiClient } from "../src/services/chat.service.js";

/**
 * Workspace isolation.
 *
 * This is the most important test in the project. Everything else
 * protects a user from seeing a document inside their own group; this
 * protects one group from another.
 *
 * The rule: membership is checked before role. Being the owner of one
 * workspace must grant nothing in another — not through the document
 * list, not through direct access, and above all not through the
 * vector search, which is the path that bypasses the UI entirely.
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

/** Register a user and create a workspace they own. */
async function signUp(email, workspaceName) {
  const registered = await api("/api/auth/register", {
    method: "POST",
    body: { email, password: PASSWORD, name: email, workspaceName },
  });
  assert.ok(registered.status < 300, `register failed: ${JSON.stringify(registered.body)}`);
  return registered.body;
}

/** Ask a question inside a workspace and report the documents searched. */
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

describe("workspace isolation", () => {
  let alice, bob;          // owners of two separate workspaces
  let aliceDocId;

  before(async () => {
    setAiClient(fakeAiClient);

    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${server.address().port}`;

    alice = await signUp(`alice-${Date.now()}@test.local`, "Alice's Class");
    bob = await signUp(`bob-${Date.now()}@test.local`, "Bob's Team");

    const { rows } = await pool.query(
      `INSERT INTO documents (owner_id, workspace_id, filename, storage_key, mime_type, status, chunk_count)
       VALUES ($1, $2, 'alice-private.pdf', 'test/alice.pdf', 'application/pdf', 'ready', 1)
       RETURNING id`,
      [alice.user.id, alice.workspace.id]
    );
    aliceDocId = rows[0].id;
  });

  after(async () => {
    setAiClient(null);
    await pool.query(`DELETE FROM workspaces WHERE id = ANY($1::uuid[])`,
      [[alice.workspace.id, bob.workspace.id]]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`,
      [[alice.user.id, bob.user.id]]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("gives a new signup their own workspace, owned by them", async () => {
    assert.ok(alice.workspace?.id, "signup should create a workspace");
    assert.notEqual(alice.workspace.id, bob.workspace.id, "workspaces must be distinct");
  });

  it("hides another workspace's documents from the list", async () => {
    const { body } = await api(`/api/documents?workspaceId=${bob.workspace.id}`, { token: bob.token });
    assert.ok(!body.some?.((d) => d.id === aliceDocId), "Bob listed Alice's document");
  });

  it("keeps another workspace's documents out of the search scope", async () => {
    const { allowedIds } = await ask(bob.token, bob.workspace.id, "what is in the document");
    assert.ok(!allowedIds.includes(aliceDocId), "Alice's document reached Bob's vector search");
  });

  it("refuses direct access to another workspace's document", async () => {
    const { status } = await api(`/api/documents/${aliceDocId}`, { token: bob.token });
    assert.equal(status, 403, "Bob should be forbidden, not merely unlisted");
  });

  it("refuses to run a question against a workspace the user isn't in", async () => {
    const session = await api("/api/chat/sessions", {
      token: bob.token, method: "POST", body: { workspaceId: alice.workspace.id },
    });
    assert.ok(session.status === 403 || session.status === 404,
      "Bob created a session inside Alice's workspace");
  });

  it("being an owner elsewhere grants nothing here", async () => {
    // Bob owns his own workspace. Ownership must not travel.
    const { status } = await api(`/api/documents/${aliceDocId}`, { token: bob.token });
    assert.equal(status, 403, "owner role leaked across the workspace boundary");
  });

  it("lets a member reach documents once invited", async () => {
    const invite = await api(`/api/workspaces/${alice.workspace.id}/invites`, {
      token: alice.token, method: "POST", body: { role: "member" },
    });
    assert.ok(invite.status < 300, `invite failed: ${JSON.stringify(invite.body)}`);

    const joined = await api(`/api/workspaces/join/${invite.body.token}`, {
      token: bob.token, method: "POST",
    });
    assert.ok(joined.status < 300, `join failed: ${JSON.stringify(joined.body)}`);

    const { allowedIds } = await ask(bob.token, alice.workspace.id, "what is in the document");
    assert.ok(allowedIds.includes(aliceDocId), "invited member should reach the document");
  });
});