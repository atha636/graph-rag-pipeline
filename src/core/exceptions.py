class GraphRAGException(Exception):
    """
    Base exception for Graph RAG application.
    """

    def __init__(
        self,
        message: str,
    ):
        self.message = message
        super().__init__(message)


class VectorDatabaseError(GraphRAGException):
    """
    Raised when Pinecone operations fail.
    """
    pass


class GraphDatabaseError(GraphRAGException):
    """
    Raised when Neo4j operations fail.
    """
    pass


class LLMServiceError(GraphRAGException):
    """
    Raised when LLM operations fail.
    """
    pass


class ConfigurationError(GraphRAGException):
    """
    Raised when environment configuration is invalid.
    """
    pass