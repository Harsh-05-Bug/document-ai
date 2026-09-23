import { pool } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";
import { getAccessibleDocumentIds } from "./permission.service.js";
import * as defaultAiClient from "./aiClient.service.js";
import { logAudit } from "./audit.service.js";

// How many earlier messages (user + assistant) to send for resolving
// follow-up questions. Three exchanges is enough for "it" and "this".
const HISTORY_LIMIT = 6;

/**
 * The AI client, swappable for tests.
 *
 * Node's mock.method can't replace ES module exports, and mocking the
 * network would test the wrong layer anyway: what matters here is which
 * document IDs reach the search.
 */
let aiClient = defaultAiClient;
export function setAiClient(client) {
  aiClient = client || defaultAiClient;
}

export async function createSession(userId, title) {
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (user_id, title) VALUES ($1,$2) RETURNING *`,
    [userId, title || "New conversation"]
  );
  return rows[0];
}

export async function listSessions(userId) {
  const { rows } = await pool.query(
    `SELECT s.*, COUNT(m.id)::int AS message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
    [userId]
  );
  return rows;
}

async function assertOwnsSession(sessionId, userId) {
  const { rows } = await pool.query(
    `SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  if (!rows[0]) throw ApiError.notFound("Conversation not found");
  return rows[0];
}

export async function getSessionWithMessages(sessionId, userId) {
  const session = await assertOwnsSession(sessionId, userId);
  const { rows } = await pool.query(
    `SELECT id, role, content, sources, latency_ms, created_at
       FROM chat_messages WHERE session_id = $1 ORDER BY created_at`,
    [sessionId]
  );
  return { ...session, messages: rows };
}

/**
 * Rename a conversation.
 *
 * The ownership check is part of the UPDATE, so one query both
 * authorises and acts — no window between checking and writing.
 */
export async function renameSession(sessionId, userId, title) {
  const clean = String(title || "").trim().slice(0, 120);
  if (!clean) throw ApiError.badRequest("Give the conversation a name");

  const { rows } = await pool.query(
    `UPDATE chat_sessions SET title = $3
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [sessionId, userId, clean]
  );
  if (!rows[0]) throw ApiError.notFound("Conversation not found");
  return rows[0];
}

/** Delete a conversation. Its messages cascade from the FK definition. */
export async function deleteSession(sessionId, userId) {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  if (!rowCount) throw ApiError.notFound("Conversation not found");
}

/**
 * The most recent turns of a conversation, oldest first.
 *
 * Only called after assertOwnsSession, so the history can only contain
 * questions this user asked and answers this user was already shown.
 * It cannot carry content from documents they aren't allowed to read.
 */
async function getRecentHistory(sessionId) {
  const { rows } = await pool.query(
    `SELECT role, content
       FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [sessionId, HISTORY_LIMIT]
  );
  return rows.reverse();
}

/**
 * The permission boundary, shared by the streaming and non-streaming paths.
 *
 *   1. work out which documents this user may read
 *   2. that list goes to the AI service, which filters the vector search
 *      BEFORE ranking — not as a post-filter on the model's answer
 *
 * Also loads history (before saving the new question, so the question
 * isn't part of its own context) and records the user's turn.
 */
async function prepareQuestion({ user, sessionId, question, documentId }) {
  if (!question?.trim()) throw ApiError.badRequest("Ask a question first");
  await assertOwnsSession(sessionId, user.id);

  let allowedIds = await getAccessibleDocumentIds(user);

  // "Ask this document" mode: narrow to one doc, but only if it was
  // already in the allowed set.
  if (documentId) {
    allowedIds = allowedIds.filter((id) => id === documentId);
    if (!allowedIds.length) throw ApiError.forbidden();
  }

  const history = await getRecentHistory(sessionId);
  const text = question.trim();

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2)`,
    [sessionId, text]
  );

  return { text, allowedIds, history };
}

/** Persist the assistant's turn, name the conversation, and audit it. */
async function saveAnswer({ user, sessionId, documentId, text, allowedIds, answer, sources, searchQuery, latency }) {
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, sources, latency_ms)
     VALUES ($1,'assistant',$2,$3,$4) RETURNING *`,
    [sessionId, answer, JSON.stringify(sources), latency]
  );

  // Name the conversation after its first question.
  await pool.query(
    `UPDATE chat_sessions SET title = $2
      WHERE id = $1 AND (title IS NULL OR title = 'New conversation')`,
    [sessionId, text.slice(0, 80)]
  );

  logAudit({
    userId: user.id,
    action: "chat.query",
    documentId: documentId || null,
    metadata: {
      question: text.slice(0, 500),
      search_query: (searchQuery || "").slice(0, 500),
      sources: sources.length,
      searched_documents: allowedIds.length,
      latency_ms: latency,
    },
  });

  return { ...rows[0], grounded: sources.length > 0 };
}

/** Ask and wait for the complete answer. */
export async function askQuestion({ user, sessionId, question, documentId }) {
  const { text, allowedIds, history } = await prepareQuestion({ user, sessionId, question, documentId });

  const started = Date.now();
  const result = await aiClient.requestQuery({ question: text, allowedDocumentIds: allowedIds, history });

  return saveAnswer({
    user, sessionId, documentId, text, allowedIds,
    answer: result.answer,
    sources: result.sources || [],
    searchQuery: result.search_query,
    latency: Date.now() - started,
  });
}

/**
 * Ask and receive the answer as it's written.
 *
 * onEvent is called with:
 *   { type: "status", stage: "generating" }  retrieval finished, writing begins
 *   { type: "delta", text }                  a piece of the answer
 *   { type: "done", message }                the saved message, with sources
 *
 * The answer is saved only once it's complete, so a stream that breaks
 * part-way never leaves a half-written answer in the history.
 */
export async function askQuestionStream({ user, sessionId, question, documentId, onEvent }) {
  const { text, allowedIds, history } = await prepareQuestion({ user, sessionId, question, documentId });

  const started = Date.now();
  let searchQuery = "";
  let final = null;

  for await (const event of aiClient.streamQuery({ question: text, allowedDocumentIds: allowedIds, history })) {
    if (event.type === "meta") {
      searchQuery = event.search_query || "";
      onEvent({ type: "status", stage: "generating" });
    } else if (event.type === "delta") {
      onEvent({ type: "delta", text: event.text });
    } else if (event.type === "done") {
      final = event;
    } else if (event.type === "error") {
      throw new ApiError(502, event.message || "The answer stopped part-way through");
    }
  }

  if (!final) throw new ApiError(502, "The answer stream ended unexpectedly");

  const message = await saveAnswer({
    user, sessionId, documentId, text, allowedIds,
    answer: final.answer,
    sources: final.sources || [],
    searchQuery,
    latency: Date.now() - started,
  });

  onEvent({ type: "done", message });
}