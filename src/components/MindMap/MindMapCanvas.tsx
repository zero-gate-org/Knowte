import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { toPng, toSvg } from "html-to-image";
import type { MindMapData, MindMapNode } from "../../lib/types";

// ─── Node size / colour per depth ─────────────────────────────────────────────

const NODE_MAX_WIDTHS = [220, 190, 168, 148]; // max width per depth level

/** Estimate node dimensions based on label text so dagre can allocate correct space. */
function estimateNodeDims(label: string, level: number): { width: number; height: number } {
  const fontSizes = [15, 13, 12, 11];
  const lvl = Math.min(level, 3);
  const width = NODE_MAX_WIDTHS[lvl];
  const fontSize = fontSizes[lvl];
  const charWidth = fontSize * 0.58; // average character width ratio
  const lineHeight = fontSize * 1.45;
  const paddingV = 16; // top + bottom padding in px
  const charsPerLine = Math.floor((width - 24) / charWidth); // subtract horizontal padding
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  const height = Math.ceil(lines * lineHeight + paddingV);
  return { width, height };
}

const NODE_STYLES: Record<number, React.CSSProperties> = {
  0: { background: "var(--accent-primary)", border: "2px solid var(--accent-secondary)", color: "#fff", fontSize: 15, fontWeight: 700, borderRadius: 12,  boxShadow: "0 4px 20px var(--accent-glow)" },
  1: { background: "var(--color-info)", border: "2px solid var(--color-info)", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 10, boxShadow: "0 2px 12px var(--accent-glow)" },
  2: { background: "var(--color-success)", border: "2px solid var(--color-success)", color: "#fff", fontSize: 12, fontWeight: 500, borderRadius: 8,  boxShadow: "0 2px 10px var(--color-success-muted)" },
  3: { background: "var(--bg-surface-overlay)", border: "2px solid var(--border-strong)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 400, borderRadius: 8,  boxShadow: "0 1px 6px rgba(0,0,0,.25)" },
};

// ─── Custom node component ─────────────────────────────────────────────────────

type MindMapNodeData = {
  label: string;
  level: number;
  highlighted: boolean;
};

function MindMapNodeComp({ data, isConnectable }: NodeProps) {
  const d = data as MindMapNodeData;
  const level = Math.min(d.level ?? 0, 3);
  const style: React.CSSProperties = {
    ...NODE_STYLES[level],
    opacity: d.highlighted === false ? 0.35 : 1,
    transition: "opacity 0.2s, box-shadow 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 12px",
    width: "100%",
    minHeight: "100%",
    boxSizing: "border-box",
    lineHeight: 1.45,
    textAlign: "center",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    cursor: "pointer",
  };

  return (
    <>
      {level > 0 && (
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} style={{ background: "var(--border-strong)" }} />
      )}
      <div style={style}>{d.label}</div>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} style={{ background: "var(--border-strong)" }} />
    </>
  );
}

const nodeTypes: NodeTypes = { mindmap: MindMapNodeComp };

// ─── Tree → flat lists ─────────────────────────────────────────────────────────

