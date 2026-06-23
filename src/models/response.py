from typing import List, Optional

from pydantic import BaseModel, Field


class Source(BaseModel):
    """
    Represents a single retrieval source shown to the user.
    """

    source_type: str = Field(
        description="Source category: 'vector' or 'graph'"
    )

    content: str = Field(
        description="Retrieved context text"
    )

    # Vector metadata
    document_name: Optional[str] = Field(
        default=None,
        description="Original document filename"
    )

    document_type: Optional[str] = Field(
        default=None,
        description="File extension, e.g. .pdf"
    )

    document_id: Optional[str] = Field(
        default=None,
        description="Stable ID assigned at upload time"
    )

    uploaded_at: Optional[str] = Field(
        default=None,
        description="UTC timestamp when the document was uploaded"
    )

    chunk_id: Optional[int] = Field(
        default=None,
        description="Chunk index within the document"
    )

    chunk_size: Optional[int] = Field(
        default=None,
        description="Character length of the chunk"
    )

    # Scores
    score: Optional[float] = Field(
        default=None,
        description="Pinecone cosine similarity score"
    )

    relevance_score: Optional[float] = Field(
        default=None,
        description="Semantic relevance score from ranking service"
    )


class QueryResponse(BaseModel):
    """
    Full API response returned by POST /api/v1/query.
    """

    answer: str = Field(
        description="LLM-generated answer"
    )

    # FIX: main.py returns `documents` but the old model didn't
    # declare it, causing a Pydantic validation error at runtime.
    documents: List[str] = Field(
        default_factory=list,
        description="Unique document names that contributed to the answer"
    )

    sources: List[Source] = Field(
        default_factory=list,
        description="Ranked retrieval sources used to generate the answer"
    )

    latency_ms: float = Field(
        description="End-to-end request latency in milliseconds"
    )