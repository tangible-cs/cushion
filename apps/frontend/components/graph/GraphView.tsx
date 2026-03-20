
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import type { LinkIndex, GraphNode, GraphEdge } from '@/lib/link-index';
import { cn } from '@/lib/utils';

interface GraphViewProps {
  /** Link index containing nodes and edges */
  linkIndex: LinkIndex | null;
  /** Currently selected file */
  currentFile: string | null;
  /** Callback when a node is clicked */
  onNodeClick: (filePath: string) => void;
  /** Callback to close the graph view */
  onClose?: () => void;
}

/** Extended node with position and layout info */
interface PlacedNode {
  id: string;
  label: string;
  exists: boolean;
  incomingCount: number;
  outgoingCount: number;
  // Position
  x: number;
  y: number;
  width: number;
  height: number;
  // Layout info
  depth: number;
  effectiveHeight: number;
  verticalClaim: PlacedNode | null;
  descendants: Set<PlacedNode>;
}

/** Edge with calculated path */
interface PlacedEdge {
  source: string;
  target: string;
  path: string;
}

/**
 * Calculate Bezier curve path between two nodes (like Tangent's MapConnectionView).
 */
function calculateEdgePath(from: PlacedNode, to: PlacedNode): string {
  const fromX = from.x + from.width;
  const fromY = from.y + from.height * 0.5;
  const toX = to.x;
  const toY = to.y + to.height * 0.5;

  const halfX = (toX - fromX) * 0.5;
  const halfY = (toY - fromY) * 0.5;
  const curveX = Math.max(halfX * 0.66, 20);

  // Cubic bezier: start -> control1 -> control2 -> end
  const c1x = fromX + curveX;
  const c1y = fromY;
  const midX = fromX + Math.min(halfX, curveX);
  const midY = fromY + halfY;
  const c2x = midX + (toX - midX) * 0.33;
  const c2y = toY;

  return `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX} ${toY}`;
}

/**
 * Traverse node and all its descendants.
 */
function traverse(node: PlacedNode, set: Set<PlacedNode>, nodeMap: Map<string, PlacedNode>, edges: GraphEdge[]) {
  set.add(node);
  for (const edge of edges) {
    if (edge.source === node.id) {
      const child = nodeMap.get(edge.target);
      if (child && !set.has(child)) {
        traverse(child, set, nodeMap, edges);
      }
    }
  }
}

/**
 * Get outgoing edges for a node.
 */
function getOutgoing(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter(e => e.source === nodeId).map(e => e.target);
}

/**
 * Get incoming edges for a node.
 */
function getIncoming(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter(e => e.target === nodeId).map(e => e.source);
}

/**
 * Place nodes in a hierarchical tree layout (like Tangent's placeMapNodes).
 */
