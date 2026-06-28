import React, { useState } from 'react';
import {
  MessageSquare, Upload, GitBranch, FileText, FileType,
  File, Trash2, Wifi, WifiOff, ChevronLeft, ChevronRight,
  BarChart2, Database, History,
} from 'lucide-react';
import type { Document, View, DocFilter, SessionStats, StatsData } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { ConversationsPanel } from './ConversationsPanel';

interface SidebarProps {
  currentView:      View;
  onViewChange:     (v: View) => void;
  documents:        Document[];
  loadingDocs:      boolean;
  onDeleteDoc:      (id: string) => void;
  isOnline:         boolean;
  theme:            'dark' | 'light';
  onToggleTheme:    () => void;
  stats:            SessionStats;
  liveStats:        StatsData | null;
  activeConvId?:    string;
  onSelectConv:     (id: string) => void;
  onNewConv:        () => void;
}

const FileIcon = ({ type }: { type: string }) => {
  if (type === 'pdf')  return <FileType size={13} color="#ef4444" />;
  if (type === 'docx') return <FileText size={13} color="var(--secondary)" />;
  return <File size={13} color="var(--sidebar-text)" />;
};

const SHORTCUTS: Record<View, string> = {
  chat: '⌘1', upload: '⌘2', graph: '⌘3', documents: '⌘4',
};

const navItems: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',      label: 'Ask AI',         icon: <MessageSquare size={16} /> },
  { id: 'upload',    label: 'Upload',          icon: <Upload        size={16} /> },
  { id: 'graph',     label: 'Knowledge Graph', icon: <GitBranch     size={16} /> },
  { id: 'documents', label: 'Documents',       icon: <Database      size={16} /> },
];

const DOC_FILTERS: { id: DocFilter; label: string }[] = [
  { id: 'all',  label: 'All'  },
  { id: 'pdf',  label: 'PDF'  },
  { id: 'docx', label: 'DOCX' },
  { id: 'txt',  label: 'TXT'  },
];

// Which section is open in the sidebar bottom area
type BottomTab = 'docs' | 'convs' | 'stats';

