# ── Build stage ────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System deps needed for pypdf, sentence-transformers, neo4j driver
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Pre-download the embedding model so it's baked into the image
# (avoids cold-start download on every deploy)
RUN python -c "from sentence_transformers import SentenceTransformer; \
               SentenceTransformer('BAAI/bge-large-en-v1.5')"

# ── Runtime ────────────────────────────────────────────────────────
EXPOSE 8000

# Use PORT env var (Render sets this automatically)
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]