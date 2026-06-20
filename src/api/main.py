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


# Configure logger
configure_logger()


# Global services
vector_service = None
graph_service = None
llm_service = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize all services at startup.
    """

    global vector_service
    global graph_service
    global llm_service

    logger.info("Starting Graph RAG API")

    vector_service = VectorService()
    graph_service = GraphService()
    llm_service = LLMService()

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

    # Run both retrievals simultaneously
    vector_task = asyncio.to_thread(
        vector_service.search,
        request.query
    )

    graph_task = asyncio.to_thread(
        graph_service.search_entities,
        request.query
    )

    vector_results, graph_results = await asyncio.gather(
        vector_task,
        graph_task
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

    # Generate final answer
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query,
        vector_context,
        graph_context
    )

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