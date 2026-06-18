from src.models.request import QueryRequest
from src.models.response import QueryResponse, Source


request = QueryRequest(
    query="Who founded SpaceX?"
)

response = QueryResponse(
    answer="Elon Musk founded SpaceX.",
    sources=[
        Source(
            source_type="graph",
            content="Elon Musk -> FOUNDED -> SpaceX"
        ),
        Source(
            source_type="vector",
            content="SpaceX was founded by Elon Musk."
        )
    ],
    latency_ms=120.45
)


print("REQUEST")
print(request.model_dump())

print("\nRESPONSE")
print(response.model_dump())