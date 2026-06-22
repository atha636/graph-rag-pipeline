import React from 'react';
import {
  MessageSquare,
  Upload,
  GitBranch,
  FileText,
  FileType,
  File,
  Trash2,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Document, View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (v: View) => void;
  documents: Document[];
  loadingDocs: boolean;
  onDeleteDoc: (id: string) => void;
  isOnline: boolean;
}

const FileIcon = ({ type }: { type: string }) => {
  if (type === 'pdf') return <FileType size={13} color="var(--error)" />;
  if (type === 'docx') return <FileText size={13} color="var(--secondary)" />;
  return <File size={13} color="var(--text-muted)" />;
};

const navItems: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'Ask AI', icon: <MessageSquare size={16} /> },
  { id: 'upload', label: 'Upload', icon: <Upload size={16} /> },
  { id: 'graph', label: 'Knowledge Graph', icon: <GitBranch size={16} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView, onViewChange, documents, loadingDocs, onDeleteDoc, isOnline,
}) => {
  const [hoveredDoc, setHoveredDoc] = React.useState<string | null>(null);

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoIcon}>
          <GitBranch size={16} color="var(--accent)" />
        </div>
        <span style={styles.logoText}>GraphRAG</span>
        <div style={styles.statusDot} title={isOnline ? 'Connected' : 'Offline'}>
          {isOnline
            ? <Wifi size={12} color="var(--success)" />
            : <WifiOff size={12} color="var(--error)" />}
        </div>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        <span style={styles.navLabel}>WORKSPACE</span>
        {navItems.map((item) => (
          <button
            key={item.id}
            style={{
              ...styles.navItem,
              ...(currentView === item.id ? styles.navItemActive : {}),
            }}
            onClick={() => onViewChange(item.id)}
          >
            <span style={{
              ...styles.navIcon,
              color: currentView === item.id ? 'var(--accent)' : 'var(--sidebar-text)',
            }}>
              {item.icon}
            </span>
            <span style={styles.navItemText}>{item.label}</span>
            {currentView === item.id && <div style={styles.activeIndicator} />}
          </button>
        ))}
      </nav>

      {/* Documents */}
      <div style={styles.docsSection}>
        <div style={styles.docsHeader}>
          <span style={styles.navLabel}>DOCUMENTS ({documents.length})</span>
          {loadingDocs && <Loader2 size={11} style={styles.spinner} />}
        </div>

        <div style={styles.docsList}>
          {documents.length === 0 && !loadingDocs && (
            <p style={styles.emptyDocs}>No documents yet.<br />Upload to get started.</p>
          )}
          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                ...styles.docItem,
                ...(hoveredDoc === doc.id ? styles.docItemHover : {}),
              }}
              onMouseEnter={() => setHoveredDoc(doc.id)}
              onMouseLeave={() => setHoveredDoc(null)}
            >
              <FileIcon type={doc.type} />
              <span style={styles.docName} title={doc.name}>{doc.name}</span>
              {hoveredDoc === doc.id && (
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); onDeleteDoc(doc.id); }}
                  title="Remove document"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLine} />
        <p style={styles.footerText}>Graph RAG · v1.0</p>
        <p style={styles.footerSub}>Powered by Neo4j + Pinecone</p>
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minWidth: 240,
    height: '100%',
    background: 'var(--sidebar-bg)',
    borderRight: '1px solid var(--sidebar-border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 18px 16px',
    borderBottom: '1px solid var(--sidebar-border)',
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
    flex: 1,
  },
  statusDot: {
    display: 'flex',
    alignItems: 'center',
  },
  nav: {
    padding: '16px 10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-faint)',
    letterSpacing: '0.08em',
    padding: '0 8px 8px',
    display: 'block',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    background: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    position: 'relative',
    color: 'var(--sidebar-text)',
  },
  navItemActive: {
    background: 'var(--sidebar-item-active)',
    color: 'var(--sidebar-text-active)',
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  navItemText: {
    fontSize: 13.5,
    fontWeight: 500,
    flex: 1,
  },
  activeIndicator: {
    width: 3,
    height: 14,
    borderRadius: 2,
    background: 'var(--accent)',
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  docsSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '8px 10px',
  },
  docsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 8px 6px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
    color: 'var(--text-muted)',
  },
  docsList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  emptyDocs: {
    fontSize: 11.5,
    color: 'var(--text-muted)',
    padding: '8px 8px',
    lineHeight: 1.6,
  },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  docItemHover: {
    background: 'var(--sidebar-item-hover)',
  },
  docName: {
    fontSize: 12,
    color: 'var(--sidebar-text)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--error)',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
    padding: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  footer: {
    padding: '12px 18px 16px',
  },
  footerLine: {
    height: 1,
    background: 'var(--sidebar-border)',
    marginBottom: 10,
  },
  footerText: {
    fontSize: 11,
    color: 'var(--text-faint)',
    fontWeight: 500,
  },
  footerSub: {
    fontSize: 10,
    color: 'var(--text-faint)',
    marginTop: 2,
  },
};
