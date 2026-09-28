import os
from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


DATABASE_URL = _require("DATABASE_URL")
INTERNAL_API_KEY = _require("INTERNAL_API_KEY")
OPENAI_API_KEY = _require("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL") or None

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

TOP_K = int(os.getenv("TOP_K", "5"))
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
CHUNK_TOKENS = int(os.getenv("CHUNK_TOKENS", "600"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "80"))

STORAGE_DRIVER = os.getenv("STORAGE_DRIVER", "local")
STORAGE_DIR = os.getenv("STORAGE_DIR", "../storage")

# S3-compatible storage. S3_ENDPOINT is set for anything that isn't
# AWS itself — Supabase Storage, Cloudflare R2, MinIO.
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
S3_ENDPOINT = os.getenv("S3_ENDPOINT") or None
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID") or None
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY") or None