import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, Copy, Check } from 'lucide-react';
import { SourcesRow } from './SourceBadge';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button style={styles.copyBtn} onClick={handleCopy} title="Copy message">
      {copied
        ? <Check size={12} color="var(--success)" />
        : <Copy size={12} color="var(--text-muted)" />}
    </button>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>
          <p style={styles.userText}>{message.content}</p>
        </div>
        <div style={styles.avatarUser}>
          <User size={14} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.assistantRow}>
      <div style={styles.avatarBot}>
        <Bot size={14} color="var(--accent)" />
      </div>

      <div style={styles.assistantContent}>
        {message.sources && message.sources.length > 0 && (
          <SourcesRow
            sources={message.sources}
            documents={message.documents ?? []}
          />
        )}

        <div style={styles.assistantBubble}>
          {message.isStreaming && message.content === '' ? (
            <div style={styles.typingIndicator}>
              <span style={{ ...styles.dot, animationDelay: '0ms' }} />
              <span style={{ ...styles.dot, animationDelay: '160ms' }} />
              <span style={{ ...styles.dot, animationDelay: '320ms' }} />
            </div>
          ) : (
            <>
              <div style={styles.markdown}>
                <ReactMarkdown
                  components={{
                    // Styled inline code
                    code: ({ children, className }) => {
                      const isBlock = className?.startsWith('language-');
                      if (isBlock) {
                        return (
                          <pre style={styles.codeBlock}>
                            <code style={styles.codeBlockInner}>{children}</code>
                          </pre>
                        );
                      }
                      return <code style={styles.inlineCode}>{children}</code>;
                    },
                    // Styled links
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={styles.link}>
                        {children}
                      </a>
                    ),
                    // Styled blockquote
                    blockquote: ({ children }) => (
                      <blockquote style={styles.blockquote}>{children}</blockquote>
                    ),
                    // Tighter list spacing
                    ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
                    ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
                    li: ({ children }) => <li style={styles.li}>{children}</li>,
                    p:  ({ children }) => <p  style={styles.p}>{children}</p>,
                    h1: ({ children }) => <h1 style={styles.h1}>{children}</h1>,
                    h2: ({ children }) => <h2 style={styles.h2}>{children}</h2>,
                    h3: ({ children }) => <h3 style={styles.h3}>{children}</h3>,
                    strong: ({ children }) => <strong style={styles.strong}>{children}</strong>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && <span style={styles.cursor}>▍</span>}
              </div>

              {!message.isStreaming && (
                <div style={styles.bubbleFooter}>
                  <span style={styles.timestamp}>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <CopyButton text={message.content} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: 10,
    animation: 'fadeIn 0.25s ease',
  },
  userBubble: {
    background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: '14px 14px 4px 14px',
    padding: '10px 14px',
    maxWidth: '72%',
  },
  userText: {
    fontSize: 14,
    color: 'var(--text-primary)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  avatarUser: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  assistantRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    animation: 'fadeIn 0.25s ease',
  },
  avatarBot: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--accent-glow)',
    border: '1px solid rgba(16,185,129,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  assistantContent: {
    flex: 1,
    maxWidth: 'calc(100% - 42px)',
  },
  assistantBubble: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px 14px 14px 14px',
    padding: '14px 16px 10px',
  },
  markdown: {
    fontSize: 14,
    color: 'var(--text-primary)',
    lineHeight: 1.75,
  },
  cursor: {
    animation: 'blink 0.8s step-end infinite',
    color: 'var(--accent)',
    marginLeft: 1,
  },
  typingIndicator: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    height: 22,
    padding: '2px 0',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    display: 'inline-block',
    animation: 'pulse-dot 1.2s ease-in-out infinite',
  },
  bubbleFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid var(--border-subtle)',
  },
  timestamp: {
    fontSize: 10.5,
    color: 'var(--text-faint)',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 4px',
    borderRadius: 4,
    opacity: 0.7,
    transition: 'opacity 0.15s',
  },
  // Markdown element styles
  p: {
    margin: '0 0 8px',
    lineHeight: 1.75,
  },
  h1: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '16px 0 8px',
    letterSpacing: '-0.3px',
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '14px 0 6px',
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '12px 0 4px',
  },
  strong: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  inlineCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12.5,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '1px 5px',
    color: 'var(--accent-text)',
  },
  codeBlock: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '12px 14px',
    margin: '8px 0',
    overflowX: 'auto',
  },
  codeBlockInner: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12.5,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  link: {
    color: 'var(--accent-text)',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
  },
  blockquote: {
    borderLeft: '3px solid var(--accent)',
    paddingLeft: 12,
    margin: '8px 0',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  ul: {
    paddingLeft: 20,
    margin: '4px 0 8px',
  },
  ol: {
    paddingLeft: 20,
    margin: '4px 0 8px',
  },
  li: {
    marginBottom: 4,
    lineHeight: 1.6,
  },
};