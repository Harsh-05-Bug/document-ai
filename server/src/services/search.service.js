import { pool } from "../db/pool.js";

/**
 * Keyword search: filename/category trigram match plus full-text search
 * over chunk bodies. Always scoped to the caller's accessible IDs.
 * Semantic search lives in the ai-service; the /api/search/hybrid
 * endpoint blends the two.
 */
export async function keywordSearch(allowedIds, query, limit = 20) {
  if (!allowedIds.length || !query?.trim()) return [];

  const { rows } = await pool.query(
    `WITH matches AS (
       SELECT d.id,
              GREATEST(similarity(d.filename, $2), similarity(COALESCE(d.category,''), $2)) AS name_score,
              0::real AS text_score,
              NULL::int AS page_number,
              NULL::text AS snippet
         FROM documents d
        WHERE d.id = ANY($1::uuid[])
          AND (d.filename ILIKE '%' || $2 || '%' OR d.category ILIKE '%' || $2 || '%')

       UNION ALL

       SELECT c.document_id,
              0::real,
              ts_rank(c.content_tsv, plainto_tsquery('english', $2)) AS text_score,
              c.page_number,
              ts_headline('english', c.content, plainto_tsquery('english', $2),
                          'MaxWords=30, MinWords=10, StartSel="<<", StopSel=">>"') AS snippet
         FROM document_chunks c
        WHERE c.document_id = ANY($1::uuid[])
          AND c.content_tsv @@ plainto_tsquery('english', $2)
     )
     SELECT d.id, d.filename, d.category, d.status, d.created_at,
            MAX(m.name_score + m.text_score) AS score,
            (array_agg(m.snippet) FILTER (WHERE m.snippet IS NOT NULL))[1] AS snippet,
            (array_agg(m.page_number) FILTER (WHERE m.page_number IS NOT NULL))[1] AS page_number
       FROM matches m
       JOIN documents d ON d.id = m.id
      GROUP BY d.id
      ORDER BY score DESC
      LIMIT $3`,
    [allowedIds, query.trim(), limit]
  );
  return rows;
}
