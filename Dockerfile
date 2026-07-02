# ── Base ───────────────────────────────────────────────────────────
FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Pre-download embedding model into the image so cold starts are fast.
# all-MiniLM-L6-v2 is only ~90 MB — works on Render free (512 MB RAM)
# and Railway free ($5 credit).
# To use the larger BAAI/bge-large-en-v1.5 model (better quality, 1.3 GB),
# set EMBEDDING_MODEL=BAAI/bge-large-en-v1.5 in your env vars and deploy
# on a platform with at least 2 GB RAM.
RUN python -c "\
import os; \
model = os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2'); \
print(f'Pre-downloading: {model}'); \
from sentence_transformers import SentenceTransformer; \
SentenceTransformer(model); \
print('Model ready')"

EXPOSE 8000

# Use PORT env var — Render and Railway both set this automatically
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]