import React, { useState } from 'react';
import { Database, Cpu, ChevronDown, ChevronUp, FileText, X } from 'lucide-react';
import type { Source } from '../types';

interface SourceBadgeProps {
  source: Source;
  index: number;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source, index }) => {
  const [open, setOpen] = useState(false);
  const isGraph = source.source_type === 'graph';
  const scoreLabel = source.score != null ? source.score.toFixed(2) : '';
  const label = isGraph ? 'Neo4j match' : `Pinecone ${scoreLabel}`;

  return (
    <>
      <button
        style={{
          ...styles.badge,
          background: isGraph ? 'var(--neo4j-bg)' : 'var(--pinecone-bg)',
          border: `1px solid ${isGraph ? 'rgba(217,119,6,0.25)' : 'rgba(194,65,12,0.30)'}`,
          color: isGraph ? 'var(--neo4j)' : 'var(--pinecone)',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {isGraph ? <Database size={11} /> : <Cpu size={11} />}
        <span>{label}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {/* Inline drawer — no z-index overlap issues */}
      {open && (
        <div style={{
          ...styles.drawer,
          borderColor: isGraph ? 'rgba(217,119,6,0.18)' : 'rgba(194,65,12,0.20)',
        }}>
          <div style={styles.drawerHeader}>
            <div style={styles.drawerLeft}>
              <div style={{
                ...styles.drawerIcon,
                background: isGraph ? 'var(--neo4j-bg)' : 'var(--pinecone-bg)',
              }}>
                {isGraph
                  ? <Database size={12} color="var(--neo4j)" />
                  : <Cpu size={12} color="var(--pinecone)" />}
              </div>
              <span style={styles.drawerType}>
                {isGraph ? 'Knowledge Graph' : 'Vector Database'}
              </span>
              <span style={styles.drawerIndex}>Source #{index + 1}</span>
            </div>
            <button style={styles.drawerClose} onClick={() => setOpen(false)}>
              <X size={12} color="var(--text-muted)" />
            </button>
          </div>

          {source.document_name && (
            <div style={styles.docRow}>
              <FileText size={11} color="var(--text-muted)" />
              <span style={styles.docName}>{source.document_name}</span>
              {source.document_type && (
                <span style={styles.docType}>
                  {source.document_type.replace('.', '').toUpperCase()}
                </span>
              )}
            </div>
          )}

          {source.content && (
            <p style={styles.content}>
              {source.content.length > 300
                ? source.content.slice(0, 300) + '…'
                : source.content}
            </p>
          )}

          <div style={styles.metaGrid}>
            {source.chunk_id != null && (
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Chunk</span>
                <span style={styles.metaValue}>#{source.chunk_id}</span>
              </div>
            )}
            {source.score != null && (
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Similarity</span>
                <span style={styles.metaValue}>{(source.score * 100).toFixed(1)}%</span>
              </div>
            )}
            {source.relevance_score != null && (
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Relevance</span>
                <span style={styles.metaValue}>{(source.relevance_score * 100).toFixed(1)}%</span>
              </div>
            )}
            {source.chunk_size != null && (
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Size</span>
                <span style={styles.metaValue}>{source.chunk_size} chars</span>
              </div>
            )}
            {source.uploaded_at && (
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Uploaded</span>
                <span style={styles.metaValue}>{source.uploaded_at}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

interface SourcesRowProps {
  sources: Source[];
  documents: string[];
}

export const SourcesRow: React.FC<SourcesRowProps> = ({ sources, documents }) => {
  const vectorCount = sources.filter(s => s.source_type === 'vector').length;
  const graphCount  = sources.filter(s => s.source_type === 'graph').length;

  return (
    <div style={rowStyles.container}>
      <div style={rowStyles.header}>
        <span style={rowStyles.label}>
          Graph RAG · {sources.length} source{sources.length !== 1 ? 's' : ''} found
        </span>
        <div style={rowStyles.counts}>
          {vectorCount > 0 && (
            <span style={{ ...rowStyles.countChip, color: 'var(--pinecone)' }}>
              <Cpu size={9} /> {vectorCount} vector
            </span>
          )}
          {graphCount > 0 && (
            <span style={{ ...rowStyles.countChip, color: 'var(--neo4j)' }}>
              <Database size={9} /> {graphCount} graph
            </span>
          )}
        </div>
      </div>

      <div style={rowStyles.badges}>
        {sources.map((s, i) => (
          <SourceBadge key={i} source={s} index={i} />
        ))}
      </div>

      {/* Drawers render below badges — no overflow clipping */}
      {documents.length > 0 && (
        <div style={rowStyles.docs}>
          {documents.map(d => (
            <span key={d} style={rowStyles.docChip}>
              <FileText size={9} />
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
  },
  drawer: {
    background: 'var(--bg-elevated)',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    marginTop: 4,
    animation: 'fadeIn 0.15s ease',
    width: '100%',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  drawerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  drawerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerType: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  drawerIndex: {
    fontSize: 10.5,
    color: 'var(--text-muted)',
    background: 'var(--bg-hover)',
    padding: '1px 6px',
    borderRadius: 4,
  },
  drawerClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    padding: 3,
    borderRadius: 4,
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  docName: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docType: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'var(--bg-hover)',
    padding: '1px 6px',
    borderRadius: 4,
  },
  content: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1.65,
    marginBottom: 10,
    padding: '8px 10px',
    background: 'var(--bg-surface)',
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    fontFamily: 'var(--font-mono)',
  },
  metaGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 16px',
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: 8,
  },
  metaItem: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  metaValue: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent-text)',
    flex: 1,
  },
  counts: {
    display: 'flex',
    gap: 6,
  },
  countChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10.5,
    fontWeight: 500,
    background: 'var(--bg-elevated)',
    padding: '2px 7px',
    borderRadius: 99,
    border: '1px solid var(--border)',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-start',
  },
  docs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  docChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10.5,
    color: 'var(--text-muted)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    padding: '2px 7px',
    borderRadius: 4,
  },
};