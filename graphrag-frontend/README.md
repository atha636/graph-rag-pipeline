# GraphRAG Frontend

Beautiful React + TypeScript frontend for the Graph RAG AI Assistant.

## Tech Stack
- **React 18** + TypeScript
- **Vite** — fast dev server
- **Lucide React** — icons
- **React Markdown** — renders AI responses
- **Axios** — API calls to your FastAPI backend

## Setup

```bash
# Install dependencies
npm install

# Start dev server (proxies /api → localhost:8000)
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000)

## Backend Requirements

Your FastAPI backend must expose these endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check → `{ status: "ok" }` |
| POST | `/api/query` | `{ query: string }` → `{ answer, sources, source_count }` |
| POST | `/api/upload` | `multipart/form-data` with `file` → upload result |
| GET | `/api/documents` | List all documents |
| DELETE | `/api/documents/:id` | Delete a document |
| GET | `/api/graph` | Graph data `{ nodes, relationships }` |

## Source format expected from `/api/query`

```json
{
  "answer": "Tesla was founded in 2003...",
  "source_count": 3,
  "sources": [
    {
      "type": "graph",
      "document_name": "Tesla Report",
      "document_type": "pdf",
      "relationship": "FOUNDED",
      "entity": "Elon Musk"
    },
    {
      "type": "vector",
      "document_name": "Tesla Report",
      "document_type": "pdf",
      "chunk_index": 2,
      "similarity_score": 0.89,
      "relevance_score": 0.92,
      "content": "Tesla was founded in 2003..."
    }
  ]
}
```

## Graph data format expected from `/api/graph`

```json
{
  "nodes": [
    { "id": "elon", "label": "Elon Musk", "type": "Person" }
  ],
  "relationships": [
    { "source": "elon", "target": "tesla", "type": "FOUNDED" }
  ]
}
```
