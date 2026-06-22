import axios from 'axios';
import type { QueryRequest, QueryResponse, UploadResponse, Document, GraphData } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export const queryAPI = async (request: QueryRequest): Promise<QueryResponse> => {
  const { data } = await api.post<QueryResponse>('/query', request);
  return data;
};

export const uploadDocumentAPI = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<UploadResponse>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
};

export const getDocumentsAPI = async (): Promise<Document[]> => {
  const { data } = await api.get<Document[]>('/documents');
  return data;
};

export const deleteDocumentAPI = async (docId: string): Promise<void> => {
  await api.delete(`/documents/${docId}`);
};

export const getGraphDataAPI = async (): Promise<GraphData> => {
  const { data } = await api.get<GraphData>('/graph');
  return data;
};

export const healthCheckAPI = async (): Promise<boolean> => {
  try {
    await api.get('/health');
    return true;
  } catch {
    return false;
  }
};
