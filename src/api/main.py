"""
Graph RAG API — Production-grade FastAPI application.

Endpoints:
  POST /api/v1/query              — standard query (with cache + memory)
  POST /api/v1/query/stream       — SSE streaming query
  POST /api/v1/upload             — document ingestion
  GET  /api/v1/graph              — knowledge graph data
  GET  /api/v1/documents          — list indexed documents
  POST /api/v1/conversations      — create conversation
  GET  /api/v1/conversations      — list conversations
  GET  /api/v1/conversations/{id} — get full conversation
  PUT  /api/v1/conversations/{id} — rename conversation
  DELETE /api/v1/conversations/{id} — delete conversation
  GET  /api/v1/stats              — system stats (cache, graph, vectors)
  GET  /health                    — health check
"""

import asyncio
import json
import time
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from sentence_transformers import SentenceTransformer

from src.core.config import settings
from src.core.exceptions import GraphRAGException
from src.core.logger import configure_logger
from src.core.middleware import request_id_middleware

from src.models.request import (
    QueryRequest,
    CreateConversationRequest,
    RenameConversationRequest,
)
from src.models.response import (
    QueryResponse, Source,
    ConversationSummary, ConversationDetail,
    StatsResponse, DocumentRecord,
)

from src.services.vector_service       import VectorService
from src.services.graph_service        import GraphService
from src.services.llm_service          import LLMService
from src.services.entity_service       import EntityExtractionService
from src.services.relationship_service import RelationshipExtractionService
from src.services.intent_service       import IntentExtractionService
from src.services.document_service     import DocumentService
from src.services.ranking_service      import RankingService
from src.services.cache_service        import CacheService
from src.services.conversation_service import ConversationService

from src.api.upload import (
    router as upload_router,
    initialize_document_service,
)

configure_logger()

# ── Global service instances ───────────────────────────────────────
vector_service:       VectorService                 = None
graph_service:        GraphService                  = None
llm_service:          LLMService                    = None
entity_service:       EntityExtractionService       = None
relationship_service: RelationshipExtractionService = None
intent_service:       IntentExtractionService       = None
ranking_service:      RankingService                = None
document_service:     DocumentService               = None
cache_service:        CacheService                  = None
conversation_service: ConversationService           = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global vector_service, graph_service, llm_service
    global entity_service, relationship_service, intent_service
    global ranking_service, document_service, cache_service
    global conversation_service

    logger.info("=" * 60)
    logger.info("Starting Graph RAG API")
    logger.info("=" * 60)

    # Load embedding model once — shared across vector + ranking + cache
    logger.info(f"Loading shared embedding model: {settings.EMBEDDING_MODEL}")
    shared_model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Shared embedding model ready")

    vector_service       = VectorService(embedding_model=shared_model)
    graph_service        = GraphService()
    llm_service          = LLMService()
    entity_service       = EntityExtractionService()
    relationship_service = RelationshipExtractionService()
    intent_service       = IntentExtractionService()
    ranking_service      = RankingService(embedding_model=shared_model)
    cache_service        = CacheService(embedding_model=shared_model)
    conversation_service = ConversationService()

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

    if graph_service:        graph_service.close()
    if conversation_service: conversation_service.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Production Graph RAG API — Neo4j + Pinecone + Groq",
    version="2.0.0",
    lifespan=lifespan,
)

app.middleware("http")(request_id_middleware)

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


# ── Exception handlers ────────────────────────────────────────────

@app.exception_handler(GraphRAGException)
async def app_exception_handler(request: Request, exc: GraphRAGException):
    logger.error(f"Application error [{exc.__class__.__name__}]: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "detail": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ── Health ────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    return {
        "status":      "healthy",
        "environment": settings.APP_ENV,
        "version":     "2.0.0",
        "model":       settings.EMBEDDING_MODEL,
        "llm":         settings.LLM_MODEL,
    }


# ── Core pipeline helper ──────────────────────────────────────────

