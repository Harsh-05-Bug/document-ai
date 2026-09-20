import logging

from app.config import TOP_K, SIMILARITY_THRESHOLD
from app.core.embeddings import embed_query
from app.db.pgvector_client import pool, to_vector

log = logging.getLogger(__name__)

SEARCH_SQL = """
    SELECT c.id,
           c.document_id,
           d.filename,
           c.page_number,
           c.content,
           1 - (c.embedding <=> %(query)s::vector) AS similarity
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
     WHERE c.document_id = ANY(%(allowed)s::uuid[])
       AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> %(query)s::vector
     LIMIT %(limit)s
"""


def retrieve(question: str, allowed_document_ids: list[str], top_k: int = TOP_K) -> list[dict]:
    """
    Similarity search, restricted to documents the caller may read.

    The allow-list is applied in the WHERE clause, so a document the user
    can't see is never ranked, never enters the prompt, and can't leak
    through the model's answer. Filtering after retrieval would still
    have put the text in front of the LLM.
    """
    if not allowed_document_ids:
        return []

    query_vector = to_vector(embed_query(question))

    # Over-fetch, then apply the quality floor, so a couple of weak
    # neighbours don't crowd out good ones.
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(SEARCH_SQL, {
            "query": query_vector,
            "allowed": allowed_document_ids,
            "limit": top_k * 3,
        })
        rows = cur.fetchall()

    results = [
        {
            "chunk_id": str(row[0]),
            "document_id": str(row[1]),
            "filename": row[2],
            "page_number": row[3],
            "content": row[4],
            "similarity": float(row[5]),
        }
        for row in rows
    ]

    kept = [r for r in results if r["similarity"] >= SIMILARITY_THRESHOLD][:top_k]

    if results and not kept:
        log.info(
            "no chunk cleared the %.2f threshold (best was %.3f) — refusing to answer",
            SIMILARITY_THRESHOLD, results[0]["similarity"],
        )
    return kept
