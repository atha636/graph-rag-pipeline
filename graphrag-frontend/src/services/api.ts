import axios from 'axios';
import type { QueryRequest, QueryResponse, UploadResponse, GraphData } from '../types';

const api = axios.create({
  baseURL: '',          // vite proxy handles /api
  timeout: 60000,
});

// POST /api/v1/query
export const queryAPI = async (request: QueryRequest): Promise<QueryResponse> => {
  const { data } = await api.post<QueryResponse>('/api/v1/query', request);
  return data;
};

// POST /api/v1/upload
export const uploadDocumentAPI = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<UploadResponse>('/api/v1/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
};

// GET /health
export const healthCheckAPI = async (): Promise<boolean> => {
  try {
    await api.get('/health');
    return true;
  } catch {
    return false;
  }
};

// GET /api/v1/graph  — optional, gracefully fails if not implemented yet
export const getGraphDataAPI = async (): Promise<GraphData> => {
  try {
    const { data } = await api.get<GraphData>('/api/v1/graph');
    return data;
  } catch {
    return { nodes: [], relationships: [] };
  }
};
