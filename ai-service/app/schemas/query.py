from typing import List, Optional

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question: str
    allowed_document_ids: List[str] = Field(default_factory=list)
    top_k: Optional[int] = None


class Source(BaseModel):
    index: int
    document_id: str
    filename: str
    page: Optional[int] = None
    snippet: Optional[str] = None
    similarity: Optional[float] = None


class QueryResponse(BaseModel):
    answer: str
    sources: List[Source]
    searched_documents: int
    retrieved_chunks: int


class SearchHit(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page_number: Optional[int] = None
    content: str
    similarity: float


class SearchResponse(BaseModel):
    results: List[SearchHit]


class SummarizeRequest(BaseModel):
    document_id: str


class SummarizeResponse(BaseModel):
    document_id: str
    summary: str
