from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """
    Request schema for Graph RAG queries.
    """

    query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="User question for the Graph RAG system"
    )