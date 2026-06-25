import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const ICONS = {
  success: <CheckCircle size={14} color="var(--accent)" />,
  error:   <XCircle    size={14} color="#ef4444" />,
  info:    <Info       size={14} color="var(--secondary)" />,
};

const COLORS = {
  success: 'rgba(217,119,6,0.12)',
  error:   'rgba(239,68,68,0.12)',
  info:    'rgba(99,102,241,0.12)',
};

const BORDERS = {
  success: 'rgba(217,119,6,0.20)',
  error:   'rgba(239,68,68,0.25)',
  info:    'rgba(99,102,241,0.25)',
};

const ToastCard: React.FC<{ toast: ToastItem; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mount animation
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.duration ?? 3500);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div style={{
      ...styles.toast,
      background: COLORS[toast.type],
      border: `1px solid ${BORDERS[toast.type]}`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(100%)',
    }}>
      {ICONS[toast.type]}
      <span style={styles.toastMsg}>{toast.message}</span>
      <button style={styles.toastClose} onClick={() => onRemove(toast.id)}>
        <X size={12} color="var(--text-muted)" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onRemove }) => (
  <div style={styles.container}>
    {toasts.map(t => (
      <ToastCard key={t.id} toast={t} onRemove={onRemove} />
    ))}
  </div>
);

// Hook
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    minWidth: 240,
    maxWidth: 360,
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    pointerEvents: 'all',
  },
  toastMsg: {
    fontSize: 13,
    color: 'var(--text-primary)',
    flex: 1,
    lineHeight: 1.4,
  },
  toastClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    padding: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
};