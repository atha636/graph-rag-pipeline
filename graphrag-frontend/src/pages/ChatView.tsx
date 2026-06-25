import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Sparkles, RotateCcw, GitBranch, Clock,
  ChevronDown, Download, Lightbulb, X,
} from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { queryAPI, cancelActiveQuery } from '../services/api';
import type { Message, SessionStats } from '../types';

const SUGGESTIONS = [
  'Who founded SpaceX?',
  'What is Elon Musk known for?',
  'Summarize the Tesla report',
  'What relationships exist in the knowledge graph?',
];

const MAX_CHARS = 2000;

// Generate follow-up suggestions from the AI answer text
const extractFollowUps = (answer: string, query: string): string[] => {
  const q = query.toLowerCase();
  const suggestions: string[] = [];

  if (q.includes('found') || q.includes('creat') || q.includes('start'))
    suggestions.push('What else did they build?', 'When was this?');
  if (q.includes('who'))
    suggestions.push('What are they known for?', 'What companies are involved?');
  if (q.includes('what'))
    suggestions.push('Who is responsible for this?', 'When did this happen?');
  if (q.includes('summar'))
    suggestions.push('What are the key entities?', 'What relationships exist?');
  if (answer.toLowerCase().includes('relationship'))
    suggestions.push('Show me the knowledge graph');
  if (answer.toLowerCase().includes('founded') || answer.toLowerCase().includes('ceo'))
    suggestions.push('Who leads this organization now?');

  // Deduplicate and limit
  return [...new Set(suggestions)].slice(0, 3);
};

