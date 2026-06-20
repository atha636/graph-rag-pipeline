from src.services.vector_service import VectorService


service = VectorService()


vector_id = service.upsert_document(
    text="Elon Musk founded SpaceX in 2002",
    metadata={
        "source": "test"
    }
)

print(
    "Stored ID:",
    vector_id
)


results = service.search(
    "Who founded SpaceX?"
)

print(
    "Search Results:"
)

for item in results:
    print(item)