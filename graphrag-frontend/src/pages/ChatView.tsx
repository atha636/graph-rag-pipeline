import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, GitBranch, Clock } from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { queryAPI } from '../services/api';
import type { Message } from '../types';

const SUGGESTIONS = [
  'Who founded SpaceX?',
  'What is Elon Musk known for?',
  'Summarize the Tesla report',
  'What relationships exist in the knowledge graph?',
];

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setLoading(true);

    try {
      // POST /api/v1/query
      const response = await queryAPI({ query: text.trim() });

      setLastLatency(response.latency_ms);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                content: response.answer,
                sources: response.sources,
                documents: response.documents,
                isStreaming: false,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                content:
                  '❌ Could not reach the backend.\n\nMake sure your FastAPI server is running:\n```\nuvicorn src.api.main:app --reload --port 8000\n```',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}><Sparkles size={15} color="var(--accent)" /></div>
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
          {!isEmpty && (
            <button style={styles.resetBtn} onClick={() => { setMessages([]); setLastLatency(null); }}>
              <RotateCcw size={13} />
              <span>New chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {isEmpty ? (
          <div style={styles.welcome}>
            <div style={styles.welcomeIcon}>
              <GitBranch size={32} color="var(--accent)" />
            </div>
            <h3 style={styles.welcomeTitle}>Graph RAG Assistant</h3>
            <p style={styles.welcomeSub}>
              Ask questions about your uploaded documents. The system searches your
              knowledge graph and vector database to give accurate, cited answers.
            </p>
            <div style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} style={styles.suggestion} onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.messageList}>
            {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <div style={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            style={styles.input}
            placeholder="Ask anything about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            style={{
              ...styles.sendBtn,
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-elevated)',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Send size={16} color={input.trim() && !loading ? '#fff' : 'var(--text-muted)'} />
          </button>
        </div>
        <p style={styles.hint}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  headerSub: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  latency: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: 'var(--text-muted)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    padding: '3px 8px', borderRadius: 6,
  },
  resetBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  messages: { flex: 1, overflowY: 'auto', padding: '0 28px' },
  welcome: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', textAlign: 'center',
    padding: '40px 20px', gap: 16,
  },
  welcomeIcon: {
    width: 64, height: 64, borderRadius: 16,
    background: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' },
  welcomeSub: { fontSize: 14, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.7 },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  suggestion: {
    padding: '8px 16px', borderRadius: 99, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
  },
  messageList: { display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' },
  inputArea: {
    padding: '16px 28px 20px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0,
  },
  inputWrapper: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '6px 6px 6px 16px',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 14, resize: 'none',
    lineHeight: 1.6, maxHeight: 120, padding: '4px 0',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 10, display: 'flex',
    alignItems: 'center', justifyContent: 'center', border: 'none',
    transition: 'background 0.2s', flexShrink: 0,
  },
  hint: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', marginTop: 8 },
};
