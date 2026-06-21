from groq import Groq
from loguru import logger

from src.core.config import settings


class IntentExtractionService:
    """
    Extract relationship intent from user queries.
    """

    def __init__(self):
        logger.info(
            "Initializing Intent Extraction Service"
        )

        self.client = Groq(
            api_key=settings.GROQ_API_KEY
        )

        self.allowed_intents = [
            "FOUNDED",
            "DEVELOPED",
            "LEADS",
            "UNKNOWN"
        ]

        logger.info(
            "Intent extraction model ready"
        )


    def extract_intent(
        self,
        query: str
    ) -> str:
        """
        Extract graph relationship intent.
        """

        prompt = f"""
You are an intent classifier.

Determine the relationship intent
from the user's question.

Possible intents:

FOUNDED:
- Who founded a company?
- Who created something?

DEVELOPED:
- What did a company develop?
- What was built by someone?

LEADS:
- Who leads a company?
- Who is CEO of something?

UNKNOWN:
- If no relationship is clear.


Return ONLY one word.

Question:
{query}
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

            intent = (
                response
                .choices[0]
                .message
                .content
                .strip()
                .upper()
            )

            if intent not in self.allowed_intents:
                intent = "UNKNOWN"

            logger.info(
                f"Extracted intent: {intent}"
            )

            return intent


        except Exception as error:

            logger.exception(
                "Intent extraction failed"
            )

            return "UNKNOWN"