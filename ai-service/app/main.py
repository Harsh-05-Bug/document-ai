import logging
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import INTERNAL_API_KEY
from app.db.pgvector_client import pool
from app.routers import ingest, query, summarize

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def verify_internal_key(x_internal_key: str = Header(default="")) -> None:
    """
    This service is only ever called by the Node API, which has already
    authenticated the user and computed their allowed document list.
    Nothing here re-derives permissions, so it must not be publicly
    reachable — hence the shared secret plus a private network.
    """
    if not secrets.compare_digest(x_internal_key, INTERNAL_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid internal key")


app = FastAPI(title="document-ai · AI service", version="1.0.0")


@app.get("/health")
def health() -> dict:
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "database": "ok"}
    except Exception:
        return {"status": "degraded", "database": "unreachable"}


for router in (ingest.router, query.router, summarize.router):
    app.include_router(router, prefix="/internal", dependencies=[Depends(verify_internal_key)])
