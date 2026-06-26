import axios, { type CancelTokenSource } from 'axios';
import type {
  QueryRequest, QueryResponse, UploadResponse,
  GraphData, ConversationSummary, ConversationDetail, StatsData,
} from '../types';

const api = axios.create({ baseURL: '', timeout: 90000 });

let activeQueryCancel: CancelTokenSource | null = null;

export const cancelActiveQuery = () => {
  activeQueryCancel?.cancel('Cancelled by user');
  activeQueryCancel = null;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 2, delay = 800): Promise<T> => {
  try { return await fn(); }
  catch (err) {
    if (retries <= 0) throw err;
    if (axios.isCancel(err)) throw err;
    if (axios.isAxiosError(err) && err.response && err.response.status < 500) throw err;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 1.5);
  }
};

// ── Query (non-streaming fallback) ────────────────────────────────
export const queryAPI = async (request: QueryRequest): Promise<QueryResponse> => {
  cancelActiveQuery();
  activeQueryCancel = axios.CancelToken.source();
  const { data } = await api.post<QueryResponse>('/api/v1/query', request, {
    cancelToken: activeQueryCancel.token,
  });
  activeQueryCancel = null;
  return data;
};

// ── SSE Streaming query ───────────────────────────────────────────
export interface StreamCallbacks {
  onMeta:  (meta: { sources: unknown[]; documents: string[]; cache_hit: boolean; intent?: string }) => void;
  onChunk: (text: string) => void;
  onDone:  (latency_ms: number) => void;
  onError: (err: string) => void;
}

export const queryStream = (
  request: QueryRequest,
  callbacks: StreamCallbacks
): (() => void) => {
  let cancelled = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const run = async () => {
    try {
      const response = await fetch('/api/v1/query/stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(request),
      });

      if (!response.ok) {
        callbacks.onError(`Backend error: ${response.status}`);
        return;
      }

      reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'meta')  callbacks.onMeta(msg);
            if (msg.type === 'chunk') callbacks.onChunk(msg.text);
            if (msg.type === 'done')  callbacks.onDone(msg.latency_ms);
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err) {
      if (!cancelled) callbacks.onError(String(err));
    }
  };

  run();

  return () => {
    cancelled = true;
    reader?.cancel();
  };
};

// ── Upload ────────────────────────────────────────────────────────
export const uploadDocumentAPI = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await withRetry(() =>
    api.post<UploadResponse>('/api/v1/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    })
  );
  return data;
};

// ── Graph ─────────────────────────────────────────────────────────
export const getGraphDataAPI = async (): Promise<GraphData> => {
  try {
    const { data } = await withRetry(() => api.get<GraphData>('/api/v1/graph'));
    return data;
  } catch { return { nodes: [], relationships: [] }; }
};

// ── Documents ─────────────────────────────────────────────────────
export const getDocumentsAPI = async () => {
  try {
    const { data } = await api.get('/api/v1/documents');
    return data as Array<{
      document_id: string; document_name: string;
      document_type: string; uploaded_at: string; chunk_count: number;
    }>;
  } catch { return []; }
};

// ── Conversations ─────────────────────────────────────────────────
export const createConversationAPI = async (title?: string): Promise<string> => {
  const { data } = await api.post('/api/v1/conversations', { title });
  return data.conversation_id;
};

export const listConversationsAPI = async (): Promise<ConversationSummary[]> => {
  const { data } = await api.get('/api/v1/conversations');
  return data;
};

export const getConversationAPI = async (id: string): Promise<ConversationDetail> => {
  const { data } = await api.get(`/api/v1/conversations/${id}`);
  return data;
};

export const renameConversationAPI = async (id: string, title: string) => {
  await api.put(`/api/v1/conversations/${id}`, { title });
};

export const deleteConversationAPI = async (id: string) => {
  await api.delete(`/api/v1/conversations/${id}`);
};

// ── Stats ─────────────────────────────────────────────────────────
export const getStatsAPI = async (): Promise<StatsData | null> => {
  try {
    const { data } = await api.get<StatsData>('/api/v1/stats');
    return data;
  } catch { return null; }
};

// ── Health ────────────────────────────────────────────────────────
export const healthCheckAPI = async (): Promise<boolean> => {
  try { await api.get('/health', { timeout: 5000 }); return true; }
  catch { return false; }
};