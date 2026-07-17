/**
 * v0.7.2 (P1 #4): extracted from `WorkflowEditor.tsx`.
 *
 * These are pure functions — no React, no hooks, no
 * i18n. They belong in their own file because (a) the
 * editor file is large enough, (b) they have a separate
 * test file (`web/tests/workflow-layout.test.ts`) that
 * previously had to import them from the editor file
 * (a code-smell: tests shouldn't depend on a JSX
 * module), and (c) they're the most likely candidate
 * to be reused if we add more layout strategies in the
 * future (orthogonal routing, dagre, etc.).
 *
 * Behavior is identical to the v0.7.0/v0.7.1/v0.7.1.1
 * inline versions — every existing test passes
 * unchanged after the move.
 */

import type { Workflow, WorkflowNode } from "@/lib/types";

interface Positioned {
  id: string;
  col: number;
  depth: number;
}

interface Layout {
  positions: Record<string, Positioned>;
  cols: number;
  depth: number;
}

/**
 * Truncate a string for display (used by the SVG preview's
 * node labels). The preview clamps text to a fixed
 * pixel width and would overflow the card without this.
 */
export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/**
 * v0.7.0: BFS from the source-most nodes. Each "level"
 * (no incoming edge from the same level or earlier) gets
 * its own column. The resulting (col, depth) is what the
 * SVG preview places the node at. v0.7.0 calls this
 * function on render for the preview; the same function
 * is reused by the "Auto-layout" button to write back
 * to `node.position` so the data is consistent across
 * page reloads.
 */
export function computeLayout(workflow: Workflow): Layout {
  const nodes = workflow.nodes;
  const edges = workflow.edges;
  if (nodes.length === 0) return { positions: {}, cols: 0, depth: 0 };

  // Build indegree + adjacency.
  const inDeg: Record<string, number> = {};
  const outAdj: Record<string, string[]> = {};
  for (const n of nodes) {
    inDeg[n.id] = 0;
    outAdj[n.id] = [];
  }
  for (const e of edges) {
    inDeg[e.to] = (inDeg[e.to] ?? 0) + 1;
    const out = outAdj[e.from];
    if (out) out.push(e.to);
  }

  // Sources: nodes with no incoming edge. If the graph has a
  // cycle, every node has at least one incoming edge, so we
  // pick the alphabetically-first node as a "seed" to break
  // the cycle. v0.7.1+ may surface the cycle visually.
  const sources = nodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  if (sources.length === 0) {
    sources.push(nodes.map((n) => n.id).sort()[0]!);
  }

  // BFS layering: each step's depth = max(depth of predecessors) + 1.
  const depth: Record<string, number> = {};
  const queue: Array<{ id: string; d: number }> = sources.map((s) => ({
    id: s,
    d: 0,
  }));
  // Track visited so cycles don't infinite-loop. v0.7.0 cycles
  // are a known limitation: the cycle stays at the depth of
  // the first visit. Same as any topological-sort on a cycle.
  const visited = new Set<string>();
  let maxDepth = 0;
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depth[id] = d;
    if (d > maxDepth) maxDepth = d;
    for (const next of outAdj[id] ?? []) {
      if (!visited.has(next)) {
        queue.push({ id: next, d: d + 1 });
      }
    }
  }
  // Any unvisited (cycle tail) lands at the maximum depth.
  for (const n of nodes) {
    if (!(n.id in depth)) depth[n.id] = maxDepth;
  }

  // Within each depth, group nodes into columns. The number
  // of columns is the widest row.
  const byDepth: Record<number, string[]> = {};
  for (const n of nodes) {
    const d = depth[n.id]!;
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(n.id);
  }
  const positions: Record<string, Positioned> = {};
  let cols = 0;
  for (const d of Object.keys(byDepth).map(Number)) {
    const row = byDepth[d]!;
    row.forEach((id, i) => {
      positions[id] = { id, col: i, depth: d };
    });
    if (row.length > cols) cols = row.length;
  }

  return { positions, cols: Math.max(1, cols), depth: maxDepth + 1 };
}

/**
 * v0.7.0: write back the auto-computed layout to each
 * node's `position` field. The SVG preview's coordinates
 * are derived from this field, so this is also what makes
 * the preview stable across reloads. We round to ints so
 * the JSON is human-readable; the SVG doesn't care about
 * sub-pixel precision at this scale.
 */
export function autoLayout(workflow: Workflow): WorkflowNode[] {
  const layout = computeLayout(workflow);
  return workflow.nodes.map((n) => {
    const pos = layout.positions[n.id];
    if (!pos) return n;
    return { ...n, position: { x: pos.col * 240, y: pos.depth * 80 } };
  });
}
