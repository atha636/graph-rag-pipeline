"""
clear_pinecone.py  —  Wipe all vectors from the configured namespace.

Handles the case where the namespace doesn't exist yet (Pinecone
returns 404 when you delete an empty/non-existent namespace).
"""

from loguru import logger
from src.services.vector_service import VectorService


def main():
    vector_service = VectorService()

    try:
        vector_service.clear_namespace()
        logger.success("Pinecone namespace cleared successfully.")

    except Exception as e:
        error_msg = str(e).lower()

        # Pinecone raises 404 / NotFoundException when the namespace
        # is empty or has never been written to. This is not an error —
        # the namespace is already clean.
        if "not found" in error_msg or "404" in error_msg or "namespace" in error_msg:
            logger.info(
                "Namespace is already empty (or does not exist yet). "
                "Nothing to clear — this is fine."
            )
        else:
            logger.error(f"Unexpected error clearing namespace: {e}")
            raise


if __name__ == "__main__":
    main()