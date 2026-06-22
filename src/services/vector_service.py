from typing import List, Dict, Any
from uuid import uuid4

from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.config import settings
from src.core.exceptions import VectorDatabaseError


class VectorService:
    """
    Handles embedding generation and
    Pinecone vector operations.
    """

    def __init__(self) -> None:
        try:
            logger.info(
                "Initializing Vector Service..."
            )

            # Load embedding model
            self.model = SentenceTransformer(
                settings.EMBEDDING_MODEL
            )

            logger.info(
                "Embedding model loaded successfully"
            )

            # Initialize Pinecone
            client = Pinecone(
                api_key=settings.PINECONE_API_KEY
            )

            self.index = client.Index(
                settings.PINECONE_INDEX_NAME
            )

            logger.info(
                "Pinecone connection established"
            )

        except Exception as error:
            logger.exception(
                "Failed to initialize Vector Service"
            )

            raise VectorDatabaseError(
                str(error)
            ) from error


    def generate_embedding(
        self,
        text: str
    ) -> List[float]:
        """
        Convert text into vector embedding.
        """

        try:
            embedding = (
                self.model.encode(
                    text,
                    normalize_embeddings=True
                )
                .tolist()
            )

            return embedding

        except Exception as error:
            logger.exception(
                "Embedding generation failed"
            )

            raise VectorDatabaseError(
                str(error)
            ) from error


    def upsert_document(
        self,
        text: str,
        metadata: Dict[str, Any]
    ) -> str:
        """
        Store document vector in Pinecone.
        """

        try:
            vector_id = str(uuid4())

            embedding = (
                self.generate_embedding(text)
            )

            self.index.upsert(
                vectors=[
                    {
                        "id": vector_id,
                        "values": embedding,
                        "metadata": {
                            "text": text,
                            **metadata
                        }
                    }
                ],
                namespace=settings.PINECONE_NAMESPACE
            )

            logger.info(
                f"Document stored: {vector_id}"
            )

            return vector_id

        except Exception as error:
            logger.exception(
                "Vector upsert failed"
            )

            raise VectorDatabaseError(
                str(error)
            ) from error


    def search(
        self,
        query: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search similar documents.
        """

        try:
            query_vector = (
                self.generate_embedding(query)
            )

            result = self.index.query(
                vector=query_vector,
                top_k=top_k,
                include_metadata=True,
                namespace=settings.PINECONE_NAMESPACE
            )

            # Diagnostic: log every raw Pinecone result BEFORE any
            # ranking or filtering touches them. If tesla_report.txt
            # doesn't appear here, the data isn't in Pinecone and the
            # fix is to clear + re-upload. If it appears here but not
            # in the final response, the bug is in ranking/dedup.
            logger.info(
                f"Pinecone raw results ({len(result.matches)} matches):"
            )
            for i, match in enumerate(result.matches):
                logger.info(
                    f"  [{i}] score={match.score:.4f} | "
                    f"doc={match.metadata.get('document_name', '?')} | "
                    f"chunk={match.metadata.get('chunk_id', '?')} | "
                    f"id={match.id}"
                )

            matches = []

            for match in result.matches:

                matches.append(
                    {
                        "id": match.id,
                        "score": match.score,
                        "text": match.metadata.get(
                            "text",
                            ""
                        ),
                        "document_name": match.metadata.get(
                            "document_name",
                            "Unknown"
                        ),
                        "document_path": match.metadata.get(
                            "document_path",
                            ""
                        ),
                        "document_type": match.metadata.get(
                            "document_type",
                            ""
                        ),
                        "document_id": match.metadata.get(
                            "document_id",
                            ""
                        ),
                        "uploaded_at": match.metadata.get(
                            "uploaded_at",
                            ""
                        ),
                        "chunk_id": match.metadata.get(
                            "chunk_id",
                            -1
                        ),
                        "chunk_size": match.metadata.get(
                            "chunk_size",
                            0
                        )
                    }
                )

            logger.info(
                f"Retrieved {len(matches)} vectors"
            )

            return matches

        except Exception as error:
            logger.exception(
                "Vector search failed"
            )

            raise VectorDatabaseError(
                str(error)
            ) from error


    def clear_namespace(self):
        self.index.delete(
            delete_all=True,
            namespace=settings.PINECONE_NAMESPACE
        )
        logger.info(
            "Pinecone namespace cleared"
        )