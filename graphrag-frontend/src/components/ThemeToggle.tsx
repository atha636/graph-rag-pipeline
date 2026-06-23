import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export const useTheme = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('graphrag_theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('graphrag_theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
};

interface ThemeToggleProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const [animating, setAnimating] = useState(false);

  const handleClick = () => {
    setAnimating(true);
    onToggle();
    setTimeout(() => setAnimating(false), 400);
  };

  const isDark = theme === 'dark';

  return (
    <button
      onClick={handleClick}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        ...styles.btn,
        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)',
      }}
    >
      {/* Track */}
      <div style={{
        ...styles.track,
        background: isDark ? '#1e2d40' : '#d1fae5',
        justifyContent: isDark ? 'flex-start' : 'flex-end',
      }}>
        <div style={{
          ...styles.thumb,
          background: isDark ? '#374151' : '#fff',
          boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.2)',
          animation: animating ? 'theme-toggle 0.35s ease' : 'none',
        }}>
          {isDark
            ? <Moon size={9} color="#94a3b8" />
            : <Sun size={9} color="#f59e0b" />}
        </div>
      </div>
    </button>
  );
};

const styles: Record<string, React.CSSProperties> = {
  btn: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 99,
    padding: '3px 5px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  track: {
    width: 36,
    height: 18,
    borderRadius: 99,
    display: 'flex',
    alignItems: 'center',
    padding: '0 2px',
    transition: 'background 0.25s, justify-content 0s',
  },
  thumb: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, box-shadow 0.2s',
    flexShrink: 0,
  },
};