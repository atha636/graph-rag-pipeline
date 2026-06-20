from src.services.entity_service import (
    EntityExtractionService
)


service = EntityExtractionService()


entities = service.extract_entities(
    "Who founded SpaceX and what did it develop?"
)


print("\nExtracted Entities:")

for entity in entities:
    print(entity)