import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './pages/ChatView';
import { UploadView } from './pages/UploadView';
import { GraphView } from './pages/GraphView';
import { ToastContainer, useToast } from './components/Toast';
import { healthCheckAPI } from './services/api';
import type { Document, View } from './types';
import { useTheme } from './components/ThemeToggle';

const STORAGE_KEY = 'graphrag_documents';

const loadStoredDocs = (): Document[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export const App: React.FC = () => {
  const { theme, toggle: toggleTheme } = useTheme();
  const { toasts, addToast, removeToast } = useToast();

  const [view,      setView]      = useState<View>('chat');
  const [documents, setDocuments] = useState<Document[]>(loadStoredDocs);
  const [isOnline,  setIsOnline]  = useState(false);

  const checkHealth = useCallback(async () => {
    const ok = await healthCheckAPI();
    setIsOnline(prev => {
      if (prev && !ok) addToast('Backend disconnected', 'error');
      if (!prev && ok) addToast('Backend connected', 'success', 2500);
      return ok;
    });
  }, [addToast]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents]);

  const handleUploaded = useCallback((filename: string, docId: string, uploadedAt: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() as Document['type'] ?? 'txt';
    setDocuments(prev => {
      if (prev.find(d => d.id === docId)) return prev;
      return [{ id: docId, name: filename, type: ext, uploadedAt }, ...prev];
    });
    addToast(`"${filename}" processed successfully`, 'success');
  }, [addToast]);

  const handleDeleteDoc = useCallback((id: string) => {
    setDocuments(prev => {
      const doc = prev.find(d => d.id === id);
      if (doc) addToast(`"${doc.name}" removed`, 'info', 2500);
      return prev.filter(d => d.id !== id);
    });
  }, [addToast]);

  return (
    <div style={styles.app}>
      <Sidebar
        currentView={view}
        onViewChange={setView}
        documents={documents}
        loadingDocs={false}
        onDeleteDoc={handleDeleteDoc}
        isOnline={isOnline}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main style={styles.main}>
        {view === 'chat'   && <ChatView />}
        {view === 'upload' && <UploadView onUploaded={handleUploaded} />}
        {view === 'graph'  && <GraphView />}
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  app:  { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};