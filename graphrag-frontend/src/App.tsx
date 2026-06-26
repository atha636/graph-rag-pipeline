import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './pages/ChatView';
import { UploadView } from './pages/UploadView';
import { GraphView } from './pages/GraphView';
import { DocumentsView } from './pages/DocumentsView';
import { ToastContainer, useToast } from './components/Toast';
import { healthCheckAPI, getStatsAPI } from './services/api';
import type { Document, View, SessionStats, StatsData } from './types';
import { useTheme } from './components/ThemeToggle';

const STORAGE_KEY = 'graphrag_documents';
const STATS_KEY   = 'graphrag_stats';

const loadStored = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
};

export const App: React.FC = () => {
  const { theme, toggle: toggleTheme } = useTheme();
  const { toasts, addToast, removeToast } = useToast();

  const [view,       setView]       = useState<View>('chat');
  const [documents,  setDocuments]  = useState<Document[]>(loadStored(STORAGE_KEY, []));
  const [isOnline,   setIsOnline]   = useState(false);
  const [stats,      setStats]      = useState<SessionStats>(loadStored(STATS_KEY, { totalQueries: 0, avgLatencyMs: 0, totalSources: 0 }));
  const [liveStats,  setLiveStats]  = useState<StatsData | null>(null);

  const prevOnline = useRef<boolean | null>(null);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key === '1') { e.preventDefault(); setView('chat'); }
      if (e.key === '2') { e.preventDefault(); setView('upload'); }
      if (e.key === '3') { e.preventDefault(); setView('graph'); }
      if (e.key === '4') { e.preventDefault(); setView('documents'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const checkHealth = useCallback(async () => {
    const ok = await healthCheckAPI();
    setIsOnline(ok);
    if (prevOnline.current !== null) {
      if (prevOnline.current && !ok)  addToast('Backend disconnected', 'error');
      if (!prevOnline.current && ok)  addToast('Backend connected', 'success', 2500);
    }
    prevOnline.current = ok;

    // Fetch live stats from backend when online
    if (ok) {
      const s = await getStatsAPI();
      if (s) setLiveStats(s);
    }
  }, [addToast]);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 30_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(documents)); }, [documents]);
  useEffect(() => { localStorage.setItem(STATS_KEY,   JSON.stringify(stats));     }, [stats]);

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
    addToast(`"${filename}" processed`, 'success');
    // Refresh live stats
    getStatsAPI().then(s => { if (s) setLiveStats(s); });
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
        liveStats={liveStats}
      />

      <main style={styles.main}>
        {view === 'chat'      && <ChatView onStatsUpdate={handleStatsUpdate} />}
        {view === 'upload'    && <UploadView onUploaded={handleUploaded} />}
        {view === 'graph'     && <GraphView />}
        {view === 'documents' && <DocumentsView />}
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  app:  { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};