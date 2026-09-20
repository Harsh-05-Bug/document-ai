from fastapi import APIRouter, HTTPException

from app.core.rag_chain import summarize_chunks
from app.db.pgvector_client import pool
from app.schemas.query import SummarizeRequest, SummarizeResponse

router = APIRouter()


@router.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest) -> SummarizeResponse:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT filename FROM documents WHERE id = %s", (req.document_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        filename = row[0]

        cur.execute(
            """SELECT content FROM document_chunks
                WHERE document_id = %s ORDER BY chunk_index""",
            (req.document_id,),
        )
        chunks = [r[0] for r in cur.fetchall()]

    return SummarizeResponse(
        document_id=req.document_id,
        summary=summarize_chunks(filename, chunks),
    )
