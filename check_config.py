from src.core.config import settings

print("API KEY:", settings.PINECONE_API_KEY[:10], "...")
print("INDEX:", settings.PINECONE_INDEX_NAME)
print("NAMESPACE:", settings.PINECONE_NAMESPACE)