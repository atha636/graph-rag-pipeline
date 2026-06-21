from typing import List, Dict, Any
from difflib import SequenceMatcher

from loguru import logger


class RankingService:
    """
    Handles source deduplication
    and relevance ranking.
    """

    def __init__(self, similarity_threshold: float = 0.75):
        self.similarity_threshold = similarity_threshold

        logger.info("Ranking Service initialized")

    def _similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between texts.
        """

        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()

    def remove_duplicates(self, sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove duplicate information.
        """

        unique_sources = []

        for source in sources:

            is_duplicate = False

            for existing in unique_sources:

                score = self._similarity(source["content"], existing["content"])

                if score > self.similarity_threshold:
                    is_duplicate = True
                    break

            if not is_duplicate:
                unique_sources.append(source)

        logger.info(
            f"Removed duplicates. "
            f"{len(sources)} → "
            f"{len(unique_sources)} sources"
        )

        return unique_sources

    def rank_sources(
        self, query: str, sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Rank sources by query similarity.
        """

        ranked = []

        for source in sources:

            score = self._similarity(query, source["content"])

            ranked.append({**source, "relevance_score": score})

        ranked.sort(key=lambda item: (item["relevance_score"]), reverse=True)

        logger.info("Sources ranked by relevance")

        return ranked

    def process_sources(
        self, query: str, sources: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Full source processing pipeline.
        """

        unique_sources = self.remove_duplicates(sources)

        ranked_sources = self.rank_sources(query, unique_sources)

        logger.info(
            f"Processed {len(unique_sources)} unique sources"
        )

        return ranked_sources