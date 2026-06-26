import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileText, FileType, File, CheckCircle, XCircle,
  Loader2, CloudUpload, Sparkles, Network, Layers,
  Calendar, Hash, Trash2, AlertCircle,
} from 'lucide-react';
import { uploadDocumentAPI } from '../services/api';
import type { UploadResponse } from '../types';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  result?: UploadResponse;
  error?: string;
}

const FileIcon = ({ name, size = 20 }: { name: string; size?: number }) => {
  if (name.endsWith('.pdf'))  return <FileType size={size} color="#ef4444" />;
  if (name.endsWith('.docx')) return <FileText size={size} color="var(--secondary)" />;
  return <File size={size} color="var(--text-muted)" />;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const STATUS_ICON = {
  pending:   null,
  uploading: <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />,
  success:   <CheckCircle size={15} color="var(--success)" />,
  error:     <AlertCircle size={15} color="var(--error)" />,
};

export const UploadView: React.FC<{
  onUploaded: (filename: string, docId: string, uploadedAt: string) => void;
}> = ({ onUploaded }) => {
  const [items,    setItems]   = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const allowed = ['.pdf', '.docx', '.txt'];
    const newItems: UploadItem[] = [];

    Array.from(files).forEach(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!allowed.includes(ext)) return;

      // Duplicate detection by name + size
      setItems(prev => {
        const isDup = prev.some(i => i.file.name === f.name && i.file.size === f.size);
        if (isDup) return prev;
        return [
          ...prev,
          { id: `${Date.now()}_${Math.random()}`, file: f, status: 'pending', progress: 0 },
        ];
      });
    });

    return newItems;
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const uploadAll = async () => {
    const pending = items.filter(i => i.status === 'pending');
    if (!pending.length) return;

    for (const item of pending) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));

      try {
        const result = await uploadDocumentAPI(item.file, pct => {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i));
        });
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'success', progress: 100, result } : i
        ));
        onUploaded(result.filename, result.document_id, result.uploaded_at);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed , Check backend connection.';
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'error', error: msg } : i
        ));
      }
    }
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const clearAll   = () => setItems([]);
  const retryItem  = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'pending', progress: 0, error: undefined } : i));

  const counts = {
    pending:   items.filter(i => i.status === 'pending').length,
    uploading: items.filter(i => i.status === 'uploading').length,
    success:   items.filter(i => i.status === 'success').length,
    error:     items.filter(i => i.status === 'error').length,
  };
  const totalProgress = items.length
    ? Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length)
    : 0;
  const isBusy = counts.uploading > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <CloudUpload size={15} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={styles.headerTitle}>Upload Documents</h2>
          <p style={styles.headerSub}>PDF, DOCX, and TXT · Chunked · Embedded · Graph-indexed</p>
        </div>
        {items.length > 0 && (
          <button style={styles.clearBtn} onClick={clearAll} disabled={isBusy}>
            <Trash2 size={13} />
            <span>Clear all</span>
          </button>
        )}
      </div>

      <div style={styles.content}>
        {/* Overall progress bar — shown while uploading */}
        {isBusy && (
          <div style={styles.overallBar}>
            <div style={styles.overallBarLeft}>
              <Loader2 size={13} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
              <span style={styles.overallBarText}>
                Uploading {counts.uploading} file{counts.uploading !== 1 ? 's' : ''}…
              </span>
            </div>
            <span style={styles.overallBarPct}>{totalProgress}%</span>
            <div style={styles.overallTrack}>
              <div style={{ ...styles.overallFill, width: `${totalProgress}%` }} />
            </div>
          </div>
        )}

        {/* Drop zone */}
        <div
          style={{
            ...styles.dropzone,
            borderColor: dragging ? 'var(--accent)' : 'var(--border)',
            background:  dragging ? 'var(--accent-glow)' : 'var(--bg-surface)',
            transform:   dragging ? 'scale(1.01)' : 'scale(1)',
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
          <div style={{ ...styles.dropIcon, borderColor: dragging ? 'var(--accent)' : 'var(--border)' }}>
            <Upload size={24} color={dragging ? 'var(--accent)' : 'var(--text-muted)'} />
          </div>
          <p style={styles.dropTitle}>
            {dragging ? 'Release to add files' : 'Drop files here or click to browse'}
          </p>
          <div style={styles.dropChips}>
            {['.PDF', '.DOCX', '.TXT'].map(ext => (
              <span key={ext} style={styles.dropChip}>{ext}</span>
            ))}
          </div>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div style={styles.fileSection}>
            <div style={styles.fileSectionHeader}>
              <span style={styles.fileSectionTitle}>
                Files ({items.length})
              </span>
              <div style={styles.fileSectionCounts}>
                {counts.success > 0  && <span style={{ ...styles.countBadge, color: 'var(--success)' }}>✓ {counts.success}</span>}
                {counts.error > 0    && <span style={{ ...styles.countBadge, color: 'var(--error)'   }}>✗ {counts.error}</span>}
                {counts.pending > 0  && <span style={{ ...styles.countBadge, color: 'var(--text-muted)' }}>◌ {counts.pending}</span>}
              </div>
            </div>

            <div style={styles.fileList}>
              {items.map(item => (
                <div
                  key={item.id}
                  style={{
                    ...styles.fileCard,
                    borderColor: item.status === 'error'   ? 'rgba(239,68,68,0.3)'
                               : item.status === 'success' ? 'rgba(217,119,6,0.20)'
                               : 'var(--border)',
                  }}
                >
                  <div style={styles.fileCardTop}>
                    <FileIcon name={item.file.name} size={18} />
                    <div style={styles.fileMeta}>
                      <span style={styles.fileName}>{item.file.name}</span>
                      <span style={styles.fileSize}>{formatBytes(item.file.size)}</span>
                    </div>
                    <div style={styles.fileActions}>
                      {STATUS_ICON[item.status]}
                      {item.status === 'error' && (
                        <button style={styles.actionIconBtn} onClick={() => retryItem(item.id)} title="Retry">
                          <Upload size={12} color="var(--warning)" />
                        </button>
                      )}
                      {item.status !== 'uploading' && (
                        <button style={styles.actionIconBtn} onClick={() => removeItem(item.id)} title="Remove">
                          <XCircle size={13} color="var(--text-muted)" />
                        </button>
                      )}
                    </div>
                  </div>

                  {item.status === 'uploading' && (
                    <div style={styles.progressWrap}>
                      <div style={styles.progressTrack}>
                        <div style={{ ...styles.progressFill, width: `${item.progress}%` }} />
                      </div>
                      <span style={styles.progressPct}>{item.progress}%</span>
                    </div>
                  )}

                  {item.status === 'success' && item.result && (
                    <div style={styles.successMeta}>
                      <div style={styles.successStat}>
                        <Hash size={10} color="var(--accent)" />
                        <span>{item.result.document_id}</span>
                      </div>
                      <div style={styles.successStat}>
                        <Calendar size={10} color="var(--text-muted)" />
                        <span>{item.result.uploaded_at}</span>
                      </div>
                      {(item.result.result as Record<string, number>)?.chunks_processed != null && (
                        <div style={styles.successStat}>
                          <Layers size={10} color="var(--accent)" />
                          <span>{(item.result.result as Record<string, number>).chunks_processed} chunks</span>
                        </div>
                      )}
                      {(item.result.result as Record<string, number>)?.relationships_added != null && (
                        <div style={styles.successStat}>
                          <Network size={10} color="var(--pinecone)" />
                          <span>{(item.result.result as Record<string, number>).relationships_added} relations</span>
                        </div>
                      )}
                    </div>
                  )}

                  {item.status === 'error' && (
                    <p style={styles.errorText}>{item.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload button */}
        {counts.pending > 0 && (
          <button
            style={{ ...styles.uploadBtn, opacity: isBusy ? 0.6 : 1 }}
            onClick={uploadAll}
            disabled={isBusy}
          >
            {isBusy
              ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Upload size={15} />}
            <span>
              {isBusy
                ? 'Processing…'
                : `Process ${counts.pending} file${counts.pending !== 1 ? 's' : ''}`}
            </span>
          </button>
        )}

        {/* Pipeline cards */}
        <div style={styles.pipeline}>
          {[
            {
              icon: <Layers size={15} color="var(--accent)" />,
              title: 'Smart Chunking',
              desc: 'Text split into 500-char overlapping chunks, embedded with BAAI/bge-large-en-v1.5, stored in Pinecone.',
              color: 'var(--accent)',
            },
            {
              icon: <Sparkles size={15} color="var(--secondary)" />,
              title: 'Entity Extraction',
              desc: 'Groq LLM identifies people, companies, products, locations, and events across every chunk.',
              color: 'var(--secondary)',
            },
            {
              icon: <Network size={15} color="var(--pinecone)" />,
              title: 'Knowledge Graph',
              desc: 'Relationships stored in Neo4j Aura. Powers graph traversal queries alongside vector search.',
              color: 'var(--pinecone)',
            },
          ].map(card => (
            <div key={card.title} style={styles.pipelineCard}>
              <div style={{ ...styles.pipelineIcon, background: card.color + '18' }}>
                {card.icon}
              </div>
              <div>
                <p style={styles.pipelineTitle}>{card.title}</p>
                <p style={styles.pipelineDesc}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 28px',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10, background: 'var(--accent-glow)',
    border: '1px solid rgba(217,119,6,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  headerSub:   { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 },
  clearBtn: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
    fontSize: 12, cursor: 'pointer', transition: 'opacity 0.15s',
  },
  content: { flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 },
  overallBar: {
    background: 'var(--accent-glow)', border: '1px solid rgba(217,119,6,0.20)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px',
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
    animation: 'fadeIn 0.2s ease',
  },
  overallBarLeft: { display: 'flex', alignItems: 'center', gap: 7, flex: 1 },
  overallBarText: { fontSize: 12.5, fontWeight: 500, color: 'var(--accent-text)' },
  overallBarPct:  { fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)' },
  overallTrack: { width: '100%', height: 3, background: 'var(--bg-elevated)', borderRadius: 2 },
  overallFill:  { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.4s ease' },
  dropzone: {
    border: '2px dashed', borderRadius: 'var(--radius-lg)', padding: '40px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    cursor: 'pointer', transition: 'all 0.2s ease', userSelect: 'none',
  },
  dropIcon: {
    width: 56, height: 56, borderRadius: 14, border: '1px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-elevated)', transition: 'border-color 0.2s',
  },
  dropTitle: { fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' },
  dropChips: { display: 'flex', gap: 6 },
  dropChip: {
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    padding: '2px 8px', borderRadius: 4, letterSpacing: '0.04em',
  },
  fileSection: { display: 'flex', flexDirection: 'column', gap: 10 },
  fileSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  fileSectionTitle:  { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  fileSectionCounts: { display: 'flex', gap: 8 },
  countBadge:        { fontSize: 11.5, fontWeight: 600 },
  fileList:  { display: 'flex', flexDirection: 'column', gap: 8 },
  fileCard: {
    background: 'var(--bg-surface)', border: '1px solid',
    borderRadius: 'var(--radius-md)', padding: '11px 14px',
    display: 'flex', flexDirection: 'column', gap: 8,
    animation: 'fadeIn 0.2s ease', transition: 'border-color 0.2s',
  },
  fileCardTop:   { display: 'flex', alignItems: 'center', gap: 10 },
  fileMeta:      { display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' },
  fileName:      { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileSize:      { fontSize: 11, color: 'var(--text-muted)' },
  fileActions:   { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  actionIconBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4 },
  progressWrap:  { display: 'flex', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' },
  progressPct:   { fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, width: 30, textAlign: 'right' },
  successMeta: {
    display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
    borderTop: '1px solid var(--border-subtle)', paddingTop: 6,
  },
  successStat: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' },
  errorText:   { fontSize: 11.5, color: 'var(--error)', paddingTop: 2 },
  uploadBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 24px', borderRadius: 'var(--radius-md)', background: 'var(--accent)',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
    transition: 'opacity 0.2s',
  },
  pipeline: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 4 },
  pipelineCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '14px 14px',
    display: 'flex', gap: 10, alignItems: 'flex-start',
  },
  pipelineIcon: {
    width: 30, height: 30, borderRadius: 8, display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pipelineTitle: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 },
  pipelineDesc:  { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55 },
};