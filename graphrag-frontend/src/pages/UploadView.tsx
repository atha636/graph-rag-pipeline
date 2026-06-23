import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileText, FileType, File, CheckCircle, XCircle,
  Loader2, CloudUpload, Sparkles, Network, Layers, Calendar, Hash
} from 'lucide-react';
import { uploadDocumentAPI } from '../services/api';
import type { UploadResponse } from '../types';

interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  result?: UploadResponse;
  error?: string;
}

const FileIcon = ({ name }: { name: string }) => {
  if (name.endsWith('.pdf')) return <FileType size={20} color="var(--error)" />;
  if (name.endsWith('.docx')) return <FileText size={20} color="var(--secondary)" />;
  return <File size={20} color="var(--text-muted)" />;
};

export const UploadView: React.FC<{ onUploaded: (filename: string, docId: string, uploadedAt: string) => void }> = ({ onUploaded }) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(
      (f) => f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.txt')
    );
    setItems((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, status: 'pending' as const, progress: 0 })),
    ]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const uploadAll = async () => {
    const pending = items.filter((i) => i.status === 'pending');
    for (const item of pending) {
      setItems((prev) => prev.map((i) => i.file === item.file ? { ...i, status: 'uploading' } : i));
      try {
        // POST /api/v1/upload
        const result = await uploadDocumentAPI(item.file, (pct) => {
          setItems((prev) => prev.map((i) => i.file === item.file ? { ...i, progress: pct } : i));
        });
        setItems((prev) =>
          prev.map((i) => i.file === item.file ? { ...i, status: 'success', progress: 100, result } : i)
        );
        onUploaded(result.filename, result.document_id, result.uploaded_at);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed. Check backend connection.';
        setItems((prev) =>
          prev.map((i) => i.file === item.file ? { ...i, status: 'error', error: msg } : i)
        );
      }
    }
  };

  const remove = (f: File) => setItems((prev) => prev.filter((i) => i.file !== f));
  const hasPending = items.some((i) => i.status === 'pending');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}><CloudUpload size={15} color="var(--accent)" /></div>
        <div>
          <h2 style={styles.headerTitle}>Upload Documents</h2>
          <p style={styles.headerSub}>PDF, DOCX, and TXT files are processed automatically</p>
        </div>
      </div>

      <div style={styles.content}>
        {/* Drop zone */}
        <div
          style={{
            ...styles.dropzone,
            borderColor: dragging ? 'var(--accent)' : 'var(--border)',
            background: dragging ? 'var(--accent-glow)' : 'var(--bg-surface)',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <Upload size={36} color={dragging ? 'var(--accent)' : 'var(--text-muted)'} />
          <p style={styles.dropTitle}>
            {dragging ? 'Drop to add files' : 'Drop files here or click to browse'}
          </p>
          <p style={styles.dropSub}>PDF · DOCX · TXT</p>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div style={styles.fileList}>
            {items.map((item, idx) => (
              <div key={idx} style={styles.fileCard}>
                <div style={styles.fileTop}>
                  <div style={styles.fileLeft}>
                    <FileIcon name={item.file.name} />
                    <div style={styles.fileMeta}>
                      <span style={styles.fileName}>{item.file.name}</span>
                      <span style={styles.fileSize}>
                        {(item.file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <div style={styles.fileRight}>
                    {item.status === 'pending' && (
                      <button style={styles.removeBtn} onClick={() => remove(item.file)}>
                        <XCircle size={16} color="var(--text-muted)" />
                      </button>
                    )}
                    {item.status === 'uploading' && (
                      <div style={styles.uploading}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
                        <span style={styles.progressText}>{item.progress}%</span>
                      </div>
                    )}
                    {item.status === 'success' && <CheckCircle size={16} color="var(--success)" />}
                    {item.status === 'error' && <XCircle size={16} color="var(--error)" />}
                  </div>
                </div>

                {item.status === 'uploading' && (
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${item.progress}%` }} />
                  </div>
                )}

                {/* Success — show backend response fields */}
                {item.status === 'success' && item.result && (
                  <div style={styles.successBox}>
                    <div style={styles.successStats}>
                      <div style={styles.stat}>
                        <Hash size={11} color="var(--accent)" />
                        <span>ID: {item.result.document_id}</span>
                      </div>
                      <div style={styles.stat}>
                        <Calendar size={11} color="var(--text-muted)" />
                        <span>{item.result.uploaded_at}</span>
                      </div>
                    </div>
                    {/* result.result contains chunks/entities/relationships if backend returns them */}
                    {item.result.result && (
                      <div style={styles.successStats}>
                        {typeof item.result.result.chunks_created === 'number' && (
                          <div style={styles.stat}>
                            <Layers size={11} color="var(--accent)" />
                            <span>{item.result.result.chunks_created} chunks</span>
                          </div>
                        )}
                        {typeof item.result.result.entities_extracted === 'number' && (
                          <div style={styles.stat}>
                            <Sparkles size={11} color="var(--secondary)" />
                            <span>{item.result.result.entities_extracted} entities</span>
                          </div>
                        )}
                        {typeof item.result.result.relationships_created === 'number' && (
                          <div style={styles.stat}>
                            <Network size={11} color="var(--pinecone)" />
                            <span>{item.result.result.relationships_created} relationships</span>
                          </div>
                        )}
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
        )}

        {hasPending && (
          <button style={styles.uploadBtn} onClick={uploadAll}>
            <Upload size={15} />
            <span>Process {items.filter((i) => i.status === 'pending').length} file(s)</span>
          </button>
        )}

        {/* Pipeline info */}
        <div style={styles.infoGrid}>
          {[
            { icon: <Layers size={16} color="var(--accent)" />, title: 'Smart Chunking', desc: 'Text is split into optimal chunks, embedded with Sentence Transformers, stored in Pinecone.' },
            { icon: <Sparkles size={16} color="var(--secondary)" />, title: 'Entity Extraction', desc: 'Groq LLM extracts people, organizations, products, and events from your documents.' },
            { icon: <Network size={16} color="var(--pinecone)" />, title: 'Knowledge Graph', desc: 'Entities and relationships are stored in Neo4j Aura for graph-based traversal queries.' },
          ].map((card) => (
            <div key={card.title} style={styles.infoCard}>
              <div style={styles.infoIcon}>{card.icon}</div>
              <div>
                <p style={styles.infoTitle}>{card.title}</p>
                <p style={styles.infoDesc}>{card.desc}</p>
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
    display: 'flex', alignItems: 'center', gap: 12, padding: '18px 28px',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10, background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  headerSub: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 },
  content: { flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 },
  dropzone: {
    border: '2px dashed', borderRadius: 'var(--radius-lg)', padding: '48px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
  },
  dropTitle: { fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)' },
  dropSub: { fontSize: 12, color: 'var(--text-muted)' },
  fileList: { display: 'flex', flexDirection: 'column', gap: 10 },
  fileCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeIn 0.2s ease',
  },
  fileTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  fileLeft: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  fileMeta: { display: 'flex', flexDirection: 'column', gap: 2 },
  fileName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  fileSize: { fontSize: 11, color: 'var(--text-muted)' },
  fileRight: { display: 'flex', alignItems: 'center', gap: 8 },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex' },
  uploading: { display: 'flex', alignItems: 'center', gap: 6 },
  progressText: { fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  progressBar: { width: '100%', height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' },
  successBox: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' },
  successStats: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  stat: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)' },
  errorText: { fontSize: 11.5, color: 'var(--error)' },
  uploadBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 24px', borderRadius: 'var(--radius-md)', background: 'var(--accent)',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
  },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 4 },
  infoCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '14px 16px',
    display: 'flex', gap: 12, alignItems: 'flex-start',
  },
  infoIcon: {
    width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoTitle: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 },
  infoDesc: { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 },
};
