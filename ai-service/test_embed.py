from app.core.embeddings import client
from app.config import EMBEDDING_MODEL

r = client.embeddings.create(
    model=EMBEDDING_MODEL,
    input=["hello world"],
    dimensions=1536,
)
print("model:", EMBEDDING_MODEL)
print("dimensions:", len(r.data[0].embedding))