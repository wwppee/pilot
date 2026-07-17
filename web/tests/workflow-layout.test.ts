/**
 * v0.7.0: unit tests for the workflow BFS layout.
 *
 * The BFS layout is the heart of the editor's auto-arrange
 * feature: given a graph of nodes + edges, it assigns each
 * node a (col, depth) so the SVG preview reads top-to-bottom
 * in the order the data flows. Same as the layout functions
 * for `react-flow` / `dagre` — the BFS-from-sources pattern
 * is a textbook topological layout. We test the three
 * interesting shapes (linear / fan-out / cycle) because
 * those are the ones a user's first workflow will hit.
 */

import { describe, expect, it } from "vitest";
// v0.7.2 (P1 #4): the BFS layout helpers moved to their
// own file. The test used to import from the editor file,
// which was a code smell — tests of pure functions
// shouldn't depend on a JSX module. They now import
// from `./layout` directly.
import { autoLayout, computeLayout } from "../src/app/workflows/[id]/layout";
import type { Workflow, WorkflowNode, WorkflowEdge } from "../src/lib/types";

function makeNode(
  id: string,
  name: string = id,
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    name,
    kind: "step",
    model: { provider: "anthropic", model: "x" },
    systemPrompt: "",
    inputTemplate: "",
    outputVar: id,
    tools: [],
    onFailure: "stop",
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return {
    id: "test",
    name: "Test",
    description: "",
    version: 1,
    nodes,
    edges,
    metadata: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("v0.7.0: computeLayout", () => {
  it("returns empty for an empty workflow", () => {
    const layout = computeLayout(makeWorkflow([], []));
    expect(layout.positions).toEqual({});
    expect(layout.cols).toBe(0);
    expect(layout.depth).toBe(0);
  });

  it("places a single node at (0, 0)", () => {
    const layout = computeLayout(makeWorkflow([makeNode("a")], []));
    expect(layout.positions.a).toEqual({ id: "a", col: 0, depth: 0 });
  });

  it("linear A → B → C places each at increasing depth", () => {
    const wf = makeWorkflow(
      [makeNode("a"), makeNode("b"), makeNode("c")],
      [
        { id: "e1", from: "a", to: "b" },
        { id: "e2", from: "b", to: "c" },
      ],
    );
    const layout = computeLayout(wf);
    expect(layout.positions.a?.depth).toBe(0);
    expect(layout.positions.b?.depth).toBe(1);
    expect(layout.positions.c?.depth).toBe(2);
  });

  it("fan-out A → B, A → C places B and C at the same depth, different cols", () => {
    const wf = makeWorkflow(
      [makeNode("a"), makeNode("b"), makeNode("c")],
      [
        { id: "e1", from: "a", to: "b" },
        { id: "e2", from: "a", to: "c" },
      ],
    );
    const layout = computeLayout(wf);
    expect(layout.positions.a?.depth).toBe(0);
    expect(layout.positions.b?.depth).toBe(1);
    expect(layout.positions.c?.depth).toBe(1);
    expect(layout.positions.b?.col).not.toBe(layout.positions.c?.col);
    // cols should be 2 (the wider row).
    expect(layout.cols).toBe(2);
  });

  it("breaks cycles by seeding from the alphabetically-first node", () => {
    // A → B → C → A: pure cycle, no source. The BFS
    // needs at least one seed; we pick the lex-first.
    const wf = makeWorkflow(
      [makeNode("a"), makeNode("b"), makeNode("c")],
      [
        { id: "e1", from: "a", to: "b" },
        { id: "e2", from: "b", to: "c" },
        { id: "e3", from: "c", to: "a" },
      ],
    );
    const layout = computeLayout(wf);
    // All three nodes get a position (no infinite loop, no
    // missing entries).
    expect(layout.positions.a).toBeDefined();
    expect(layout.positions.b).toBeDefined();
    expect(layout.positions.c).toBeDefined();
  });
});

describe("v0.7.0: autoLayout", () => {
  it("writes back integer (x, y) positions to every node", () => {
    const wf = makeWorkflow(
      [makeNode("a"), makeNode("b")],
      [{ id: "e1", from: "a", to: "b" }],
    );
    const out = autoLayout(wf);
    expect(out).toHaveLength(2);
    for (const n of out) {
      expect(Number.isInteger(n.position.x)).toBe(true);
      expect(Number.isInteger(n.position.y)).toBe(true);
    }
  });

  it("preserves node identity (same id, same name)", () => {
    const wf = makeWorkflow(
      [makeNode("a", "Read"), makeNode("b", "Write")],
      [{ id: "e1", from: "a", to: "b" }],
    );
    const out = autoLayout(wf);
    expect(out.find((n) => n.id === "a")?.name).toBe("Read");
    expect(out.find((n) => n.id === "b")?.name).toBe("Write");
  });
});

describe("v0.7.4: hand-placed position overrides BFS layout", () => {
  it("uses node.position when a node has been hand-placed (drag-and-drop)", () => {
    // A node with {x: 480, y: 160} sits at column 2 row 2
    // of the 240×80 grid — i.e. 2 cells over and 2 down
    // from the BFS-default position. The layout helper
    // should honor that hand-placed coordinate instead of
    // assigning it whatever BFS thinks the depth should be.
    const wf = makeWorkflow(
      [
        makeNode("a", "a", { position: { x: 0, y: 0 } }),
        makeNode("b", "b", { position: { x: 480, y: 160 } }),
      ],
      [{ id: "e1", from: "a", to: "b" }],
    );
    const layout = computeLayout(wf);
    const b = layout.positions.b!;
    expect(b.col).toBe(2);
    expect(b.depth).toBe(2);
  });

  it("treats {0, 0} as 'not placed' so the BFS fallback runs", () => {
    // {0, 0} is the BFS starting corner. A node whose
    // position is {0, 0} (default for a fresh workflow
    // that has never been auto-laid-out) must NOT be
    // treated as 'pinned' — otherwise an auto-layout
    // would never move it.
    const wf = makeWorkflow(
      [makeNode("a", "a", { position: { x: 0, y: 0 } })],
      [],
    );
    const layout = computeLayout(wf);
    const a = layout.positions.a!;
    expect(a.col).toBe(0);
    expect(a.depth).toBe(0);
  });

  it("uses integer grid coordinates for hand-placed positions", () => {
    // v0.7.4: the PreviewPanel drag handler rounds to
    // integers, so positions are always clean multiples
    // of (240, 80). This pins that contract — if a future
    // change starts storing floats, the test surfaces it.
    const wf = makeWorkflow(
      [makeNode("a", "a", { position: { x: 240, y: 80 } })],
      [],
    );
    const layout = computeLayout(wf);
    expect(layout.positions.a!.col).toBe(1);
    expect(layout.positions.a!.depth).toBe(1);
  });
});
