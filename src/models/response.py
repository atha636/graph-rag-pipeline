from typing import List, Optional

from pydantic import BaseModel, Field


class Source(BaseModel):
    """
    Represents a retrieval source.
    """

    source_type: str = Field(
        description="Source category such as vector or graph"
    )

    content: str = Field(
        description="Retrieved context"
    )

    # Vector metadata
    document_name: Optional[str] = Field(
        default=None,
        description="Original document name"
    )

    document_type: Optional[str] = Field(
        default=None,
        description="Document file type"
    )

    document_id: Optional[str] = Field(
        default=None,
        description="Stable identifier assigned at upload time"
    )

    uploaded_at: Optional[str] = Field(
        default=None,
        description="Timestamp (UTC) when the document was uploaded"
    )

    chunk_id: Optional[int] = Field(
        default=None,
        description="Chunk number in the document"
    )

    chunk_size: Optional[int] = Field(
        default=None,
        description="Number of characters in the chunk"
    )

    # Ranking and similarity information
    score: Optional[float] = Field(
        default=None,
        description="Pinecone similarity score"
    )

    relevance_score: Optional[float] = Field(
        default=None,
        description="Final ranking score after source ranking"
    )


class QueryResponse(BaseModel):
    """
    API response schema.
    """

    answer: str = Field(
        description="LLM generated answer"
    )

    sources: List[Source] = Field(
        default_factory=list,
        description="Supporting retrieval evidence"
    )

    latency_ms: float = Field(
        description="Total request processing time in milliseconds"
    )