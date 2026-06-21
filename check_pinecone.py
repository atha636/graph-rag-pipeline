from pinecone import Pinecone
from src.core.config import settings

pc = Pinecone(
    api_key=settings.PINECONE_API_KEY
)

index = pc.Index(
    settings.PINECONE_INDEX_NAME
)

stats = index.describe_index_stats()

print(stats)