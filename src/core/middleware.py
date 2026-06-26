"""
Production middleware:
- Unique request ID injected into every request/response
- Structured per-request timing log
- Graceful error responses with consistent JSON shape
"""

import time
import uuid

from fastapi import Request, Response
from loguru import logger


async def request_id_middleware(request: Request, call_next):
    """
    Attach a unique request ID to every request.
    Logged at start and end so you can grep full traces.
    """
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    request.state.start_time = time.time()

    # Forward ID in response header so frontend can log it
    logger.info(
        f"[{request_id}] → {request.method} {request.url.path}"
    )

    response: Response = await call_next(request)

    latency = (time.time() - request.state.start_time) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Latency-Ms"] = f"{latency:.1f}"

    logger.info(
        f"[{request_id}] ← {response.status_code} "
        f"({latency:.0f} ms)"
    )

    return response