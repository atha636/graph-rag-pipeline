from typing import Optional
from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """
    Request schema for Graph RAG queries.
    """

    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="User question for the Graph RAG system",
    )

    # Optional conversation ID for multi-turn memory
    conversation_id: Optional[str] = Field(
        default=None,
        description="Conversation UUID for multi-turn context. "
                    "If None, query is treated as stateless.",
    )

    # Control how many vector results to retrieve
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of vector search results to retrieve",
    )

    # Whether to use the semantic cache
    use_cache: bool = Field(
        default=True,
        description="Return a cached answer if a similar query was answered recently",
    )


class CreateConversationRequest(BaseModel):
    title: Optional[str] = Field(
        default="New Conversation",
        max_length=120,
    )


class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)