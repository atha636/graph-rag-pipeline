import json
from typing import List, Dict

from groq import Groq
from loguru import logger

from src.core.config import settings


class RelationshipExtractionService:
    """
    Extract relationships from text using LLM.
    """

    def __init__(self):
        logger.info(
            "Initializing Relationship Extraction Service"
        )

        self.client = Groq(
            api_key=settings.GROQ_API_KEY
        )

        logger.info(
            "Relationship extraction model ready"
        )


    def extract_relationships(
        self,
        text: str
    ) -> List[Dict]:
        """
        Extract entity relationships from text.
        """

        prompt = f"""
Extract relationships from the text.

Return ONLY a valid JSON array.

Format:
[
    {{
        "source": "Entity A",
        "relationship": "RELATION",
        "target": "Entity B"
    }}
]

Rules:
- Relationship should be uppercase.
- Use concise relationship names.
- Do not add explanations.

Text:
{text}
"""

        try:
            response = (
                self.client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature=0
                )
            )

            content = (
                response
                .choices[0]
                .message.content
                .strip()
            )

            relationships = json.loads(content)

            logger.info(
                f"Extracted {len(relationships)} relationships"
            )

            return relationships


        except Exception as error:
            logger.exception(
                "Relationship extraction failed"
            )

            return []