// Export conversation as a Markdown file
const exportConversation = (messages: Message[]) => {
  const lines: string[] = [
    '# GraphRAG Conversation Export',
    `> Exported on ${new Date().toLocaleString()}`,
    '',
  ];

  messages.forEach(m => {
    if (m.role === 'user') {
      lines.push(`## You`, m.content, '');
    } else {
      lines.push(`## GraphRAG Assistant`, m.content, '');
      if (m.sources && m.sources.length > 0) {
        lines.push('**Sources:**');
        m.sources.forEach((s, i) => {
          lines.push(`- [${i + 1}] ${s.source_type === 'graph' ? 'Neo4j' : 'Pinecone'}: ${s.document_name ?? 'Graph result'}`);
        });
        lines.push('');
      }
      if (m.latency_ms) lines.push(`*Response time: ${m.latency_ms.toFixed(0)} ms*`, '');
    }
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `graphrag-chat-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

interface ChatViewProps {
  onStatsUpdate: (latency: number, sourceCount: number) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ onStatsUpdate }) => {
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [lastLatency,  setLastLatency]  = useState<number | null>(null);
  const [showScrollBtn,setShowScrollBtn]= useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  // Global Ctrl+K / Cmd+K to focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Cmd+1/2/3 nav shortcuts are handled in App
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   text.trim(),
      timestamp: new Date(),
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id:          aiMsgId,
      role:        'assistant',
      content:     '',
      timestamp:   new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryAPI({ query: text.trim() });

      const followUps = extractFollowUps(response.answer, text.trim());

      setLastLatency(response.latency_ms);
      onStatsUpdate(response.latency_ms, response.sources.length);

      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? {
                ...m,
                content:     response.answer,
                sources:     response.sources,
                documents:   response.documents,
                latency_ms:  response.latency_ms,
                followUps,
                isStreaming: false,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const isCancelled =
        typeof err === 'object' && err !== null && 'message' in err &&
        (err as { message: string }).message === 'Cancelled by user';

      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? {
                ...m,
                content: isCancelled
                  ? '_Request cancelled._'
                  : '❌ **Could not reach the backend.**\n\nMake sure your FastAPI server is running:\n```\nuvicorn src.api.main:app --reload --port 8000\n```',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleStop = () => {
    cancelActiveQuery();
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const charsLeft = MAX_CHARS - input.length;
  const isEmpty   = messages.length === 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <Sparkles size={15} color="var(--accent)" />
          </div>
          <div>
            <h2 style={styles.headerTitle}>Ask AI</h2>
            <p style={styles.headerSub}>Groq LLM · Neo4j · Pinecone</p>
          </div>
        </div>

        <div style={styles.headerRight}>
          {lastLatency != null && (
            <div style={styles.latencyBadge}>
              <Clock size={11} />
              <span>{lastLatency.toFixed(0)} ms</span>
            </div>
          )}
          {messages.length > 0 && (
            <>
              <button
                style={styles.headerBtn}
                onClick={() => exportConversation(messages)}
                title="Export as Markdown"
              >
                <Download size={13} />
                <span>Export</span>
              </button>
              <button
                style={styles.headerBtn}
                onClick={() => { setMessages([]); setLastLatency(null); setInput(''); }}
                title="New conversation"
              >
                <RotateCcw size={13} />
                <span>New chat</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messages} ref={messagesRef} onScroll={handleScroll}>
        {isEmpty ? (
          <div style={styles.welcome}>
            <div style={styles.welcomeIcon}>
              <GitBranch size={32} color="var(--accent)" />
            </div>
            <h3 style={styles.welcomeTitle}>Graph RAG Assistant</h3>
            <p style={styles.welcomeSub}>
              Ask questions about your uploaded documents. The system searches
              your knowledge graph and vector database to give accurate, cited answers.
            </p>
            <div style={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button key={s} style={styles.suggestion} onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div style={styles.shortcutHint}>
              <kbd style={styles.kbd}>⌘K</kbd>
              <span style={styles.shortcutText}>to focus input anywhere</span>
            </div>
          </div>
        ) : (
          <div style={styles.messageList}>
            {messages.map((m, idx) => (
              <React.Fragment key={m.id}>
                <MessageBubble message={m} />

                {/* Follow-up suggestions after last assistant message */}
                {m.role === 'assistant' &&
                 !m.isStreaming &&
                 m.followUps &&
                 m.followUps.length > 0 &&
                 idx === messages.length - 1 && (
                  <div style={styles.followUps}>
                    <div style={styles.followUpsHeader}>
                      <Lightbulb size={11} color="var(--accent)" />
                      <span style={styles.followUpsLabel}>Follow-up suggestions</span>
                    </div>
                    <div style={styles.followUpBtns}>
                      {m.followUps.map(fu => (
                        <button
                          key={fu}
                          style={styles.followUpBtn}
                          onClick={() => sendMessage(fu)}
                          disabled={loading}
                        >
                          {fu}
                        </button>
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
          <button style={styles.scrollBtn} onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <div style={{
          ...styles.inputWrapper,
          borderColor: input.length > MAX_CHARS * 0.9 ? 'var(--warning)' : 'var(--border)',
          boxShadow: loading ? '0 0 0 2px var(--accent-glow)' : 'none',
        }}>
          <textarea
            ref={inputRef}
            style={styles.input}
            placeholder="Ask anything about your documents… (⌘K)"
            value={input}
            onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />

          <div style={styles.inputActions}>
            {input.length > MAX_CHARS * 0.7 && (
              <span style={{
                ...styles.charCount,
                color: charsLeft < 100 ? 'var(--error)' : 'var(--text-muted)',
              }}>
                {charsLeft}
              </span>
            )}

            {loading ? (
              <button style={{ ...styles.sendBtn, background: 'var(--error)' }} onClick={handleStop} title="Stop">
                <X size={15} color="#fff" />
              </button>
            ) : (
              <button
                style={{
                  ...styles.sendBtn,
                  background: input.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                }}
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
              >
                <Send size={15} color={input.trim() ? '#fff' : 'var(--text-muted)'} />
              </button>
            )}
          </div>
        </div>

        <div style={styles.hintRow}>
          <span style={styles.hint}>↵ Send · Shift+↵ New line · ⌘K Focus</span>
          {loading && (
            <span style={styles.loadingHint}>
              <span style={styles.loadingDot} />
              Searching knowledge graph…
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden', position: 'relative',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 34, height: 34, borderRadius: 9,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 },
  headerSub:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  latencyBadge: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
    color: 'var(--text-muted)', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 6,
  },
  headerBtn: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: '0 28px', position: 'relative',
  },
  welcome: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100%',
    textAlign: 'center', padding: '48px 20px', gap: 14,
  },
  welcomeIcon: {
    width: 68, height: 68, borderRadius: 18,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.4px' },
  welcomeSub:   { fontSize: 14, color: 'var(--text-secondary)', maxWidth: 440, lineHeight: 1.75 },
  suggestions:  { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 6 },
  suggestion: {
    padding: '9px 18px', borderRadius: 99, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)',
    fontSize: 13, cursor: 'pointer', fontWeight: 500,
    transition: 'border-color 0.15s, color 0.15s',
  },
  shortcutHint: {
    display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
  },
  kbd: {
    fontSize: 10.5, fontFamily: 'var(--font-mono)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderBottom: '2px solid var(--border)', borderRadius: 5,
    padding: '2px 7px', color: 'var(--text-muted)',
  },
  shortcutText: { fontSize: 12, color: 'var(--text-faint)' },
  messageList: { display: 'flex', flexDirection: 'column', gap: 22, padding: '28px 0' },
  followUps: {
    display: 'flex', flexDirection: 'column', gap: 7,
    paddingLeft: 42, animation: 'fadeIn 0.3s ease',
  },
  followUpsHeader: { display: 'flex', alignItems: 'center', gap: 5 },
  followUpsLabel:  { fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 },
  followUpBtns:    { display: 'flex', flexWrap: 'wrap', gap: 6 },
  followUpBtn: {
    padding: '6px 14px', borderRadius: 99, fontSize: 12,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500,
    transition: 'border-color 0.15s',
  },
  scrollBtn: {
    position: 'sticky', bottom: 16, marginLeft: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: '50%',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)', animation: 'fadeIn 0.2s ease',
  },
  inputArea: {
    padding: '12px 28px 16px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0,
  },
  inputWrapper: {
    display: 'flex', alignItems: 'flex-end', gap: 10,
    background: 'var(--bg-elevated)', border: '1px solid',
    borderRadius: 'var(--radius-lg)', padding: '8px 8px 8px 16px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 14, resize: 'none',
    lineHeight: 1.6, maxHeight: 140, padding: '2px 0', overflowY: 'auto',
  },
  inputActions: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  charCount:    { fontSize: 11, fontFamily: 'var(--font-mono)', transition: 'color 0.2s' },
  sendBtn: {
    width: 36, height: 36, borderRadius: 10, display: 'flex',
    alignItems: 'center', justifyContent: 'center', border: 'none',
    transition: 'background 0.2s', flexShrink: 0,
  },
  hintRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6, paddingLeft: 4,
  },
  hint: { fontSize: 11, color: 'var(--text-faint)' },
  loadingHint: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: 'var(--accent)',
  },
  loadingDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'pulse-dot 1.2s ease-in-out infinite',
    display: 'inline-block',
  },
};