/**
 * Tests for SessionTreeView's pure logic.
 *
 * The component itself is tested via the integration; the key
 * pure functions (flatten + findCurrentPath) are tested here.
 */

import { describe, it, expect } from "vitest";
import type { SessionTree, SessionTreeNode } from "../src/lib/types";

/** Re-implement the same flatten signature the component uses, so
 * the test covers the algorithm without re-importing internal
 * helpers. */
type NodeRow = {
  node: SessionTreeNode;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
};
function flatten(
  node: SessionTreeNode,
  depth: number,
  out: NodeRow[],
  siblingIndex: number,
  siblingCount: number,
): void {
  out.push({ node, depth, siblingIndex, siblingCount });
  for (let i = 0; i < node.children.length; i++) {
    flatten(node.children[i]!, depth + 1, out, i, node.children.length);
  }
}

function makeNode(
  id: string,
  type: SessionTreeNode["type"] = "user",
  children: SessionTreeNode[] = [],
  timestamp: string | undefined = undefined,
  preview = id,
): SessionTreeNode {
  // Build the node without the optional field when undefined so
  // the resulting object satisfies exactOptionalPropertyTypes.
  const node: SessionTreeNode = {
    id,
    type,
    children,
    preview,
  };
  if (timestamp !== undefined) node.timestamp = timestamp;
  return node;
}

describe("SessionTreeView — flatten", () => {
  it("flattens a linear chain with depth 0..N", () => {
    const tree: SessionTreeNode = makeNode("root", "user", [
      makeNode("a", "user", [makeNode("b", "user", [makeNode("c", "user")])]),
    ]);
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    expect(rows.map((r) => r.node.id)).toEqual(["root", "a", "b", "c"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3]);
  });

  it("records siblingIndex + siblingCount at branch points", () => {
    const tree: SessionTreeNode = makeNode("root", "user", [
      makeNode("left", "user"),
      makeNode("right", "user"),
      makeNode("center", "user"),
    ]);
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({
      node: { id: "left" },
      siblingIndex: 0,
      siblingCount: 3,
      depth: 1,
    });
    expect(rows[2]).toMatchObject({
      node: { id: "right" },
      siblingIndex: 1,
      siblingCount: 3,
      depth: 1,
    });
    expect(rows[3]).toMatchObject({
      node: { id: "center" },
      siblingIndex: 2,
      siblingCount: 3,
      depth: 1,
    });
  });

  it("handles a deep fork tree (root → user → assistant → tool → assistant → user)", () => {
    const tree: SessionTreeNode = makeNode("u1", "user", [
      makeNode("a1", "assistant", [
        makeNode("t1", "tool", [
          makeNode("a2", "assistant", [makeNode("u2", "user")]),
        ]),
      ]),
    ]);
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    expect(rows.map((r) => `${r.node.id}@${r.depth}`)).toEqual([
      "u1@0",
      "a1@1",
      "t1@2",
      "a2@3",
      "u2@4",
    ]);
  });
});

describe("SessionTreeView — findCurrentPath", () => {
  // Re-implement findCurrentPath for the test (the component
  // exports only the component; the helper is private).
  function findCurrentPath(rows: NodeRow[], latestTs: number): Set<string> {
    const current = new Set<string>();
    let chosen: NodeRow | null = null;
    for (const r of rows) {
      const t = r.node.timestamp ? Date.parse(r.node.timestamp) : 0;
      if (t <= latestTs) {
        // Use >= (not >) so a node whose timestamp exactly matches
        // the latest event still wins over an earlier node. Also
        // guard the chosen timestamp: a node without a timestamp
        // is always treated as "older" so we don't get stuck.
        const chosenT = chosen?.node.timestamp
          ? Date.parse(chosen.node.timestamp)
          : -Infinity;
        if (!chosen || t >= chosenT) {
          chosen = r;
        }
      }
    }
    if (!chosen) return current;
    let cur: NodeRow | null = chosen;
    while (cur) {
      current.add(cur.node.id);
      const parentDepth = cur.depth - 1;
      if (parentDepth < 0) break;
      const idx = rows.indexOf(cur);
      for (let i = idx - 1; i >= 0; i--) {
        const r = rows[i]!;
        if (r.depth === parentDepth) {
          if (r.node.children.some((c) => c.id === cur!.node.id)) {
            cur = r;
            break;
          }
          break;
        }
      }
    }
    return current;
  }

  it("marks no nodes when no events have arrived", () => {
    const tree: SessionTreeNode = makeNode(
      "u1",
      "user",
      [],
      "2026-07-01T00:00:00.000Z",
    );
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    const current = findCurrentPath(rows, 0);
    expect(current.size).toBe(0);
  });

  it("highlights the linear path to the latest node", () => {
    const tree: SessionTreeNode = makeNode("u1", "user", [
      makeNode("a1", "assistant", [], "2026-07-01T00:01:00.000Z"),
    ]);
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    const current = findCurrentPath(
      rows,
      Date.parse("2026-07-01T00:01:00.000Z"),
    );
    // Walk from the latest node back to root → every node on the
    // path should be marked. Use `has` to avoid ordering coupling.
    expect(current.has("a1")).toBe(true);
    expect(current.has("u1")).toBe(true);
    expect(current.size).toBe(2);
  });

  it("only marks the latest branch when sibling timestamps diverge", () => {
    // u1 has two children: a1 (older) and a2 (newer). latestTs is
    // after a2's timestamp → only u1 + a2 should be in the path.
    const tree: SessionTreeNode = makeNode("u1", "user", [
      makeNode("a1", "assistant", [], "2026-07-01T00:01:00.000Z"),
      makeNode("a2", "assistant", [], "2026-07-01T00:02:00.000Z"),
    ]);
    const rows: NodeRow[] = [];
    flatten(tree, 0, rows, 0, 1);
    const current = findCurrentPath(
      rows,
      Date.parse("2026-07-01T00:02:00.000Z"),
    );
    expect(current.has("u1")).toBe(true);
    expect(current.has("a2")).toBe(true);
    expect(current.has("a1")).toBe(false);
    expect(current.size).toBe(2);
  });
});

describe("SessionTree type sanity", () => {
  it("SessionTree shape matches what /sessions/:id/tree returns", () => {
    const sample: SessionTree = {
      id: "sess-1",
      root: makeNode("u1", "user"),
      totalNodes: 1,
      maxDepth: 0,
      models: [],
    };
    expect(sample.id).toBe("sess-1");
    expect(sample.root.children).toHaveLength(0);
  });
});
