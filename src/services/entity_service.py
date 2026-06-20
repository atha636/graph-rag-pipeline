from typing import List
import json

from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.exceptions import LLMServiceError


class EntityExtractionService:
    """
    Extracts entities from natural language queries.
    """

    def __init__(self) -> None:
        try:
            logger.info(
                "Initializing Entity Extraction Service"
            )

            self.client = Groq(
                api_key=settings.GROQ_API_KEY
            )

            logger.info(
                "Entity extraction model ready"
            )

        except Exception as error:
            logger.exception(
                "Entity service initialization failed"
            )

            raise LLMServiceError(
                str(error)
            ) from error


    def extract_entities(
        self,
        query: str
    ) -> List[str]:
        """
        Extract entities from a user question.
        """

        try:
            system_prompt = """
You are an entity extraction system.

Extract only important named entities.

Examples:

Question:
Who founded SpaceX?

Output:
["SpaceX"]

Question:
What did SpaceX develop?

Output:
["SpaceX"]

Question:
Tell me about Elon Musk.

Output:
["Elon Musk"]

Return ONLY valid JSON array.
"""


            response = (
                self.client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": system_prompt
                        },
                        {
                            "role": "user",
                            "content": query
                        }
                    ],
                    temperature=0,
                    max_tokens=100
                )
            )


            content = (
                response
                .choices[0]
                .message.content
                .strip()
            )


            entities = list(
    set(
        json.loads(content)
    )
)


            logger.info(
                f"Extracted entities: {entities}"
            )

            return entities


        except Exception as error:
            logger.exception(
                "Entity extraction failed"
            )

            raise LLMServiceError(
                str(error)
            ) from error