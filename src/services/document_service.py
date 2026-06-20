from pathlib import Path
from typing import List

from pypdf import PdfReader
from docx import Document
from loguru import logger

from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.entity_service import EntityExtractionService


class DocumentService:
    """
    Handles document parsing, chunking,
    vector storage and graph generation.
    """

    def __init__(
        self,
        vector_service: VectorService,
        graph_service: GraphService,
        entity_service: EntityExtractionService,
        chunk_size: int = 500,
        chunk_overlap: int = 100
    ):
        self.vector_service = vector_service
        self.graph_service = graph_service
        self.entity_service = entity_service

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
        Extract text from PDF file.
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
        Extract text from DOCX file.
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
                chunks.append(chunk)

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
        Extract document text and
        convert it into chunks.
        """

        logger.info(
            f"Processing document: {file_path}"
        )

        text = self.extract_text(
            file_path
        )

        return self.chunk_text(text)

    def ingest_document(
        self,
        file_path: str
    ) -> dict:
        """
        Process document and store data
        into Pinecone and Neo4j.
        """

        logger.info(
            f"Starting ingestion: {file_path}"
        )

        chunks = self.process_document(
            file_path
        )

        vector_ids = []

        for chunk in chunks:

            # Store chunk in Pinecone with metadata
            vector_id = self.vector_service.upsert_document(
                text=chunk,
                metadata={
                    "source": file_path,
                    "document_type": Path(file_path).suffix
                }
            )

            vector_ids.append(
                vector_id
            )

            # Extract entities from chunk
            entities = (
                self.entity_service
                .extract_entities(chunk)
            )

            logger.info(
                f"Entities found: {entities}"
            )

            # Create graph relationships
            for i in range(
                len(entities) - 1
            ):
                self.graph_service.create_relationship(
                    entities[i],
                    "RELATED_TO",
                    entities[i + 1]
                )

        logger.info(
            "Document ingestion completed"
        )

        return {
            "status": "success",
            "chunks_processed": len(chunks),
            "vectors_created": len(vector_ids)
        }