async def _run_rag_pipeline(request: QueryRequest):
    """
    Shared RAG pipeline used by both /query and /query/stream.
    Returns (answer_or_generator, sources, documents, intent, entities,
             cache_hit, latency_ms).
    """
    start = time.time()

    # 1. Check semantic cache
    if request.use_cache:
        cached = cache_service.get(request.query)
        if cached:
            latency = (time.time() - start) * 1000
            return (
                cached.answer, cached.sources,
                cached.documents, None, None,
                True, latency,
            )

    # 2. Conversation history
    history = []
    if request.conversation_id:
        history = await asyncio.to_thread(
            conversation_service.get_history,
            request.conversation_id,
        )

    # 3. Parallel: vector search + intent + entity extraction
    vector_task = asyncio.to_thread(
        vector_service.search, request.query, request.top_k
    )
    intent_task = asyncio.to_thread(
        intent_service.extract_intent, request.query
    )
    entity_task = asyncio.to_thread(
        entity_service.extract_entities, request.query
    )

    vector_results, intent, entities = await asyncio.gather(
        vector_task, intent_task, entity_task
    )

    logger.info(f"Intent: {intent} | Entities: {entities}")

    # 4. Graph search per entity
    graph_results = []
    if entities:
        graph_tasks = [
            asyncio.to_thread(
                graph_service.search_entities, entity, intent
            )
            for entity in entities
        ]
        nested = await asyncio.gather(*graph_tasks)
        graph_results = [r for sub in nested for r in sub]

    logger.info(
        f"Sources: {len(vector_results)} vector | "
        f"{len(graph_results)} graph"
    )

    # 5. Build raw source list
    raw_sources = [
        {
            "source_type":   "vector",
            "content":       item["text"],
            "document_name": item.get("document_name"),
            "document_type": item.get("document_type"),
            "document_id":   item.get("document_id"),
            "uploaded_at":   item.get("uploaded_at"),
            "chunk_id":      item.get("chunk_id"),
            "chunk_size":    item.get("chunk_size"),
            "score":         item.get("score"),
        }
        for item in vector_results
    ] + [
        {
            "source_type": "graph",
            "content": (
                f'{item["source"]} '
                f'{item["relationship"]} '
                f'{item["target"]}'
            ),
        }
        for item in graph_results
    ]

    # 6. Deduplicate + rank
    processed = ranking_service.process_sources(request.query, raw_sources)

    # 7. Build LLM context
    vector_by_doc: OrderedDict = OrderedDict()
    for item in processed:
        if item["source_type"] != "vector":
            continue
        doc = item.get("document_name") or "Unknown"
        vector_by_doc.setdefault(doc, []).append(item["content"])

    vector_context = "\n\n".join(
        f"[Document: {doc}]\n" + "\n".join(chunks)
        for doc, chunks in vector_by_doc.items()
    )
    graph_context = "\n".join(
        item["content"]
        for item in processed
        if item["source_type"] == "graph"
    )
    documents = list(vector_by_doc.keys())

    latency = (time.time() - start) * 1000

    return (
        (vector_context, graph_context, history),  # args for LLM
        processed, documents, intent, entities,
        False, latency,
    )


# ── Query endpoint (standard) ─────────────────────────────────────

@app.post("/api/v1/query", response_model=QueryResponse, tags=["Query"])
async def query_graph_rag(request: QueryRequest):
    result = await _run_rag_pipeline(request)

    # Cache hit — return immediately
    if result[5]:  # cache_hit flag
        answer, sources_raw, documents, intent, entities, cache_hit, latency = result
        sources = [Source(**s) if isinstance(s, dict) else s for s in sources_raw]
        return QueryResponse(
            answer=answer, documents=documents, sources=sources,
            latency_ms=latency, cache_hit=True,
            conversation_id=request.conversation_id,
        )

    llm_args, processed, documents, intent, entities, cache_hit, _ = result

    start_llm = time.time()
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query, llm_args[0], llm_args[1], llm_args[2],
    )
    total_latency = (time.time() - start_llm) * 1000 + _

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
        for item in processed
    ]

    # Store in cache
    cache_service.set(
        query=request.query, answer=answer,
        sources=[s.model_dump() for s in sources],
        documents=documents, latency_ms=total_latency,
    )

    # Store conversation turns
    if request.conversation_id:
        conv_id = request.conversation_id
        turns = await asyncio.to_thread(
            conversation_service.get_history, conv_id
        )
        if not turns:
            await asyncio.to_thread(
                conversation_service.auto_title, conv_id, request.query
            )
        await asyncio.to_thread(
            conversation_service.add_turn, conv_id, "user", request.query
        )
        await asyncio.to_thread(
            conversation_service.add_turn, conv_id, "assistant", answer
        )

    logger.info(f"Query completed in {total_latency:.0f} ms")

    return QueryResponse(
        answer=answer, documents=documents, sources=sources,
        latency_ms=total_latency, cache_hit=False,
        intent=intent, entities=entities,
        conversation_id=request.conversation_id,
    )


# ── Streaming query endpoint (SSE) ────────────────────────────────

