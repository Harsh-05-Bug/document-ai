import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { pool } from "../src/db/pool.js";
import { createApp } from "../src/app.js";
import { setAiClient } from "../src/services/chat.service.js";

/**
 * Permission boundary tests.
 *
 * These assert the rule the whole product rests on: a user can never
 * retrieve content from a document they aren't allowed to read — not
 * through the document list, and not through the question endpoint.
 *
 * The AI client is substituted. What matters here isn't the answer
 * text, it's which document IDs reach the vector search, because that
 * list IS the permission boundary. Substituting also keeps the suite
 * fast, offline and free of API quota.
 */

const PASSWORD = "password123";

let server;
let baseUrl;

/** Document IDs the most recent question was allowed to search. */
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

async function login(email) {
  const { status, body } = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
  return body;
}

/** Ask a question and report which documents the search was scoped to. */
async function ask(token, question) {
  const session = await api("/api/chat/sessions", { token, method: "POST", body: {} });
  assert.equal(session.status, 201, `session failed: ${JSON.stringify(session.body)}`);

  const answer = await api(`/api/chat/sessions/${session.body.id}/messages`, {
    token, method: "POST", body: { question },
  });
  assert.equal(answer.status, 200, `ask failed: ${JSON.stringify(answer.body)}`);
  return { ...answer, allowedIds: lastAllowedIds };
}

describe("permission boundary", () => {
  let admin, manager, employee;
  let documentId;

  before(async () => {
    setAiClient(fakeAiClient);

    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${server.address().port}`;

    admin = await login("admin@acme.test");
    manager = await login("manager@acme.test");
    employee = await login("emp@acme.test");

    // A document owned by the admin, in the Technology department —
    // so neither Finance user can reach it by role alone.
    const { rows } = await pool.query(
      `INSERT INTO documents (owner_id, filename, storage_key, mime_type, status, department, chunk_count)
       VALUES ($1, 'permissions-test.pdf', 'test/permissions-test.pdf', 'application/pdf', 'ready', 'Technology', 1)
       RETURNING id`,
      [admin.user.id]
    );
    documentId = rows[0].id;
  });

  after(async () => {
    setAiClient(null);
    if (documentId) await pool.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("hides an unshared document from an employee's list", async () => {
    const { status, body } = await api("/api/documents", { token: employee.token });
    assert.equal(status, 200);
    assert.ok(!body.some((d) => d.id === documentId), "employee should not see the document");
  });

  it("keeps an unshared document out of an employee's search scope", async () => {
    const { allowedIds } = await ask(employee.token, "what does the document say");
    assert.ok(!allowedIds.includes(documentId), "restricted document reached the vector search");
  });

  it("keeps it out of scope for a manager in another department", async () => {
    const { allowedIds } = await ask(manager.token, "what does the document say");
    assert.ok(!allowedIds.includes(documentId), "manager crossed a department boundary");
  });

  it("refuses direct access to an unshared document", async () => {
    const { status } = await api(`/api/documents/${documentId}`, { token: employee.token });
    assert.equal(status, 403, "employee should be forbidden, not merely unlisted");
  });

  it("grants access once the document is shared", async () => {
    const shared = await api(`/api/documents/${documentId}/share`, {
      token: admin.token, method: "POST",
      body: { userId: employee.user.id, permission: "view" },
    });
    assert.ok(shared.status < 300, `share failed: ${JSON.stringify(shared.body)}`);

    const list = await api("/api/documents", { token: employee.token });
    assert.ok(list.body.some((d) => d.id === documentId), "shared document should be listed");

    const { allowedIds } = await ask(employee.token, "what does the document say");
    assert.ok(allowedIds.includes(documentId), "shared document should be searchable");
  });

  it("revokes access again", async () => {
    const revoked = await api(`/api/documents/${documentId}/permissions/${employee.user.id}`, {
      token: admin.token, method: "DELETE",
    });
    assert.ok(revoked.status < 300, `revoke failed: ${JSON.stringify(revoked.body)}`);

    const { allowedIds } = await ask(employee.token, "what does the document say");
    assert.ok(!allowedIds.includes(documentId), "revoked access should remove it from scope");
  });

  it("lets an admin reach every document", async () => {
    const { allowedIds } = await ask(admin.token, "what does the document say");
    assert.ok(allowedIds.includes(documentId), "admin should see everything");
  });
});