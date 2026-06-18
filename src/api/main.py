from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger

from src.core.config import settings
from src.core.exceptions import GraphRAGException
from src.core.logger import configure_logger


# Initialize logging
configure_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle events.
    """

    logger.info(
        "Starting Graph RAG API..."
    )

    logger.info(
        f"Environment: {settings.APP_ENV}"
    )

    yield

    logger.info(
        "Shutting down Graph RAG API..."
    )


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise Graph RAG API with Hybrid Retrieval",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(GraphRAGException)
async def graph_rag_exception_handler(
    request: Request,
    exc: GraphRAGException,
):
    """
    Handles custom application errors.
    """

    logger.error(
        f"Application Error: {exc}"
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
        },
    )


@app.get(
    "/health",
    tags=["Health"],
)
async def health_check():
    """
    Health check endpoint.
    """

    logger.info(
        "Health check requested"
    )

    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "environment": settings.APP_ENV,
    }