"""
LLM Service — Groq-backed answer generation.

Upgrades over original:
- Multi-turn conversation history injected into every prompt
- Streaming support (returns generator for SSE endpoint)
- Richer system prompt with explicit chain-of-thought instruction
- Token usage logging for cost tracking
"""

from typing import List, Dict, Optional, Generator

from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.exceptions import LLMServiceError


SYSTEM_PROMPT = """You are an expert enterprise AI assistant powered by Graph RAG \
(Retrieval-Augmented Generation with a knowledge graph).

Your job is to answer the user's question using ONLY the provided context below.

Rules:
1. Answer only from VECTOR CONTEXT and GRAPH CONTEXT provided — never use outside knowledge.
2. If the context does not contain enough information, say clearly: \
"I don't have enough information in the uploaded documents to answer this."
3. When graph relationships are relevant, reference them explicitly \
(e.g. "According to the knowledge graph, Elon Musk FOUNDED Tesla").
4. Keep answers factual, concise and well-structured. Use markdown formatting.
5. If comparing across documents, state which document each fact comes from.
6. Maintain continuity with the conversation history when provided.
"""


class LLMService:

    def __init__(self) -> None:
        try:
            logger.info("Initializing Groq LLM Service...")
            self.client = Groq(api_key=settings.GROQ_API_KEY)
            logger.info("Groq client initialized")
        except Exception as e:
            raise LLMServiceError(str(e)) from e

    def _build_messages(
        self,
        question:       str,
        vector_context: str,
        graph_context:  str,
        history:        Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        """
        Build the full message list for the Groq API call.
        Injects conversation history between the system prompt
        and the current user turn.
        """
        user_content = f"""CONVERSATION HISTORY provides prior context.
Use it to answer follow-up questions coherently.

VECTOR CONTEXT (from document chunks):
{vector_context or "No vector results available."}

GRAPH CONTEXT (from knowledge graph):
{graph_context or "No graph results available."}

QUESTION: {question}

ANSWER:"""

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Inject prior turns for multi-turn memory
        if history:
            messages.extend(history)

        messages.append({"role": "user", "content": user_content})
        return messages

    def generate_response(
        self,
        question:       str,
        vector_context: str,
        graph_context:  str,
        history:        Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Generate a complete answer (non-streaming)."""
        try:
            messages = self._build_messages(
                question, vector_context, graph_context, history
            )

            response = self.client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                temperature=0.2,
                max_tokens=800,
            )

            answer = response.choices[0].message.content

            # Log token usage for cost tracking
            usage = response.usage
            logger.info(
                f"LLM tokens — prompt: {usage.prompt_tokens}, "
                f"completion: {usage.completion_tokens}, "
                f"total: {usage.total_tokens}"
            )

            return answer

        except Exception as e:
            logger.exception("LLM generation failed")
            raise LLMServiceError(str(e)) from e

    def generate_stream(
        self,
        question:       str,
        vector_context: str,
        graph_context:  str,
        history:        Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        """
        Streaming answer generator.
        Yields text chunks as they arrive from Groq.
        Used by the SSE endpoint in main.py.
        """
        try:
            messages = self._build_messages(
                question, vector_context, graph_context, history
            )

            stream = self.client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                temperature=0.2,
                max_tokens=800,
                stream=True,
            )

            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content

        except Exception as e:
            logger.exception("LLM streaming failed")
            raise LLMServiceError(str(e)) from e