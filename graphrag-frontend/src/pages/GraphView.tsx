import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GitBranch, RefreshCw, Loader2, ZoomIn, ZoomOut, Maximize2, Search, X } from 'lucide-react';
import { getGraphDataAPI } from '../services/api';
import type { GraphData, GraphNode, GraphRelationship } from '../types';

const NODE_COLORS: Record<string, string> = {
  Person:       '#d97706',
  Organization: '#c2410c',
  Product:      '#65a30d',
  Location:     '#0891b2',
  Technology:   '#a16207',
  Event:        '#be185d',
  Entity:       '#d97706',
  default:      '#78716c',
};

interface NodePos { x: number; y: number; vx: number; vy: number; }

// Force-directed simulation constants
const REPULSION  = 4000;
const ATTRACTION = 0.04;
const DAMPING    = 0.82;
const MIN_DIST   = 60;

export const GraphView: React.FC = () => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number>(0);
  const posRef      = useRef<Map<string, NodePos>>(new Map());
  const simRunning  = useRef(false);
  const panRef      = useRef({ x: 0, y: 0 });
  const dragRef     = useRef<{ nodeId: string | null; panStart: { x: number; y: number } | null }>({ nodeId: null, panStart: null });
  const mouseRef    = useRef({ x: 0, y: 0 });

  const [graphData,    setGraphData]    = useState<GraphData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom,         setZoom]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [canvasSize,   setCanvasSize]   = useState({ w: 800, h: 520 });

  // Fit canvas to wrapper
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const loadGraph = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGraphDataAPI();
      setGraphData(data);
      setSelectedNode(null);
      posRef.current.clear();
      panRef.current = { x: 0, y: 0 };
    } catch {
      setError('Could not load graph. Make sure your backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGraph(); }, []);

  // Init positions when data or canvas size changes
  useEffect(() => {
    if (!graphData?.nodes.length) return;
    const { w, h } = canvasSize;
    graphData.nodes.forEach((n, i) => {
      if (!posRef.current.has(n.id)) {
        const angle  = (2 * Math.PI * i) / graphData.nodes.length - Math.PI / 2;
        const radius = Math.min(w, h) * 0.3;
        posRef.current.set(n.id, {
          x: w / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
          y: h / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
        });
      }
    });
    simRunning.current = true;
  }, [graphData, canvasSize]);

  // Build neighbour lookup for connection-count sizing
  const connectionCount = React.useMemo(() => {
    const counts: Record<string, number> = {};
    graphData?.relationships.forEach(r => {
      counts[r.source] = (counts[r.source] ?? 0) + 1;
      counts[r.target] = (counts[r.target] ?? 0) + 1;
    });
    return counts;
  }, [graphData]);

  // Filtered nodes for search highlight
  const matchedIds = React.useMemo(() => {
    if (!search.trim() || !graphData) return new Set<string>();
    const q = search.toLowerCase();
    return new Set(
      graphData.nodes
        .filter(n => n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
        .map(n => n.id)
    );
  }, [search, graphData]);

  // Draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;
    const ctx = canvas.getContext('2d')!;
    const { w, h } = canvasSize;
    const nodes = graphData.nodes;
    const rels  = graphData.relationships;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Apply pan + zoom
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoom, zoom);

    // ── Force simulation tick ──────────────────────────────────────
    if (simRunning.current) {
      let maxV = 0;

      nodes.forEach(a => {
        const pa = posRef.current.get(a.id);
        if (!pa) return;
        let fx = 0, fy = 0;

        // Repulsion from every other node
        nodes.forEach(b => {
          if (b.id === a.id) return;
          const pb = posRef.current.get(b.id);
          if (!pb) return;
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
          const force = REPULSION / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });

        // Attraction to centre
        fx += (w / 2 - pa.x) * 0.003;
        fy += (h / 2 - pa.y) * 0.003;

        pa.vx = (pa.vx + fx) * DAMPING;
        pa.vy = (pa.vy + fy) * DAMPING;
        maxV = Math.max(maxV, Math.abs(pa.vx), Math.abs(pa.vy));
      });

      // Attraction along edges
      rels.forEach(r => {
        const ps = posRef.current.get(r.source);
        const pt = posRef.current.get(r.target);
        if (!ps || !pt) return;
        const dx = pt.x - ps.x;
        const dy = pt.y - ps.y;
        ps.vx += dx * ATTRACTION;
        ps.vy += dy * ATTRACTION;
        pt.vx -= dx * ATTRACTION;
        pt.vy -= dy * ATTRACTION;
      });

      nodes.forEach(n => {
        const p = posRef.current.get(n.id);
        if (!p || dragRef.current.nodeId === n.id) return;
        p.x += p.vx;
        p.y += p.vy;
        // Boundary padding
        p.x = Math.max(40, Math.min(w - 40, p.x));
        p.y = Math.max(40, Math.min(h - 40, p.y));
      });

      if (maxV < 0.3) simRunning.current = false;
    }

    // ── Draw edges ────────────────────────────────────────────────
    rels.forEach(rel => {
      const ps = posRef.current.get(rel.source);
      const pt = posRef.current.get(rel.target);
      if (!ps || !pt) return;

      const isHighlighted =
        selectedNode?.id === rel.source || selectedNode?.id === rel.target;

      const dx   = pt.x - ps.x;
      const dy   = pt.y - ps.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Curve offset
      const cx = (ps.x + pt.x) / 2 - (dy / dist) * 20;
      const cy = (ps.y + pt.y) / 2 + (dx / dist) * 20;

      ctx.beginPath();
      ctx.moveTo(ps.x, ps.y);
      ctx.quadraticCurveTo(cx, cy, pt.x, pt.y);
      ctx.strokeStyle = isHighlighted
        ? 'rgba(217,119,6,0.65)'
        : 'rgba(120,113,108,0.25)';
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();

      // Arrowhead at target
      const arrowLen = 8;
      const tx = pt.x - (dx / dist) * 16;
      const ty = pt.y - (dy / dist) * 16;
      const angle = Math.atan2(pt.y - cy, pt.x - cx);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(
        tx - arrowLen * Math.cos(angle - 0.4),
        ty - arrowLen * Math.sin(angle - 0.4)
      );
      ctx.lineTo(
        tx - arrowLen * Math.cos(angle + 0.4),
        ty - arrowLen * Math.sin(angle + 0.4)
      );
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? 'rgba(217,119,6,0.70)' : 'rgba(120,113,108,0.35)';
      ctx.fill();

      // Edge label (only when highlighted or zoomed in)
      if (isHighlighted || zoom > 1.2) {
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = isHighlighted ? 'rgba(217,119,6,0.90)' : 'rgba(120,113,108,0.70)';
        ctx.textAlign = 'center';
        ctx.fillText(rel.type, cx, cy - 4);
      }
    });

    // ── Draw nodes ────────────────────────────────────────────────
    nodes.forEach(node => {
      const pos = posRef.current.get(node.id);
      if (!pos) return;

      const color       = NODE_COLORS[node.type] ?? NODE_COLORS.default;
      const isSelected  = selectedNode?.id === node.id;
      const isMatched   = matchedIds.has(node.id);
      const isDimmed    = (search.trim() && !isMatched) ||
                          (selectedNode && !isSelected &&
                           !graphData.relationships.some(
                             r => (r.source === selectedNode.id && r.target === node.id) ||
                                  (r.target === selectedNode.id && r.source === node.id)
                           ));

      const degree = connectionCount[node.id] ?? 0;
      const r      = Math.max(12, Math.min(22, 12 + degree * 1.5));

      ctx.globalAlpha = isDimmed ? 0.2 : 1;

      // Outer glow for selected / matched
      if (isSelected || isMatched) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 8, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, r + 8);
        grad.addColorStop(0, color + '44');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color + (isSelected ? '44' : '22');
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth   = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      ctx.globalAlpha = 1;

      // Label
      const labelY = pos.y + r + 13;
      ctx.font      = `${isSelected ? 600 : 400} 11px Inter, sans-serif`;
      ctx.fillStyle = isSelected ? 'var(--text-primary)' : 'rgba(148,163,184,0.9)';
      ctx.textAlign = 'center';

      // Label background for readability
      const labelW = ctx.measureText(node.label).width + 8;
      if (isSelected || isMatched) {
        ctx.fillStyle = 'rgba(15,17,23,0.7)';
        ctx.beginPath();
        ctx.roundRect(pos.x - labelW / 2, labelY - 10, labelW, 14, 3);
        ctx.fill();
      }

      ctx.fillStyle = isSelected ? '#f1f5f9' : isDimmed ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.85)';
      ctx.fillText(node.label, pos.x, labelY);
    });

    ctx.restore();
    rafRef.current = requestAnimationFrame(draw);
  }, [graphData, canvasSize, zoom, selectedNode, matchedIds, search, connectionCount]);

  // Start/stop render loop
  useEffect(() => {
    if (!graphData?.nodes.length) return;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, graphData]);

  // Canvas hit-test helpers
  const canvasToWorld = (cx: number, cy: number) => ({
    x: (cx - panRef.current.x) / zoom,
    y: (cy - panRef.current.y) / zoom,
  });

  const nodeAtPoint = (wx: number, wy: number): GraphNode | null => {
    if (!graphData) return null;
    for (const node of graphData.nodes) {
      const p = posRef.current.get(node.id);
      if (!p) continue;
      const degree = connectionCount[node.id] ?? 0;
      const r = Math.max(12, Math.min(22, 12 + degree * 1.5)) + 4;
      if ((wx - p.x) ** 2 + (wy - p.y) ** 2 <= r * r) return node;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const wx   = (e.clientX - rect.left - panRef.current.x) / zoom;
    const wy   = (e.clientY - rect.top  - panRef.current.y) / zoom;
    const node = nodeAtPoint(wx, wy);

    if (node) {
      dragRef.current.nodeId = node.id;
      setSelectedNode(prev => prev?.id === node.id ? null : node);
    } else {
      dragRef.current.panStart = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (dragRef.current.nodeId) {
      const pos = posRef.current.get(dragRef.current.nodeId);
      if (pos) {
        const wx = (e.clientX - rect.left - panRef.current.x) / zoom;
        const wy = (e.clientY - rect.top  - panRef.current.y) / zoom;
        pos.x = wx; pos.y = wy; pos.vx = 0; pos.vy = 0;
        simRunning.current = true;
      }
    } else if (dragRef.current.panStart) {
      panRef.current = {
        x: e.clientX - dragRef.current.panStart.x,
        y: e.clientY - dragRef.current.panStart.y,
      };
    }
  };

  const handleMouseUp = () => {
    dragRef.current.nodeId   = null;
    dragRef.current.panStart = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)));
  };

  const fitView = () => {
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
  };

  const nodeTypeCounts = graphData?.nodes.reduce<Record<string, number>>((acc, n) => {
    const t = n.type || 'Entity';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  const selectedRelationships = graphData?.relationships.filter(
    r => r.source === selectedNode?.id || r.target === selectedNode?.id
  ) ?? [];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <GitBranch size={15} color="var(--accent)" />
          </div>
          <div>
            <h2 style={styles.headerTitle}>Knowledge Graph</h2>
            <p style={styles.headerSub}>
              {graphData
                ? `${graphData.nodes.length} nodes · ${graphData.relationships.length} relationships`
                : 'Neo4j Aura visualization'}
            </p>
          </div>
        </div>

        <div style={styles.headerActions}>
          {/* Search */}
          <div style={styles.searchBox}>
            <Search size={12} color="var(--text-muted)" />
            <input
              style={styles.searchInput}
              placeholder="Search nodes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button style={styles.clearSearch} onClick={() => setSearch('')}>
                <X size={11} color="var(--text-muted)" />
              </button>
            )}
          </div>
          <button style={styles.actionBtn} onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom in"><ZoomIn size={14} /></button>
          <button style={styles.actionBtn} onClick={() => setZoom(z => Math.max(z - 0.25, 0.3))} title="Zoom out"><ZoomOut size={14} /></button>
          <button style={styles.actionBtn} onClick={fitView} title="Fit view"><Maximize2 size={13} /></button>
          <button style={styles.actionBtn} onClick={loadGraph} title="Refresh">
            <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Canvas */}
        <div ref={wrapRef} style={styles.canvasWrap}>
          {loading && (
            <div style={styles.overlay}>
              <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={styles.overlayText}>Loading graph from Neo4j…</p>
            </div>
          )}
          {error && (
            <div style={styles.overlay}>
              <p style={{ fontSize: 13, color: 'var(--error)', textAlign: 'center', maxWidth: 300 }}>{error}</p>
            </div>
          )}
          {!loading && !error && graphData?.nodes.length === 0 && (
            <div style={styles.overlay}>
              <GitBranch size={36} color="var(--text-muted)" />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 10 }}>No graph data yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Upload documents to build your knowledge graph.</p>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            style={{
              width: '100%', height: '100%',
              cursor: dragRef.current.nodeId ? 'grabbing' : dragRef.current.panStart ? 'grabbing' : 'grab',
              display: graphData?.nodes.length ? 'block' : 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {/* Zoom badge */}
          {graphData?.nodes.length ? (
            <div style={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>
          ) : null}

          {/* Search results count */}
          {search && matchedIds.size > 0 && (
            <div style={styles.searchResults}>
              {matchedIds.size} match{matchedIds.size !== 1 ? 'es' : ''}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={styles.panel}>
          {/* Legend */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>Node Types</p>
            {Object.entries(NODE_COLORS)
              .filter(([k]) => k !== 'default')
              .map(([type, color]) => (
                <div key={type} style={styles.legendRow}>
                  <span style={{ ...styles.legendDot, background: color }} />
                  <span style={styles.legendLabel}>{type}</span>
                  <span style={styles.legendCount}>{nodeTypeCounts[type] ?? 0}</span>
                </div>
              ))}
          </div>

          {/* Selected node details */}
          {selectedNode && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Selected Node</p>
              <div style={styles.nodeCard}>
                <div style={{
                  ...styles.nodeCardIcon,
                  background: (NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default) + '22',
                  border: `1px solid ${(NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default)}44`,
                }}>
                  <GitBranch size={14} color={NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={styles.nodeCardLabel}>{selectedNode.label}</p>
                  <p style={styles.nodeCardType}>{selectedNode.type}</p>
                </div>
              </div>

              <p style={styles.nodeCardId}>{selectedNode.id}</p>

              {selectedRelationships.length > 0 && (
                <>
                  <p style={{ ...styles.sectionTitle, marginTop: 10 }}>
                    Connections ({selectedRelationships.length})
                  </p>
                  <div style={styles.relList}>
                    {selectedRelationships.slice(0, 8).map((r, i) => {
                      const isOut = r.source === selectedNode.id;
                      const otherId = isOut ? r.target : r.source;
                      const other = graphData?.nodes.find(n => n.id === otherId);
                      return (
                        <div key={i} style={styles.relRow}>
                          <span style={styles.relDir}>{isOut ? '→' : '←'}</span>
                          <span style={styles.relType}>{r.type}</span>
                          <span style={styles.relTarget}>{other?.label ?? otherId}</span>
                        </div>
                      );
                    })}
                    {selectedRelationships.length > 8 && (
                      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
                        +{selectedRelationships.length - 8} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <p style={styles.hint}>
            Drag nodes · Scroll to zoom · Click to inspect
          </p>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 16px 28px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0, gap: 12,
  },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 12 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 6 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10, background: 'var(--accent-glow)',
    border: '1px solid rgba(217,119,6,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  headerSub:   { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '5px 10px', minWidth: 160,
  },
  searchInput: {
    background: 'none', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 12, width: '100%',
  },
  clearSearch: {
    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0,
  },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)',
  },
  body:       { flex: 1, display: 'flex', overflow: 'hidden' },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: 'var(--bg-base)',
  },
  overlay: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 2,
  },
  overlayText: { fontSize: 13, color: 'var(--text-muted)' },
  zoomBadge: {
    position: 'absolute', bottom: 12, left: 12,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '2px 8px', fontSize: 11,
    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
  },
  searchResults: {
    position: 'absolute', top: 12, left: 12,
    background: 'var(--accent-glow)', border: '1px solid rgba(217,119,6,0.25)',
    borderRadius: 6, padding: '3px 10px', fontSize: 11.5,
    color: 'var(--accent-text)', fontWeight: 500,
  },
  panel: {
    width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)',
    background: 'var(--bg-surface)', padding: '14px 14px',
    overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
  },
  section: {
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', padding: '10px 12px',
  },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
  },
  legendRow:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { fontSize: 12, color: 'var(--text-secondary)', flex: 1 },
  legendCount: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  nodeCard:     { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  nodeCardIcon: { width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nodeCardLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nodeCardType:  { fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 },
  nodeCardId:    { fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 4, wordBreak: 'break-all' },
  relList: { display: 'flex', flexDirection: 'column', gap: 4 },
  relRow:  { display: 'flex', alignItems: 'center', gap: 5 },
  relDir:  { fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0, width: 12 },
  relType: { fontSize: 10, fontWeight: 600, color: 'var(--accent-text)', fontFamily: 'var(--font-mono)', flexShrink: 0, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' },
  relTarget: { fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', marginTop: 'auto', paddingTop: 4 },
};