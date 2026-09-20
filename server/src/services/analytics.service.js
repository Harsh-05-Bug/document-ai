import { pool } from "../db/pool.js";

/** Everything here is scoped to the document IDs the caller can see. */
export async function overview(allowedIds, userId) {
  const ids = allowedIds.length ? allowedIds : [null];

  const [totals, questions, unanswered] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int              AS total_documents,
              COALESCE(SUM(size_bytes),0)::bigint AS total_storage_bytes,
              COUNT(*) FILTER (WHERE status='ready')::int      AS ready,
              COUNT(*) FILTER (WHERE status='processing')::int AS processing,
              COUNT(*) FILTER (WHERE status='failed')::int     AS failed,
              COALESCE(SUM(chunk_count),0)::int AS total_chunks
         FROM documents WHERE id = ANY($1::uuid[])`,
      [ids]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS asked
         FROM chat_messages m
         JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.role='user' AND s.user_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS ungrounded
         FROM chat_messages m
         JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.role='assistant' AND s.user_id=$1 AND jsonb_array_length(m.sources)=0`,
      [userId]
    ),
  ]);

  return {
    ...totals.rows[0],
    total_storage_bytes: Number(totals.rows[0].total_storage_bytes),
    questions_asked: questions.rows[0].asked,
    unanswered_questions: unanswered.rows[0].ungrounded,
  };
}

export async function topDocuments(allowedIds, limit = 5) {
  if (!allowedIds.length) return [];
  const { rows } = await pool.query(
    `SELECT d.id, d.filename, COUNT(a.id)::int AS views
       FROM documents d
       LEFT JOIN audit_logs a
              ON a.document_id = d.id AND a.action IN ('document.view','document.download')
      WHERE d.id = ANY($1::uuid[])
      GROUP BY d.id
      ORDER BY views DESC, d.created_at DESC
      LIMIT $2`,
    [allowedIds, limit]
  );
  return rows;
}

export async function topQuestions(userId, limit = 5) {
  const { rows } = await pool.query(
    `SELECT lower(content) AS question, COUNT(*)::int AS times_asked
       FROM chat_messages m
       JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.role='user' AND s.user_id = $1
      GROUP BY lower(content)
      ORDER BY times_asked DESC, MAX(m.created_at) DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

export async function categoryBreakdown(allowedIds) {
  if (!allowedIds.length) return [];
  const { rows } = await pool.query(
    `SELECT COALESCE(category,'Uncategorised') AS category, COUNT(*)::int AS documents
       FROM documents WHERE id = ANY($1::uuid[])
      GROUP BY 1 ORDER BY documents DESC`,
    [allowedIds]
  );
  return rows;
}

/** Question volume per day for the last 14 days, zero-filled. */
export async function activity(userId, days = 14) {
  const { rows } = await pool.query(
    `SELECT to_char(g.day,'YYYY-MM-DD') AS day,
            COUNT(m.id)::int AS questions
       FROM generate_series(current_date - ($2::int - 1), current_date, '1 day') AS g(day)
       LEFT JOIN chat_sessions s ON s.user_id = $1
       LEFT JOIN chat_messages m
              ON m.session_id = s.id AND m.role='user' AND m.created_at::date = g.day
      GROUP BY g.day ORDER BY g.day`,
    [userId, days]
  );
  return rows;
}
