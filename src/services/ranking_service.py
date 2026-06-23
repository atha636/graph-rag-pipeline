from typing import List, Dict, Any, Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.config import settings


class RankingService:
    """
    Handles source deduplication and semantic relevance ranking.
    """

    def __init__(
        self,
        # FIX: accept a shared SentenceTransformer so we don't load
        # the model a second time (VectorService already loaded it).
        embedding_model: Optional[SentenceTransformer] = None,
        similarity_threshold: float = 0.95,
        min_vector_sources: int = 2,
        min_graph_sources: int = 1,
        max_sources: int = 5
    ):
        self.similarity_threshold = similarity_threshold
        self.min_vector_sources = min_vector_sources
        self.min_graph_sources = min_graph_sources
        self.max_sources = max_sources

        if embedding_model is not None:
            self.model = embedding_model
            logger.info("RankingService using shared embedding model")
        else:
            logger.info("Loading embedding model for ranking...")
            self.model = SentenceTransformer(settings.EMBEDDING_MODEL)
            logger.info("Ranking embedding model loaded")

        logger.info("Ranking Service initialized")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _embed(self, texts: List[str]) -> np.ndarray:
        return self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False
        )

    def _cosine_similarity(
        self,
        vec_a: np.ndarray,
        vec_b: np.ndarray
    ) -> float:
        return float(np.dot(vec_a, vec_b))

    # ------------------------------------------------------------------
    # Deduplication
    # ------------------------------------------------------------------

    def remove_duplicates(
        self,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Remove near-duplicate sources using cosine similarity.
        Always keeps the first chunk from each unique document.
        """

        if not sources:
            return []

        contents = [s["content"] for s in sources]
        embeddings = self._embed(contents)

        unique_sources: List[Dict[str, Any]] = []
        unique_embeddings: List[np.ndarray] = []
        seen_documents: set = set()

        for idx, source in enumerate(sources):
            emb = embeddings[idx]
            doc_name = source.get("document_name")

            if doc_name and doc_name not in seen_documents:
                unique_sources.append(source)
                unique_embeddings.append(emb)
                seen_documents.add(doc_name)
                continue

            is_duplicate = any(
                self._cosine_similarity(emb, existing) > self.similarity_threshold
                for existing in unique_embeddings
            )

            if not is_duplicate:
                unique_sources.append(source)
                unique_embeddings.append(emb)
                if doc_name:
                    seen_documents.add(doc_name)

        logger.info(
            f"Deduplication: {len(sources)} → {len(unique_sources)} "
            f"(docs: {seen_documents})"
        )

        return unique_sources

    # ------------------------------------------------------------------
    # Ranking
    # ------------------------------------------------------------------

    def rank_sources(
        self,
        query: str,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Score every source by semantic similarity to the query.
        Build the final list with guaranteed min slots per type,
        then sort by score.
        """

        if not sources:
            return []

        query_emb = self._embed([query])[0]
        content_embs = self._embed([s["content"] for s in sources])

        scored = []
        for idx, source in enumerate(sources):
            score = self._cosine_similarity(query_emb, content_embs[idx])
            scored.append({**source, "relevance_score": score})

        scored.sort(key=lambda x: x["relevance_score"], reverse=True)

        vector_pool = [s for s in scored if s["source_type"] == "vector"]
        graph_pool  = [s for s in scored if s["source_type"] == "graph"]

        reserved_vector = vector_pool[:self.min_vector_sources]
        reserved_graph  = graph_pool[:self.min_graph_sources]

        reserved_ids = {id(s) for s in reserved_vector + reserved_graph}

        remaining_slots = (
            self.max_sources - len(reserved_vector) - len(reserved_graph)
        )

        top_remaining = [
            s for s in scored if id(s) not in reserved_ids
        ][:remaining_slots]

        final = reserved_vector + reserved_graph + top_remaining
        final.sort(key=lambda x: x["relevance_score"], reverse=True)

        logger.info(
            f"Ranked → {len(final)} sources | "
            f"reserved: {len(reserved_vector)}v + {len(reserved_graph)}g | "
            f"remaining: {remaining_slots}"
        )

        return final

    # ------------------------------------------------------------------
    # Public pipeline
    # ------------------------------------------------------------------

    def process_sources(
        self,
        query: str,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        unique = self.remove_duplicates(sources)
        ranked = self.rank_sources(query, unique)

        logger.info(
            f"Pipeline: {len(sources)} raw → "
            f"{len(unique)} unique → {len(ranked)} final"
        )

        return ranked