from pathlib import Path
from typing import List, Optional

from pypdf import PdfReader
from docx import Document
from loguru import logger

from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.entity_service import EntityExtractionService
from src.services.relationship_service import (
    RelationshipExtractionService
)


class DocumentService:
    """
    Handles document parsing, chunking,
    vector storage and intelligent
    graph generation.
    """

    def __init__(
        self,
        vector_service: VectorService,
        graph_service: GraphService,
        entity_service: EntityExtractionService,
        relationship_service: RelationshipExtractionService,
        chunk_size: int = 500,
        chunk_overlap: int = 100
    ):
        self.vector_service = vector_service
        self.graph_service = graph_service
        self.entity_service = entity_service
        self.relationship_service = relationship_service

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        logger.info(
            "Document Service initialized"
        )

    def extract_text(
        self,
        file_path: str
    ) -> str:
        """
        Extract text from supported documents.
        """

        path = Path(file_path)

        extension = path.suffix.lower()

        if extension == ".pdf":
            return self._read_pdf(path)

        elif extension == ".docx":
            return self._read_docx(path)

        elif extension == ".txt":
            return path.read_text(
                encoding="utf-8"
            )

        raise ValueError(
            f"Unsupported file type: {extension}"
        )

    def _read_pdf(
        self,
        path: Path
    ) -> str:
        """
        Extract text from PDF.
        """

        logger.info(
            f"Reading PDF: {path.name}"
        )

        reader = PdfReader(path)

        text = ""

        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

        return text

    def _read_docx(
        self,
        path: Path
    ) -> str:
        """
        Extract text from DOCX.
        """

        logger.info(
            f"Reading DOCX: {path.name}"
        )

        document = Document(path)

        return "\n".join(
            paragraph.text
            for paragraph in document.paragraphs
        )

    def chunk_text(
        self,
        text: str
    ) -> List[str]:
        """
        Split text into overlapping chunks.
        """

        logger.info(
            "Starting text chunking"
        )

        chunks = []

        start = 0

        while start < len(text):

            end = start + self.chunk_size

            chunk = text[start:end].strip()

            if chunk:
                chunks.append(
                    chunk
                )

            start += (
                self.chunk_size -
                self.chunk_overlap
            )

        logger.info(
            f"Created {len(chunks)} chunks"
        )

        return chunks

    def process_document(
        self,
        file_path: str
    ) -> List[str]:
        """
        Extract document and create chunks.
        """

        logger.info(
            f"Processing document: {file_path}"
        )

        text = self.extract_text(
            file_path
        )

        return self.chunk_text(
            text
        )

    def ingest_document(
        self,
        file_path: str,
        original_filename: Optional[str] = None,
        document_id: Optional[str] = None,
        uploaded_at: Optional[str] = None
    ) -> dict:
        """
        Process document and store data
        into Pinecone and Neo4j.

        original_filename / document_id / uploaded_at are optional
        so this method still works if called directly (e.g. from a
        script) without going through the /upload endpoint. When not
        provided, document_name falls back to the file_path's name,
        same as before.
        """

        logger.info(
            f"Starting ingestion: {file_path}"
        )

        # Prefer the real uploaded filename over the temp file's
        # randomly generated name (e.g. tmpjslmfo7m.txt).
        document_name = (
            original_filename
            or Path(file_path).name
        )

        chunks = self.process_document(
            file_path
        )

        vector_ids = []

        for index, chunk in enumerate(chunks):

            # Store chunk in Pinecone with metadata
            vector_id = (
                self.vector_service.upsert_document(
                    text=chunk,
                    metadata={

                        "document_name": document_name,
                        "document_path": file_path,
                        "document_type": (
                            Path(file_path).suffix
                        ),
                        "document_id": document_id,
                        "uploaded_at": uploaded_at,
                        "chunk_id": index,
                        "chunk_size": len(chunk)
                    }
                )
            )

            vector_ids.append(
                vector_id
            )

            # Extract relationships using LLM
            relationships = (
                self.relationship_service
                .extract_relationships(
                    chunk
                )
            )

            logger.info(
                f"Relationships found: {relationships}"
            )

            # Store relationships in Neo4j
            for relation in relationships:

                source = relation.get(
                    "source"
                )

                relationship = relation.get(
                    "relationship"
                )

                target = relation.get(
                    "target"
                )

                if (
                    source and
                    relationship and
                    target
                ):
                    self.graph_service.create_relationship(
                        source,
                        relationship,
                        target
                    )

        logger.info(
            "Document ingestion completed"
        )

        return {
            "status": "success",
            "document_id": document_id,
            "document_name": document_name,
            "uploaded_at": uploaded_at,
            "chunks_processed": len(chunks),
            "vectors_created": len(vector_ids)
        }