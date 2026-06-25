export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt';
  uploadedAt?: string;
  size?: number;
}

export interface Source {
  source_type: 'vector' | 'graph';
  content: string;
  document_name?: string;
  document_type?: string;
  document_id?: string;
  uploaded_at?: string;
  chunk_id?: number;
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
  latency_ms?: number;
  followUps?: string[];
}

export interface QueryRequest {
  query: string;
}

export interface QueryResponse {
  answer: string;
  documents: string[];
  sources: Source[];
  latency_ms: number;
}

export interface UploadResult {
  chunks_processed?: number;
  vectors_created?: number;
  relationships_added?: number;
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

// Session-level stats shown in sidebar footer
export interface SessionStats {
  totalQueries: number;
  avgLatencyMs: number;
  totalSources: number;
}

export type View = 'chat' | 'upload' | 'graph';
export type DocFilter = 'all' | 'pdf' | 'docx' | 'txt';