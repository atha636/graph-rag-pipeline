import asyncio
import time
from contextlib import asynccontextmanager

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
from src.services.relationship_service import (
    RelationshipExtractionService
)
from src.services.intent_service import (
    IntentExtractionService
)
from src.services.document_service import DocumentService

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
    global document_service

    logger.info("Starting Graph RAG API")

    vector_service = VectorService()

    graph_service = GraphService()

    llm_service = LLMService()

    entity_service = EntityExtractionService()
    relationship_service = (
    RelationshipExtractionService()
)
    intent_service = (
    IntentExtractionService()
)

    document_service = DocumentService(
        vector_service=vector_service,
        graph_service=graph_service,
        entity_service=entity_service,
        relationship_service=relationship_service
    )

    initialize_document_service(
        document_service
    )

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
    logger.error(
        f"Application error: {exc}"
    )

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
async def query_graph_rag(
    request: QueryRequest
):
    """
    Main Graph RAG endpoint.
    """

    start_time = time.time()

    logger.info(
        f"Received query: {request.query}"
    )

    # Start vector search in parallel
    vector_task = asyncio.to_thread(
        vector_service.search,
        request.query
    )

    # Extract intent
    intent = await asyncio.to_thread(
        intent_service.extract_intent,
        request.query
    )

    logger.info(
        f"Extracted intent: {intent}"
    )

    # Extract entities
    entities = await asyncio.to_thread(
        entity_service.extract_entities,
        request.query
    )

    logger.info(
        f"Extracted entities: {entities}"
    )

    # Create graph search tasks with intent filter
    graph_tasks = [
        asyncio.to_thread(
            graph_service.search_entities,
            entity,
            intent
        )
        for entity in entities
    ]

    # Run vector and graph searches together
    results = await asyncio.gather(
        vector_task,
        *graph_tasks
    )

    # First result is vector search
    vector_results = results[0]

    # Remaining results are graph searches
    graph_results = []

    for result in results[1:]:
        graph_results.extend(result)

    logger.info(
        f"Vector results: {len(vector_results)} | "
        f"Graph results: {len(graph_results)}"
    )

    # Build vector context
    vector_context = "\n".join(
        item["text"]
        for item in vector_results
    )

    # Build graph context
    graph_context = "\n".join(
        f'{item["source"]} - '
        f'{item["relationship"]} -> '
        f'{item["target"]}'
        for item in graph_results
    )

    # Generate final answer using LLM
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query,
        vector_context,
        graph_context
    )

    # Collect sources
    sources = []

    for item in vector_results:
        sources.append(
            Source(
                source_type="vector",
                content=item["text"]
            )
        )

    for item in graph_results:
        sources.append(
            Source(
                source_type="graph",
                content=(
                    f'{item["source"]} '
                    f'{item["relationship"]} '
                    f'{item["target"]}'
                )
            )
        )

    latency = (
        time.time() - start_time
    ) * 1000

    logger.info(
        f"Query completed in {latency:.2f} ms"
    )

    return QueryResponse(
        answer=answer,
        sources=sources,
        latency_ms=latency
    )