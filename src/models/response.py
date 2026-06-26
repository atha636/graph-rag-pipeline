from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Source(BaseModel):
    source_type:    str
    content:        str
    document_name:  Optional[str]  = None
    document_type:  Optional[str]  = None
    document_id:    Optional[str]  = None
    uploaded_at:    Optional[str]  = None
    chunk_id:       Optional[int]  = None
    chunk_size:     Optional[int]  = None
    score:          Optional[float] = None
    relevance_score: Optional[float] = None


class QueryResponse(BaseModel):
    answer:          str
    documents:       List[str]            = Field(default_factory=list)
    sources:         List[Source]         = Field(default_factory=list)
    latency_ms:      float
    conversation_id: Optional[str]        = None
    cache_hit:       bool                 = False
    intent:          Optional[str]        = None
    entities:        Optional[List[str]]  = None


class ConversationSummary(BaseModel):
    id:          str
    title:       str
    created_at:  str
    updated_at:  str
    turn_count:  int


class ConversationDetail(ConversationSummary):
    messages: List[Dict[str, str]] = Field(default_factory=list)


class DocumentRecord(BaseModel):
    document_id:   str
    document_name: str
    document_type: str
    uploaded_at:   Optional[str] = None
    chunk_count:   int           = 0


class StatsResponse(BaseModel):
    vector_count:       int
    graph_node_count:   int
    graph_rel_count:    int
    document_count:     int
    cache_size:         int
    cache_hit_rate:     float
    cache_total_requests: int