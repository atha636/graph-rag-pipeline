export interface Document {
  id: string; name: string; type: 'pdf' | 'docx' | 'txt'; uploadedAt?: string;
}

export interface Source {
  source_type: 'vector' | 'graph';
  content: string;
  document_name?: string; document_type?: string; document_id?: string;
  uploaded_at?: string; chunk_id?: number; chunk_size?: number;
  score?: number; relevance_score?: number;
}

export interface Message {
  id: string; role: 'user' | 'assistant'; content: string;
  sources?: Source[]; documents?: string[];
  timestamp: Date; isStreaming?: boolean;
  latency_ms?: number; followUps?: string[];
  cache_hit?: boolean; intent?: string;
}

export interface QueryRequest {
  query: string;
  conversation_id?: string;
  top_k?: number;
  use_cache?: boolean;
}

export interface QueryResponse {
  answer: string; documents: string[]; sources: Source[];
  latency_ms: number; cache_hit: boolean;
  conversation_id?: string; intent?: string; entities?: string[];
}

export interface UploadResult {
  chunks_processed?: number; vectors_created?: number;
  relationships_added?: number; [key: string]: unknown;
}

export interface UploadResponse {
  filename: string; document_id: string; uploaded_at: string; result: UploadResult;
}

export interface GraphNode { id: string; label: string; type: string; }
export interface GraphRelationship { source: string; target: string; type: string; }
export interface GraphData { nodes: GraphNode[]; relationships: GraphRelationship[]; }

export interface ConversationSummary {
  id: string; title: string; created_at: string; updated_at: string; turn_count: number;
}
export interface ConversationDetail extends ConversationSummary {
  messages: Array<{ role: string; content: string; }>;
}

export interface StatsData {
  graph_node_count: number; graph_rel_count: number;
  document_count: number; cache_size: number;
  cache_hit_rate: number; cache_total_requests: number;
}

export interface SessionStats { totalQueries: number; avgLatencyMs: number; totalSources: number; }
export type View = 'chat' | 'upload' | 'graph' | 'documents';
export type DocFilter = 'all' | 'pdf' | 'docx' | 'txt';