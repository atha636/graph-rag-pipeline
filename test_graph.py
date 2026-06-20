from src.services.graph_service import GraphService


graph = GraphService()


graph.create_relationship(
    source="Elon Musk",
    relation="FOUNDED",
    target="SpaceX"
)

graph.create_relationship(
    source="SpaceX",
    relation="DEVELOPED",
    target="Starship"
)


results = graph.search_entities(
    "Elon Musk"
)


print("\nGraph Results:")

for item in results:
    print(item)


graph.close()