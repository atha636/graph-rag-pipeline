import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, RotateCcw, GitBranch, Clock, ChevronDown } from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { queryAPI } from '../services/api';
import type { Message } from '../types';

const SUGGESTIONS = [
  'Who founded SpaceX?',
  'What is Elon Musk known for?',
  'Summarize the Tesla report',
  'What relationships exist in the knowledge graph?',
];

const MAX_CHARS = 2000;

export const ChatView: React.FC = () => {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const messagesRef  = useRef<HTMLDivElement>(null);

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

  // Show scroll-to-bottom button when scrolled up
  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryAPI({ query: text.trim() });
      setLastLatency(response.latency_ms);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: response.answer, sources: response.sources, documents: response.documents, isStreaming: false }
            : m
        )
      );
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? {
                ...m,
                content: '❌ **Could not reach the backend.**\n\nMake sure your FastAPI server is running:\n```\nuvicorn src.api.main:app --reload --port 8000\n```',
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
            <div style={styles.latency}>
              <Clock size={11} color="var(--text-muted)" />
              <span>{lastLatency.toFixed(0)} ms</span>
            </div>
          )}
          {messages.length > 0 && (
            <button
              style={styles.resetBtn}
              onClick={() => { setMessages([]); setLastLatency(null); setInput(''); }}
            >
              <RotateCcw size={13} />
              <span>New chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        style={styles.messages}
        ref={messagesRef}
        onScroll={handleScroll}
      >
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
                <button
                  key={s}
                  style={styles.suggestion}
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.messageList}>
            {messages.map(m => <MessageBubble key={m.id} message={m} />)}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button style={styles.scrollBtn} onClick={scrollToBottom}>
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
            placeholder="Ask anything about your documents…"
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
            <button
              style={{
                ...styles.sendBtn,
                background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-hover)',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              }}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              {loading
                ? <span style={styles.sendSpinner} />
                : <Send size={15} color={input.trim() ? '#fff' : 'var(--text-muted)'} />}
            </button>
          </div>
        </div>
        <div style={styles.hintRow}>
          <span style={styles.hint}>↵ Send · Shift+↵ New line</span>
          {loading && <span style={styles.loadingHint}>Searching knowledge graph…</span>}
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
    padding: '16px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 },
  headerSub:   { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 },
  latency: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
    color: 'var(--text-muted)', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', padding: '3px 9px', borderRadius: 6,
  },
  resetBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: '0 28px',
    position: 'relative',
  },
  welcome: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100%', textAlign: 'center',
    padding: '48px 20px', gap: 16,
  },
  welcomeIcon: {
    width: 68, height: 68, borderRadius: 18,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.4px' },
  welcomeSub:   { fontSize: 14, color: 'var(--text-secondary)', maxWidth: 440, lineHeight: 1.75 },
  suggestions:  { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  suggestion: {
    padding: '9px 18px', borderRadius: 99, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)',
    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
    fontWeight: 500,
  },
  messageList: { display: 'flex', flexDirection: 'column', gap: 22, padding: '28px 0' },
  scrollBtn: {
    position: 'sticky',
    bottom: 16,
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    animation: 'fadeIn 0.2s ease',
  },
  inputArea: {
    padding: '14px 28px 18px', borderTop: '1px solid var(--border)',
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
    lineHeight: 1.6, maxHeight: 140, padding: '2px 0',
    overflowY: 'auto',
  },
  inputActions: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  charCount:   { fontSize: 11, fontFamily: 'var(--font-mono)', transition: 'color 0.2s' },
  sendBtn: {
    width: 36, height: 36, borderRadius: 10, display: 'flex',
    alignItems: 'center', justifyContent: 'center', border: 'none',
    transition: 'background 0.2s', flexShrink: 0,
  },
  sendSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
  },
  hintRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 7, paddingLeft: 4,
  },
  hint:        { fontSize: 11, color: 'var(--text-faint)' },
  loadingHint: {
    fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5,
    animation: 'pulse-dot 1.5s ease-in-out infinite',
  },
};