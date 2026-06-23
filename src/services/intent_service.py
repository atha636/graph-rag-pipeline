from groq import Groq
from loguru import logger

from src.core.config import settings


class IntentExtractionService:
    """
    Classifies a user query into a Neo4j relationship type
    so graph search can be filtered to the most relevant edges.
    """

    # FIX: the original service only had 3 intents (FOUNDED, DEVELOPED, LEADS).
    # Most real-world queries fell through to UNKNOWN which meant graph search
    # always ran as a broad unfiltered match — expensive and noisy.
    # Expanded to 10 common relationship types covering typical document content.
    ALLOWED_INTENTS = {
        "FOUNDED",          # Who created / started a company?
        "DEVELOPED",        # What did X build / engineer?
        "LEADS",            # Who is CEO / head of X?
        "OWNS",             # Who owns X?
        "INVESTED_IN",      # Who invested in X?
        "PARTNERED_WITH",   # Who partnered with X?
        "ACQUIRED",         # Who bought X?
        "WORKS_AT",         # Where does X work?
        "LOCATED_IN",       # Where is X based?
        "UNKNOWN",          # Fallback — use broad graph search
    }

    def __init__(self):
        logger.info("Initializing Intent Extraction Service")

        self.client = Groq(api_key=settings.GROQ_API_KEY)

        logger.info("Intent extraction model ready")

    def extract_intent(self, query: str) -> str:
        """
        Return the single most likely relationship intent for the query.
        Always returns a value from ALLOWED_INTENTS.
        """

        intents_list = "\n".join(
            f"- {i}" for i in sorted(self.ALLOWED_INTENTS)
            if i != "UNKNOWN"
        )

        prompt = f"""
You are a relationship intent classifier for a knowledge graph system.

Given a user question, return the single most relevant relationship type
from the list below. Return ONLY that one word. No punctuation, no explanation.

Relationship types:
{intents_list}
- UNKNOWN (use this if none of the above clearly applies)

Examples:
Question: Who founded Tesla?         → FOUNDED
Question: Who is CEO of SpaceX?      → LEADS
Question: What did Apple develop?    → DEVELOPED
Question: Who bought Twitter?        → ACQUIRED
Question: Where is Google based?     → LOCATED_IN
Question: Tell me about the report   → UNKNOWN

Question: {query}
"""

        try:
            response = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=20,
            )

            intent = (
                response.choices[0].message.content
                .strip()
                .upper()
                .split()[0]          # take only the first word
                .rstrip(".,;:")      # strip stray punctuation
            )

            if intent not in self.ALLOWED_INTENTS:
                logger.info(
                    f"Intent '{intent}' not in allowed set, using UNKNOWN"
                )
                intent = "UNKNOWN"

            logger.info(f"Extracted intent: {intent}")
            return intent

        except Exception as error:
            logger.warning(f"Intent extraction failed, using UNKNOWN: {error}")
            return "UNKNOWN"