function flattenTree(
  node: MindMapNode,
  level: number,
  nodes: Node[],
  edges: Edge[],
  parentId: string | null,
): void {
  const { width, height } = estimateNodeDims(node.label, level);
  nodes.push({
    id: node.id,
    type: "mindmap",
    data: { label: node.label, level, highlighted: true } as unknown as Record<string, unknown>,
    position: { x: 0, y: 0 },
    width,
    height,
    style: { width, minHeight: height },
  });
  if (parentId) {
    edges.push({
      id: `e-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      type: "smoothstep",
      animated: false,
      style: { stroke: "var(--border-strong)", strokeWidth: 2 },
    });
  }
  for (const child of node.children ?? []) {
    flattenTree(child, level + 1, nodes, edges, node.id);
  }
}

// ─── Dagre auto-layout ─────────────────────────────────────────────────────────

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 80, marginx: 40, marginy: 40 });

  nodes.forEach((n) => {
    const w = (n.width as number) ?? 160;
    const h = (n.height as number) ?? 48;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const w = (n.width as number) ?? 160;
    const h = (n.height as number) ?? 48;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// ─── Inner canvas (needs ReactFlowProvider context) ───────────────────────────

function InnerCanvas({ data }: { data: MindMapData }) {
  const { fitView } = useReactFlow();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const reactFlowCanvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedBranch, setSelectedBranch] = useState<Set<string> | null>(null);

  // Build a map from nodeId → all descendant ids (including self)
  const branchMap = useMemo<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    function collect(node: MindMapNode): Set<string> {
      const s = new Set<string>([node.id]);
      for (const child of node.children ?? []) {
        collect(child).forEach((id) => s.add(id));
      }
      map.set(node.id, s);
      return s;
    }
    collect(data.root);
    return map;
  }, [data]);

  // Parse tree → nodes/edges, apply layout
  useEffect(() => {
    const rawNodes: Node[] = [];
    const rawEdges: Edge[] = [];
    flattenTree(data.root, 0, rawNodes, rawEdges, null);
    const laid = layoutNodes(rawNodes, rawEdges);
    setNodes(laid);
    setEdges(rawEdges);
    // Fit after layout settles
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
  }, [data, fitView, setNodes, setEdges]);

  // Update highlight state when branch selection changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          highlighted: selectedBranch === null ? true : selectedBranch.has(n.id),
        },
      })),
    );
    setEdges((prev) =>
      prev.map((e) => ({
        ...e,
        style: {
          ...e.style,
          stroke:
            selectedBranch === null
              ? "var(--border-strong)"
              : selectedBranch.has(e.source) && selectedBranch.has(e.target)
                ? "var(--accent-primary)"
                : "var(--bg-surface-overlay)",
          opacity: selectedBranch === null ? 1 : selectedBranch.has(e.source) && selectedBranch.has(e.target) ? 1 : 0.2,
        },
      })),
    );
  }, [selectedBranch, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Clicking the selected root again clears selection
      if (selectedBranch !== null && selectedBranch.has(data.root.id) && node.id === data.root.id) {
        setSelectedBranch(null);
        return;
      }
      const branch = branchMap.get(node.id);
      if (!branch) return;
      // If clicking root with nothing selected, just deselect
      if (node.id === data.root.id && selectedBranch === null) return;
      setSelectedBranch(branch ?? null);
    },
    [branchMap, data.root.id, selectedBranch],
  );

  const onPaneClick = useCallback(() => {
    setSelectedBranch(null);
  }, []);

  // ─── Export helpers ──────────────────────────────────────────────────────

  /** Filter function that excludes UI chrome (toolbar, hint bar, controls, minimap) from exports. */
  const exportFilter = useCallback((node: HTMLElement) => {
    if (node.dataset?.exportExclude === "true") return false;
    const cls = node.classList;
    if (
      cls?.contains("react-flow__controls") ||
      cls?.contains("react-flow__minimap") ||
      cls?.contains("react-flow__panel")
    ) return false;
    return true;
  }, []);

  const downloadPng = useCallback(async () => {
    const el = reactFlowCanvasRef.current;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: "#0f172a",
        quality: 1,
        pixelRatio: 2,
        filter: exportFilter,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "mindmap.png";
      a.click();
    } catch (err) {
      console.error("PNG export failed", err);
    }
  }, [exportFilter]);

  const downloadSvg = useCallback(async () => {
    const el = reactFlowCanvasRef.current;
    if (!el) return;
    try {
      const svgUrl = await toSvg(el, {
        backgroundColor: "#0f172a",
        filter: exportFilter,
      });
      const a = document.createElement("a");
      a.href = svgUrl;
      a.download = "mindmap.svg";
      a.click();
    } catch (err) {
      console.error("SVG export failed", err);
    }
  }, [exportFilter]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 400 });
  }, [fitView]);

  return (
    <div className="relative w-full h-full" ref={reactFlowWrapperRef}>
      <div className="w-full h-full" ref={reactFlowCanvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--bg-base)" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border-default)" />
        <MiniMap
          nodeColor={(n) => {
            const level = Math.min(((n.data as MindMapNodeData).level ?? 0) as number, 3);
            const colors = getComputedStyle(document.documentElement);
            return [
              colors.getPropertyValue('--accent-primary').trim() || '#4f46e5',
              colors.getPropertyValue('--color-info').trim() || '#1d4ed8',
              colors.getPropertyValue('--color-success').trim() || '#047857',
              colors.getPropertyValue('--bg-surface-overlay').trim() || '#334155',
            ][level];
          }}
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          maskColor="rgba(15,23,42,0.7)"
        />
        <Controls
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8 }}
          showInteractive={false}
        />
      </ReactFlow>
      </div>

      {/* Toolbar — excluded from image export */}
      <div className="absolute top-3 right-3 flex gap-2 z-10" data-export-exclude="true">
        <button
          type="button"
          onClick={handleFitView}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] text-[var(--text-secondary)] rounded-lg border border-[var(--border-strong)] transition-colors"
          title="Fit the full map in view"
        >
          Fit View
        </button>
        <button
          type="button"
          data-hotkey-export="true"
          onClick={downloadPng}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] text-[var(--text-secondary)] rounded-lg border border-[var(--border-strong)] transition-colors"
          title="Download as PNG"
        >
          ↓ PNG
        </button>
        <button
          type="button"
          onClick={downloadSvg}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] text-[var(--text-secondary)] rounded-lg border border-[var(--border-strong)] transition-colors"
          title="Download as SVG"
        >
          ↓ SVG
        </button>
        {selectedBranch !== null && (
          <button
            type="button"
            onClick={() => setSelectedBranch(null)}
            className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)] text-white rounded-lg border border-[var(--accent-primary)] transition-colors"
          >
            Clear Selection
          </button>
        )}
      </div>

      {selectedBranch !== null && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)]/80 px-3 py-1.5 rounded-full" data-export-exclude="true">
          Click a node to highlight its branch · Click background to clear
        </p>
      )}
    </div>
  );
}

// ─── Public export (wraps with Provider) ──────────────────────────────────────

export interface MindMapCanvasProps {
  data: MindMapData;
}

export default function MindMapCanvas({ data }: MindMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas data={data} />
    </ReactFlowProvider>
  );
}
