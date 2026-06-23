import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './pages/ChatView';
import { UploadView } from './pages/UploadView';
import { GraphView } from './pages/GraphView';
import { healthCheckAPI } from './services/api';
import type { Document, View } from './types';

// Documents are tracked client-side from successful uploads
// (no GET /api/documents endpoint exists in the backend)
const STORAGE_KEY = 'graphrag_documents';

const loadStoredDocs = (): Document[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export const App: React.FC = () => {
  const [view, setView] = useState<View>('chat');
  const [documents, setDocuments] = useState<Document[]>(loadStoredDocs);
  const [isOnline, setIsOnline] = useState(false);

  const checkHealth = useCallback(async () => {
    const ok = await healthCheckAPI();
    setIsOnline(ok);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Persist documents to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents]);

  const handleUploaded = useCallback((filename: string, docId: string, uploadedAt: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() as Document['type'] ?? 'txt';
    const newDoc: Document = {
      id: docId,
      name: filename,
      type: ext,
      uploadedAt,
    };
    setDocuments((prev) => {
      // avoid duplicates
      if (prev.find((d) => d.id === docId)) return prev;
      return [newDoc, ...prev];
    });
  }, []);

  const handleDeleteDoc = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div style={styles.app}>
      <Sidebar
        currentView={view}
        onViewChange={setView}
        documents={documents}
        loadingDocs={false}
        onDeleteDoc={handleDeleteDoc}
        isOnline={isOnline}
      />
      <main style={styles.main}>
        {view === 'chat' && <ChatView />}
        {view === 'upload' && (
          <UploadView onUploaded={handleUploaded} />
        )}
        {view === 'graph' && <GraphView />}
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  app: { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};
