import asyncio
import time
from contextlib import asynccontextmanager
from collections import OrderedDict

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger

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

from src.api.upload import (
    router as upload_router,
    initialize_document_service
)

# Configure logger
configure_logger()

# Global services
vector_service = None
graph_service = None
llm_service = None
entity_service = None
relationship_service = None
intent_service = None
ranking_service = None
document_service = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize all services at startup.
    """
    global vector_service
    global graph_service
    global llm_service
    global entity_service
    global relationship_service
    global intent_service
    global ranking_service
    global document_service

    logger.info("Starting Graph RAG API")

    vector_service = VectorService()
    graph_service = GraphService()
    llm_service = LLMService()
    entity_service = EntityExtractionService()
    relationship_service = RelationshipExtractionService()
    intent_service = IntentExtractionService()
    ranking_service = RankingService()

    document_service = DocumentService(
        vector_service=vector_service,
        graph_service=graph_service,
        entity_service=entity_service,
        relationship_service=relationship_service
    )

    initialize_document_service(document_service)

    logger.info("All AI services initialized")

    yield

    if graph_service:
        graph_service.close()

    logger.info("Application shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    description="Advanced Graph RAG API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(upload_router)


@app.exception_handler(GraphRAGException)
async def application_exception_handler(
    request: Request,
    exc: GraphRAGException
):
    logger.error(f"Application error: {exc}")

    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc)
        }
    )


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "environment": settings.APP_ENV
    }


@app.post(
    "/api/v1/query",
    response_model=QueryResponse
)
async def query_graph_rag(request: QueryRequest):
    """
    Main Graph RAG endpoint.
    """
    start_time = time.time()

    logger.info(f"Received query: {request.query}")

    # Start vector search
    vector_task = asyncio.to_thread(
        vector_service.search,
        request.query
    )

    # Extract intent
    intent = await asyncio.to_thread(
        intent_service.extract_intent,
        request.query
    )

    logger.info(f"Extracted intent: {intent}")

    # Extract entities
    entities = await asyncio.to_thread(
        entity_service.extract_entities,
        request.query
    )

    logger.info(f"Extracted entities: {entities}")

    # Graph search tasks
    graph_tasks = [
        asyncio.to_thread(
            graph_service.search_entities,
            entity,
            intent
        )
        for entity in entities
    ]

    # Run vector + graph searches together
    results = await asyncio.gather(
        vector_task,
        *graph_tasks
    )

    vector_results = results[0]

    graph_results = []
    for result in results[1:]:
        graph_results.extend(result)

    logger.info(
        f"Vector results: {len(vector_results)} | "
        f"Graph results: {len(graph_results)}"
    )

    # Collect raw sources
    raw_sources = []

    # Add vector results — carry all metadata through
    for item in vector_results:
        raw_sources.append(
            {
                "source_type": "vector",
                "content": item["text"],
                "document_name": item.get("document_name"),
                "document_type": item.get("document_type"),
                "document_id": item.get("document_id"),
                "uploaded_at": item.get("uploaded_at"),
                "chunk_id": item.get("chunk_id"),
                "chunk_size": item.get("chunk_size"),
                "score": item.get("score"),
            }
        )

    # Add graph results
    for item in graph_results:
        raw_sources.append(
            {
                "source_type": "graph",
                "content": (
                    f'{item["source"]} '
                    f'{item["relationship"]} '
                    f'{item["target"]}'
                )
            }
        )

    logger.info(f"Raw sources before ranking: {raw_sources}")

    # Deduplicate, rank and slice to max_sources.
    # NOTE: max_sources slicing is handled inside ranking_service
    # process_sources() → rank_sources(), NOT here. This ensures
    # the reserved min_vector / min_graph slots are selected before
    # the cut, not after re-sorting (which was the previous bug where
    # tesla_report.txt landed at position 6 and got cut by [:5]).
    processed_sources = ranking_service.process_sources(
        request.query,
        raw_sources
    )

    logger.info(f"Processed sources after ranking: {processed_sources}")
    logger.info(
        f"Using {len(processed_sources)} ranked sources for LLM"
    )

    # Build vector context grouped by document so the LLM can compare
    # across sources explicitly when the question asks for it.
    vector_by_document: OrderedDict = OrderedDict()

    for item in processed_sources:
        if item["source_type"] != "vector":
            continue

        doc_name = item.get("document_name") or "Unknown Document"

        vector_by_document.setdefault(
            doc_name, []
        ).append(item["content"])

    vector_context = "\n\n".join(
        f"[Document: {doc_name}]\n" + "\n".join(contents)
        for doc_name, contents in vector_by_document.items()
    )

    # Unique document names for the top-level response field
    documents = list(vector_by_document.keys())

    graph_context = "\n".join(
        item["content"]
        for item in processed_sources
        if item["source_type"] == "graph"
    )

    logger.info("Built clean ranked context")

    # Generate final answer
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query,
        vector_context,
        graph_context
    )

    # Convert ranked sources to response model
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
            relevance_score=item.get("relevance_score")
        )
        for item in processed_sources
    ]

    latency = (time.time() - start_time) * 1000

    logger.info(f"Query completed in {latency:.2f} ms")

    return QueryResponse(
        answer=answer,
        documents=documents,
        sources=sources,
        latency_ms=latency
    )