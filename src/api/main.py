"""
Graph RAG API v2.1 — Production FastAPI application.

New in this version:
- SummarizationService integrated into ingestion pipeline
- /api/v1/summaries  — get all document summaries
- /api/v1/search     — document-scoped semantic search
- MMR ranking (via upgraded RankingService)
- All tuning params driven from config (no magic numbers)
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

from src.services.vector_service         import VectorService
from src.services.graph_service          import GraphService
from src.services.llm_service            import LLMService
from src.services.entity_service         import EntityExtractionService
from src.services.relationship_service   import RelationshipExtractionService
from src.services.intent_service         import IntentExtractionService
from src.services.document_service       import DocumentService
from src.services.ranking_service        import RankingService
from src.services.cache_service          import CacheService
from src.services.conversation_service   import ConversationService
from src.services.summarization_service  import SummarizationService

from src.api.upload import (
    router as upload_router,
    initialize_document_service,
)

configure_logger()

# ── Globals ───────────────────────────────────────────────────────────
vector_service:        VectorService               = None
graph_service:         GraphService                = None
llm_service:           LLMService                  = None
entity_service:        EntityExtractionService     = None
relationship_service:  RelationshipExtractionService = None
intent_service:        IntentExtractionService     = None
ranking_service:       RankingService              = None
document_service:      DocumentService             = None
cache_service:         CacheService                = None
conversation_service:  ConversationService         = None
summarization_service: SummarizationService        = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global vector_service, graph_service, llm_service
    global entity_service, relationship_service, intent_service
    global ranking_service, document_service, cache_service
    global conversation_service, summarization_service

    logger.info("=" * 60)
    logger.info(f"Starting {settings.APP_NAME} v2.1")
    logger.info("=" * 60)

    # Single shared embedding model — avoids loading 1.3 GB model 3×
    logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
    shared_model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Embedding model ready")

    vector_service        = VectorService(embedding_model=shared_model)
    graph_service         = GraphService()
    llm_service           = LLMService()
    entity_service        = EntityExtractionService()
    relationship_service  = RelationshipExtractionService()
    intent_service        = IntentExtractionService()
    ranking_service       = RankingService(embedding_model=shared_model)
    cache_service         = CacheService(
        embedding_model=shared_model,
        similarity_threshold=settings.CACHE_SIMILARITY_THRESHOLD,
        max_entries=settings.CACHE_MAX_ENTRIES,
        ttl_seconds=settings.CACHE_TTL_SECONDS,
    )
    conversation_service  = ConversationService()
    summarization_service = SummarizationService()

    document_service = DocumentService(
        vector_service=vector_service,
        graph_service=graph_service,
        entity_service=entity_service,
        relationship_service=relationship_service,
        summarization_service=summarization_service,
    )

    initialize_document_service(document_service)

    logger.info("All services ready")
    logger.info("=" * 60)

    yield

    if graph_service:        graph_service.close()
    if conversation_service: conversation_service.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Graph RAG API — Neo4j + Pinecone + Groq",
    version="2.1.0",
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


# ── Exception handlers ────────────────────────────────────────────────

@app.exception_handler(GraphRAGException)
async def app_exc_handler(request: Request, exc: GraphRAGException):
    logger.error(f"[{exc.__class__.__name__}] {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "detail": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exc_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ── Health ────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    return {
        "status":      "healthy",
        "version":     "2.1.0",
        "environment": settings.APP_ENV,
        "model":       settings.EMBEDDING_MODEL,
        "llm":         settings.LLM_MODEL,
        "chunk_size":  settings.CHUNK_SIZE,
        "mmr_lambda":  settings.RANKING_MMR_LAMBDA,
    }


# ── Shared RAG pipeline ───────────────────────────────────────────────

async def _rag_pipeline(request: QueryRequest):
    """
    Core RAG pipeline shared by /query and /query/stream.
    Returns (llm_args | cached_answer, processed_sources, documents,
             intent, entities, cache_hit, pipeline_latency_ms)
    """
    start = time.time()

    # 1. Cache check
    if request.use_cache:
        cached = cache_service.get(request.query)
        if cached:
            latency = (time.time() - start) * 1000
            return (cached.answer, cached.sources, cached.documents,
                    None, None, True, latency)

    # 2. Conversation history
    history = []
    if request.conversation_id:
        history = await asyncio.to_thread(
            conversation_service.get_history, request.conversation_id
        )

    # 3. Parallel: vector search + intent + entities
    v_task = asyncio.to_thread(
        vector_service.search, request.query,
        request.top_k or settings.QUERY_DEFAULT_TOP_K
    )
    i_task = asyncio.to_thread(intent_service.extract_intent, request.query)
    e_task = asyncio.to_thread(entity_service.extract_entities, request.query)

    vector_results, intent, entities = await asyncio.gather(v_task, i_task, e_task)
    logger.info(f"Intent: {intent} | Entities: {entities}")

    # 4. Graph search
    graph_results = []
    if entities:
        g_tasks = [
            asyncio.to_thread(graph_service.search_entities, ent, intent)
            for ent in entities
        ]
        nested       = await asyncio.gather(*g_tasks)
        graph_results = [r for sub in nested for r in sub]

    # 5. Build raw sources
    raw = [
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
            "content": f'{item["source"]} {item["relationship"]} {item["target"]}',
        }
        for item in graph_results
    ]

    # 6. MMR ranking
    processed = ranking_service.process_sources(request.query, raw)

    # 7. Build context
    by_doc: OrderedDict = OrderedDict()
    for item in processed:
        if item["source_type"] != "vector":
            continue
        doc = item.get("document_name") or "Unknown"
        by_doc.setdefault(doc, []).append(item["content"])

    vector_ctx = "\n\n".join(
        f"[Document: {d}]\n" + "\n".join(chunks)
        for d, chunks in by_doc.items()
    )
    graph_ctx  = "\n".join(
        item["content"] for item in processed
        if item["source_type"] == "graph"
    )
    documents  = list(by_doc.keys())
    latency    = (time.time() - start) * 1000

    return (
        (vector_ctx, graph_ctx, history),
        processed, documents, intent, entities,
        False, latency,
    )


# ── Query (standard) ──────────────────────────────────────────────────

@app.post("/api/v1/query", response_model=QueryResponse, tags=["Query"])
async def query(request: QueryRequest):
    result = await _rag_pipeline(request)

    if result[5]:  # cache hit
        answer, sources_raw, docs, intent, entities, _, latency = result
        sources = [Source(**s) if isinstance(s, dict) else s for s in sources_raw]
        return QueryResponse(
            answer=answer, documents=docs, sources=sources,
            latency_ms=latency, cache_hit=True,
            conversation_id=request.conversation_id,
        )

    llm_args, processed, docs, intent, entities, _, pipeline_ms = result

    t0     = time.time()
    answer = await asyncio.to_thread(
        llm_service.generate_response,
        request.query, llm_args[0], llm_args[1], llm_args[2],
    )
    total_ms = pipeline_ms + (time.time() - t0) * 1000

    sources = [
        Source(
            source_type=p["source_type"], content=p["content"],
            document_name=p.get("document_name"), document_type=p.get("document_type"),
            document_id=p.get("document_id"), uploaded_at=p.get("uploaded_at"),
            chunk_id=p.get("chunk_id"), chunk_size=p.get("chunk_size"),
            score=p.get("score"), relevance_score=p.get("relevance_score"),
        )
        for p in processed
    ]

    cache_service.set(
        query=request.query, answer=answer,
        sources=[s.model_dump() for s in sources],
        documents=docs, latency_ms=total_ms,
    )

    if request.conversation_id:
        cid = request.conversation_id
        turns = await asyncio.to_thread(conversation_service.get_history, cid)
        if not turns:
            await asyncio.to_thread(
                conversation_service.auto_title, cid, request.query
            )
        await asyncio.to_thread(
            conversation_service.add_turn, cid, "user", request.query
        )
        await asyncio.to_thread(
            conversation_service.add_turn, cid, "assistant", answer
        )

    logger.info(f"Query done in {total_ms:.0f} ms")
    return QueryResponse(
        answer=answer, documents=docs, sources=sources,
        latency_ms=total_ms, cache_hit=False,
        intent=intent, entities=entities,
        conversation_id=request.conversation_id,
    )


# ── Streaming query (SSE) ─────────────────────────────────────────────

@app.post("/api/v1/query/stream", tags=["Query"])
async def query_stream(request: QueryRequest):
    async def stream():
        start  = time.time()
        result = await _rag_pipeline(request)

        if result[5]:   # cache hit
            answer, sources_raw, docs, _, __, ___, latency = result
            srcs = [s if isinstance(s, dict) else s.model_dump() for s in sources_raw]
            yield f"data: {json.dumps({'type':'meta','documents':docs,'sources':srcs,'cache_hit':True})}\n\n"
            for i, word in enumerate(answer.split(" ")):
                yield f"data: {json.dumps({'type':'chunk','text':word+(' ' if i < len(answer.split())-1 else '')})}\n\n"
                await asyncio.sleep(0.015)
            yield f"data: {json.dumps({'type':'done','latency_ms':latency})}\n\n"
            return

        llm_args, processed, docs, intent, entities, _, _ = result

        srcs_data = [
            {
                "source_type": p["source_type"], "content": p["content"],
                "document_name": p.get("document_name"), "score": p.get("score"),
                "relevance_score": p.get("relevance_score"),
            }
            for p in processed
        ]
        yield f"data: {json.dumps({'type':'meta','documents':docs,'sources':srcs_data,'intent':intent,'entities':entities,'cache_hit':False})}\n\n"

        full = ""
        for chunk in llm_service.generate_stream(
            request.query, llm_args[0], llm_args[1], llm_args[2]
        ):
            full += chunk
            yield f"data: {json.dumps({'type':'chunk','text':chunk})}\n\n"

        total_ms = (time.time() - start) * 1000

        cache_service.set(
            query=request.query, answer=full,
            sources=[Source(**{k: v for k, v in p.items() if k != "_emb"}).model_dump()
                     for p in processed],
            documents=docs, latency_ms=total_ms,
        )

        if request.conversation_id:
            await asyncio.to_thread(
                conversation_service.add_turn,
                request.conversation_id, "user", request.query
            )
            await asyncio.to_thread(
                conversation_service.add_turn,
                request.conversation_id, "assistant", full
            )

        yield f"data: {json.dumps({'type':'done','latency_ms':total_ms})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Graph ─────────────────────────────────────────────────────────────

@app.get("/api/v1/graph", tags=["Graph"])
async def get_graph():
    return await asyncio.to_thread(graph_service.get_all_graph_data)


# ── Documents ─────────────────────────────────────────────────────────

@app.get("/api/v1/documents", tags=["Documents"])
async def list_documents():
    try:
        return await asyncio.to_thread(vector_service.list_documents)
    except Exception as e:
        logger.warning(f"list_documents: {e}")
        return []


# ── Document summaries ────────────────────────────────────────────────

@app.get("/api/v1/summaries", tags=["Documents"])
async def get_summaries():
    """
    Return all document summaries generated during ingestion.
    Used by the frontend Documents view to show doc overviews.
    """
    return await asyncio.to_thread(
        summarization_service.get_document_summaries, graph_service
    )


# ── Conversations ─────────────────────────────────────────────────────

@app.post("/api/v1/conversations", tags=["Conversations"])
async def create_conv(body: CreateConversationRequest):
    cid = await asyncio.to_thread(
        conversation_service.create_conversation,
        body.title or "New Conversation",
    )
    return {"conversation_id": cid}

@app.get(
    "/api/v1/conversations",
    response_model=list[ConversationSummary],
    tags=["Conversations"],
)
async def list_convs():
    return await asyncio.to_thread(conversation_service.list_conversations)

@app.get(
    "/api/v1/conversations/{cid}",
    response_model=ConversationDetail,
    tags=["Conversations"],
)
async def get_conv(cid: str):
    conv = await asyncio.to_thread(conversation_service.get_conversation, cid)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv

@app.put("/api/v1/conversations/{cid}", tags=["Conversations"])
async def rename_conv(cid: str, body: RenameConversationRequest):
    ok = await asyncio.to_thread(
        conversation_service.rename_conversation, cid, body.title
    )
    if not ok:
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}

@app.delete("/api/v1/conversations/{cid}", tags=["Conversations"])
async def delete_conv(cid: str):
    await asyncio.to_thread(conversation_service.delete_conversation, cid)
    return {"ok": True}


# ── Stats ─────────────────────────────────────────────────────────────

@app.get("/api/v1/stats", response_model=StatsResponse, tags=["System"])
async def stats():
    graph_data  = await asyncio.to_thread(graph_service.get_all_graph_data)
    cache_stats = cache_service.stats()
    docs        = await asyncio.to_thread(vector_service.list_documents)

    return StatsResponse(
        vector_count=0,
        graph_node_count=len(graph_data.get("nodes", [])),
        graph_rel_count=len(graph_data.get("relationships", [])),
        document_count=len(docs),
        cache_size=cache_stats["size"],
        cache_hit_rate=cache_stats["hit_rate"],
        cache_total_requests=cache_stats["total_requests"],
    )