from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.exceptions import LLMServiceError


class LLMService:
    """
    Handles LLM generation using Groq.
    """

    def __init__(self) -> None:
        try:
            logger.info(
                "Initializing Groq LLM Service..."
            )

            self.client = Groq(
                api_key=settings.GROQ_API_KEY
            )

            logger.info(
                "Groq client initialized successfully"
            )

        except Exception as error:
            logger.exception(
                "Failed to initialize Groq client"
            )

            raise LLMServiceError(
                str(error)
            ) from error


    def generate_response(
        self,
        question: str,
        vector_context: str,
        graph_context: str
    ) -> str:
        """
        Generate a grounded response.
        """

        try:

            system_prompt = """
You are an enterprise AI assistant using Graph RAG.

Rules:
1. Answer only from the provided context.
2. Do not use outside knowledge.
3. If the answer does not exist in the context,
   say "I do not have enough information."
4. Use graph relationships when helpful.
5. Keep answers concise and factual.
"""

            user_prompt = f"""
QUESTION:
{question}


VECTOR CONTEXT:
{vector_context}


GRAPH CONTEXT:
{graph_context}


ANSWER:
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
                            "content": user_prompt
                        }
                    ],
                    temperature=0.2,
                    max_tokens=500
                )
            )

            answer = (
                response.choices[0]
                .message.content
            )

            logger.info(
                "LLM response generated successfully"
            )

            return answer


        except Exception as error:

            logger.exception(
                "LLM generation failed"
            )

            raise LLMServiceError(
                str(error)
            ) from error