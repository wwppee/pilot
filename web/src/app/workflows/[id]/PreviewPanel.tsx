"use client";

/**
 * v0.8.9: <PreviewPanel> extracted from WorkflowEditor.tsx
 * (v0.7.2 backlog closed). The right side of the editor:
 * an SVG that lays out the workflow's nodes by BFS depth
 * and renders the edges as curves. v0.7.4 added drag-
 * and-drop on top of the SVG; v0.8.9 just moves the
 * existing surface into its own file.
 *
 * The panel is a pure view + a single mutation
 * callback: `onNodeMove(nodeId, position)`. The editor
 * owns the workflow state and applies the position
 * patch. This keeps the panel testable in isolation
 * (a test can pass a mock `onNodeMove` and assert the
 * SVG renders the right number of nodes / edges)
 * and keeps the drag-to-position math encapsulated
 * (client → viewBox coordinate conversion via
 * `getScreenCTM` + `createSVGPoint` is non-trivial).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { computeLayout, truncate } from "./layout";
import type { Workflow } from "@/lib/types";

export interface PreviewPanelProps {
  workflow: Workflow;
  t: (k: string, p?: Record<string, unknown>) => string;
  /**
   * v0.7.4: drag-and-drop callback. The preview is a
   * pure view component; it doesn't own the workflow
   * state. When the user drops a node, we report the
   * new (x, y) up so the editor can mutate + mark
   * dirty.
   */
  onNodeMove: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
}

export function PreviewPanel({ workflow, t, onNodeMove }: PreviewPanelProps) {
  // BFS from the source-most nodes (no incoming edge)
  // and lay out top-to-bottom by depth. The output is
  // the same data the SVG renders; we memoize so re-
  // renders that don't change the topology skip the
  // layout work.
  const layout = useMemo(() => computeLayout(workflow), [workflow]);

  // v0.7.4: drag state. `dragging` holds the node id
  // being dragged plus the offset between the mouse
  // and the node's top-left corner (so a click in the
  // middle of a node doesn't jump the corner to the
  // cursor). `svgRef` is used to convert client
  // coordinates to SVG viewBox coordinates via the
  // CTM (current transformation matrix).
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // v0.7.4: pointer move + up are bound at the document
  // level (not the SVG level) so the drag continues even
  // when the cursor leaves the SVG bounds. The handlers
  // do nothing when `dragging` is null so the global
  // listeners are inert in the common case.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!svgRef.current) return;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      // Convert screen coords to SVG viewBox coords.
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const newX = Math.max(0, Math.round(local.x - dragging.offsetX));
      const newY = Math.max(0, Math.round(local.y - dragging.offsetY));
      onNodeMove(dragging.nodeId, { x: newX, y: newY });
    };
    const onUp = () => setDragging(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [dragging, onNodeMove]);

  if (workflow.nodes.length === 0) {
    return (
      <aside
        className="workflow-preview surface rounded-lg p-6 text-sm text-center text-[var(--text-muted)]"
        data-testid="workflow-preview"
      >
        <p>{t("workflows.editor.preview")}</p>
        <p className="text-xs mt-2">{t("workflows.editor.noNodes")}</p>
      </aside>
    );
  }

  const nodeWidth = 200;
  const nodeHeight = 56;
  const colWidth = 240;
  const rowHeight = 80;

  return (
    <aside
      className="workflow-preview surface rounded-lg p-4 overflow-auto"
      data-testid="workflow-preview"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
        {t("workflows.editor.preview")}
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {t("workflows.editor.layoutHint")}
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.cols * colWidth} ${Math.max(1, layout.depth) * rowHeight}`}
        width="100%"
        style={{ minHeight: "320px" }}
        role="img"
        aria-label={t("workflows.editor.preview")}
      >
        {/* Edges first so they sit under the nodes. */}
        {workflow.edges.map((e) => {
          const from = layout.positions[e.from];
          const to = layout.positions[e.to];
          if (!from || !to) return null;
          const x1 = from.col * colWidth + nodeWidth;
          const y1 = from.depth * rowHeight + nodeHeight / 2;
          const x2 = to.col * colWidth;
          const y2 = to.depth * rowHeight + nodeHeight / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke="var(--accent)"
              strokeWidth={1.5}
              fill="none"
              opacity={0.7}
              data-edge-from={e.from}
              data-edge-to={e.to}
            />
          );
        })}
        {workflow.nodes.map((n) => {
          const pos = layout.positions[n.id];
          if (!pos) return null;
          const isDragging = dragging?.nodeId === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${pos.col * colWidth}, ${pos.depth * rowHeight})`}
              data-node-id={n.id}
              data-testid={`workflow-preview-node-${n.id}`}
              style={{
                cursor: isDragging ? "grabbing" : "grab",
                opacity: isDragging ? 0.8 : 1,
              }}
              onPointerDown={(e) => {
                // v0.7.4: start a drag. The offset is the
                // distance from the cursor to the node's
                // top-left corner so the node doesn't jump
                // on the first move. SVG createSVGPoint +
                // matrixTransform is the standard way to
                // convert client coords to viewBox coords.
                if (!svgRef.current) return;
                e.preventDefault();
                const ctm = svgRef.current.getScreenCTM();
                if (!ctm) return;
                const pt = svgRef.current.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const local = pt.matrixTransform(ctm.inverse());
                setDragging({
                  nodeId: n.id,
                  offsetX: local.x - pos.col * colWidth,
                  offsetY: local.y - pos.depth * rowHeight,
                });
              }}
            >
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={1.5}
              />
              <text
                x={10}
                y={20}
                fontSize={12}
                fontWeight={600}
                fill="var(--text)"
              >
                {truncate(n.name, 22)}
              </text>
              <text
                x={10}
                y={38}
                fontSize={10}
                fill="var(--text-muted)"
                fontFamily="monospace"
              >
                {n.model.provider}/{truncate(n.model.model || "—", 18)}
              </text>
              <text
                x={10}
                y={50}
                fontSize={10}
                fill="var(--text-muted)"
                fontFamily="monospace"
              >
                → {n.outputVar}
              </text>
            </g>
          );
        })}
      </svg>
    </aside>
  );
}
