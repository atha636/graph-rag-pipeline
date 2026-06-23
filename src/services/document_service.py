from pathlib import Path
from typing import List, Optional

from pypdf import PdfReader
from docx import Document
from loguru import logger

from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.entity_service import EntityExtractionService
from src.services.relationship_service import RelationshipExtractionService


class DocumentService:
    """
    Handles document parsing, chunking, vector storage,
    and knowledge graph construction.
    """

    def __init__(
        self,
        vector_service: VectorService,
        graph_service: GraphService,
        entity_service: EntityExtractionService,
        relationship_service: RelationshipExtractionService,
        chunk_size: int = 500,
        chunk_overlap: int = 100,
    ):
        self.vector_service = vector_service
        self.graph_service = graph_service
        self.entity_service = entity_service
        self.relationship_service = relationship_service
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        logger.info("Document Service initialized")

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------

    def extract_text(self, file_path: str) -> str:
        path = Path(file_path)
        ext  = path.suffix.lower()

        if ext == ".pdf":
            return self._read_pdf(path)
        if ext == ".docx":
            return self._read_docx(path)
        if ext == ".txt":
            return path.read_text(encoding="utf-8")

        raise ValueError(f"Unsupported file type: {ext}")

    def _read_pdf(self, path: Path) -> str:
        logger.info(f"Reading PDF: {path.name}")
        reader = PdfReader(path)
        return "".join(
            page.extract_text() + "\n"
            for page in reader.pages
            if page.extract_text()
        )

    def _read_docx(self, path: Path) -> str:
        logger.info(f"Reading DOCX: {path.name}")
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)

    # ------------------------------------------------------------------
    # Chunking
    # ------------------------------------------------------------------

    def chunk_text(self, text: str) -> List[str]:
        logger.info("Starting text chunking")
        chunks = []
        start  = 0

        while start < len(text):
            chunk = text[start: start + self.chunk_size].strip()
            if chunk:
                chunks.append(chunk)
            start += self.chunk_size - self.chunk_overlap

        logger.info(f"Created {len(chunks)} chunks")
        return chunks

    # ------------------------------------------------------------------
    # Ingestion pipeline
    # ------------------------------------------------------------------

    def ingest_document(
        self,
        file_path: str,
        original_filename: Optional[str] = None,
        document_id: Optional[str] = None,
        uploaded_at: Optional[str] = None,
    ) -> dict:
        """
        Full ingestion pipeline:
          1. Extract text from file.
          2. Split into overlapping chunks.
          3. Embed + store each chunk in Pinecone.
          4. Extract relationships from each chunk.
          5. Store relationships in Neo4j.
        """

        logger.info(f"Starting ingestion: {file_path}")

        document_name = original_filename or Path(file_path).name
        chunks = self.chunk_text(self.extract_text(file_path))

        vector_ids:            List[str] = []
        total_relationships:   int       = 0

        for index, chunk in enumerate(chunks):

            # --- Pinecone ---
            vector_id = self.vector_service.upsert_document(
                text=chunk,
                metadata={
                    "document_name": document_name,
                    "document_path": file_path,
                    "document_type": Path(file_path).suffix,
                    "document_id":   document_id,
                    "uploaded_at":   uploaded_at,
                    "chunk_id":      index,
                    "chunk_size":    len(chunk),
                },
            )
            vector_ids.append(vector_id)

            # --- Neo4j ---
            relationships = (
                self.relationship_service.extract_relationships(chunk)
            )

            logger.info(
                f"Chunk {index}: {len(relationships)} relationships"
            )

            for relation in relationships:
                source       = relation.get("source", "").strip()
                relationship = relation.get("relationship", "").strip()
                target       = relation.get("target", "").strip()

                if source and relationship and target:
                    # FIX: old code passed `relationship` as the third
                    # positional argument, but GraphService.create_relationship()
                    # declared its second parameter as `relation` — the names
                    # never matched when called as keyword arguments, causing
                    # silent failures where Neo4j received an empty string.
                    # Unified parameter name to `relationship` in GraphService.
                    self.graph_service.create_relationship(
                        source=source,
                        relationship=relationship,
                        target=target,
                    )
                    total_relationships += 1

        logger.info("Document ingestion completed")

        return {
            "status":              "success",
            "document_id":         document_id,
            "document_name":       document_name,
            "uploaded_at":         uploaded_at,
            "chunks_processed":    len(chunks),
            "vectors_created":     len(vector_ids),
            "relationships_added": total_relationships,
        }