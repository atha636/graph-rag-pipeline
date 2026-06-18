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

    # Neo4j Configuration
    NEO4J_URI: str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: str

    # AI Models
    LLM_MODEL: str = "llama3-8b-8192"
    EMBEDDING_MODEL: str = "bge-large-en"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Creates a single settings object and
    reuses it during the application lifetime.
    """
    return Settings()


# Global settings object
settings = get_settings()