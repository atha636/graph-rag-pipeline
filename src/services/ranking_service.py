from typing import List, Dict, Any

import numpy as np
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.config import settings


class RankingService:
    """
    Handles source deduplication and semantic relevance ranking.

    Uses embedding-based cosine similarity for both deduplication
    and ranking, with document-diversity protection and guaranteed
    slot reservation per source type.
    """

    def __init__(
        self,
        similarity_threshold: float = 0.95,
        min_vector_sources: int = 2,
        min_graph_sources: int = 1,
        max_sources: int = 5
    ):
        # Deduplication threshold — 0.95 = near-identical text only.
        self.similarity_threshold = similarity_threshold

        # Guaranteed minimum slots per source type in the final output.
        self.min_vector_sources = min_vector_sources
        self.min_graph_sources = min_graph_sources

        # Total sources returned. Slicing is done INSIDE rank_sources()
        # (not in main.py) so the reservation guarantee is enforced
        # before the cut, not after.
        self.max_sources = max_sources

        logger.info("Loading embedding model for semantic ranking...")

        self.model = SentenceTransformer(settings.EMBEDDING_MODEL)

        logger.info("Ranking Service initialized with semantic model")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _embed(self, texts: List[str]) -> np.ndarray:
        """Return L2-normalised embeddings. Shape: (N, dim)."""
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
        """Dot product of two L2-normalised vectors = cosine similarity."""
        return float(np.dot(vec_a, vec_b))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def remove_duplicates(
        self,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Remove near-duplicate sources using cosine similarity.

        Document-diversity protection: the first chunk from each
        unique document_name is always kept, regardless of how
        similar it is to chunks from other documents. This prevents
        two topically-related documents (e.g. both about Tesla/Elon
        Musk) from having one silently removed before ranking runs.
        """

        if not sources:
            return []

        contents = [s["content"] for s in sources]
        embeddings = self._embed(contents)

        unique_sources = []
        unique_embeddings = []
        seen_documents = set()

        for idx, source in enumerate(sources):
            emb = embeddings[idx]
            doc_name = source.get("document_name")

            # Always keep the first chunk from each document.
            if doc_name and doc_name not in seen_documents:
                unique_sources.append(source)
                unique_embeddings.append(emb)
                seen_documents.add(doc_name)
                continue

            # For subsequent chunks, apply cosine similarity check.
            is_duplicate = any(
                self._cosine_similarity(emb, existing_emb)
                > self.similarity_threshold
                for existing_emb in unique_embeddings
            )

            if not is_duplicate:
                unique_sources.append(source)
                unique_embeddings.append(emb)
                if doc_name:
                    seen_documents.add(doc_name)

        logger.info(
            f"Deduplication: {len(sources)} → "
            f"{len(unique_sources)} sources "
            f"(documents represented: {seen_documents})"
        )

        return unique_sources

    def rank_sources(
        self,
        query: str,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Score sources by semantic similarity to the query, then
        build the final list of self.max_sources results while
        guaranteeing min_vector_sources and min_graph_sources slots.

        KEY DESIGN: the max_sources slice happens HERE, not in
        main.py. The previous bug was:
          1. rank_sources() returned all 19 sources (reserved items
             included but spread throughout).
          2. main.py sliced [:5] by score order.
          3. The reserved tesla_report.txt chunk scored 0.645,
             landing at position 6 — just outside the cut.

        Fix: build the final list as
            reserved_vector (up to min_vector_sources)
          + reserved_graph  (up to min_graph_sources)
          + best remaining  (filling up to max_sources total)
        THEN sort. This guarantees reserved items survive the cut
        because they are selected before remaining slots are filled.
        """

        if not sources:
            return []

        # Score every source
        query_emb = self._embed([query])[0]
        content_embs = self._embed([s["content"] for s in sources])

        scored = []
        for idx, source in enumerate(sources):
            score = self._cosine_similarity(
                query_emb,
                content_embs[idx]
            )
            scored.append({**source, "relevance_score": score})

        scored.sort(
            key=lambda item: item["relevance_score"],
            reverse=True
        )

        # Split into typed pools (already score-sorted)
        vector_pool = [
            s for s in scored if s["source_type"] == "vector"
        ]
        graph_pool = [
            s for s in scored if s["source_type"] == "graph"
        ]

        # Reserve guaranteed slots from each pool
        reserved_vector = vector_pool[:self.min_vector_sources]
        reserved_graph  = graph_pool[:self.min_graph_sources]

        reserved_ids = set(
            id(s) for s in reserved_vector + reserved_graph
        )

        # Fill remaining slots from the globally scored list,
        # skipping reserved items
        remaining_slots = (
            self.max_sources
            - len(reserved_vector)
            - len(reserved_graph)
        )

        top_remaining = [
            s for s in scored
            if id(s) not in reserved_ids
        ][:remaining_slots]

        # Merge and sort so items appear in score order in the response
        final = reserved_vector + reserved_graph + top_remaining
        final.sort(
            key=lambda item: item["relevance_score"],
            reverse=True
        )

        logger.info(
            f"Ranked → {len(final)} final sources "
            f"({len(vector_pool)} vector / {len(graph_pool)} graph total) "
            f"reserved: {len(reserved_vector)}v + {len(reserved_graph)}g | "
            f"remaining slots: {remaining_slots}"
        )

        return final

    def process_sources(
        self,
        query: str,
        sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Full pipeline: deduplicate → rank → return max_sources results.
        """

        unique_sources = self.remove_duplicates(sources)

        ranked_sources = self.rank_sources(query, unique_sources)

        logger.info(
            f"Pipeline complete: {len(unique_sources)} unique → "
            f"{len(ranked_sources)} final sources"
        )

        return ranked_sources