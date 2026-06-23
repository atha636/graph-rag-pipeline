from typing import List

from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.exceptions import LLMServiceError
from src.core.utils import extract_json


class EntityExtractionService:
    """
    Extracts named entities from natural language queries.
    """

    def __init__(self) -> None:
        try:
            logger.info("Initializing Entity Extraction Service")

            self.client = Groq(api_key=settings.GROQ_API_KEY)

            logger.info("Entity extraction model ready")

        except Exception as error:
            logger.exception("Entity service initialization failed")
            raise LLMServiceError(str(error)) from error

    def extract_entities(self, query: str) -> List[str]:
        """
        Extract named entities from a user question.
        Returns a deduplicated list of entity strings.
        Falls back to an empty list on any failure so the
        query pipeline can continue with vector search alone.
        """

        system_prompt = """
You are a named entity extraction system.

Extract only the important named entities from the question.
Named entities include: people, companies, products, places, and technologies.

Return ONLY a valid JSON array of strings. No explanations. No markdown.

Examples:

Question: Who founded SpaceX?
Output: ["SpaceX"]

Question: What did Elon Musk build?
Output: ["Elon Musk"]

Question: Tell me about Tesla and Elon Musk.
Output: ["Tesla", "Elon Musk"]

Question: What is the Starship rocket?
Output: ["Starship"]

Question: What happened in 2023?
Output: []
"""

        try:
            response = self.client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": query},
                ],
                temperature=0,
                max_tokens=150,
            )

            content = response.choices[0].message.content.strip()

            # FIX: old code used bare json.loads() which crashes
            # when the LLM wraps the output in ```json ... ``` fences.
            # extract_json() handles all common LLM formatting quirks.
            raw = extract_json(content)

            if not isinstance(raw, list):
                logger.warning(
                    f"Entity extraction returned non-list: {raw}"
                )
                return []

            entities = list({
                str(e).strip()
                for e in raw
                if isinstance(e, str) and e.strip()
            })

            logger.info(f"Extracted entities: {entities}")
            return entities

        except Exception as error:
            # Non-fatal: fall back to empty list so vector search still runs.
            logger.warning(f"Entity extraction failed, continuing: {error}")
            return []