export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt';
  uploadedAt?: string;
}

// Matches your backend Source model exactly
export interface Source {
  source_type: 'vector' | 'graph';
  content: string;
  document_name?: string;
  document_type?: string;
  document_id?: string;
  uploaded_at?: string;
  chunk_id?: string;
  chunk_size?: number;
  score?: number;
  relevance_score?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  documents?: string[];
  timestamp: Date;
  isStreaming?: boolean;
}

// POST /api/v1/query
export interface QueryRequest {
  query: string;
}

// matches QueryResponse from your backend
export interface QueryResponse {
  answer: string;
  documents: string[];
  sources: Source[];
  latency_ms: number;
}

// POST /api/v1/upload response
export interface UploadResult {
  chunks_created?: number;
  entities_extracted?: number;
  relationships_created?: number;
  [key: string]: unknown;
}

export interface UploadResponse {
  filename: string;
  document_id: string;
  uploaded_at: string;
  result: UploadResult;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphRelationship {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export type View = 'chat' | 'upload' | 'graph';
