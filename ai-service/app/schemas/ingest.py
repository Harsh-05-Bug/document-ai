from pydantic import BaseModel


class IngestRequest(BaseModel):
    document_id: str
    storage_key: str
    mime_type: str


class IngestResponse(BaseModel):
    document_id: str
    status: str          # accepted | failed
    message: str | None = None
