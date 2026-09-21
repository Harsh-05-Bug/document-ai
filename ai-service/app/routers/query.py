import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import TOP_K
from app.core.query_rewriter import rewrite_question
from app.core.rag_chain import NO_ANSWER, build_sources, generate_answer, stream_answer
from app.core.retriever import retrieve
from app.schemas.query import QueryRequest, QueryResponse, SearchResponse

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    # Resolve follow-ups ("tell me more about this") into a standalone
    # question first. The permission filter below applies to the rewritten
    # question exactly as it would to the original.
    history = [turn.model_dump() for turn in req.history]
    search_query = rewrite_question(req.question, history)

    chunks = retrieve(search_query, req.allowed_document_ids, req.top_k or TOP_K)
    answer, sources = generate_answer(search_query, chunks)
    return QueryResponse(
        answer=answer,
        sources=sources,
        searched_documents=len(req.allowed_document_ids),
        retrieved_chunks=len(chunks),
        search_query=search_query,
    )


def _event(payload: dict) -> str:
    """One JSON object per line (NDJSON)."""
    return json.dumps(payload) + "\n"


@router.post("/query/stream")
def query_stream(req: QueryRequest) -> StreamingResponse:
    """
    Same pipeline as /query, but the answer is sent as it's written.

    Rewriting and retrieval run BEFORE the response starts, so a failure
    there still returns a normal HTTP error. Only generation is streamed.

    Events, in order:
      meta   – what was searched and how many passages matched
      delta  – a piece of answer text (many of these)
      done   – the complete answer plus its sources
      error  – generation failed part-way through
    """
    history = [turn.model_dump() for turn in req.history]
    search_query = rewrite_question(req.question, history)
    chunks = retrieve(search_query, req.allowed_document_ids, req.top_k or TOP_K)

    def events():
        yield _event({
            "type": "meta",
            "search_query": search_query,
            "retrieved_chunks": len(chunks),
            "searched_documents": len(req.allowed_document_ids),
        })

        # Nothing cleared the similarity floor: don't call the model at all.
        if not chunks:
            yield _event({"type": "done", "answer": NO_ANSWER, "sources": []})
            return

        parts: list[str] = []
        try:
            for text in stream_answer(search_query, chunks):
                parts.append(text)
                yield _event({"type": "delta", "text": text})
        except Exception:
            log.exception("Answer stream failed part-way through")
            yield _event({"type": "error", "message": "The model stopped responding before finishing."})
            return

        answer = "".join(parts).strip()

        # Sources are decided only now, once the full answer is known:
        # a refusal must not arrive with citations attached.
        if answer.startswith(NO_ANSWER):
            yield _event({"type": "done", "answer": NO_ANSWER, "sources": []})
        else:
            yield _event({"type": "done", "answer": answer, "sources": build_sources(chunks)})

    return StreamingResponse(events(), media_type="application/x-ndjson")


@router.post("/search", response_model=SearchResponse)
def semantic_search(req: QueryRequest) -> SearchResponse:
    """Retrieval only — no LLM call. Powers the semantic search box."""
    return SearchResponse(
        results=retrieve(req.question, req.allowed_document_ids, req.top_k or 8)
    )