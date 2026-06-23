from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration class.
    Loads all environment variables from .env file.
    """

    # Application Settings
    APP_NAME: str = "Graph RAG API"
    APP_ENV: str = "development"
    API_PORT: int = 8000

    # Groq Configuration
    GROQ_API_KEY: str

    # Pinecone Configuration
    PINECONE_API_KEY: str
    PINECONE_INDEX_NAME: str
    PINECONE_NAMESPACE: str = "default"

    # Neo4j Configuration
    NEO4J_URI: str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: str

    # AI Models
    LLM_MODEL: str = "llama3-8b-8192"

    # FIX: "bge-large-en" is not a valid HuggingFace model id.
    # The correct id is "BAAI/bge-large-en-v1.5".
    # Using the wrong name causes SentenceTransformer to crash on startup.
    EMBEDDING_MODEL: str = "BAAI/bge-large-en-v1.5"

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