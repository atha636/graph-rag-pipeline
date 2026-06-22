export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt';
  size?: number;
  uploadedAt?: string;
  chunks?: number;
}

export interface Source {
  type: 'vector' | 'graph';
  document_name: string;
  document_type: string;
  chunk_index?: number;
  similarity_score?: number;
  relevance_score?: number;
  content?: string;
  relationship?: string;
  entity?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  sourceCount?: number;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface QueryRequest {
  query: string;
  top_k?: number;
}

export interface QueryResponse {
  answer: string;
  sources: Source[];
  source_count: number;
  intent?: string;
  entities?: string[];
}

export interface UploadResponse {
  success: boolean;
  document_id: string;
  document_name: string;
  chunks_created: number;
  entities_extracted: number;
  relationships_created: number;
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
