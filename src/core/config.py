from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration — all values can be overridden via .env
    or environment variables without changing code.
    """

    # ── Application ───────────────────────────────────────────────
    APP_NAME: str = "Graph RAG API"
    APP_ENV:  str = "development"
    API_PORT: int = 8000

    # ── Groq ──────────────────────────────────────────────────────
    GROQ_API_KEY: str
    LLM_MODEL:    str = "llama3-8b-8192"
    # Faster model for bulk extraction tasks (entity/relationship/intent)
    LLM_FAST_MODEL: str = "llama-3.1-8b-instant"

    # ── Pinecone ──────────────────────────────────────────────────
    PINECONE_API_KEY:    str
    PINECONE_INDEX_NAME: str
    PINECONE_NAMESPACE:  str = "default"

    # ── Neo4j ─────────────────────────────────────────────────────
    NEO4J_URI:      str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: str

    # ── Embedding model ───────────────────────────────────────────
    EMBEDDING_MODEL: str = "BAAI/bge-large-en-v1.5"

    # ── Document ingestion tuning (all overridable via .env) ──────
    # Chunk size in characters
    CHUNK_SIZE:    int = 1500
    # Overlap between consecutive chunks
    CHUNK_OVERLAP: int = 200
    # How many chunks to batch per Pinecone upsert call
    PINECONE_BATCH_SIZE: int = 100
    # Sample 1 in N chunks for graph relationship extraction
    # (higher = faster ingestion, lower = denser graph)
    GRAPH_SAMPLE_RATE: int = 5
    # Skip chunks shorter than this for graph extraction
    GRAPH_MIN_CHUNK_LEN: int = 200

    # ── Semantic cache ────────────────────────────────────────────
    CACHE_SIMILARITY_THRESHOLD: float = 0.92
    CACHE_MAX_ENTRIES:          int   = 200
    CACHE_TTL_SECONDS:          int   = 3600   # 1 hour

    # ── Ranking ───────────────────────────────────────────────────
    RANKING_MAX_SOURCES:      int   = 5
    RANKING_MIN_VECTOR:       int   = 2
    RANKING_MIN_GRAPH:        int   = 1
    # MMR lambda: 1.0 = pure relevance, 0.0 = pure diversity
    RANKING_MMR_LAMBDA:       float = 0.7

    # ── Query ─────────────────────────────────────────────────────
    QUERY_DEFAULT_TOP_K: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()