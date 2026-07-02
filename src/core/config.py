from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration.
    All values overridable via .env or environment variables.
    """

    # ── Application ───────────────────────────────────────────────
    APP_NAME: str = "Graph RAG API"
    APP_ENV:  str = "development"
    API_PORT: int = 8000

    # ── CORS — set ALLOWED_ORIGINS in production env ──────────────
    # Comma-separated list of allowed frontend origins.
    # Example: "https://your-app.vercel.app,https://your-custom-domain.com"
    # In development, localhost origins are always added automatically.
    ALLOWED_ORIGINS: str = ""

    # ── Groq ──────────────────────────────────────────────────────
    GROQ_API_KEY:   str
    LLM_MODEL:      str = "llama3-8b-8192"
    LLM_FAST_MODEL: str = "llama-3.1-8b-instant"

    # ── Pinecone ──────────────────────────────────────────────────
    PINECONE_API_KEY:    str
    PINECONE_INDEX_NAME: str
    PINECONE_NAMESPACE:  str = "default"

    # ── Neo4j ─────────────────────────────────────────────────────
    NEO4J_URI:      str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: str

    # ── Embedding ─────────────────────────────────────────────────
    # Switched from BAAI/bge-large-en-v1.5 (1.3 GB) to all-MiniLM-L6-v2 (90 MB)
    # Quality is slightly lower but works on all free hosting tiers.
    # To use the large model, set EMBEDDING_MODEL=BAAI/bge-large-en-v1.5 in env vars
    # and deploy on a platform with at least 2 GB RAM (Railway, Fly.io paid).
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # ── Ingestion tuning ──────────────────────────────────────────
    CHUNK_SIZE:          int = 1500
    CHUNK_OVERLAP:       int = 200
    PINECONE_BATCH_SIZE: int = 100
    GRAPH_SAMPLE_RATE:   int = 5
    GRAPH_MIN_CHUNK_LEN: int = 200

    # ── Cache ─────────────────────────────────────────────────────
    CACHE_SIMILARITY_THRESHOLD: float = 0.92
    CACHE_MAX_ENTRIES:          int   = 200
    CACHE_TTL_SECONDS:          int   = 3600

    # ── Ranking ───────────────────────────────────────────────────
    RANKING_MAX_SOURCES: int   = 5
    RANKING_MIN_VECTOR:  int   = 2
    RANKING_MIN_GRAPH:   int   = 1
    RANKING_MMR_LAMBDA:  float = 0.7

    # ── Query ─────────────────────────────────────────────────────
    QUERY_DEFAULT_TOP_K: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    def get_allowed_origins(self) -> List[str]:
        """
        Build the full CORS origins list.
        Always includes localhost for development.
        Adds any origins from ALLOWED_ORIGINS env var.
        """
        origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        if self.ALLOWED_ORIGINS:
            extra = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
            origins.extend(extra)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()