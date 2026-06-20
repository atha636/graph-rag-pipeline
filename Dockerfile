# --------------------------
# Python Runtime
# --------------------------
FROM python:3.11-slim


# Prevent Python cache files
ENV PYTHONDONTWRITEBYTECODE=1

# Show logs immediately
ENV PYTHONUNBUFFERED=1


# Working directory
WORKDIR /app


# System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc && \
    rm -rf /var/lib/apt/lists/*


# Install Python packages
COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.4.1 && \
    pip install --no-cache-dir -r requirements.txt


# Copy application
COPY src ./src


# Expose FastAPI port
EXPOSE 8000


# Production server
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]