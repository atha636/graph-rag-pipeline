

import asyncio
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from pypdf import PdfReader
from docx import Document
from loguru import logger

from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.entity_service import EntityExtractionService
from src.services.relationship_service import RelationshipExtractionService


# ── Tuning constants ──────────────────────────────────────────────────
CHUNK_SIZE        = 1500   # chars per chunk  (was 500)
CHUNK_OVERLAP     = 200    # overlap between chunks  (was 100)
PINECONE_BATCH    = 100    # vectors per upsert call
GRAPH_SAMPLE_EVERY = 5     # only extract relations from every Nth chunk
MIN_GRAPH_LEN     = 200    # skip chunks shorter than this for graph extraction


class DocumentService:

    def __init__(
        self,
        vector_service:       VectorService,
        graph_service:        GraphService,
        entity_service:       EntityExtractionService,
        relationship_service: RelationshipExtractionService,
        chunk_size:    int = CHUNK_SIZE,
        chunk_overlap: int = CHUNK_OVERLAP,
    ):
        self.vector_service       = vector_service
        self.graph_service        = graph_service
        self.entity_service       = entity_service
        self.relationship_service = relationship_service
        self.chunk_size           = chunk_size
        self.chunk_overlap        = chunk_overlap

        logger.info(
            f"Document Service initialized "
            f"(chunk={chunk_size}, overlap={chunk_overlap})"
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
        pages  = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                pages.append(text)
        result = "\n".join(pages)
        logger.info(f"Extracted {len(result):,} chars from {len(pages)} pages")
        return result

    def _read_docx(self, path: Path) -> str:
        logger.info(f"Reading DOCX: {path.name}")
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    # ── Chunking ──────────────────────────────────────────────────────

    def chunk_text(self, text: str) -> List[str]:
        chunks = []
        start  = 0
        step   = self.chunk_size - self.chunk_overlap

        while start < len(text):
            chunk = text[start: start + self.chunk_size].strip()
            if chunk:
                chunks.append(chunk)
            start += step

        logger.info(
            f"Chunked into {len(chunks)} chunks "
            f"({self.chunk_size} chars, {self.chunk_overlap} overlap)"
        )
        return chunks

    # ── Optimised ingestion pipeline ──────────────────────────────────

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

        # ── Step 1: Extract + chunk ───────────────────────────────────
        text   = self.extract_text(file_path)
        chunks = self.chunk_text(text)

        if not chunks:
            logger.warning("No text extracted from document")
            return {
                "status": "error", "document_id": document_id,
                "document_name": document_name, "chunks_processed": 0,
                "vectors_created": 0, "relationships_added": 0,
            }

        # ── Step 2: Batch-embed ALL chunks in one shot ────────────────
        # This is single model.encode() call across all chunks —
        # orders of magnitude faster than one call per chunk.
        logger.info(f"Batch-embedding {len(chunks)} chunks…")
        embeddings = self.vector_service.batch_embed(chunks)
        logger.info("Batch embedding complete")

        # ── Step 3: Batch-upsert to Pinecone ─────────────────────────
        vector_ids: List[str] = []
        pinecone_batch: list  = []

        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vid = str(uuid4())
            vector_ids.append(vid)

            pinecone_batch.append({
                "id":     vid,
                "values": embedding,
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

            # Flush batch when it reaches PINECONE_BATCH size
            if len(pinecone_batch) >= PINECONE_BATCH:
                self._flush_pinecone(pinecone_batch)
                logger.info(
                    f"Pinecone batch upserted "
                    f"({idx + 1}/{len(chunks)} chunks)"
                )
                pinecone_batch = []

        # Flush remaining
        if pinecone_batch:
            self._flush_pinecone(pinecone_batch)
            logger.info(f"Pinecone final batch upserted ({len(chunks)} total)")

        # ── Step 4: Selective relationship extraction ─────────────────
        # Only process every GRAPH_SAMPLE_EVERY-th chunk to cut
        # Groq API calls by ~80%. For a 700-chunk doc this means
        # ~140 Groq calls instead of 700, saving ~4-5 minutes.
        sampled_chunks = [
            chunk for idx, chunk in enumerate(chunks)
            if idx % GRAPH_SAMPLE_EVERY == 0
            and len(chunk) >= MIN_GRAPH_LEN
        ]

        logger.info(
            f"Graph extraction: sampling {len(sampled_chunks)}"
            f"/{len(chunks)} chunks "
            f"(every {GRAPH_SAMPLE_EVERY}th, min_len={MIN_GRAPH_LEN})"
        )

        all_relationships: List[dict] = []
        for idx, chunk in enumerate(sampled_chunks):
            rels = self.relationship_service.extract_relationships(chunk)
            all_relationships.extend(rels)
            if (idx + 1) % 10 == 0:
                logger.info(
                    f"Graph extraction: {idx + 1}/{len(sampled_chunks)} "
                    f"chunks done, {len(all_relationships)} relations so far"
                )

        # ── Step 5: Batch-write relationships to Neo4j ────────────────
        total_relationships = self._flush_neo4j(all_relationships)

        logger.info(
            f"Ingestion complete — "
            f"{len(chunks)} chunks | "
            f"{len(vector_ids)} vectors | "
            f"{total_relationships} relationships"
        )

        return {
            "status":              "success",
            "document_id":         document_id,
            "document_name":       document_name,
            "uploaded_at":         uploaded_at,
            "chunks_processed":    len(chunks),
            "vectors_created":     len(vector_ids),
            "relationships_added": total_relationships,
        }

    # ── Internal helpers ──────────────────────────────────────────────

    def _flush_pinecone(self, batch: list) -> None:
        """Upsert a pre-built vector batch directly to Pinecone."""
        from src.core.config import settings
        self.vector_service.index.upsert(
            vectors=batch,
            namespace=settings.PINECONE_NAMESPACE,
        )

    def _flush_neo4j(self, relationships: List[dict]) -> int:
        """
        Write all relationships to Neo4j in a single UNWIND batch
        instead of one session.run() per relationship.
        """
        if not relationships:
            return 0

        # Deduplicate (source, relationship, target) triples
        seen = set()
        unique = []
        for r in relationships:
            src  = r.get("source", "").strip()
            rel  = r.get("relationship", "").strip().upper().replace(" ", "_")
            tgt  = r.get("target", "").strip()
            if src and rel and tgt:
                key = (src, rel, tgt)
                if key not in seen:
                    seen.add(key)
                    unique.append({"source": src, "relationship": rel, "target": tgt})

        if not unique:
            return 0

        # Group by relationship type so we can use typed MERGE in Cypher.
        # Neo4j doesn't allow dynamic relationship types in a single UNWIND
        # easily, so we batch per type.
        from collections import defaultdict
        by_type: dict = defaultdict(list)
        for r in unique:
            by_type[r["relationship"]].append(r)

        total = 0
        with self.graph_service.driver.session() as session:
            for rel_type, triples in by_type.items():
                try:
                    from src.services.graph_service import _sanitize_relation
                    safe_rel = _sanitize_relation(rel_type)

                    query = f"""
                    UNWIND $rows AS row
                    MERGE (a:Entity {{name: row.source}})
                    MERGE (b:Entity {{name: row.target}})
                    MERGE (a)-[:`{safe_rel}`]->(b)
                    """
                    session.run(query, rows=[
                        {"source": r["source"], "target": r["target"]}
                        for r in triples
                    ])
                    total += len(triples)

                except ValueError as e:
                    logger.warning(f"Skipping unsafe relation type: {e}")

        logger.info(f"Neo4j batch write: {total} relationships stored")
        return total