function placeNodes(
  graphNodes: GraphNode[],
  edges: GraphEdge[],
  nodeWidths: Map<string, number>,
  nodeHeights: Map<string, number>
): { nodes: PlacedNode[]; edges: PlacedEdge[] } {
  const horizontalSpacing = 60;
  const verticalSpacing = 24;
  const defaultWidth = 140;
  const defaultHeight = 32;

  // Create placed nodes
  const nodeMap = new Map<string, PlacedNode>();
  const nodes: PlacedNode[] = graphNodes.map(node => {
    const placed: PlacedNode = {
      ...node,
      x: 0,
      y: 0,
      width: nodeWidths.get(node.id) || defaultWidth,
      height: nodeHeights.get(node.id) || defaultHeight,
      depth: 0,
      effectiveHeight: 0,
      verticalClaim: null,
      descendants: new Set(),
    };
    nodeMap.set(node.id, placed);
    return placed;
  });

  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Find roots (nodes with no incoming edges)
  let roots = nodes.filter(n => getIncoming(n.id, edges).length === 0);

  // Ensure all nodes are reachable from roots
  const allNodes = new Set<PlacedNode>();
  for (const root of roots) {
    traverse(root, allNodes, nodeMap, edges);
  }

  // Add unreachable nodes as additional roots
  while (allNodes.size < nodes.length) {
    const nextNode = nodes.find(n => !allNodes.has(n));
    if (nextNode) {
      roots.push(nextNode);
      traverse(nextNode, allNodes, nodeMap, edges);
    }
  }

  // Sort roots by connection count (more connected first)
  roots.sort((a, b) => {
    const connA = a.incomingCount + a.outgoingCount;
    const connB = b.incomingCount + b.outgoingCount;
    return connB - connA;
  });

  // Reset position details
  for (const node of nodes) {
    node.depth = 0;
    node.effectiveHeight = 0;
    node.verticalClaim = null;
    node.descendants = new Set();
  }

  // Breadth-first pass to make vertical claims
  const waiting = [...roots];
  for (let i = 0; i < waiting.length; i++) {
    const parent = waiting[i];
    for (const childId of getOutgoing(parent.id, edges)) {
      const child = nodeMap.get(childId);
      if (child && child.verticalClaim === null) {
        child.verticalClaim = parent;
        waiting.push(child);
      }
    }
  }

  // Depth pass to calculate effective heights (with cycle detection)
  const depthVisited = new Set<string>();
  
  function depthPass(parent: PlacedNode, stack: PlacedNode[]) {
    // Prevent infinite recursion from cycles
    if (depthVisited.has(parent.id)) return;
    depthVisited.add(parent.id);
    
    parent.depth = stack.length;
    let height = 0;
    let involvedNodes = 0;

    for (const childId of getOutgoing(parent.id, edges)) {
      const child = nodeMap.get(childId);
      if (child && !stack.includes(child) && !child.descendants.has(parent) && !depthVisited.has(child.id)) {
        for (const superParent of stack) {
          superParent.descendants.add(child);
        }
        parent.descendants.add(child);
        depthPass(child, [...stack, parent]);
      }

      if (child && child.verticalClaim === parent) {
        involvedNodes++;
        height += child.effectiveHeight;
      }
    }

    height += Math.max(0, involvedNodes - 1) * verticalSpacing;
    parent.effectiveHeight = Math.max(height, parent.height);
  }

  // Position children (with visited set to prevent cycles)
  const placedSet = new Set<string>();
  
  function placeChildren(parent: PlacedNode, groupY: number, nextX: number) {
    // Prevent infinite recursion from cycles
    if (placedSet.has(parent.id)) return;
    placedSet.add(parent.id);
    
    const x = nextX + parent.width + horizontalSpacing;
    let y = groupY;

    for (const childId of getOutgoing(parent.id, edges)) {
      const child = nodeMap.get(childId);
      if (!child) continue;

      if (child.verticalClaim === parent) {
        child.y = y + (child.effectiveHeight / 2) - (child.height / 2);
        y += verticalSpacing + child.effectiveHeight;
      }

      if (parent.descendants.has(child) && !placedSet.has(child.id)) {
        child.x = Math.max(x, child.x);
        placeChildren(child, child.y - (child.effectiveHeight / 2) + (child.height / 2), child.x);
      }
    }
  }

  // Position roots and their children
  let currentY = verticalSpacing;
  for (const root of roots) {
    depthPass(root, []);
    root.x = horizontalSpacing;
    root.y = currentY + (root.effectiveHeight / 2) - (root.height / 2);
    placedSet.clear(); // Clear for each root tree
    placeChildren(root, currentY, horizontalSpacing);
    currentY += root.effectiveHeight + verticalSpacing;
  }

  // Calculate edge paths
  const placedEdges: PlacedEdge[] = edges
    .map(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return null;
      return {
        source: edge.source,
        target: edge.target,
        path: calculateEdgePath(source, target),
      };
    })
    .filter((e): e is PlacedEdge => e !== null);

  return { nodes, edges: placedEdges };
}

