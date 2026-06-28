import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, FileType, File, RefreshCw, Layers,
  Calendar, Search, Database, AlertCircle, X,
  BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getDocumentsAPI } from '../services/api';

interface DocRecord {
  document_id:   string;
  document_name: string;
  document_type: string;
  uploaded_at:   string;
  chunk_count:   number;
  source?:       'pinecone' | 'local';
  summary?:      string;
}

interface DocSummary {
  document_id:   string;
  document_name: string;
  summary:       string;
}

const FileIcon = ({ type }: { type: string }) => {
  if (type.includes('pdf'))  return <FileType size={18} color="var(--error)" />;
  if (type.includes('docx')) return <FileText size={18} color="var(--secondary)" />;
  return <File size={18} color="var(--text-muted)" />;
};

const loadLocalDocs = (): DocRecord[] => {
  try {
    const raw = JSON.parse(localStorage.getItem('graphrag_documents') ?? '[]');
    return raw.map((d: { id: string; name: string; type: string; uploadedAt?: string }) => ({
      document_id:   d.id,
      document_name: d.name,
      document_type: '.' + d.type,
      uploaded_at:   d.uploadedAt ?? '',
      chunk_count:   0,
      source:        'local' as const,
    }));
  } catch { return []; }
};

const SummaryRow: React.FC<{ summary: string }> = ({ summary }) => {
  const [expanded, setExpanded] = useState(false);
  const short = summary.length > 200;
  return (
    <div style={ss.summaryBox}>
      <div style={ss.summaryHeader}>
        <BookOpen size={11} color="var(--accent)" />
        <span style={ss.summaryLabel}>Document Summary</span>
      </div>
      <p style={ss.summaryText}>
        {expanded || !short ? summary : summary.slice(0, 200) + '…'}
      </p>
      {short && (
        <button style={ss.summaryToggle} onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          <span>{expanded ? 'Show less' : 'Show more'}</span>
        </button>
      )}
    </div>
  );
};