@app.post("/api/v1/query/stream", tags=["Query"])
async def query_stream(request: QueryRequest):
    """
    Server-Sent Events streaming endpoint.
    Frontend receives answer word-by-word as it's generated.

    SSE format:
      data: {"type": "sources", "data": {...}}   ← sent first
      data: {"type": "chunk",   "text": "..."}   ← per token
      data: {"type": "done",    "latency_ms": N}  ← final
    """

    async def event_stream():
        start = time.time()

        result = await _run_rag_pipeline(request)

        # Cache hit — send everything at once
        if result[5]:
            answer, sources_raw, documents, _, __, ___, latency = result
            sources = [s if isinstance(s, dict) else s.model_dump()
                       for s in sources_raw]

            yield f"data: {json.dumps({'type': 'meta', 'documents': documents, 'sources': sources, 'cache_hit': True})}\n\n"

            # Simulate streaming for cache hits (nicer UX)
            words = answer.split(" ")
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
                await asyncio.sleep(0.015)

            yield f"data: {json.dumps({'type': 'done', 'latency_ms': latency})}\n\n"
            return

        llm_args, processed, documents, intent, entities, _, pipeline_latency = result

        sources_data = [
            {
                "source_type":    item["source_type"],
                "content":        item["content"],
                "document_name":  item.get("document_name"),
                "document_type":  item.get("document_type"),
                "score":          item.get("score"),
                "relevance_score":item.get("relevance_score"),
            }
            for item in processed
        ]

        # Send metadata first so the frontend can render source badges
        yield f"data: {json.dumps({'type': 'meta', 'documents': documents, 'sources': sources_data, 'intent': intent, 'entities': entities, 'cache_hit': False})}\n\n"

        # Stream answer tokens
        full_answer = ""
        stream_gen  = llm_service.generate_stream(
            request.query, llm_args[0], llm_args[1], llm_args[2]
        )

        for chunk_text in stream_gen:
            full_answer += chunk_text
            yield f"data: {json.dumps({'type': 'chunk', 'text': chunk_text})}\n\n"

        total_latency = (time.time() - start) * 1000

        # Cache + store conversation
        sources_for_cache = [
            Source(
                source_type=s["source_type"],
                content=s["content"],
                document_name=s.get("document_name"),
                document_type=s.get("document_type"),
                score=s.get("score"),
                relevance_score=s.get("relevance_score"),
            ).model_dump()
            for s in sources_data
        ]
        cache_service.set(
            query=request.query, answer=full_answer,
            sources=sources_for_cache,
            documents=documents, latency_ms=total_latency,
        )

        if request.conversation_id:
            conv_id = request.conversation_id
            await asyncio.to_thread(
                conversation_service.add_turn, conv_id, "user", request.query
            )
            await asyncio.to_thread(
                conversation_service.add_turn, conv_id, "assistant", full_answer
            )

        yield f"data: {json.dumps({'type': 'done', 'latency_ms': total_latency})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering":"no",
        },
    )


# ── Knowledge Graph ───────────────────────────────────────────────

@app.get("/api/v1/graph", tags=["Graph"])
async def get_graph_data():
    data = await asyncio.to_thread(graph_service.get_all_graph_data)
    return data


# ── Documents ─────────────────────────────────────────────────────

@app.get(
    "/api/v1/documents",
    response_model=list[DocumentRecord],
    tags=["Documents"],
)
async def list_documents():
    """
    Return all unique documents indexed in Pinecone.
    Fetches distinct document metadata from the vector namespace.
    """
    try:
        records = await asyncio.to_thread(vector_service.list_documents)
        return records
    except Exception as e:
        logger.warning(f"Document list failed: {e}")
        return []


# ── Conversations ─────────────────────────────────────────────────

@app.post(
    "/api/v1/conversations",
    tags=["Conversations"],
)
async def create_conversation(body: CreateConversationRequest):
    conv_id = await asyncio.to_thread(
        conversation_service.create_conversation,
        body.title or "New Conversation",
    )
    return {"conversation_id": conv_id}


@app.get(
    "/api/v1/conversations",
    response_model=list[ConversationSummary],
    tags=["Conversations"],
)
async def list_conversations():
    convs = await asyncio.to_thread(conversation_service.list_conversations)
    return convs


@app.get(
    "/api/v1/conversations/{conv_id}",
    response_model=ConversationDetail,
    tags=["Conversations"],
)
async def get_conversation(conv_id: str):
    conv = await asyncio.to_thread(
        conversation_service.get_conversation, conv_id
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.put("/api/v1/conversations/{conv_id}", tags=["Conversations"])
async def rename_conversation(conv_id: str, body: RenameConversationRequest):
    ok = await asyncio.to_thread(
        conversation_service.rename_conversation, conv_id, body.title
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True}


@app.delete("/api/v1/conversations/{conv_id}", tags=["Conversations"])
async def delete_conversation(conv_id: str):
    await asyncio.to_thread(
        conversation_service.delete_conversation, conv_id
    )
    return {"ok": True}


# ── Stats ─────────────────────────────────────────────────────────

@app.get("/api/v1/stats", response_model=StatsResponse, tags=["System"])
async def get_stats():
    """
    Live system stats — shown in the frontend stats panel.
    """
    graph_data    = await asyncio.to_thread(graph_service.get_all_graph_data)
    cache_stats   = cache_service.stats()
    documents     = await asyncio.to_thread(vector_service.list_documents)

    return StatsResponse(
        vector_count=0,           # Pinecone free tier doesn't expose count easily
        graph_node_count=len(graph_data.get("nodes", [])),
        graph_rel_count=len(graph_data.get("relationships", [])),
        document_count=len(documents),
        cache_size=cache_stats["size"],
        cache_hit_rate=cache_stats["hit_rate"],
        cache_total_requests=cache_stats["total_requests"],
    )