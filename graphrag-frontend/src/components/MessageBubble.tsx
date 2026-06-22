import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import { SourcesRow } from './SourceBadge';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

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
          <SourcesRow sources={message.sources} count={message.sourceCount ?? message.sources.length} />
        )}

        <div style={styles.assistantBubble}>
          {message.isStreaming && message.content === '' ? (
            <div style={styles.typingIndicator}>
              <span style={{ ...styles.dot, animationDelay: '0ms' }} />
              <span style={{ ...styles.dot, animationDelay: '160ms' }} />
              <span style={{ ...styles.dot, animationDelay: '320ms' }} />
            </div>
          ) : (
            <div style={styles.markdown}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
              {message.isStreaming && <span style={styles.cursor}>▍</span>}
            </div>
          )}
        </div>

        <span style={styles.timestamp}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
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
    maxWidth: '70%',
  },
  userText: {
    fontSize: 14,
    color: 'var(--text-primary)',
    lineHeight: 1.6,
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
    padding: '12px 16px',
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
    height: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    display: 'inline-block',
    animation: 'pulse-dot 1.2s ease-in-out infinite',
  },
  timestamp: {
    fontSize: 10.5,
    color: 'var(--text-faint)',
    marginTop: 5,
    display: 'block',
    paddingLeft: 4,
  },
};
