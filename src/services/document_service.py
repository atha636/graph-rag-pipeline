"""
Document Ingestion Service — optimised + summarization pipeline.

Pipeline:
  1. Extract text from PDF/DOCX/TXT
  2. Generate document summary (Groq) → store in Neo4j
  3. Chunk text
  4. Batch-embed all chunks (single model call)
  5. Batch-upsert to Pinecone (100 vectors/call)
  6. Sample every Nth chunk for relationship extraction (Groq)
  7. Batch-write relationships to Neo4j via UNWIND

All tuning constants come from config.py and can be changed via .env.
"""

from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from pypdf import PdfReader
from docx import Document
from loguru import logger

from src.core.config import settings
from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.entity_service import EntityExtractionService
from src.services.relationship_service import RelationshipExtractionService
from src.services.summarization_service import SummarizationService


class DocumentService:

    def __init__(
        self,
        vector_service:        VectorService,
        graph_service:         GraphService,
        entity_service:        EntityExtractionService,
        relationship_service:  RelationshipExtractionService,
        summarization_service: Optional[SummarizationService] = None,
        chunk_size:    int = settings.CHUNK_SIZE,
        chunk_overlap: int = settings.CHUNK_OVERLAP,
    ):
        self.vector_service        = vector_service
        self.graph_service         = graph_service
        self.entity_service        = entity_service
        self.relationship_service  = relationship_service
        self.summarization_service = summarization_service
        self.chunk_size            = chunk_size
        self.chunk_overlap         = chunk_overlap

        logger.info(
            f"Document Service ready "
            f"(chunk={chunk_size}, overlap={chunk_overlap}, "
            f"graph_sample=1/{settings.GRAPH_SAMPLE_RATE})"
        )

    # ── Text extraction ───────────────────────────────────────────────

    def extract_text(self, file_path: str) -> str:
        path = Path(file_path)
        ext  = path.suffix.lower()
        if ext == ".pdf":   return self._read_pdf(path)
        if ext == ".docx":  return self._read_docx(path)
        if ext == ".txt":   return path.read_text(encoding="utf-8")
        raise ValueError(f"Unsupported file type: {ext}")

    def _read_pdf(self, path: Path) -> str:
        logger.info(f"Reading PDF: {path.name}")
        reader = PdfReader(path)
        pages  = [p.extract_text() for p in reader.pages if p.extract_text()]
        result = "\n".join(pages)
        logger.info(f"Extracted {len(result):,} chars from {len(pages)} pages")
        return result

    def _read_docx(self, path: Path) -> str:
        logger.info(f"Reading DOCX: {path.name}")
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    # ── Chunking ──────────────────────────────────────────────────────

    def chunk_text(self, text: str) -> List[str]:
        chunks, start = [], 0
        step = self.chunk_size - self.chunk_overlap
        while start < len(text):
            chunk = text[start: start + self.chunk_size].strip()
            if chunk:
                chunks.append(chunk)
            start += step
        logger.info(f"Created {len(chunks)} chunks")
        return chunks

    # ── Main ingestion pipeline ───────────────────────────────────────

    def ingest_document(
        self,
        file_path:         str,
        original_filename: Optional[str] = None,
        document_id:       Optional[str] = None,
        uploaded_at:       Optional[str] = None,
    ) -> dict:

        logger.info(f"Ingestion start: {file_path}")
        document_name = original_filename or Path(file_path).name
        doc_type      = Path(file_path).suffix

        # ── Step 1: Extract text ──────────────────────────────────────
        text = self.extract_text(file_path)
        if not text.strip():
            logger.warning("No text extracted")
            return {
                "status": "error", "document_id": document_id,
                "document_name": document_name,
                "chunks_processed": 0, "vectors_created": 0,
                "relationships_added": 0, "summary": "",
            }

        # ── Step 2: Generate + store document summary ─────────────────
        summary = ""
        if self.summarization_service:
            logger.info("Generating document summary…")
            summary = self.summarization_service.summarize_document(
                text, document_name
            )
            if summary:
                self.summarization_service.store_summary_in_graph(
                    self.graph_service, document_id, document_name, summary
                )

        # ── Step 3: Chunk ─────────────────────────────────────────────
        chunks = self.chunk_text(text)

        # ── Step 4: Batch-embed all chunks ────────────────────────────
        logger.info(f"Batch-embedding {len(chunks)} chunks…")
        embeddings = self.vector_service.batch_embed(chunks)

        # ── Step 5: Batch-upsert to Pinecone ──────────────────────────
        vector_ids: List[str] = []
        batch:      list      = []

        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            vid = str(uuid4())
            vector_ids.append(vid)
            batch.append({
                "id":     vid,
                "values": emb,
                "metadata": {
                    "text":          chunk,
                    "document_name": document_name,
                    "document_type": doc_type,
                    "document_id":   document_id,
                    "uploaded_at":   uploaded_at,
                    "chunk_id":      idx,
                    "chunk_size":    len(chunk),
                },
            })

            if len(batch) >= settings.PINECONE_BATCH_SIZE:
                self._flush_pinecone(batch)
                logger.info(f"Pinecone: upserted {idx + 1}/{len(chunks)}")
                batch = []

        if batch:
            self._flush_pinecone(batch)

        logger.info(f"Pinecone: {len(vector_ids)} vectors stored")

        # ── Step 6: Selective relationship extraction ──────────────────
        sampled = [
            c for i, c in enumerate(chunks)
            if i % settings.GRAPH_SAMPLE_RATE == 0
            and len(c) >= settings.GRAPH_MIN_CHUNK_LEN
        ]

        logger.info(
            f"Graph extraction: {len(sampled)}/{len(chunks)} chunks sampled"
        )

        all_rels: List[dict] = []
        for i, chunk in enumerate(sampled):
            rels = self.relationship_service.extract_relationships(chunk)
            all_rels.extend(rels)
            if (i + 1) % 10 == 0:
                logger.info(
                    f"Graph: {i + 1}/{len(sampled)} chunks, "
                    f"{len(all_rels)} relations so far"
                )

        # ── Step 7: Batch-write to Neo4j ──────────────────────────────
        total_rels = self._flush_neo4j(all_rels)

        logger.info(
            f"Ingestion complete — "
            f"{len(chunks)} chunks, "
            f"{len(vector_ids)} vectors, "
            f"{total_rels} relationships"
        )

        return {
            "status":              "success",
            "document_id":         document_id,
            "document_name":       document_name,
            "uploaded_at":         uploaded_at,
            "chunks_processed":    len(chunks),
            "vectors_created":     len(vector_ids),
            "relationships_added": total_rels,
            "summary":             summary,
        }

    # ── Internal helpers ──────────────────────────────────────────────

    def _flush_pinecone(self, batch: list) -> None:
        self.vector_service.index.upsert(
            vectors=batch,
            namespace=settings.PINECONE_NAMESPACE,
        )

    def _flush_neo4j(self, relationships: List[dict]) -> int:
        if not relationships:
            return 0

        from collections import defaultdict
        from src.services.graph_service import _sanitize_relation

        # Deduplicate triples
        seen, unique = set(), []
        for r in relationships:
            src = r.get("source", "").strip()
            rel = r.get("relationship", "").strip().upper().replace(" ", "_")
            tgt = r.get("target", "").strip()
            if src and rel and tgt and (src, rel, tgt) not in seen:
                seen.add((src, rel, tgt))
                unique.append({"source": src, "relationship": rel, "target": tgt})

        if not unique:
            return 0

        # Group by type for typed MERGE
        by_type: dict = defaultdict(list)
        for r in unique:
            by_type[r["relationship"]].append(r)

        total = 0
        with self.graph_service.driver.session() as session:
            for rel_type, triples in by_type.items():
                try:
                    safe = _sanitize_relation(rel_type)
                    session.run(
                        f"""
                        UNWIND $rows AS row
                        MERGE (a:Entity {{name: row.source}})
                        MERGE (b:Entity {{name: row.target}})
                        MERGE (a)-[:`{safe}`]->(b)
                        """,
                        rows=[{"source": r["source"], "target": r["target"]}
                              for r in triples],
                    )
                    total += len(triples)
                except ValueError as e:
                    logger.warning(f"Skipping unsafe relation: {e}")

        logger.info(f"Neo4j: {total} relationships written")
        return total