export const Sidebar: React.FC<SidebarProps> = ({
  currentView, onViewChange, documents, loadingDocs,
  onDeleteDoc, isOnline, theme, onToggleTheme,
  stats, liveStats, activeConvId, onSelectConv, onNewConv,
}) => {
  const [collapsed,   setCollapsed]   = useState(false);
  const [hoveredDoc,  setHoveredDoc]  = useState<string | null>(null);
  const [docFilter,   setDocFilter]   = useState<DocFilter>('all');
  const [bottomTab,   setBottomTab]   = useState<BottomTab>('docs');

  const filteredDocs = docFilter === 'all'
    ? documents
    : documents.filter(d => d.type === docFilter);

  const filterCounts: Record<DocFilter, number> = {
    all:  documents.length,
    pdf:  documents.filter(d => d.type === 'pdf').length,
    docx: documents.filter(d => d.type === 'docx').length,
    txt:  documents.filter(d => d.type === 'txt').length,
  };

  // ── Collapsed (icon-only) ─────────────────────────────────────
  if (collapsed) {
    return (
      <aside style={{ ...styles.sidebar, width: 56, minWidth: 56 }}>
        <div style={{ ...styles.logo, justifyContent: 'center', padding: '16px 0 12px' }}>
          <div style={styles.logoIcon}><GitBranch size={15} color="var(--accent)" /></div>
        </div>
        <nav style={{ ...styles.nav, padding: '10px 8px', alignItems: 'center' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              title={item.label}
              style={{
                ...styles.navItem, justifyContent: 'center',
                padding: '9px', width: '100%',
                ...(currentView === item.id ? styles.navItemActive : {}),
              }}
              onClick={() => onViewChange(item.id)}
            >
              <span style={{ color: currentView === item.id ? 'var(--accent)' : 'var(--sidebar-text)', display: 'flex' }}>
                {item.icon}
              </span>
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 0 16px' }}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button style={styles.collapseBtn} onClick={() => setCollapsed(false)} title="Expand">
            <ChevronRight size={14} color="var(--sidebar-text)" />
          </button>
        </div>
      </aside>
    );
  }

  // ── Full sidebar ──────────────────────────────────────────────
  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <div style={styles.logoIcon}><GitBranch size={15} color="var(--accent)" /></div>
        <span style={styles.logoText}>GraphRAG</span>
        <div style={styles.logoActions}>
          <div style={styles.statusWrap} title={isOnline ? 'Backend connected' : 'Offline'}>
            {isOnline
              ? <Wifi    size={12} color="var(--success)" />
              : <WifiOff size={12} color="var(--error)" />}
            <span style={{ ...styles.statusLabel, color: isOnline ? 'var(--success)' : 'var(--error)' }}>
              {isOnline ? 'Live' : 'Off'}
            </span>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button style={styles.collapseBtn} onClick={() => setCollapsed(true)} title="Collapse">
            <ChevronLeft size={14} color="var(--sidebar-text)" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        <span style={styles.sectionLabel}>WORKSPACE</span>
        {navItems.map(item => (
          <button
            key={item.id}
            style={{ ...styles.navItem, ...(currentView === item.id ? styles.navItemActive : {}) }}
            onClick={() => onViewChange(item.id)}
          >
            <span style={{ color: currentView === item.id ? 'var(--accent)' : 'var(--sidebar-text)', display: 'flex' }}>
              {item.icon}
            </span>
            <span style={styles.navItemText}>{item.label}</span>
            <span style={styles.shortcut}>{SHORTCUTS[item.id]}</span>
            {currentView === item.id && <div style={styles.activeBar} />}
          </button>
        ))}
      </nav>

      {/* Bottom tab switcher */}
      <div style={styles.tabBar}>
        {([
          { id: 'docs',  icon: <Database  size={12} />, label: 'Docs'  },
          { id: 'convs', icon: <History   size={12} />, label: 'Chats' },
          { id: 'stats', icon: <BarChart2 size={12} />, label: 'Stats' },
        ] as { id: BottomTab; icon: React.ReactNode; label: string }[]).map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.tabBtn,
              ...(bottomTab === tab.id ? styles.tabBtnActive : {}),
            }}
            onClick={() => setBottomTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom content */}
      <div style={styles.bottomContent}>

        {/* Documents tab */}
        {bottomTab === 'docs' && (
          <>
            <div style={styles.tabHeader}>
              <span style={styles.sectionLabel}>DOCUMENTS</span>
              <span style={styles.docCountBadge}>{documents.length}</span>
            </div>
            {documents.length > 0 && (
              <div style={styles.filterTabs}>
                {DOC_FILTERS.filter(f => f.id === 'all' || filterCounts[f.id] > 0).map(f => (
                  <button
                    key={f.id}
                    style={{ ...styles.filterTab, ...(docFilter === f.id ? styles.filterTabActive : {}) }}
                    onClick={() => setDocFilter(f.id)}
                  >
                    {f.label}
                    {f.id !== 'all' && <span style={styles.filterCount}>{filterCounts[f.id]}</span>}
                  </button>
                ))}
              </div>
            )}
            <div style={styles.docsList}>
              {filteredDocs.length === 0 && !loadingDocs && (
                <div style={styles.emptyDocs}>
                  <File size={18} color="var(--text-faint)" />
                  <p>No documents yet.</p>
                </div>
              )}
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{ ...styles.docItem, background: hoveredDoc === doc.id ? 'var(--sidebar-item-hover)' : 'transparent' }}
                  onMouseEnter={() => setHoveredDoc(doc.id)}
                  onMouseLeave={() => setHoveredDoc(null)}
                >
                  <FileIcon type={doc.type} />
                  <div style={styles.docMeta}>
                    <span style={styles.docName} title={doc.name}>{doc.name}</span>
                    {doc.uploadedAt && <span style={styles.docDate}>{doc.uploadedAt.slice(0, 10)}</span>}
                  </div>
                  {hoveredDoc === doc.id && (
                    <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onDeleteDoc(doc.id); }}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Conversations tab */}
        {bottomTab === 'convs' && (
          <ConversationsPanel
            activeId={activeConvId}
            onSelect={id => { onSelectConv(id); onViewChange('chat'); }}
            onNew={() => { onNewConv(); onViewChange('chat'); }}
          />
        )}

        {/* Stats tab */}
        {bottomTab === 'stats' && (
          <div style={styles.statsContent}>
            <span style={styles.sectionLabel}>SESSION</span>
            <div style={styles.statsGrid}>
              <div style={styles.statCell}>
                <span style={styles.statVal}>{stats.totalQueries}</span>
                <span style={styles.statKey}>Queries</span>
              </div>
              <div style={styles.statCell}>
                <span style={styles.statVal}>
                  {stats.avgLatencyMs > 0 ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
                </span>
                <span style={styles.statKey}>Avg time</span>
              </div>
              <div style={styles.statCell}>
                <span style={styles.statVal}>{stats.totalSources}</span>
                <span style={styles.statKey}>Sources</span>
              </div>
              <div style={styles.statCell}>
                <span style={styles.statVal}>{documents.length}</span>
                <span style={styles.statKey}>Docs</span>
              </div>
            </div>

            {liveStats && (
              <>
                <span style={{ ...styles.sectionLabel, marginTop: 10, display: 'block' }}>BACKEND</span>
                <div style={styles.statsGrid}>
                  <div style={styles.statCell}>
                    <span style={styles.statVal}>{liveStats.graph_node_count}</span>
                    <span style={styles.statKey}>Nodes</span>
                  </div>
                  <div style={styles.statCell}>
                    <span style={styles.statVal}>{liveStats.graph_rel_count}</span>
                    <span style={styles.statKey}>Relations</span>
                  </div>
                  <div style={styles.statCell}>
                    <span style={styles.statVal}>{(liveStats.cache_hit_rate * 100).toFixed(0)}%</span>
                    <span style={styles.statKey}>Cache hits</span>
                  </div>
                  <div style={styles.statCell}>
                    <span style={styles.statVal}>{liveStats.cache_total_requests}</span>
                    <span style={styles.statKey}>Requests</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerDivider} />
        <p style={styles.footerText}>Graph RAG · v2.1</p>
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240, minWidth: 240, height: '100%',
    background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    transition: 'width 0.2s ease, min-width 0.2s ease',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 14px 12px', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0,
  },
  logoIcon: {
    width: 26, height: 26, borderRadius: 6, background: 'var(--accent-glow)',
    border: '1px solid rgba(217,119,6,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoText:    { fontSize: 13, fontWeight: 700, color: 'var(--sidebar-text-active)', letterSpacing: '-0.3px', flex: 1 },
  logoActions: { display: 'flex', alignItems: 'center', gap: 5 },
  statusWrap:  { display: 'flex', alignItems: 'center', gap: 3 },
  statusLabel: { fontSize: 10, fontWeight: 600 },
  collapseBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4, opacity: 0.6 },
  nav:         { padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 },
  sectionLabel:{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em', padding: '0 8px 6px', display: 'block' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: 'none',
    background: 'none', width: '100%', textAlign: 'left', position: 'relative',
    color: 'var(--sidebar-text)', transition: 'background 0.12s',
  },
  navItemActive: { background: 'var(--sidebar-item-active)', color: 'var(--sidebar-text-active)' },
  navItemText:   { fontSize: 12.5, fontWeight: 500, flex: 1 },
  shortcut: {
    fontSize: 9.5, color: 'var(--text-faint)', background: 'rgba(255,255,255,0.04)',
    padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-mono)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  activeBar: {
    width: 3, height: 14, borderRadius: 2, background: 'var(--accent)',
    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
  },
  tabBar: {
    display: 'flex', gap: 2, padding: '6px 10px 2px',
    borderTop: '1px solid var(--sidebar-border)', flexShrink: 0,
  },
  tabBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    fontSize: 10.5, fontWeight: 500, padding: '5px 4px', borderRadius: 5,
    border: 'none', cursor: 'pointer', background: 'none', color: 'var(--sidebar-text)',
    transition: 'background 0.12s',
  },
  tabBtnActive: { background: 'var(--sidebar-item-active)', color: 'var(--sidebar-text-active)' },
  bottomContent: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '6px 10px 0' },
  tabHeader:   { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 6px', flexShrink: 0 },
  docCountBadge: {
    fontSize: 10, fontWeight: 700, background: 'var(--accent-glow)', color: 'var(--accent)',
    border: '1px solid rgba(217,119,6,0.25)', padding: '0 6px', borderRadius: 99,
  },
  filterTabs:      { display: 'flex', gap: 2, padding: '0 6px 5px', flexShrink: 0 },
  filterTab:       { display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'none', color: 'var(--sidebar-text)' },
  filterTabActive: { background: 'var(--sidebar-item-active)', color: 'var(--sidebar-text-active)' },
  filterCount:     { fontSize: 9, background: 'rgba(255,255,255,0.08)', padding: '0 3px', borderRadius: 3, color: 'var(--text-muted)' },
  docsList:    { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 },
  emptyDocs:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '16px 8px', color: 'var(--text-muted)', fontSize: 11.5, textAlign: 'center' },
  docItem:     { display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 'var(--radius-sm)', transition: 'background 0.1s' },
  docMeta:     { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 1 },
  docName:     { fontSize: 11.5, color: 'var(--sidebar-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docDate:     { fontSize: 10, color: 'var(--text-faint)' },
  deleteBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', display: 'flex', opacity: 0.7, padding: 2, borderRadius: 4, flexShrink: 0 },
  statsContent:{ padding: '4px 2px', overflowY: 'auto' },
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6,
    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--sidebar-border)',
    borderRadius: 7, padding: '8px 10px',
  },
  statCell:  { display: 'flex', flexDirection: 'column', gap: 1 },
  statVal:   { fontSize: 16, fontWeight: 700, color: 'var(--sidebar-text-active)', fontFamily: 'var(--font-mono)' },
  statKey:   { fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  footer:    { padding: '6px 14px 12px', flexShrink: 0 },
  footerDivider: { height: 1, background: 'var(--sidebar-border)', marginBottom: 6 },
  footerText:    { fontSize: 10, color: 'var(--text-faint)' },
};