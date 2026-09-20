from fastapi import APIRouter

from app.config import TOP_K
from app.core.rag_chain import generate_answer
from app.core.retriever import retrieve
from app.schemas.query import QueryRequest, QueryResponse, SearchResponse

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    chunks = retrieve(req.question, req.allowed_document_ids, req.top_k or TOP_K)
    answer, sources = generate_answer(req.question, chunks)
    return QueryResponse(
        answer=answer,
        sources=sources,
        searched_documents=len(req.allowed_document_ids),
        retrieved_chunks=len(chunks),
    )


@router.post("/search", response_model=SearchResponse)
def semantic_search(req: QueryRequest) -> SearchResponse:
    """Retrieval only — no LLM call. Powers the semantic search box."""
    return SearchResponse(
        results=retrieve(req.question, req.allowed_document_ids, req.top_k or 8)
    )
