import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Sparkles, RotateCcw, GitBranch, Clock,
  ChevronDown, Download, Lightbulb, X, Zap, MessageSquarePlus,
} from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { queryStream, cancelActiveQuery, createConversationAPI } from '../services/api';
import type { Message, Source, SessionStats } from '../types';

const SUGGESTIONS = [
  'Who founded SpaceX?', 'What is Elon Musk known for?',
  'Summarize the Tesla report', 'What relationships exist in the knowledge graph?',
];

const MAX_CHARS = 2000;

const extractFollowUps = (answer: string, query: string): string[] => {
  const q = query.toLowerCase();
  const s: string[] = [];
  if (q.includes('found') || q.includes('creat'))   s.push('What else did they build?');
  if (q.includes('who'))   s.push('What are they known for?', 'What companies are involved?');
  if (q.includes('what'))  s.push('Who is responsible for this?');
  if (q.includes('summar'))s.push('What are the key entities?');
  if (answer.toLowerCase().includes('founded'))      s.push('Who leads this organization now?');
  return [...new Set(s)].slice(0, 3);
};

const exportConversation = (messages: Message[]) => {
  const lines = [
    '# GraphRAG Conversation Export',
    `> Exported on ${new Date().toLocaleString()}`, '',
  ];
  messages.forEach(m => {
    if (m.role === 'user') {
      lines.push('## You', m.content, '');
    } else {
      lines.push('## GraphRAG Assistant', m.content, '');
      if (m.cache_hit) lines.push('> ⚡ *Answered from semantic cache*', '');
      if (m.sources?.length) {
        lines.push('**Sources:**');
        m.sources.forEach((s, i) =>
          lines.push(`- [${i+1}] ${s.source_type === 'graph' ? 'Neo4j' : 'Pinecone'}: ${s.document_name ?? 'Graph result'}`)
        );
        lines.push('');
      }
      if (m.latency_ms) lines.push(`*${m.latency_ms.toFixed(0)} ms*`, '');
    }
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `graphrag-chat-${Date.now()}.md` });
  a.click();
  URL.revokeObjectURL(url);
};

