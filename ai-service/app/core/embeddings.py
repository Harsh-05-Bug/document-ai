import logging

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import OPENAI_API_KEY, OPENAI_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIM

log = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

# Big documents produce hundreds of chunks; batch them so ingestion is
# a handful of API calls rather than one per chunk.
BATCH_SIZE = 96


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=20))
def _embed_batch(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
        dimensions=EMBEDDING_DIM,
    )
    return [item.embedding for item in response.data]


def embed_texts(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        vectors.extend(_embed_batch(batch))

    if vectors and len(vectors[0]) != EMBEDDING_DIM:
        raise ValueError(
            f"{EMBEDDING_MODEL} returned {len(vectors[0])}-dim vectors but the "
            f"document_chunks.embedding column is VECTOR({EMBEDDING_DIM}). "
            "Update EMBEDDING_DIM and the migration together."
        )
    return vectors


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]