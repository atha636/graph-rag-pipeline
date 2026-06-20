from src.services.graph_service import GraphService


graph = GraphService()


results = graph.search_entities(
    "SpaceX"
)


print("\nGraph Results:")

for item in results:
    print(
        f"{item['source']} "
        f"{item['relationship']} "
        f"{item['target']}"
    )


graph.close()