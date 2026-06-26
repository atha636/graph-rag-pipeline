"""
Structured exception hierarchy for the Graph RAG API.

Using a typed hierarchy lets middleware catch specific error
classes and return the right HTTP status codes with consistent
error shapes the frontend can parse reliably.
"""


class GraphRAGException(Exception):
    """Base exception for all application errors."""
    status_code: int = 500

    def __init__(self, message: str, detail: str = ""):
        self.message = message
        self.detail  = detail
        super().__init__(message)


class VectorDatabaseError(GraphRAGException):
    """Pinecone operation failed."""
    status_code = 503


class GraphDatabaseError(GraphRAGException):
    """Neo4j operation failed."""
    status_code = 503


class LLMServiceError(GraphRAGException):
    """Groq API call failed."""
    status_code = 502


class DocumentProcessingError(GraphRAGException):
    """File parsing or chunking failed."""
    status_code = 422


class CacheError(GraphRAGException):
    """Cache read/write failed — non-fatal, caller should continue."""
    status_code = 500


class ConversationError(GraphRAGException):
    """Conversation history operation failed."""
    status_code = 500


class RateLimitError(GraphRAGException):
    """Upstream API rate limit hit."""
    status_code = 429