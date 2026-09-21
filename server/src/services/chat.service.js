import { pool } from "../db/pool.js";
import { ApiError } from "../utils/ApiError.js";
import { getAccessibleDocumentIds } from "./permission.service.js";
import { requestQuery } from "./aiClient.service.js";
import { logAudit } from "./audit.service.js";

// How many earlier messages (user + assistant) to send for resolving
// follow-up questions. Three exchanges is enough for "it" and "this".
const HISTORY_LIMIT = 6;

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
 * The permission boundary in one function.
 *
 *   1. work out which documents this user may read
 *   2. hand that list to the AI service, which filters the vector search
 *      BEFORE ranking — not as a post-filter on the model's answer
 *   3. persist both turns plus the citations
 */
export async function askQuestion({ user, sessionId, question, documentId }) {
  if (!question?.trim()) throw ApiError.badRequest("Ask a question first");
  await assertOwnsSession(sessionId, user.id);

  let allowedIds = await getAccessibleDocumentIds(user);

  // "Ask this document" mode: narrow to one doc, but only if it was
  // already in the allowed set.
  if (documentId) {
    allowedIds = allowedIds.filter((id) => id === documentId);
    if (!allowedIds.length) throw ApiError.forbidden();
  }

  // Read history BEFORE saving the new question, so the question
  // isn't included in its own context.
  const history = await getRecentHistory(sessionId);

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2)`,
    [sessionId, question.trim()]
  );

  const started = Date.now();
  const result = await requestQuery({
    question: question.trim(),
    allowedDocumentIds: allowedIds,
    history,
  });
  const latency = Date.now() - started;

  const { rows } = await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, sources, latency_ms)
     VALUES ($1,'assistant',$2,$3,$4) RETURNING *`,
    [sessionId, result.answer, JSON.stringify(result.sources || []), latency]
  );

  // Name the conversation after its first question.
  await pool.query(
    `UPDATE chat_sessions SET title = $2
      WHERE id = $1 AND (title IS NULL OR title = 'New conversation')`,
    [sessionId, question.trim().slice(0, 80)]
  );

  logAudit({
    userId: user.id,
    action: "chat.query",
    documentId: documentId || null,
    metadata: {
      question: question.trim().slice(0, 500),
      search_query: (result.search_query || "").slice(0, 500),
      sources: (result.sources || []).length,
      searched_documents: allowedIds.length,
      latency_ms: latency,
    },
  });

  return { ...rows[0], grounded: (result.sources || []).length > 0 };
}