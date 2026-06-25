import axios, { type CancelTokenSource } from 'axios';
import type { QueryRequest, QueryResponse, UploadResponse, GraphData } from '../types';

const api = axios.create({
  baseURL: '',
  timeout: 90000,
});

// ── Request cancellation ───────────────────────────────────────────
// Store the active query cancel token so ChatView can abort in-flight
// requests when the user starts a new message.
let activeQueryCancel: CancelTokenSource | null = null;

export const cancelActiveQuery = () => {
  activeQueryCancel?.cancel('Cancelled by user');
  activeQueryCancel = null;
};

// ── Retry helper ───────────────────────────────────────────────────
// Retries on transient network errors (not 4xx client errors).
const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 800
): Promise<T> => {
  try {
    return await fn();
  } catch (err: unknown) {
    if (retries <= 0) throw err;
    if (axios.isCancel(err)) throw err;
    // Don't retry client errors (400, 422 etc.)
    if (axios.isAxiosError(err) && err.response && err.response.status < 500) throw err;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 1.5);
  }
};

// ── API calls ──────────────────────────────────────────────────────

export const queryAPI = async (request: QueryRequest): Promise<QueryResponse> => {
  cancelActiveQuery(); // cancel any previous in-flight query
  activeQueryCancel = axios.CancelToken.source();

  const { data } = await api.post<QueryResponse>('/api/v1/query', request, {
    cancelToken: activeQueryCancel.token,
  });

  activeQueryCancel = null;
  return data;
};

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
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    })
  );

  return data;
};

export const healthCheckAPI = async (): Promise<boolean> => {
  try {
    await api.get('/health', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

export const getGraphDataAPI = async (): Promise<GraphData> => {
  try {
    const { data } = await withRetry(() => api.get<GraphData>('/api/v1/graph'));
    return data;
  } catch {
    return { nodes: [], relationships: [] };
  }
};