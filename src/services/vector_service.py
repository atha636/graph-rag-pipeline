from typing import List, Dict, Any, Optional
from uuid import uuid4

from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.config import settings
from src.core.exceptions import VectorDatabaseError


class VectorService:
    """
    Handles embedding generation and Pinecone vector operations.

    Accepts an optional pre-loaded SentenceTransformer so the model
    is not loaded twice when RankingService also needs it.
    """

    def __init__(
        self,
        embedding_model: Optional[SentenceTransformer] = None
    ) -> None:
        try:
            logger.info("Initializing Vector Service...")

            # FIX: accept a shared model instance to avoid loading
            # SentenceTransformer twice (once here, once in RankingService).
            # If none is provided we load our own — backwards compatible.
            if embedding_model is not None:
                self.model = embedding_model
                logger.info("Using shared embedding model")
            else:
                self.model = SentenceTransformer(settings.EMBEDDING_MODEL)
                logger.info("Embedding model loaded successfully")

            client = Pinecone(api_key=settings.PINECONE_API_KEY)
            self.index = client.Index(settings.PINECONE_INDEX_NAME)

            logger.info("Pinecone connection established")

        except Exception as error:
            logger.exception("Failed to initialize Vector Service")

            raise VectorDatabaseError(str(error)) from error

    def batch_embed(self, texts: List[str]) -> List[List[float]]:
        """
        Embed a list of texts in a single batched model call.
        Much faster than calling generate_embedding() in a loop
        because the sentence-transformer processes all texts in
        parallel on the same CPU/GPU pass.
        """
        try:
            embeddings = self.model.encode(
                texts,
                normalize_embeddings=True,
                batch_size=64,          # process 64 chunks per forward pass
                show_progress_bar=False,
            )
            return [emb.tolist() for emb in embeddings]

        except Exception as error:
            logger.exception("Batch embedding failed")
            raise VectorDatabaseError(str(error)) from error

    def generate_embedding(self, text: str) -> List[float]:
        try:
            return (
                self.model
                .encode(text, normalize_embeddings=True)
                .tolist()
            )
        except Exception as error:
            logger.exception("Embedding generation failed")
            raise VectorDatabaseError(str(error)) from error

    def upsert_document(
        self,
        text: str,
        metadata: Dict[str, Any]
    ) -> str:
        try:
            vector_id = str(uuid4())
            embedding = self.generate_embedding(text)

            self.index.upsert(
                vectors=[{
                    "id":     vector_id,
                    "values": embedding,
                    "metadata": {"text": text, **metadata}
                }],
                namespace=settings.PINECONE_NAMESPACE
            )

            logger.info(f"Document stored: {vector_id}")
            return vector_id

        except Exception as error:
            logger.exception("Vector upsert failed")
            raise VectorDatabaseError(str(error)) from error

    def search(
        self,
        query: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        try:
            query_vector = self.generate_embedding(query)

            result = self.index.query(
                vector=query_vector,
                top_k=top_k,
                include_metadata=True,
                namespace=settings.PINECONE_NAMESPACE
            )

            logger.info(
                f"Pinecone raw results ({len(result.matches)} matches):"
            )
            for i, match in enumerate(result.matches):
                logger.info(
                    f"  [{i}] score={match.score:.4f} | "
                    f"doc={match.metadata.get('document_name', '?')} | "
                    f"chunk={match.metadata.get('chunk_id', '?')}"
                )

            matches = []
            for match in result.matches:
                matches.append({
                    "id":            match.id,
                    "score":         match.score,
                    "text":          match.metadata.get("text", ""),
                    "document_name": match.metadata.get("document_name", "Unknown"),
                    "document_path": match.metadata.get("document_path", ""),
                    "document_type": match.metadata.get("document_type", ""),
                    "document_id":   match.metadata.get("document_id", ""),
                    "uploaded_at":   match.metadata.get("uploaded_at", ""),
                    "chunk_id":      match.metadata.get("chunk_id", -1),
                    "chunk_size":    match.metadata.get("chunk_size", 0),
                })

            logger.info(f"Retrieved {len(matches)} vectors")
            return matches

        except Exception as error:
            logger.exception("Vector search failed")
            raise VectorDatabaseError(str(error)) from error

    def clear_namespace(self) -> None:
        """
        Delete all vectors in the configured namespace.

        Pinecone raises a 404 NotFoundException when the namespace is
        empty or has never been written to. We treat that as a no-op
        (it is already clean) rather than a hard error.
        """
        try:
            self.index.delete(
                delete_all=True,
                namespace=settings.PINECONE_NAMESPACE,
            )
            logger.info("Pinecone namespace cleared successfully")
        except Exception as e:
            if "not found" in str(e).lower() or "404" in str(e):
                logger.info(
                    "Namespace is already empty — nothing to clear."
                )
            else:
                raise

    def list_documents(self) -> list:
        """
        Return distinct document metadata from Pinecone.
        Queries with a zero vector and extracts unique document_name entries.
        """
        try:
            import numpy as np
            zero_vec = np.zeros(self.model.get_sentence_embedding_dimension()).tolist()

            result = self.index.query(
                vector=zero_vec,
                top_k=100,
                include_metadata=True,
                namespace=settings.PINECONE_NAMESPACE,
            )

            seen: dict = {}
            for match in result.matches:
                m = match.metadata
                doc_id = m.get("document_id", "")
                if doc_id and doc_id not in seen:
                    seen[doc_id] = {
                        "document_id":   doc_id,
                        "document_name": m.get("document_name", "Unknown"),
                        "document_type": m.get("document_type", ""),
                        "uploaded_at":   m.get("uploaded_at", ""),
                        "chunk_count":   0,
                    }
                if doc_id in seen:
                    seen[doc_id]["chunk_count"] += 1

            return list(seen.values())

        except Exception as e:
            logger.warning(f"list_documents failed: {e}")
            return []