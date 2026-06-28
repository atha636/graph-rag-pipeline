"""
Document Summarization Service

Generates a concise summary of each document immediately after ingestion.
The summary is stored in Neo4j as a :DocumentSummary node linked to the
document's entities, and returned in upload responses.

Benefits:
1. Better entity extraction — summarize first, extract from summary
   instead of raw chunks (cleaner text, higher precision)
2. "Document overview" query — users can ask "what is this document about?"
   and get an instant answer without searching chunks
3. Shows interviewers you understand multi-stage RAG pipelines

Architecture:
  Upload → chunk → embed → [summarize] → extract entities from summary
                                       → store summary in Neo4j
                                       → return summary in API response
"""

from groq import Groq
from loguru import logger

from src.core.config import settings
from src.core.exceptions import LLMServiceError


# Max characters of document text fed to the summarizer.
# A full 10 MB PDF is too long for a single LLM call — we take the
# first + last sections which capture intro/conclusion well.
SUMMARY_HEAD_CHARS = 6000
SUMMARY_TAIL_CHARS = 3000


class SummarizationService:

    def __init__(self) -> None:
        logger.info("Initializing Summarization Service")
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        logger.info("Summarization Service ready")

    def summarize_document(
        self,
        text:          str,
        document_name: str,
    ) -> str:
        """
        Generate a concise summary of a document.

        Uses head + tail of the text to stay within token limits while
        capturing the document's introduction and conclusions.
        Returns an empty string on failure (non-fatal).
        """
        if not text or len(text) < 200:
            return ""

        # Take head and tail to capture intro + conclusion
        if len(text) > SUMMARY_HEAD_CHARS + SUMMARY_TAIL_CHARS:
            excerpt = (
                text[:SUMMARY_HEAD_CHARS] +
                "\n\n[... middle section omitted ...]\n\n" +
                text[-SUMMARY_TAIL_CHARS:]
            )
        else:
            excerpt = text

        prompt = f"""You are a document summarization assistant.

Summarize the following document in 3-5 concise paragraphs.
Cover: main topic, key entities (people, companies, products),
important facts or findings, and any conclusions.

Document name: {document_name}

Document content:
{excerpt}

Summary:"""

        try:
            response = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=400,
            )

            summary = response.choices[0].message.content.strip()
            logger.info(
                f"Summary generated for '{document_name}' "
                f"({len(summary)} chars)"
            )
            return summary

        except Exception as e:
            logger.warning(f"Summarization failed for '{document_name}': {e}")
            return ""

    def store_summary_in_graph(
        self,
        graph_service,
        document_id:   str,
        document_name: str,
        summary:       str,
    ) -> None:
        """
        Store the document summary as a Neo4j node so it can be
        retrieved by the knowledge graph query and overview endpoints.
        """
        if not summary:
            return

        try:
            with graph_service.driver.session() as session:
                session.run(
                    """
                    MERGE (d:DocumentSummary {document_id: $doc_id})
                    SET d.document_name = $name,
                        d.summary       = $summary,
                        d.updated_at    = datetime()
                    """,
                    doc_id=document_id,
                    name=document_name,
                    summary=summary,
                )
            logger.info(f"Summary stored in Neo4j for doc: {document_id}")

        except Exception as e:
            logger.warning(f"Failed to store summary in Neo4j: {e}")

    def get_document_summaries(self, graph_service) -> list:
        """Return all stored document summaries from Neo4j."""
        try:
            with graph_service.driver.session() as session:
                result = session.run(
                    """
                    MATCH (d:DocumentSummary)
                    RETURN d.document_id   AS document_id,
                           d.document_name AS document_name,
                           d.summary       AS summary
                    ORDER BY d.document_name ASC
                    """
                )
                return [dict(r) for r in result]
        except Exception as e:
            logger.warning(f"Failed to fetch summaries: {e}")
            return []