interface ChatViewProps {
  onStatsUpdate: (latency: number, sourceCount: number) => void;
  conversationId?: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ onStatsUpdate, conversationId }) => {
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [lastLatency,   setLastLatency]   = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [activeConvId,  setActiveConvId]  = useState<string | undefined>(conversationId);
  const [cacheHits,     setCacheHits]     = useState(0);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const stopRef     = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    // Create conversation on first message
    let convId = activeConvId;
    if (!convId) {
      try {
        convId = await createConversationAPI(text.slice(0, 60));
        setActiveConvId(convId);
      } catch { /* proceed without conversation ID */ }
    }

    const userMsg: Message = {
      id: Date.now().toString(), role: 'user',
      content: text.trim(), timestamp: new Date(),
    };
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId, role: 'assistant', content: '',
      timestamp: new Date(), isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setLoading(true);

    // Use SSE streaming
    stopRef.current = queryStream(
      { query: text.trim(), conversation_id: convId, use_cache: true },
      {
        onMeta: (meta) => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId
              ? { ...m, sources: meta.sources as Source[], documents: meta.documents, cache_hit: meta.cache_hit, intent: meta.intent }
              : m
          ));
          if (meta.cache_hit) setCacheHits(c => c + 1);
        },
        onChunk: (chunk) => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: m.content + chunk } : m
          ));
        },
        onDone: (latency) => {
          setLastLatency(latency);
          setMessages(prev => prev.map(m => {
            if (m.id !== aiMsgId) return m;
            return { ...m, isStreaming: false, latency_ms: latency, followUps: extractFollowUps(m.content, text) };
          }));
          setMessages(prev => {
            const ai = prev.find(m => m.id === aiMsgId);
            if (ai) onStatsUpdate(latency, ai.sources?.length ?? 0);
            return prev;
          });
          setLoading(false);
          stopRef.current = null;
          setTimeout(() => inputRef.current?.focus(), 50);
        },
        onError: (err) => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId
              ? { ...m, content: `❌ **Error:** ${err}\n\nCheck your backend is running:\n\`\`\`\nuvicorn src.api.main:app --reload --port 8000\n\`\`\``, isStreaming: false }
              : m
          ));
          setLoading(false);
          stopRef.current = null;
        },
      }
    );
  };

  const handleStop = () => {
    stopRef.current?.();
    cancelActiveQuery();
    setLoading(false);
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content + '\n\n*Stopped.*' } : m
    ));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleReset = () => {
    setMessages([]); setLastLatency(null); setInput('');
    setActiveConvId(undefined); setCacheHits(0);
  };

  const isEmpty   = messages.length === 0;
  const charsLeft = MAX_CHARS - input.length;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.headerIcon}><Sparkles size={15} color="var(--accent)" /></div>
          <div>
            <h2 style={s.headerTitle}>Ask AI</h2>
            <p style={s.headerSub}>Groq LLM · Neo4j · Pinecone</p>
          </div>
        </div>
        <div style={s.headerRight}>
          {lastLatency != null && (
            <div style={s.badge}><Clock size={11} /><span>{lastLatency.toFixed(0)} ms</span></div>
          )}
          {cacheHits > 0 && (
            <div style={{ ...s.badge, color: 'var(--accent)', borderColor: 'rgba(217,119,6,0.3)', background: 'var(--accent-glow)' }}>
              <Zap size={11} /><span>{cacheHits} cached</span>
            </div>
          )}
          {!isEmpty && (
            <>
              <button style={s.headerBtn} onClick={() => exportConversation(messages)}>
                <Download size={13} /><span>Export</span>
              </button>
              <button style={s.headerBtn} onClick={handleReset}>
                <RotateCcw size={13} /><span>New</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={s.messages} ref={messagesRef} onScroll={handleScroll}>
        {isEmpty ? (
          <div style={s.welcome}>
            <div style={s.welcomeIcon}><GitBranch size={32} color="var(--accent)" /></div>
            <h3 style={s.welcomeTitle}>Graph RAG Assistant</h3>
            <p style={s.welcomeSub}>
              Ask questions about your documents. Powered by semantic vector search,
              knowledge graph traversal, and Groq LLM generation.
            </p>
            <div style={s.suggestions}>
              {SUGGESTIONS.map(sug => (
                <button key={sug} style={s.suggestion} onClick={() => sendMessage(sug)}>{sug}</button>
              ))}
            </div>
            <div style={s.shortcutRow}>
              <kbd style={s.kbd}>⌘K</kbd><span style={s.shortcutText}>focus input</span>
              <kbd style={s.kbd}>⌘1–3</kbd><span style={s.shortcutText}>switch views</span>
            </div>
          </div>
        ) : (
          <div style={s.messageList}>
            {messages.map((m, idx) => (
              <React.Fragment key={m.id}>
                <MessageBubble message={m} />
                {m.role === 'assistant' && !m.isStreaming && m.followUps?.length && idx === messages.length - 1 && (
                  <div style={s.followUps}>
                    <div style={s.followUpsHeader}>
                      <Lightbulb size={11} color="var(--accent)" />
                      <span style={s.followUpsLabel}>Follow-up</span>
                    </div>
                    <div style={s.followUpBtns}>
                      {m.followUps.map(fu => (
                        <button key={fu} style={s.followUpBtn} onClick={() => sendMessage(fu)} disabled={loading}>{fu}</button>
                      ))}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
        {showScrollBtn && (
          <button style={s.scrollBtn} onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {/* Input */}
      <div style={s.inputArea}>
        <div style={{ ...s.inputWrapper, boxShadow: loading ? '0 0 0 2px var(--accent-glow)' : 'none' }}>
          <textarea
            ref={inputRef}
            style={s.input}
            placeholder="Ask anything… (⌘K)"
            value={input}
            onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <div style={s.inputActions}>
            {input.length > MAX_CHARS * 0.7 && (
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: charsLeft < 100 ? 'var(--error)' : 'var(--text-muted)' }}>
                {charsLeft}
              </span>
            )}
            {loading ? (
              <button style={{ ...s.sendBtn, background: 'var(--error)' }} onClick={handleStop}>
                <X size={15} color="#fff" />
              </button>
            ) : (
              <button
                style={{ ...s.sendBtn, background: input.trim() ? 'var(--accent)' : 'var(--bg-hover)', cursor: input.trim() ? 'pointer' : 'not-allowed' }}
                onClick={() => sendMessage(input)} disabled={!input.trim()}
              >
                <Send size={15} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
              </button>
            )}
          </div>
        </div>
        <div style={s.hintRow}>
          <span style={s.hint}>↵ Send · Shift+↵ New line</span>
          {loading && <span style={s.loadingHint}><span style={s.loadingDot} />Generating answer…</span>}
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container:    { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', position:'relative' },
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 28px', borderBottom:'1px solid var(--border)', background:'var(--bg-surface)', flexShrink:0 },
  headerLeft:   { display:'flex', alignItems:'center', gap:12 },
  headerRight:  { display:'flex', alignItems:'center', gap:8 },
  headerIcon:   { width:34, height:34, borderRadius:9, background:'var(--accent-glow)', border:'1px solid rgba(217,119,6,0.2)', display:'flex', alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:15, fontWeight:600, color:'var(--text-primary)', lineHeight:1.2 },
  headerSub:    { fontSize:11, color:'var(--text-muted)', marginTop:1 },
  badge:        { display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-muted)', background:'var(--bg-elevated)', border:'1px solid var(--border)', padding:'3px 9px', borderRadius:6 },
  headerBtn:    { display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:'var(--radius-sm)', background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontSize:12, fontWeight:500, cursor:'pointer' },
  messages:     { flex:1, overflowY:'auto', padding:'0 28px', position:'relative' },
  welcome:      { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100%', textAlign:'center', padding:'48px 20px', gap:14 },
  welcomeIcon:  { width:68, height:68, borderRadius:18, background:'var(--accent-glow)', border:'1px solid rgba(217,119,6,0.25)', display:'flex', alignItems:'center', justifyContent:'center' },
  welcomeTitle: { fontSize:24, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.4px' },
  welcomeSub:   { fontSize:14, color:'var(--text-secondary)', maxWidth:440, lineHeight:1.75 },
  suggestions:  { display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:6 },
  suggestion:   { padding:'9px 18px', borderRadius:99, background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', fontWeight:500 },
  shortcutRow:  { display:'flex', alignItems:'center', gap:8, marginTop:4 },
  kbd:          { fontSize:10.5, fontFamily:'var(--font-mono)', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderBottom:'2px solid var(--border)', borderRadius:5, padding:'2px 7px', color:'var(--text-muted)' },
  shortcutText: { fontSize:12, color:'var(--text-faint)' },
  messageList:  { display:'flex', flexDirection:'column', gap:22, padding:'28px 0' },
  followUps:    { display:'flex', flexDirection:'column', gap:7, paddingLeft:42, animation:'fadeIn 0.3s ease' },
  followUpsHeader:{ display:'flex', alignItems:'center', gap:5 },
  followUpsLabel: { fontSize:11, color:'var(--text-muted)', fontWeight:500 },
  followUpBtns: { display:'flex', flexWrap:'wrap', gap:6 },
  followUpBtn:  { padding:'6px 14px', borderRadius:99, fontSize:12, background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', cursor:'pointer', fontWeight:500 },
  scrollBtn:    { position:'sticky', bottom:16, marginLeft:'auto', display:'flex', alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:'50%', background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.3)', animation:'fadeIn 0.2s ease' },
  inputArea:    { padding:'12px 28px 16px', borderTop:'1px solid var(--border)', background:'var(--bg-surface)', flexShrink:0 },
  inputWrapper: { display:'flex', alignItems:'flex-end', gap:10, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'8px 8px 8px 16px', transition:'box-shadow 0.2s' },
  input:        { flex:1, background:'none', border:'none', outline:'none', color:'var(--text-primary)', fontSize:14, resize:'none', lineHeight:1.6, maxHeight:140, padding:'2px 0', overflowY:'auto' },
  inputActions: { display:'flex', alignItems:'center', gap:6, flexShrink:0 },
  sendBtn:      { width:36, height:36, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', border:'none', transition:'background 0.2s', flexShrink:0 },
  hintRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6, paddingLeft:4 },
  hint:         { fontSize:11, color:'var(--text-faint)' },
  loadingHint:  { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--accent)' },
  loadingDot:   { width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'pulse-dot 1.2s ease-in-out infinite', display:'inline-block' },
};