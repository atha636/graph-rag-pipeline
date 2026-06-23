import asyncio
import time
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from sentence_transformers import SentenceTransformer

from src.core.config import settings
from src.core.exceptions import GraphRAGException
from src.core.logger import configure_logger

from src.models.request import QueryRequest
from src.models.response import QueryResponse, Source

from src.services.vector_service import VectorService
from src.services.graph_service import GraphService
from src.services.llm_service import LLMService
from src.services.entity_service import EntityExtractionService
from src.services.relationship_service import RelationshipExtractionService
from src.services.intent_service import IntentExtractionService
from src.services.document_service import DocumentService
from src.services.ranking_service import RankingService

from src.api.upload import router as upload_router, initialize_document_service

configure_logger()

# Global service instances
vector_service:       VectorService                 = None
graph_service:        GraphService                  = None
llm_service:          LLMService                    = None
entity_service:       EntityExtractionService       = None
relationship_service: RelationshipExtractionService = None
intent_service:       IntentExtractionService       = None
ranking_service:      RankingService                = None
document_service:     DocumentService               = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global vector_service, graph_service, llm_service
    global entity_service, relationship_service, intent_service
    global ranking_service, document_service

    logger.info("=" * 60)
    logger.info("Starting Graph RAG API")
    logger.info("=" * 60)

    # FIX: load the embedding model ONCE and share it between
    # VectorService and RankingService. The old code loaded it
    # twice, doubling startup time and RAM usage (~1.3 GB model).
    logger.info(f"Loading shared embedding model: {settings.EMBEDDING_MODEL}")
    shared_model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Shared embedding model loaded")

    vector_service       = VectorService(embedding_model=shared_model)
    graph_service        = GraphService()
    llm_service          = LLMService()
    entity_service       = EntityExtractionService()
    relationship_service = RelationshipExtractionService()
    intent_service       = IntentExtractionService()
    ranking_service      = RankingService(embedding_model=shared_model)

    document_service = DocumentService(
        vector_service=vector_service,
        graph_service=graph_service,
        entity_service=entity_service,
        relationship_service=relationship_service,
    )

    initialize_document_service(document_service)

    logger.info("All services initialized successfully")
    logger.info("=" * 60)

    yield

    if graph_service:
        graph_service.close()

    logger.info("Application shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Advanced Graph RAG API — Neo4j + Pinecone + Groq",
    version="1.0.0",
    lifespan=lifespan,
)

# FIX: add CORS middleware so the React frontend (localhost:3000)
# can call the API from the browser without being blocked.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)


# ------------------------------------------------------------------
# Exception handler
# ------------------------------------------------------------------

@app.exception_handler(GraphRAGException)
async def application_exception_handler(
    request: Request,
    exc: GraphRAGException,
):
    logger.error(f"Application error: {exc}")
    return JSONResponse(status_code=500, content={"error": str(exc)})


# ------------------------------------------------------------------
# Health check
# ------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health():
    return {
        "status":      "healthy",
        "environment": settings.APP_ENV,
        "model":       settings.EMBEDDING_MODEL,
        "llm":         settings.LLM_MODEL,
    }


# ------------------------------------------------------------------
# Query endpoint
# ------------------------------------------------------------------

@app.post(
    "/api/v1/query",
    response_model=QueryResponse,
    tags=["Query"],
)
async def query_graph_rag(request: QueryRequest):
    """
    Main Graph RAG endpoint.

    Pipeline:
      1. Parallel: vector search + intent extraction + entity extraction
      2. Graph search for each extracted entity
      3. Deduplicate + rank all sources
      4. Build context and generate LLM answer
    """

    start_time = time.time()
    logger.info(f"Query received: '{request.query}'")

    # --- Parallel: vector search + intent + entity extraction ---
    vector_task  = asyncio.to_thread(vector_service.search, request.query)
    intent_task  = asyncio.to_thread(intent_service.extract_intent, request.query)
    entity_task  = asyncio.to_thread(entity_service.extract_entities, request.query)

    vector_results, intent, entities = await asyncio.gather(
        vector_task, intent_task, entity_task
    )

    logger.info(f"Intent: {intent} | Entities: {entities}")

    # --- Graph search for each entity (parallel) ---
    if entities:
        graph_tasks = [
            asyncio.to_thread(graph_service.search_entities, entity, intent)
            for entity in entities
        ]
        graph_results_nested = await asyncio.gather(*graph_tasks)
        graph_results = [r for sublist in graph_results_nested for r in sublist]
    else:
        graph_results = []

    logger.info(
        f"Sources: {len(vector_results)} vector | {len(graph_results)} graph"
    )

    # --- Build raw source list ---
    raw_sources = []

    for item in vector_results:
        raw_sources.append({
            "source_type":   "vector",
            "content":       item["text"],
            "document_name": item.get("document_name"),
            "document_type": item.get("document_type"),
            "document_id":   item.get("document_id"),
            "uploaded_at":   item.get("uploaded_at"),
            "chunk_id":      item.get("chunk_id"),
            "chunk_size":    item.get("chunk_size"),
            "score":         item.get("score"),
        })

    for item in graph_results:
        raw_sources.append({
            "source_type": "graph",
            "content": (
                f'{item["source"]} {item["relationship"]} {item["target"]}'
            ),
        })

    # --- Deduplicate + rank ---
    processed_sources = ranking_service.process_sources(
        request.query, raw_sources
    )

    logger.info(f"Using {len(processed_sources)} ranked sources for LLM")

    # --- Build context for LLM ---
    vector_by_document: OrderedDict = OrderedDict()
    for item in processed_sources:
        if item["source_type"] != "vector":
            continue
        doc_name = item.get("document_name") or "Unknown Document"
        vector_by_document.setdefault(doc_name, []).append(item["content"])

    vector_context = "\n\n".join(
        f"[Document: {doc}]\n" + "\n".join(chunks)
        for doc, chunks in vector_by_document.items()
    )

    graph_context = "\n".join(
        item["content"]
        for item in processed_sources
        if item["source_type"] == "graph"
    )

    documents = list(vector_by_document.keys())

    # --- Generate answer ---
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query,
        vector_context,
        graph_context,
    )

    # --- Build response ---
    sources = [
        Source(
            source_type=item["source_type"],
            content=item["content"],
            document_name=item.get("document_name"),
            document_type=item.get("document_type"),
            document_id=item.get("document_id"),
            uploaded_at=item.get("uploaded_at"),
            chunk_id=item.get("chunk_id"),
            chunk_size=item.get("chunk_size"),
            score=item.get("score"),
            relevance_score=item.get("relevance_score"),
        )
        for item in processed_sources
    ]

    latency_ms = (time.time() - start_time) * 1000
    logger.info(f"Query completed in {latency_ms:.0f} ms")

    return QueryResponse(
        answer=answer,
        documents=documents,
        sources=sources,
        latency_ms=latency_ms,
    )


# ------------------------------------------------------------------
# Knowledge Graph endpoint  (used by frontend Graph view)
# ------------------------------------------------------------------

@app.get(
    "/api/v1/graph",
    tags=["Graph"],
)
async def get_graph_data():
    """
    Return all nodes and relationships for the knowledge graph visualisation.
    """
    data = await asyncio.to_thread(graph_service.get_all_graph_data)
    return data