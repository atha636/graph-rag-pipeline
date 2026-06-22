import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, RefreshCw, Loader2, Info, ZoomIn, ZoomOut } from 'lucide-react';
import { getGraphDataAPI } from '../services/api';
import type { GraphData, GraphNode, GraphRelationship } from '../types';

const NODE_COLORS: Record<string, string> = {
  Person:       '#10b981',
  Organization: '#6366f1',
  Product:      '#f59e0b',
  Location:     '#06b6d4',
  Technology:   '#8b5cf6',
  Event:        '#ec4899',
  default:      '#64748b',
};

export const GraphView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);

  // Node positions (calculated)
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const animFrameRef = useRef<number>(0);

  const loadGraph = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGraphDataAPI();
      setGraphData(data);
    } catch {
      setError('Could not load graph. Make sure your backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGraph(); }, []);

  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const { nodes, relationships } = graphData;

    if (nodes.length === 0) return;

    // Layout: circular + random spread
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.35;

    positionsRef.current.clear();
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positionsRef.current.set(n.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate((W * (1 - zoom)) / (2 * zoom), (H * (1 - zoom)) / (2 * zoom));

      // Draw edges
      relationships.forEach((rel: GraphRelationship) => {
        const src = positionsRef.current.get(rel.source);
        const tgt = positionsRef.current.get(rel.target);
        if (!src || !tgt) return;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = 'rgba(100,116,139,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = 'rgba(100,116,139,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(rel.type, mx, my - 4);
      });

      // Draw nodes
      nodes.forEach((node: GraphNode) => {
        const pos = positionsRef.current.get(node.id);
        if (!pos) return;

        const color = NODE_COLORS[node.type] ?? NODE_COLORS.default;
        const isSelected = selectedNode?.id === node.id;
        const r = isSelected ? 18 : 14;

        // Glow
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = color + '22';
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Label
        ctx.font = `${isSelected ? 600 : 400} 11px Inter, sans-serif`;
        ctx.fillStyle = isSelected ? '#f1f5f9' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, pos.x, pos.y + r + 14);
      });

      ctx.restore();
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [graphData, selectedNode, zoom]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graphData || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / zoom;
    const my = (e.clientY - rect.top) / zoom;

    for (const node of graphData.nodes) {
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;
      const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
      if (dist <= 18) {
        setSelectedNode(node.id === selectedNode?.id ? null : node);
        return;
      }
    }
    setSelectedNode(null);
  };

  const nodeTypeCounts = graphData?.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}><GitBranch size={15} color="var(--accent)" /></div>
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
          <button style={styles.actionBtn} onClick={() => setZoom(z => Math.min(z + 0.2, 2))}><ZoomIn size={14} /></button>
          <button style={styles.actionBtn} onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}><ZoomOut size={14} /></button>
          <button style={styles.actionBtn} onClick={loadGraph}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Canvas */}
        <div style={styles.canvasWrap}>
          {loading && (
            <div style={styles.loader}>
              <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={styles.loaderText}>Loading graph from Neo4j…</p>
            </div>
          )}
          {error && (
            <div style={styles.errorBox}>
              <Info size={18} color="var(--error)" />
              <p style={styles.errorText}>{error}</p>
            </div>
          )}
          {!loading && !error && graphData && graphData.nodes.length === 0 && (
            <div style={styles.empty}>
              <GitBranch size={36} color="var(--text-muted)" />
              <p style={styles.emptyTitle}>No graph data yet</p>
              <p style={styles.emptySub}>Upload documents to build your knowledge graph.</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={800}
            height={520}
            style={{ ...styles.canvas, display: graphData && graphData.nodes.length > 0 ? 'block' : 'none' }}
            onClick={handleCanvasClick}
          />
        </div>

        {/* Legend + info */}
        <div style={styles.sidebar}>
          {/* Legend */}
          <div style={styles.panel}>
            <p style={styles.panelTitle}>Node Types</p>
            {Object.entries(NODE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
              <div key={type} style={styles.legendRow}>
                <span style={{ ...styles.legendDot, background: color }} />
                <span style={styles.legendLabel}>{type}</span>
                <span style={styles.legendCount}>{nodeTypeCounts[type] ?? 0}</span>
              </div>
            ))}
          </div>

          {/* Selected node */}
          {selectedNode && (
            <div style={styles.panel}>
              <p style={styles.panelTitle}>Selected Node</p>
              <div style={styles.nodeDetail}>
                <div style={{
                  ...styles.nodeDetailIcon,
                  background: (NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default) + '22',
                  border: `1px solid ${NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default}44`,
                }}>
                  <GitBranch size={14} color={NODE_COLORS[selectedNode.type] ?? NODE_COLORS.default} />
                </div>
                <div>
                  <p style={styles.nodeLabel}>{selectedNode.label}</p>
                  <p style={styles.nodeType}>{selectedNode.type}</p>
                </div>
              </div>
              <p style={styles.nodeId}>ID: {selectedNode.id}</p>

              {/* Relationships of this node */}
              {graphData && (
                <div style={styles.nodeRels}>
                  {graphData.relationships
                    .filter(r => r.source === selectedNode.id || r.target === selectedNode.id)
                    .slice(0, 5)
                    .map((r, i) => {
                      const other = r.source === selectedNode.id
                        ? graphData.nodes.find(n => n.id === r.target)
                        : graphData.nodes.find(n => n.id === r.source);
                      return (
                        <div key={i} style={styles.relRow}>
                          <span style={styles.relType}>{r.type}</span>
                          <span style={styles.relTarget}>{other?.label ?? r.target}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Zoom hint */}
          <p style={styles.hint}>Click a node to inspect it</p>
        </div>
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
  headerActions: { display: 'flex', gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--text-secondary)',
  },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvasWrap: {
    flex: 1, position: 'relative', display: 'flex',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    background: 'var(--bg-base)',
  },
  canvas: { width: '100%', height: '100%', cursor: 'pointer', objectFit: 'contain' },
  loader: { position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  loaderText: { fontSize: 13, color: 'var(--text-muted)' },
  errorBox: {
    position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, padding: 20, background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  },
  errorText: { fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 300 },
  empty: { position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' },
  emptySub: { fontSize: 13, color: 'var(--text-muted)' },
  sidebar: {
    width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)',
    background: 'var(--bg-surface)', padding: 16, overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  panel: {
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', padding: '12px 14px',
  },
  panelTitle: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' },
  legendRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { fontSize: 12, color: 'var(--text-secondary)', flex: 1 },
  legendCount: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  nodeDetail: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  nodeDetailIcon: { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nodeLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  nodeType: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  nodeId: { fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8 },
  nodeRels: { borderTop: '1px solid var(--border-subtle)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 },
  relRow: { display: 'flex', gap: 8, alignItems: 'center' },
  relType: { fontSize: 10, fontWeight: 600, color: 'var(--accent-text)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  relTarget: { fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', paddingTop: 4 },
};
