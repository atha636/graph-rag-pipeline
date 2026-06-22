import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, GitBranch } from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { queryAPI } from '../services/api';
import type { Message } from '../types';

const WELCOME_SUGGESTIONS = [
  'Who founded SpaceX?',
  'What is Elon Musk known for?',
  'Summarize the Tesla report',
  'What relationships exist in the knowledge graph?',
];

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryAPI({ query: text.trim() });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? {
                ...m,
                content: response.answer,
                sources: response.sources,
                sourceCount: response.source_count,
                isStreaming: false,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? {
                ...m,
                content: 'Sorry, there was an error connecting to the backend. Make sure your FastAPI server is running on port 8000.',
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

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  const isEmpty = messages.length === 0;

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
            <p style={styles.headerSub}>Powered by Neo4j + Pinecone + Groq</p>
          </div>
        </div>
        {!isEmpty && (
          <button style={styles.resetBtn} onClick={handleReset} title="New conversation">
            <RotateCcw size={14} />
            <span>New chat</span>
          </button>
        )}
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
              Ask questions about your uploaded documents. The AI searches across your
              knowledge graph and vector database to give accurate, cited answers.
            </p>
            <div style={styles.suggestions}>
              {WELCOME_SUGGESTIONS.map((s) => (
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
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
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
        <p style={styles.hint}>Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 28px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 11.5,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 28px',
  },
  welcome: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center',
    padding: '40px 20px',
    gap: 16,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  welcomeSub: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    maxWidth: 420,
    lineHeight: 1.7,
  },
  suggestions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
  },
  suggestion: {
    padding: '8px 16px',
    borderRadius: 99,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  messageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '24px 0',
  },
  inputArea: {
    padding: '16px 28px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '6px 6px 6px 16px',
    transition: 'border-color 0.2s',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
    resize: 'none',
    lineHeight: 1.6,
    maxHeight: 120,
    padding: '4px 0',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-faint)',
    textAlign: 'center',
    marginTop: 8,
  },
};
