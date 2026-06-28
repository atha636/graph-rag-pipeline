
import time
from collections import OrderedDict
from typing import Optional, List, Dict, Any

import numpy as np
from sentence_transformers import SentenceTransformer
from loguru import logger

from src.core.exceptions import CacheError


class SemanticCacheEntry:
    def __init__(
        self,
        query:      str,
        embedding:  np.ndarray,
        answer:     str,
        sources:    List[Dict[str, Any]],
        documents:  List[str],
        latency_ms: float,
    ):
        self.query      = query
        self.embedding  = embedding
        self.answer     = answer
        self.sources    = sources
        self.documents  = documents
        self.latency_ms = latency_ms
        self.created_at = time.time()
        self.hits       = 0


class CacheService:
    """
    Semantic similarity cache for Graph RAG queries.
    """

    def __init__(
        self,
        embedding_model:    SentenceTransformer,
        similarity_threshold: float = 0.92,
        max_entries:        int    = 200,
        ttl_seconds:        int    = 3600,   # 1 hour
    ):
        self.model               = embedding_model
        self.similarity_threshold = similarity_threshold
        self.max_entries         = max_entries
        self.ttl_seconds         = ttl_seconds

        # OrderedDict preserves insertion order for LRU eviction
        self._cache: OrderedDict[str, SemanticCacheEntry] = OrderedDict()

        self.total_requests = 0
        self.cache_hits     = 0

        logger.info(
            f"Cache Service initialized "
            f"(threshold={similarity_threshold}, "
            f"max={max_entries}, ttl={ttl_seconds}s)"
        )

    # ── public API ────────────────────────────────────────────────

    def get(self, query: str) -> Optional[SemanticCacheEntry]:
        """
        Return a cached entry if a semantically similar query
        was answered recently, otherwise return None.
        """
        self.total_requests += 1
        self._evict_expired()

        if not self._cache:
            return None

        try:
            query_emb = self._embed(query)

            best_score = -1.0
            best_key:  Optional[str] = None

            for key, entry in self._cache.items():
                score = float(np.dot(query_emb, entry.embedding))
                if score > best_score:
                    best_score = score
                    best_key   = key

            if best_score >= self.similarity_threshold and best_key:
                entry = self._cache[best_key]
                # Move to end (most-recently-used)
                self._cache.move_to_end(best_key)
                entry.hits += 1
                self.cache_hits += 1

                logger.info(
                    f"Cache HIT (score={best_score:.3f}, "
                    f"hits={entry.hits}): '{entry.query[:60]}'"
                )
                return entry

            logger.debug(
                f"Cache MISS (best_score={best_score:.3f}): '{query[:60]}'"
            )
            return None

        except Exception as e:
            logger.warning(f"Cache lookup failed, continuing: {e}")
            return None

    def set(
        self,
        query:      str,
        answer:     str,
        sources:    List[Dict[str, Any]],
        documents:  List[str],
        latency_ms: float,
    ) -> None:
        """Store a new query-answer pair in the cache."""
        try:
            embedding = self._embed(query)
            entry     = SemanticCacheEntry(
                query=query,
                embedding=embedding,
                answer=answer,
                sources=sources,
                documents=documents,
                latency_ms=latency_ms,
            )
            self._cache[query] = entry
            self._cache.move_to_end(query)

            # LRU eviction when over capacity
            while len(self._cache) > self.max_entries:
                evicted_key, _ = self._cache.popitem(last=False)
                logger.debug(f"Cache evicted: '{evicted_key[:40]}'")

            logger.info(f"Cache SET: '{query[:60]}'")

        except Exception as e:
            logger.warning(f"Cache set failed, continuing: {e}")

    @property
    def hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.cache_hits / self.total_requests

    @property
    def size(self) -> int:
        return len(self._cache)

    def clear(self) -> None:
        self._cache.clear()
        logger.info("Cache cleared")

    def stats(self) -> Dict[str, Any]:
        return {
            "size":           self.size,
            "max_entries":    self.max_entries,
            "total_requests": self.total_requests,
            "cache_hits":     self.cache_hits,
            "hit_rate":       round(self.hit_rate, 3),
            "ttl_seconds":    self.ttl_seconds,
        }

    # ── internals ─────────────────────────────────────────────────

    def _embed(self, text: str) -> np.ndarray:
        return self.model.encode(
            text,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def _evict_expired(self) -> None:
        now     = time.time()
        expired = [
            k for k, v in self._cache.items()
            if now - v.created_at > self.ttl_seconds
        ]
        for k in expired:
            del self._cache[k]
        if expired:
            logger.debug(f"Cache evicted {len(expired)} expired entries")