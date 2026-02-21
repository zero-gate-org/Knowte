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

const NODE_DIMS = [
  { width: 200, height: 64 },  // root (level 0)
  { width: 172, height: 52 },  // level 1
  { width: 148, height: 44 },  // level 2
  { width: 128, height: 40 },  // level 3+
];

const NODE_STYLES: Record<number, React.CSSProperties> = {
  0: { background: "#4f46e5", border: "2px solid #818cf8", color: "#fff", fontSize: 15, fontWeight: 700, borderRadius: 12,  boxShadow: "0 4px 20px rgba(99,102,241,.45)" },
  1: { background: "#1d4ed8", border: "2px solid #60a5fa", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 10, boxShadow: "0 2px 12px rgba(37,99,235,.35)" },
  2: { background: "#047857", border: "2px solid #34d399", color: "#fff", fontSize: 12, fontWeight: 500, borderRadius: 8,  boxShadow: "0 2px 10px rgba(5,150,105,.30)" },
  3: { background: "#334155", border: "2px solid #64748b", color: "#cbd5e1", fontSize: 11, fontWeight: 400, borderRadius: 8,  boxShadow: "0 1px 6px rgba(0,0,0,.25)" },
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
    padding: "4px 12px",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    lineHeight: 1.3,
    textAlign: "center",
    wordBreak: "break-word",
    cursor: "pointer",
  };

  return (
    <>
      {level > 0 && (
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} style={{ background: "#475569" }} />
      )}
      <div style={style}>{d.label}</div>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} style={{ background: "#475569" }} />
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
  const dimIdx = Math.min(level, NODE_DIMS.length - 1);
  nodes.push({
    id: node.id,
    type: "mindmap",
    data: { label: node.label, level, highlighted: true } as unknown as Record<string, unknown>,
    position: { x: 0, y: 0 },
    width: NODE_DIMS[dimIdx].width,
    height: NODE_DIMS[dimIdx].height,
    style: { width: NODE_DIMS[dimIdx].width, height: NODE_DIMS[dimIdx].height },
  });
  if (parentId) {
    edges.push({
      id: `e-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#475569", strokeWidth: 2 },
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
              ? "#475569"
              : selectedBranch.has(e.source) && selectedBranch.has(e.target)
                ? "#818cf8"
                : "#334155",
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

  const downloadPng = useCallback(async () => {
    const el = reactFlowWrapperRef.current;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: "#0f172a",
        quality: 1,
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "mindmap.png";
      a.click();
    } catch (err) {
      console.error("PNG export failed", err);
    }
  }, []);

  const downloadSvg = useCallback(async () => {
    const el = reactFlowWrapperRef.current;
    if (!el) return;
    try {
      const svgUrl = await toSvg(el, { backgroundColor: "#0f172a" });
      const a = document.createElement("a");
      a.href = svgUrl;
      a.download = "mindmap.svg";
      a.click();
    } catch (err) {
      console.error("SVG export failed", err);
    }
  }, []);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 400 });
  }, [fitView]);

  return (
    <div className="relative w-full h-full" ref={reactFlowWrapperRef}>
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
        style={{ background: "#0f172a" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <MiniMap
          nodeColor={(n) => {
            const level = Math.min(((n.data as MindMapNodeData).level ?? 0) as number, 3);
            return ["#4f46e5", "#1d4ed8", "#047857", "#334155"][level];
          }}
          style={{ background: "#1e293b", border: "1px solid #334155" }}
          maskColor="rgba(15,23,42,0.7)"
        />
        <Controls
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          showInteractive={false}
        />
      </ReactFlow>

      {/* Toolbar */}
      <div className="absolute top-3 right-3 flex gap-2 z-10">
        <button
          onClick={handleFitView}
          className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 transition-colors"
          title="Fit the full map in view"
        >
          Fit View
        </button>
        <button
          onClick={downloadPng}
          className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 transition-colors"
          title="Download as PNG"
        >
          ↓ PNG
        </button>
        <button
          onClick={downloadSvg}
          className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 transition-colors"
          title="Download as SVG"
        >
          ↓ SVG
        </button>
        {selectedBranch !== null && (
          <button
            onClick={() => setSelectedBranch(null)}
            className="px-3 py-1.5 text-xs font-medium bg-violet-700 hover:bg-violet-600 text-white rounded-lg border border-violet-500 transition-colors"
          >
            Clear Selection
          </button>
        )}
      </div>

      {selectedBranch !== null && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full">
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
