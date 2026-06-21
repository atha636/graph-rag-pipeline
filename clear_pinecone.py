from src.services.vector_service import VectorService


vector_service = VectorService()

vector_service.clear_namespace()

print(
    "Pinecone namespace deleted successfully"
)