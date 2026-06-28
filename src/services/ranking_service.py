"""
Ranking Service — MMR-enhanced source ranking.

Upgrade over previous version: uses Maximal Marginal Relevance (MMR)
instead of pure top-N by score. MMR balances relevance vs diversity:

  MMR score = λ * sim(query, doc) - (1-λ) * max_sim(doc, selected_docs)

A document that is highly relevant to the query BUT very similar to an
already-selected document gets penalised. This prevents the response
from being flooded with near-identical chunks from one section of a
document, and ensures different aspects / documents are represented.

λ (RANKING_MMR_LAMBDA in config):
  1.0 = pure relevance (old behaviour)
  0.5 = equal weight to relevance and diversity
  0.7 = default — favours relevance but diversifies when tied
"""

from typing import List, Dict, Any, Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.config import settings


class RankingService:

    def __init__(
        self,
        embedding_model:      Optional[SentenceTransformer] = None,
        similarity_threshold: float = settings.CACHE_SIMILARITY_THRESHOLD,
        min_vector_sources:   int   = settings.RANKING_MIN_VECTOR,
        min_graph_sources:    int   = settings.RANKING_MIN_GRAPH,
        max_sources:          int   = settings.RANKING_MAX_SOURCES,
        mmr_lambda:           float = settings.RANKING_MMR_LAMBDA,
    ):
        self.similarity_threshold = similarity_threshold
        self.min_vector_sources   = min_vector_sources
        self.min_graph_sources    = min_graph_sources
        self.max_sources          = max_sources
        self.mmr_lambda           = mmr_lambda

        if embedding_model is not None:
            self.model = embedding_model
            logger.info("RankingService using shared embedding model")
        else:
            logger.info("Loading embedding model for ranking…")
            self.model = SentenceTransformer(settings.EMBEDDING_MODEL)

        logger.info(
            f"Ranking Service initialized "
            f"(MMR λ={mmr_lambda}, max={max_sources})"
        )

    # ── Helpers ───────────────────────────────────────────────────────

    def _embed(self, texts: List[str]) -> np.ndarray:
        return self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def _cos(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b))

    # ── Deduplication ─────────────────────────────────────────────────

    def remove_duplicates(
        self,
        sources: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Remove near-duplicate sources using cosine similarity."""
        if not sources:
            return []

        embeddings    = self._embed([s["content"] for s in sources])
        unique        : List[Dict[str, Any]] = []
        unique_embs   : List[np.ndarray]     = []
        seen_documents: set                  = set()

        for idx, source in enumerate(sources):
            emb      = embeddings[idx]
            doc_name = source.get("document_name")

            # Always keep first chunk from each unique document
            if doc_name and doc_name not in seen_documents:
                unique.append(source)
                unique_embs.append(emb)
                seen_documents.add(doc_name)
                continue

            is_dup = any(
                self._cos(emb, e) > self.similarity_threshold
                for e in unique_embs
            )
            if not is_dup:
                unique.append(source)
                unique_embs.append(emb)
                if doc_name:
                    seen_documents.add(doc_name)

        logger.info(
            f"Dedup: {len(sources)} → {len(unique)} "
            f"(docs: {seen_documents})"
        )
        return unique

    # ── MMR Ranking ───────────────────────────────────────────────────

    def rank_sources(
        self,
        query:   str,
        sources: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Rank sources using Maximal Marginal Relevance.

        Guarantees min_vector_sources and min_graph_sources slots,
        then fills the rest greedily with MMR.
        """
        if not sources:
            return []

        query_emb    = self._embed([query])[0]
        content_embs = self._embed([s["content"] for s in sources])

        # Compute relevance scores
        relevance = [self._cos(query_emb, e) for e in content_embs]
        scored    = [
            {**s, "relevance_score": relevance[i], "_emb": content_embs[i]}
            for i, s in enumerate(sources)
        ]
        scored.sort(key=lambda x: x["relevance_score"], reverse=True)

        # Split into type pools
        vector_pool = [s for s in scored if s["source_type"] == "vector"]
        graph_pool  = [s for s in scored if s["source_type"] == "graph"]

        # Reserve guaranteed slots
        reserved = (
            vector_pool[:self.min_vector_sources] +
            graph_pool[:self.min_graph_sources]
        )
        reserved_ids = {id(s) for s in reserved}
        remaining    = [s for s in scored if id(s) not in reserved_ids]

        # MMR greedy selection for remaining slots
        n_remaining = self.max_sources - len(reserved)
        selected    = list(reserved)

        while len(selected) < self.max_sources and remaining:
            best_score = -1.0
            best_idx   = 0

            for i, candidate in enumerate(remaining):
                rel = candidate["relevance_score"]

                # Penalise by max similarity to already-selected docs
                if selected:
                    max_sim = max(
                        self._cos(candidate["_emb"], s["_emb"])
                        for s in selected
                    )
                else:
                    max_sim = 0.0

                mmr = self.mmr_lambda * rel - (1 - self.mmr_lambda) * max_sim

                if mmr > best_score:
                    best_score = mmr
                    best_idx   = i

            chosen = remaining.pop(best_idx)
            chosen["relevance_score"] = best_score   # store MMR score
            selected.append(chosen)

        # Clean up internal embedding field
        final = []
        for s in selected:
            s_clean = {k: v for k, v in s.items() if k != "_emb"}
            final.append(s_clean)

        # Sort final result by relevance_score descending
        final.sort(key=lambda x: x["relevance_score"], reverse=True)

        logger.info(
            f"MMR ranking: {len(sources)} → {len(final)} sources "
            f"(λ={self.mmr_lambda}, "
            f"reserved {len(reserved)}, "
            f"MMR-selected {len(final) - len(reserved)})"
        )
        return final

    # ── Pipeline ──────────────────────────────────────────────────────

    def process_sources(
        self,
        query:   str,
        sources: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        unique = self.remove_duplicates(sources)
        ranked = self.rank_sources(query, unique)
        logger.info(
            f"Ranking pipeline: {len(sources)} raw → "
            f"{len(unique)} unique → {len(ranked)} final"
        )
        return ranked