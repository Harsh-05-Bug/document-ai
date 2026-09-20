import logging

from fastapi import APIRouter, BackgroundTasks

from app.core.chunking import chunk_pages
from app.core.embeddings import embed_texts
from app.core.extraction import extract, suffix_for
from app.db.pgvector_client import pool, to_vector
from app.schemas.ingest import IngestRequest, IngestResponse
from app.storage import download_to_tempfile

log = logging.getLogger(__name__)
router = APIRouter()


def _set_failed(document_id: str, message: str) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status='failed', error=%s, updated_at=now() WHERE id=%s",
            (message[:500], document_id),
        )


def process_document(document_id: str, storage_key: str, mime_type: str) -> None:
    """The whole ingestion pipeline: fetch -> extract -> chunk -> embed -> store."""
    try:
        with download_to_tempfile(storage_key, suffix_for(mime_type)) as path:
            pages = extract(path, mime_type)

        if not pages:
            return _set_failed(document_id, "No readable text found. If this is a scan, enable OCR.")

        chunks = chunk_pages(pages)
        if not chunks:
            return _set_failed(document_id, "Text extracted but produced no chunks.")

        embeddings = embed_texts([c["content"] for c in chunks])

        with pool.connection() as conn:
            with conn.cursor() as cur:
                # Re-ingesting replaces the old vectors rather than duplicating them.
                cur.execute("DELETE FROM document_chunks WHERE document_id = %s", (document_id,))
                cur.executemany(
                    """INSERT INTO document_chunks
                         (document_id, chunk_index, page_number, content, token_count, embedding)
                       VALUES (%s, %s, %s, %s, %s, %s::vector)""",
                    [
                        (
                            document_id,
                            chunk["chunk_index"],
                            chunk["page_number"],
                            chunk["content"],
                            chunk["token_count"],
                            to_vector(vector),
                        )
                        for chunk, vector in zip(chunks, embeddings)
                    ],
                )
                cur.execute(
                    """UPDATE documents
                          SET status='ready', error=NULL, chunk_count=%s,
                              page_count=%s, updated_at=now()
                        WHERE id=%s""",
                    (len(chunks), len([p for p in pages if p["page_number"]]) or None, document_id),
                )
            conn.commit()

        log.info("ingested %s: %s chunks", document_id, len(chunks))

    except Exception as exc:  # noqa: BLE001 - the status column is the error channel
        log.exception("ingestion failed for %s", document_id)
        _set_failed(document_id, str(exc))


@router.post("/ingest", response_model=IngestResponse)
def ingest_document(req: IngestRequest, background: BackgroundTasks) -> IngestResponse:
    """
    Returns immediately and processes in the background — a 200-page PDF
    shouldn't hold an HTTP connection open. The client polls
    GET /api/documents/:id/status for the outcome.
    """
    background.add_task(process_document, req.document_id, req.storage_key, req.mime_type)
    return IngestResponse(document_id=req.document_id, status="accepted")
