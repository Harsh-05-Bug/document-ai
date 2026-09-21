from fastapi import APIRouter

from app.config import TOP_K
from app.core.query_rewriter import rewrite_question
from app.core.rag_chain import generate_answer
from app.core.retriever import retrieve
from app.schemas.query import QueryRequest, QueryResponse, SearchResponse

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


@router.post("/search", response_model=SearchResponse)
def semantic_search(req: QueryRequest) -> SearchResponse:
    """Retrieval only — no LLM call. Powers the semantic search box."""
    return SearchResponse(
        results=retrieve(req.question, req.allowed_document_ids, req.top_k or 8)
    )