export function GraphView({ linkIndex, currentFile, onNodeClick, onClose }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [nodeWidths, setNodeWidths] = useState<Map<string, number>>(new Map());
  const [nodeHeights, setNodeHeights] = useState<Map<string, number>>(new Map());
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Measure node sizes after first render
  useEffect(() => {
    if (!linkIndex) return;
    
    const newWidths = new Map<string, number>();
    const newHeights = new Map<string, number>();
    
    nodeRefs.current.forEach((el, id) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        newWidths.set(id, rect.width / zoom);
        newHeights.set(id, rect.height / zoom);
      }
    });
    
    if (newWidths.size > 0) {
      setNodeWidths(newWidths);
      setNodeHeights(newHeights);
    }
  }, [linkIndex, zoom]);

  // Calculate layout
  const { placedNodes, placedEdges, contentSize } = useMemo(() => {
    if (!linkIndex || linkIndex.nodes.length === 0) {
      return { placedNodes: [], placedEdges: [], contentSize: { width: 0, height: 0 } };
    }

    const { nodes, edges } = placeNodes(
      linkIndex.nodes,
      linkIndex.edges,
      nodeWidths,
      nodeHeights
    );

    // Calculate content bounds
    let maxX = 0;
    let maxY = 0;
    for (const node of nodes) {
      maxX = Math.max(maxX, node.x + node.width + 60);
      maxY = Math.max(maxY, node.y + node.height + 60);
    }

    return {
      placedNodes: nodes,
      placedEdges: edges,
      contentSize: { width: maxX, height: maxY },
    };
  }, [linkIndex, nodeWidths, nodeHeights]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('.graph-node')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.3));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  // Register node ref
  const setNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      nodeRefs.current.set(id, el);
    } else {
      nodeRefs.current.delete(id);
    }
  }, []);

  if (!linkIndex || linkIndex.nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-foreground-muted bg-surface">
        <div className="text-center p-8">
          <Maximize2 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">No connections yet</p>
          <p className="text-sm opacity-70">
            Create links between notes using [[wiki-links]]<br />
            to see your knowledge graph
          </p>
        </div>
      </div>
    );
  }

  // Check if a node is connected to the hovered node
  const isConnectedToHovered = (nodeId: string) => {
    if (!hoveredNode) return false;
    return placedEdges.some(
      e => (e.source === hoveredNode && e.target === nodeId) ||
           (e.target === hoveredNode && e.source === nodeId)
    );
  };

  // Check if an edge is connected to hovered or current node
  const isEdgeHighlighted = (edge: PlacedEdge) => {
    return hoveredNode === edge.source || 
           hoveredNode === edge.target ||
           currentFile === edge.source ||
           currentFile === edge.target;
  };

  return (
    <div 
      ref={containerRef}
      className="h-full w-full relative bg-surface overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={handleReset}
          className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Reset view"
        >
          <Maximize2 size={18} />
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-tertiary text-foreground-muted hover:text-foreground transition-colors"
            title="Close graph"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="absolute bottom-4 left-4 z-20 text-xs text-graph-node-unresolved">
        {linkIndex.nodes.length} notes · {linkIndex.edges.length} connections
      </div>

      {/* Content container (panned and zoomed) */}
      <div
        ref={contentRef}
        className="absolute"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: contentSize.width,
          height: contentSize.height,
        }}
      >
        {/* SVG Edges (behind nodes) */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: contentSize.width, height: contentSize.height }}
        >
          {placedEdges.map((edge, i) => {
            const highlighted = isEdgeHighlighted(edge);
            return (
              <path
                key={i}
                d={edge.path}
                fill="none"
                stroke={highlighted ? 'var(--graph-node-focused)' : 'var(--graph-line)'}
                strokeWidth={highlighted ? 3 : 2}
                strokeOpacity={highlighted ? 1 : 0.6}
                className="transition-all duration-200"
              />
            );
          })}
        </svg>

        {/* HTML Nodes */}
        {placedNodes.map(node => {
          const isCurrent = currentFile === node.id;
          const isHovered = hoveredNode === node.id;
          const isConnected = isConnectedToHovered(node.id);

          return (
            <div
              key={node.id}
              ref={(el) => setNodeRef(node.id, el)}
              className={cn(
                "graph-node absolute cursor-pointer select-none",
                "px-3 py-1.5 rounded-md border-2",
                "text-sm font-medium leading-tight",
                "max-w-[200px] truncate",
                "transition-all duration-200",
                isCurrent && "bg-graph-node-focused text-[var(--background-primary-alt)] border-graph-node-focused",
                !isCurrent && isHovered && "bg-surface-tertiary border-graph-node-focused text-graph-text",
                !isCurrent && !isHovered && isConnected && "bg-surface-elevated border-[var(--accent-primary-12)] text-graph-text",
                !isCurrent && !isHovered && !isConnected && node.exists && "bg-surface-elevated border-surface-elevated text-graph-node",
                !isCurrent && !isHovered && !isConnected && !node.exists && "bg-surface border-dashed border-accent-red text-graph-node-unresolved",
                !isCurrent && !isHovered && !isConnected && "opacity-80 hover:opacity-100"
              )}
              style={{
                transform: `translate(${node.x}px, ${node.y}px)`,
                zIndex: 1 + node.depth,
              }}
              onClick={() => onNodeClick(node.id)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {node.label}
            </div>
          );
        })}
      </div>

      {/* Tooltip for hovered node */}
      {hoveredNode && (() => {
        const node = placedNodes.find(n => n.id === hoveredNode);
        if (!node) return null;
        return (
          <div className="absolute top-4 left-4 z-20 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
            <div className="font-medium">{node.label}</div>
            <div className="text-xs text-foreground-muted mt-1">
              {node.incomingCount || 0} incoming · {node.outgoingCount || 0} outgoing
            </div>
          </div>
        );
      })()}
    </div>
  );
}
