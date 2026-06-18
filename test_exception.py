from src.core.exceptions import (
    VectorDatabaseError,
)


try:
    raise VectorDatabaseError(
        "Pinecone connection timeout"
    )

except VectorDatabaseError as error:
    print(
        f"Handled error: {error}"
    )