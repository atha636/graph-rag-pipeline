from typing import List

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