export const DocumentsView: React.FC = () => {
  const [docs,      setDocs]      = useState<DocRecord[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [error,     setError]     = useState('');
  const [source,    setSource]    = useState<'pinecone' | 'local' | ''>('');
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, summaryData] = await Promise.all([
        getDocumentsAPI(),
        fetch('/api/v1/summaries').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      // Merge summaries into docs
      const summaryMap: Record<string, string> = {};
      (summaryData as DocSummary[]).forEach(s => {
        summaryMap[s.document_id] = s.summary;
      });
      setSummaries(summaryMap);

      if (data && data.length > 0) {
        setDocs(data.map(d => ({
          ...d,
          source:  'pinecone' as const,
          summary: summaryMap[d.document_id],
        })));
        setSource('pinecone');
      } else {
        const local = loadLocalDocs().map(d => ({
          ...d,
          summary: summaryMap[d.document_id],
        }));
        setDocs(local);
        setSource(local.length > 0 ? 'local' : '');
        if (local.length > 0) {
          setError(
            'Pinecone returned no results yet. Showing locally-tracked uploads. ' +
            'Refresh in a moment after the backend finishes indexing.'
          );
        }
      }
    } catch {
      const local = loadLocalDocs();
      setDocs(local);
      setSource(local.length > 0 ? 'local' : '');
      setError('Could not reach backend. Showing locally-tracked uploads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered    = docs.filter(d =>
    d.document_name.toLowerCase().includes(search.toLowerCase())
  );
  const totalChunks = docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0);
  const pdfCount    = docs.filter(d => d.document_type.includes('pdf')).length;
  const txtCount    = docs.filter(d => d.document_type.includes('txt')).length;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerIcon}><Database size={15} color="var(--accent)" /></div>
        <div style={{ flex: 1 }}>
          <h2 style={s.headerTitle}>Documents</h2>
          <p style={s.headerSub}>
            {docs.length} indexed{totalChunks > 0 ? ` · ${totalChunks} chunks` : ''}
            {source === 'local' && <span style={s.localBadge}> · local cache</span>}
          </p>
        </div>
        <div style={s.searchBox}>
          <Search size={12} color="var(--text-muted)" />
          <input
            style={s.searchInput}
            placeholder="Search documents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button style={s.iconBtn} onClick={() => setSearch('')}>
              <X size={11} color="var(--text-muted)" />
            </button>
          )}
        </div>
        <button style={s.refreshBtn} onClick={load}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      <div style={s.content}>
        {/* Warning */}
        {error && (
          <div style={s.warnBox}>
            <AlertCircle size={14} color="var(--warning)" style={{ flexShrink: 0 }} />
            <p style={s.warnText}>{error}</p>
            <button style={s.iconBtn} onClick={() => setError('')}>
              <X size={12} color="var(--text-muted)" />
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div style={s.statsRow}>
          {[
            { label: 'Total Documents', value: docs.length,  icon: <FileText size={15} color="var(--accent)" />,     bg: 'var(--accent-glow)' },
            { label: 'Total Chunks',    value: totalChunks,  icon: <Layers   size={15} color="var(--secondary)" />,  bg: 'var(--secondary-dim)' },
            { label: 'PDFs',            value: pdfCount,     icon: <FileType size={15} color="var(--error)" />,      bg: 'rgba(220,38,38,0.08)' },
            { label: 'Summarized',      value: Object.keys(summaries).length, icon: <BookOpen size={15} color="var(--success)" />, bg: 'rgba(101,163,13,0.1)' },
          ].map(card => (
            <div key={card.label} style={s.statCard}>
              <div style={{ ...s.statIcon, background: card.bg }}>{card.icon}</div>
              <div>
                <p style={s.statVal}>{card.value}</p>
                <p style={s.statLabel}>{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading && docs.length === 0 ? (
          <div style={s.empty}>
            <RefreshCw size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={s.emptyTitle}>Loading documents…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            <Database size={36} color="var(--text-faint)" />
            <p style={s.emptyTitle}>{search ? 'No matches' : 'No documents yet'}</p>
            <p style={s.emptySub}>{search ? 'Try a different search.' : 'Upload PDF, DOCX, or TXT files to get started.'}</p>
          </div>
        ) : (
          <div style={s.tableWrap}>
            <div style={s.tableHeader}>
              <span style={{ ...s.th, flex: 3 }}>Document</span>
              <span style={{ ...s.th, flex: 1 }}>Type</span>
              <span style={{ ...s.th, flex: 1 }}>Chunks</span>
              <span style={{ ...s.th, flex: 2 }}>Indexed At</span>
              <span style={{ ...s.th, flex: 1 }}>ID</span>
            </div>

            {filtered.map(doc => (
              <React.Fragment key={doc.document_id}>
                <div
                  style={{
                    ...s.tableRow,
                    background: expanded === doc.document_id ? 'var(--bg-elevated)' : 'transparent',
                    cursor: doc.summary ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (doc.summary) setExpanded(e => e === doc.document_id ? null : doc.document_id);
                  }}
                  onMouseEnter={e => { if (expanded !== doc.document_id) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  onMouseLeave={e => { if (expanded !== doc.document_id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ ...s.td, flex: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileIcon type={doc.document_type} />
                    <div style={{ overflow: 'hidden' }}>
                      <p style={s.docName} title={doc.document_name}>{doc.document_name}</p>
                      {doc.source === 'local' && <p style={s.localTag}>locally tracked</p>}
                    </div>
                    {doc.summary && (
                      <div style={s.summaryDot} title="Summary available">
                        <BookOpen size={10} color="var(--accent)" />
                      </div>
                    )}
                  </div>
                  <div style={{ ...s.td, flex: 1 }}>
                    <span style={s.typeBadge}>{doc.document_type.replace('.', '').toUpperCase() || 'FILE'}</span>
                  </div>
                  <div style={{ ...s.td, flex: 1 }}>
                    {doc.chunk_count > 0
                      ? <span style={s.chunkBadge}><Layers size={10} /> {doc.chunk_count}</span>
                      : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>}
                  </div>
                  <div style={{ ...s.td, flex: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={11} color="var(--text-muted)" />
                    <span style={s.dateText}>{doc.uploaded_at?.slice(0, 16).replace('T', ' ') || '—'}</span>
                  </div>
                  <div style={{ ...s.td, flex: 1 }}>
                    <span style={s.idText} title={doc.document_id}>{doc.document_id.slice(-8)}</span>
                  </div>
                </div>

                {/* Expandable summary row */}
                {expanded === doc.document_id && doc.summary && (
                  <div style={s.summaryRow}>
                    <SummaryRow summary={doc.summary} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {search && filtered.length > 0 && (
          <p style={s.searchCount}>{filtered.length} of {docs.length} documents</p>
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container:   { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 },
  headerIcon:  { width: 34, height: 34, borderRadius: 9, background: 'var(--accent-glow)', border: '1px solid rgba(217,119,6,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  headerSub:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  localBadge:  { color: 'var(--warning)', fontWeight: 500 },
  searchBox:   { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', minWidth: 200 },
  searchInput: { background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12, width: '100%' },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 },
  refreshBtn:  { width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 },
  content:     { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  warnBox:     { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--radius-md)' },
  warnText:    { fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 },
  statsRow:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 },
  statCard:    { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  statIcon:    { width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statVal:     { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.1 },
  statLabel:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  tableWrap:   { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  tableHeader: { display: 'flex', padding: '9px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' },
  tableRow:    { display: 'flex', padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', transition: 'background 0.1s' },
  th:          { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  td:          { fontSize: 13, color: 'var(--text-secondary)' },
  docName:     { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  localTag:    { fontSize: 10, color: 'var(--warning)', marginTop: 1 },
  summaryDot:  { flexShrink: 0, display: 'flex', alignItems: 'center' },
  typeBadge:   { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4 },
  chunkBadge:  { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: 4 },
  dateText:    { fontSize: 11.5, color: 'var(--text-muted)' },
  idText:      { fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  summaryRow:  { borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', padding: '0 16px 12px 48px' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 60, textAlign: 'center' },
  emptyTitle:  { fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' },
  emptySub:    { fontSize: 13, color: 'var(--text-muted)' },
  searchCount: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
};

const ss: Record<string, React.CSSProperties> = {
  summaryBox:    { paddingTop: 10 },
  summaryHeader: { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 },
  summaryLabel:  { fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  summaryText:   { fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 },
  summaryToggle: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' },
};