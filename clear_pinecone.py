from pinecone import Pinecone
from src.core.config import settings


client = Pinecone(
    api_key=settings.PINECONE_API_KEY
)

index = client.Index(
    settings.PINECONE_INDEX_NAME
)


index.delete(
    delete_all=True,
    namespace=settings.PINECONE_NAMESPACE
)


print("✅ Pinecone namespace cleared")