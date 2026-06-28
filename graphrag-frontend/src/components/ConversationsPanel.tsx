import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Plus, Trash2, Pencil, Check, X,
  Loader2, Clock, ChevronRight,
} from 'lucide-react';
import {
  listConversationsAPI, deleteConversationAPI,
  renameConversationAPI, createConversationAPI,
} from '../services/api';
import type { ConversationSummary } from '../types';

interface Props {
  activeId?:    string;
  onSelect:     (id: string) => void;
  onNew:        () => void;
  onDelete?:    (id: string) => void;
}

export const ConversationsPanel: React.FC<Props> = ({
  activeId, onSelect, onNew, onDelete,
}) => {
  const [convs,     setConvs]     = useState<ConversationSummary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConversationsAPI();
      setConvs(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversationAPI(id);
      setConvs(prev => prev.filter(c => c.id !== id));
      onDelete?.(id);
    } catch { /* silent */ }
  };

  const startEdit = (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    try {
      await renameConversationAPI(id, editTitle.trim());
      setConvs(prev => prev.map(c =>
        c.id === id ? { ...c, title: editTitle.trim() } : c
      ));
    } catch { /* silent */ }
    setEditingId(null);
  };

  const handleNew = async () => {
    try {
      const id = await createConversationAPI('New Conversation');
      await load();
      onSelect(id);
      onNew();
    } catch { onNew(); }
  };

  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7)  return `${diffDays}d ago`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.headerLabel}>CONVERSATIONS</span>
        <button style={s.newBtn} onClick={handleNew} title="New conversation">
          <Plus size={13} />
        </button>
      </div>

      {loading && convs.length === 0 && (
        <div style={s.loading}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} color="var(--text-muted)" />
        </div>
      )}

      {!loading && convs.length === 0 && (
        <p style={s.empty}>No saved conversations yet.</p>
      )}

      <div style={s.list}>
        {convs.map(conv => (
          <div
            key={conv.id}
            style={{
              ...s.item,
              background: activeId === conv.id ? 'var(--sidebar-item-active)' : 'transparent',
            }}
            onClick={() => { onSelect(conv.id); }}
          >
            <MessageSquare size={13} color={activeId === conv.id ? 'var(--accent)' : 'var(--sidebar-text)'} style={{ flexShrink: 0 }} />

            <div style={s.itemBody}>
              {editingId === conv.id ? (
                <input
                  style={s.editInput}
                  value={editTitle}
                  autoFocus
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEdit(conv.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span style={s.itemTitle}>{conv.title}</span>
              )}
              <div style={s.itemMeta}>
                <Clock size={9} color="var(--text-faint)" />
                <span style={s.itemDate}>{fmt(conv.updated_at)}</span>
                <span style={s.itemCount}>{conv.turn_count} msg{conv.turn_count !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div style={s.itemActions}>
              {editingId === conv.id ? (
                <>
                  <button style={s.iconBtn} onClick={e => { e.stopPropagation(); saveEdit(conv.id); }}>
                    <Check size={11} color="var(--success)" />
                  </button>
                  <button style={s.iconBtn} onClick={e => { e.stopPropagation(); setEditingId(null); }}>
                    <X size={11} color="var(--text-muted)" />
                  </button>
                </>
              ) : (
                <>
                  <button style={s.iconBtn} onClick={e => startEdit(e, conv)} title="Rename">
                    <Pencil size={11} color="var(--text-muted)" />
                  </button>
                  <button style={s.iconBtn} onClick={e => handleDelete(e, conv.id)} title="Delete">
                    <Trash2 size={11} color="var(--error)" />
                  </button>
                </>
              )}
            </div>

            {activeId === conv.id && <div style={s.activeBar} />}
          </div>
        ))}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  panel:       { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 4px' },
  headerLabel: { fontSize: 9.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em' },
  newBtn:      { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 3, borderRadius: 4, color: 'var(--accent)' },
  loading:     { display: 'flex', justifyContent: 'center', padding: 12 },
  empty:       { fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', textAlign: 'center' },
  list:        { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 7, padding: '7px 8px',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', position: 'relative',
    transition: 'background 0.1s',
  },
  itemBody:    { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 },
  itemTitle:   { fontSize: 12, fontWeight: 500, color: 'var(--sidebar-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemMeta:    { display: 'flex', alignItems: 'center', gap: 4 },
  itemDate:    { fontSize: 10, color: 'var(--text-faint)' },
  itemCount:   { fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 },
  itemActions: { display: 'flex', gap: 2, flexShrink: 0 },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 3, opacity: 0.8 },
  editInput:   { background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 5px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%' },
  activeBar:   { width: 3, height: 14, borderRadius: 2, background: 'var(--accent)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' },
};