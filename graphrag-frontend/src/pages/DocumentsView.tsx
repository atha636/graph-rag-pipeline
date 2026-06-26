import React, { useState, useEffect } from 'react';
import { FileText, FileType, File, RefreshCw, Layers, Network, Calendar, Search, Trash2, AlertCircle, Database } from 'lucide-react';
import { getDocumentsAPI } from '../services/api';

interface DocRecord {
  document_id: string; document_name: string;
  document_type: string; uploaded_at: string; chunk_count: number;
}

const FileIcon = ({ type }: { type: string }) => {
  if (type.includes('pdf'))  return <FileType size={18} color="var(--error)" />;
  if (type.includes('docx')) return <FileText size={18} color="var(--secondary)" />;
  return <File size={18} color="var(--text-muted)" />;
};

export const DocumentsView: React.FC = () => {
  const [docs,    setDocs]    = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await getDocumentsAPI();
      setDocs(data);
    } catch {
      setError('Could not load documents. Make sure your backend is running.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = docs.filter(d =>
    d.document_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.headerIcon}><Database size={15} color="var(--accent)" /></div>
        <div style={{ flex: 1 }}>
          <h2 style={s.headerTitle}>Documents</h2>
          <p style={s.headerSub}>{docs.length} indexed · {totalChunks} total chunks</p>
        </div>
        <div style={s.searchBox}>
          <Search size={12} color="var(--text-muted)" />
          <input style={s.searchInput} placeholder="Search documents…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button style={s.refreshBtn} onClick={load}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      <div style={s.content}>
        {error && (
          <div style={s.errorBox}><AlertCircle size={16} color="var(--error)" /><p style={s.errorText}>{error}</p></div>
        )}

        {/* Summary cards */}
        <div style={s.statsRow}>
          {[
            { label: 'Total Documents', value: docs.length, icon: <FileText size={16} color="var(--accent)" /> },
            { label: 'Total Chunks',    value: totalChunks, icon: <Layers size={16} color="var(--secondary)" /> },
            { label: 'PDFs',  value: docs.filter(d => d.document_type.includes('pdf')).length,  icon: <FileType size={16} color="var(--error)" /> },
            { label: 'TXTs',  value: docs.filter(d => d.document_type.includes('txt')).length,  icon: <File size={16} color="var(--text-muted)" /> },
          ].map(card => (
            <div key={card.label} style={s.statCard}>
              <div style={s.statIcon}>{card.icon}</div>
              <div>
                <p style={s.statVal}>{card.value}</p>
                <p style={s.statLabel}>{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Document table */}
        {filtered.length === 0 && !loading ? (
          <div style={s.empty}>
            <Database size={36} color="var(--text-faint)" />
            <p style={s.emptyTitle}>{search ? 'No matches found' : 'No documents indexed yet'}</p>
            <p style={s.emptySub}>{search ? 'Try a different search term.' : 'Upload PDF, DOCX or TXT files to get started.'}</p>
          </div>
        ) : (
          <div style={s.tableWrap}>
            <div style={s.tableHeader}>
              <span style={{ ...s.col, flex: 3 }}>Document</span>
              <span style={{ ...s.col, flex: 1 }}>Type</span>
              <span style={{ ...s.col, flex: 1 }}>Chunks</span>
              <span style={{ ...s.col, flex: 2 }}>Indexed At</span>
              <span style={{ ...s.col, flex: 1 }}>ID</span>
            </div>
            {filtered.map(doc => (
              <div key={doc.document_id} style={s.tableRow}>
                <div style={{ ...s.col, flex: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileIcon type={doc.document_type} />
                  <span style={s.docName}>{doc.document_name}</span>
                </div>
                <div style={{ ...s.col, flex: 1 }}>
                  <span style={s.typeBadge}>{doc.document_type.replace('.', '').toUpperCase()}</span>
                </div>
                <div style={{ ...s.col, flex: 1 }}>
                  <span style={s.chunkBadge}>
                    <Layers size={10} /> {doc.chunk_count}
                  </span>
                </div>
                <div style={{ ...s.col, flex: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={11} color="var(--text-muted)" />
                  <span style={s.dateText}>{doc.uploaded_at || '—'}</span>
                </div>
                <div style={{ ...s.col, flex: 1 }}>
                  <span style={s.idText}>{doc.document_id.slice(-8)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container:  { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' },
  header:     { display:'flex', alignItems:'center', gap:12, padding:'14px 28px', borderBottom:'1px solid var(--border)', background:'var(--bg-surface)', flexShrink:0 },
  headerIcon: { width:34, height:34, borderRadius:9, background:'var(--accent-glow)', border:'1px solid rgba(217,119,6,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  headerTitle:{ fontSize:15, fontWeight:600, color:'var(--text-primary)' },
  headerSub:  { fontSize:11, color:'var(--text-muted)', marginTop:1 },
  searchBox:  { display:'flex', alignItems:'center', gap:6, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', minWidth:180 },
  searchInput:{ background:'none', border:'none', outline:'none', color:'var(--text-primary)', fontSize:12, width:'100%' },
  refreshBtn: { width:32, height:32, borderRadius:8, background:'var(--bg-elevated)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-secondary)' },
  content:    { flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 },
  errorBox:   { display:'flex', alignItems:'center', gap:10, padding:14, background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:'var(--radius-md)' },
  errorText:  { fontSize:13, color:'var(--error)' },
  statsRow:   { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 },
  statCard:   { background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', padding:'14px 16px', display:'flex', alignItems:'center', gap:12 },
  statIcon:   { width:34, height:34, borderRadius:8, background:'var(--bg-elevated)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  statVal:    { fontSize:20, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-mono)', lineHeight:1.2 },
  statLabel:  { fontSize:11, color:'var(--text-muted)', marginTop:2 },
  tableWrap:  { background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', overflow:'hidden' },
  tableHeader:{ display:'flex', padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg-elevated)' },
  tableRow:   { display:'flex', padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)', transition:'background 0.1s', alignItems:'center' },
  col:        { fontSize:13, color:'var(--text-secondary)', display:'flex', alignItems:'center' },
  docName:    { fontSize:13, color:'var(--text-primary)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  typeBadge:  { fontSize:10, fontWeight:700, color:'var(--text-muted)', background:'var(--bg-elevated)', border:'1px solid var(--border)', padding:'2px 7px', borderRadius:4 },
  chunkBadge: { display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'var(--accent)', background:'var(--accent-glow)', padding:'2px 8px', borderRadius:4 },
  dateText:   { fontSize:11.5, color:'var(--text-muted)' },
  idText:     { fontSize:11, color:'var(--text-faint)', fontFamily:'var(--font-mono)' },
  empty:      { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:10, padding:60, textAlign:'center' },
  emptyTitle: { fontSize:16, fontWeight:600, color:'var(--text-secondary)' },
  emptySub:   { fontSize:13, color:'var(--text-muted)' },
};