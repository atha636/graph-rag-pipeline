import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './pages/ChatView';
import { UploadView } from './pages/UploadView';
import { GraphView } from './pages/GraphView';
import { getDocumentsAPI, deleteDocumentAPI, healthCheckAPI } from './services/api';
import type { Document, View } from './types';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('chat');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const docs = await getDocumentsAPI();
      setDocuments(docs);
    } catch {
      // Backend may not be running yet
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    const ok = await healthCheckAPI();
    setIsOnline(ok);
  }, []);

  useEffect(() => {
    fetchDocuments();
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchDocuments, checkHealth]);

  const handleDeleteDoc = async (id: string) => {
    try {
      await deleteDocumentAPI(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
  };

  const handleUploaded = () => {
    fetchDocuments();
  };

  return (
    <div style={styles.app}>
      <Sidebar
        currentView={view}
        onViewChange={setView}
        documents={documents}
        loadingDocs={loadingDocs}
        onDeleteDoc={handleDeleteDoc}
        isOnline={isOnline}
      />

      <main style={styles.main}>
        {view === 'chat' && <ChatView />}
        {view === 'upload' && <UploadView onUploaded={handleUploaded} />}
        {view === 'graph' && <GraphView />}
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};
