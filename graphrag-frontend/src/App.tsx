import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './pages/ChatView';
import { UploadView } from './pages/UploadView';
import { GraphView } from './pages/GraphView';
import { ToastContainer, useToast } from './components/Toast';
import { healthCheckAPI } from './services/api';
import type { Document, View, SessionStats } from './types';
import { useTheme } from './components/ThemeToggle';

const STORAGE_KEY  = 'graphrag_documents';
const STATS_KEY    = 'graphrag_stats';

const loadStoredDocs = (): Document[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
};

const loadStoredStats = (): SessionStats => {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null')
      ?? { totalQueries: 0, avgLatencyMs: 0, totalSources: 0 };
  } catch {
    return { totalQueries: 0, avgLatencyMs: 0, totalSources: 0 };
  }
};

export const App: React.FC = () => {
  const { theme, toggle: toggleTheme } = useTheme();
  const { toasts, addToast, removeToast } = useToast();

  const [view,      setView]      = useState<View>('chat');
  const [documents, setDocuments] = useState<Document[]>(loadStoredDocs);
  const [isOnline,  setIsOnline]  = useState(false);
  const [stats,     setStats]     = useState<SessionStats>(loadStoredStats);

  const prevOnline = useRef<boolean | null>(null);

  // Keyboard shortcuts ⌘1 / ⌘2 / ⌘3
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod   = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key === '1') { e.preventDefault(); setView('chat');   }
      if (e.key === '2') { e.preventDefault(); setView('upload'); }
      if (e.key === '3') { e.preventDefault(); setView('graph');  }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Health polling
  const checkHealth = useCallback(async () => {
    const ok = await healthCheckAPI();
    setIsOnline(ok);

    if (prevOnline.current !== null) {
      if (prevOnline.current && !ok) addToast('Backend disconnected', 'error');
      if (!prevOnline.current && ok) addToast('Backend connected', 'success', 2500);
    }
    prevOnline.current = ok;
  }, [addToast]);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 20_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  // Persist documents
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents]);

  // Persist stats
  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Called by ChatView after each successful query
  const handleStatsUpdate = useCallback((latencyMs: number, sourceCount: number) => {
    setStats(prev => {
      const n = prev.totalQueries + 1;
      return {
        totalQueries: n,
        avgLatencyMs: (prev.avgLatencyMs * (n - 1) + latencyMs) / n,
        totalSources: prev.totalSources + sourceCount,
      };
    });
  }, []);

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
        stats={stats}
      />

      <main style={styles.main}>
        {view === 'chat'   && <ChatView onStatsUpdate={handleStatsUpdate} />}
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