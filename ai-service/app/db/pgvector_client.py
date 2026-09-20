from psycopg_pool import ConnectionPool

from app.config import DATABASE_URL

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=True)


def to_vector(embedding: list[float]) -> str:
    """pgvector accepts a bracketed literal, so no extra type adapter needed."""
    return "[" + ",".join(f"{value:.7f}" for value in embedding) + "]"
