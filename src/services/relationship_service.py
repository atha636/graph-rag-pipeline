import json
from typing import List, Dict

from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.utils import extract_json


class RelationshipExtractionService:
    """
    Extracts entity relationships from document chunks using an LLM.
    """

    def __init__(self):
        logger.info("Initializing Relationship Extraction Service")

        self.client = Groq(api_key=settings.GROQ_API_KEY)

        logger.info("Relationship extraction model ready")

    def extract_relationships(self, text: str) -> List[Dict]:
        """
        Extract (source, relationship, target) triples from a text chunk.

        Returns an empty list on any failure — this keeps ingestion
        running even when the LLM returns unexpected output.
        """

        prompt = f"""
Extract entity relationships from the text below.

Return ONLY a valid JSON array. No markdown, no explanations.

Format:
[
    {{
        "source": "Entity A",
        "relationship": "RELATION_TYPE",
        "target": "Entity B"
    }}
]

Rules:
- relationship must be UPPERCASE with underscores, e.g. FOUNDED, LEADS, DEVELOPED, PARTNERED_WITH.
- Use specific relationship names, not generic ones like RELATED_TO.
- Only include relationships that are clearly stated in the text.
- If there are no relationships, return an empty array: []

Text:
{text}
"""

        try:
            response = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=500,
            )

            content = response.choices[0].message.content.strip()

            # FIX: old code used bare json.loads() which crashes when
            # the LLM wraps output in ```json ... ``` fences.
            raw = extract_json(content)

            if not isinstance(raw, list):
                logger.warning(
                    f"Relationship extraction returned non-list: {raw}"
                )
                return []

            # Validate each triple has the required fields.
            valid = []
            for item in raw:
                if not isinstance(item, dict):
                    continue
                source       = item.get("source", "").strip()
                relationship = item.get("relationship", "").strip()
                target       = item.get("target", "").strip()

                if source and relationship and target:
                    valid.append({
                        "source":       source,
                        "relationship": relationship.upper().replace(" ", "_"),
                        "target":       target,
                    })
                else:
                    logger.debug(
                        f"Skipping incomplete triple: {item}"
                    )

            logger.info(f"Extracted {len(valid)} valid relationships")
            return valid

        except (json.JSONDecodeError, Exception) as error:
            logger.warning(
                f"Relationship extraction failed, skipping chunk: {error}"
            )
            return []