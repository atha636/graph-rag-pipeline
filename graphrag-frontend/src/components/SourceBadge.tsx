import React, { useState } from 'react';
import { Database, Cpu, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { Source } from '../types';

interface SourceBadgeProps {
  source: Source;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source }) => {
  const [expanded, setExpanded] = useState(false);
  const isGraph = source.source_type === 'graph';

  const scoreLabel = source.score != null ? source.score.toFixed(2) : '';
  const label = isGraph ? 'Neo4j match' : `Pinecone ${scoreLabel}`;

  return (
    <div style={styles.wrapper}>
      <button
        style={{
          ...styles.badge,
          background: isGraph ? 'var(--neo4j-bg)' : 'var(--pinecone-bg)',
          border: `1px solid ${isGraph ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.25)'}`,
          color: isGraph ? 'var(--neo4j)' : 'var(--pinecone)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {isGraph ? <Database size={11} /> : <Cpu size={11} />}
        <span>{label}</span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {expanded && (
        <div style={styles.popup}>
          {source.document_name && (
            <div style={styles.popupHeader}>
              <FileText size={11} color="var(--text-muted)" />
              <span style={styles.popupDoc}>{source.document_name}</span>
              {source.document_type && (
                <span style={styles.popupType}>{source.document_type.toUpperCase()}</span>
              )}
            </div>
          )}

          {source.content && (
            <p style={styles.popupContent}>
              {source.content.length > 220 ? source.content.slice(0, 220) + '…' : source.content}
            </p>
          )}

          <div style={styles.popupMeta}>
            {source.chunk_id && <span>Chunk: {source.chunk_id}</span>}
            {source.score != null && <span>Score: {source.score.toFixed(3)}</span>}
            {source.relevance_score != null && (
              <span>Relevance: {(source.relevance_score * 100).toFixed(0)}%</span>
            )}
            {source.uploaded_at && <span>{source.uploaded_at}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

interface SourcesRowProps {
  sources: Source[];
  documents: string[];
}

export const SourcesRow: React.FC<SourcesRowProps> = ({ sources, documents }) => {
  return (
    <div style={rowStyles.container}>
      <span style={rowStyles.label}>
        Graph RAG · {sources.length} source{sources.length !== 1 ? 's' : ''} found
      </span>
      <div style={rowStyles.badges}>
        {sources.slice(0, 5).map((s, i) => (
          <SourceBadge key={i} source={s} />
        ))}
        {sources.length > 5 && (
          <span style={rowStyles.more}>+{sources.length - 5} more</span>
        )}
      </div>
      {documents.length > 0 && (
        <div style={rowStyles.docs}>
          {documents.map((d) => (
            <span key={d} style={rowStyles.docChip}>
              <FileText size={10} />
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'relative', display: 'inline-block' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 99, fontSize: 11.5,
    fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  popup: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: 12, minWidth: 260, maxWidth: 340,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadeIn 0.15s ease',
  },
  popupHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  popupDoc: {
    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  popupType: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
    background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4,
  },
  popupContent: { fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 },
  popupMeta: {
    display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5,
    color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8,
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  container: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', display: 'block', marginBottom: 6 },
  badges: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  more: { fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' },
  docs: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  docChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 10.5, color: 'var(--text-muted)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    padding: '2px 7px', borderRadius: 4,
  },
};
