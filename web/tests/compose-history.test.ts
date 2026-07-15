/**
 * Tests for the v0.6.2 Compose history (undo/redo) helpers.
 *
 * The helpers are pure functions of `ComposeState` so we can test
 * them without rendering the React tree. The React layer just wires
 * these into the toolbar + keyboard handlers.
 */

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  applyEntry,
  invertEntry,
  MAX_HISTORY,
  type HistoryEntry,
} from "../src/lib/compose-history";
import type { ComposeBlock, ComposeState } from "../src/lib/types";

function makeState(blocks: ComposeBlock[] = []): ComposeState {
  return {
    blocks,
    version: 3,
    updatedAt: "2026-07-11T00:00:00.000Z",
    name: "test",
  };
}

function makeBlock(overrides: Partial<ComposeBlock> = {}): ComposeBlock {
  return {
    id: "b-1",
    kind: "session",
    refId: "ref-1",
    x: 50,
    y: 60,
    label: "block-1",
    ...overrides,
  };
}

describe("applyEntry / invertEntry", () => {
  it("add inserts the block and selects it", () => {
    const block = makeBlock();
    const entry: HistoryEntry = { type: "add", block };
    const { state, selectedId } = applyEntry(makeState(), entry);
    expect(state.blocks).toEqual([block]);
    expect(selectedId).toBe(block.id);
  });

  it("remove deletes the block and clears selection", () => {
    const block = makeBlock();
    const { state, selectedId } = applyEntry(makeState([block]), {
      type: "remove",
      block,
    });
    expect(state.blocks).toEqual([]);
    expect(selectedId).toBeNull();
  });

  it("move updates x/y and selects the moved block", () => {
    const block = makeBlock({ id: "b-move", x: 0, y: 0 });
    const { state, selectedId } = applyEntry(makeState([block]), {
      type: "move",
      blockId: "b-move",
      fromX: 0,
      fromY: 0,
      toX: 100,
      toY: 200,
    });
    expect(state.blocks[0]?.x).toBe(100);
    expect(state.blocks[0]?.y).toBe(200);
    expect(selectedId).toBe("b-move");
  });

  it("add invert → remove, remove invert → add", () => {
    const block = makeBlock();
    const addInverted = invertEntry({ type: "add", block });
    expect(addInverted).toEqual({ type: "remove", block });
    const removeInverted = invertEntry({ type: "remove", block });
    expect(removeInverted).toEqual({ type: "add", block });
  });

  it("move invert swaps from/to", () => {
    const entry: HistoryEntry = {
      type: "move",
      blockId: "b-move",
      fromX: 10,
      fromY: 20,
      toX: 30,
      toY: 40,
    };
    const inverted = invertEntry(entry);
    expect(inverted).toEqual({
      type: "move",
      blockId: "b-move",
      fromX: 30,
      fromY: 40,
      toX: 10,
      toY: 20,
    });
  });

  it("undo/redo round-trip: add → undo → redo preserves state", () => {
    const block = makeBlock({ id: "b-rt" });
    const addEntry: HistoryEntry = { type: "add", block };
    // Apply add
    const afterAdd = applyEntry(makeState(), addEntry);
    // Undo via invertEntry
    const undoEntry = invertEntry(addEntry);
    const afterUndo = applyEntry(afterAdd.state, undoEntry);
    expect(afterUndo.state.blocks).toEqual([]);
    // Redo = re-apply original
    const afterRedo = applyEntry(afterUndo.state, addEntry);
    expect(afterRedo.state.blocks).toEqual([block]);
    expect(afterRedo.selectedId).toBe("b-rt");
  });

  it("undo/redo round-trip: move → undo → redo preserves positions", () => {
    const block = makeBlock({ id: "b-mv", x: 0, y: 0 });
    const moveEntry: HistoryEntry = {
      type: "move",
      blockId: "b-mv",
      fromX: 0,
      fromY: 0,
      toX: 100,
      toY: 200,
    };
    const afterMove = applyEntry(makeState([block]), moveEntry);
    expect(afterMove.state.blocks[0]?.x).toBe(100);
    // Undo
    const afterUndo = applyEntry(afterMove.state, invertEntry(moveEntry));
    expect(afterUndo.state.blocks[0]?.x).toBe(0);
    expect(afterUndo.state.blocks[0]?.y).toBe(0);
    // Redo
    const afterRedo = applyEntry(afterUndo.state, moveEntry);
    expect(afterRedo.state.blocks[0]?.x).toBe(100);
    expect(afterRedo.state.blocks[0]?.y).toBe(200);
  });

  it("MAX_HISTORY is exported and a positive number", () => {
    expect(MAX_HISTORY).toBeGreaterThan(0);
    expect(typeof MAX_HISTORY).toBe("number");
  });

  it("does not mutate the input state", () => {
    const block = makeBlock();
    const state = makeState([block]);
    const snapshot = JSON.parse(JSON.stringify(state));
    applyEntry(state, { type: "remove", block });
    expect(state).toEqual(snapshot);
  });
});

// ─── v0.6.7: addConnection / removeConnection ───────────────

describe("addConnection / removeConnection (v0.6.7)", () => {
  const a: ComposeBlock = makeBlock({ id: "a" });
  const b: ComposeBlock = makeBlock({ id: "b", x: 400, y: 400 });
  const conn = { id: "c1", from: "a", to: "b" };

  it("addConnection adds to state.connections and selects nothing", () => {
    const { state, selectedId } = applyEntry(makeState([a, b]), {
      type: "addConnection",
      connection: conn,
    });
    expect(state.connections).toEqual([conn]);
    expect(selectedId).toBeNull();
  });

  it("removeConnection drops from state.connections", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const { state, selectedId } = applyEntry(start, {
      type: "removeConnection",
      connection: conn,
    });
    expect(state.connections).toEqual([]);
    expect(selectedId).toBeNull();
  });

  it("addConnection invert → removeConnection (and back)", () => {
    const addInv = invertEntry({ type: "addConnection", connection: conn });
    expect(addInv).toEqual({ type: "removeConnection", connection: conn });
    const remInv = invertEntry({ type: "removeConnection", connection: conn });
    expect(remInv).toEqual({ type: "addConnection", connection: conn });
  });

  it("addConnection round-trip: add → undo → redo preserves state", () => {
    let s = makeState([a, b]);
    s = applyEntry(s, { type: "addConnection", connection: conn }).state;
    expect(s.connections).toEqual([conn]);
    // undo via invertEntry
    s = applyEntry(
      s,
      invertEntry({ type: "addConnection", connection: conn }),
    ).state;
    expect(s.connections).toEqual([]);
    // redo
    s = applyEntry(s, { type: "addConnection", connection: conn }).state;
    expect(s.connections).toEqual([conn]);
  });

  it("preserves state.connections when applying non-connection entries", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const { state } = applyEntry(start, { type: "remove", block: a });
    expect(state.connections).toEqual([conn]);
    expect(state.blocks).toEqual([b]);
  });
});

// ─── v0.6.9: updateConnectionLabel ───────────────────────────

import type { ComposeConnection } from "../src/lib/types";

describe("updateConnectionLabel (v0.6.9)", () => {
  const a: ComposeBlock = makeBlock({ id: "a" });
  const b: ComposeBlock = makeBlock({ id: "b", x: 400, y: 400 });
  const conn: ComposeConnection = { id: "c-lab", from: "a", to: "b" };

  it("sets label and kind on the matching edge", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const { state } = applyEntry(start, {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "",
      toLabel: "via npm",
      fromKind: "",
      toKind: "uses",
    });
    expect(state.connections?.[0]?.label).toBe("via npm");
    expect(state.connections?.[0]?.kind).toBe("uses");
  });

  it("preserves other edges untouched", () => {
    const conn2: ComposeConnection = { id: "c-other", from: "b", to: "a" };
    const start = {
      ...makeState([a, b]),
      connections: [conn, conn2],
    };
    const { state } = applyEntry(start, {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "",
      toLabel: "via npm",
      fromKind: "",
      toKind: "uses",
    });
    const labelled = state.connections?.find((c) => c.id === "c-lab");
    const other = state.connections?.find((c) => c.id === "c-other");
    expect(labelled?.label).toBe("via npm");
    expect(labelled?.kind).toBe("uses");
    expect(other).toEqual(conn2);
  });

  it("clears label and kind when to* are empty string", () => {
    const labelled: ComposeConnection = {
      ...conn,
      label: "old",
      kind: "uses",
    };
    const start = { ...makeState([a, b]), connections: [labelled] };
    const { state } = applyEntry(start, {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "old",
      toLabel: "",
      fromKind: "uses",
      toKind: "",
    });
    expect(state.connections?.[0]?.label).toBeUndefined();
    expect(state.connections?.[0]?.kind).toBeUndefined();
    // The connection object should NOT carry `label: undefined`
    // or `kind: undefined` — `delete` ensures JSON.stringify
    // drops the keys entirely (round-trip stable).
    expect("label" in (state.connections?.[0] ?? {})).toBe(false);
    expect("kind" in (state.connections?.[0] ?? {})).toBe(false);
  });

  it("invertEntry swaps before/after values", () => {
    const entry: HistoryEntry = {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "old",
      toLabel: "new",
      fromKind: "uses",
      toKind: "feeds",
    };
    const inverted = invertEntry(entry);
    expect(inverted).toEqual({
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "new",
      toLabel: "old",
      fromKind: "feeds",
      toKind: "uses",
    });
  });

  it("undo/redo round-trip: edit label → undo → redo preserves state", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const edit: HistoryEntry = {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "",
      toLabel: "via npm",
      fromKind: "",
      toKind: "uses",
    };
    // apply
    let s = applyEntry(start, edit).state;
    expect(s.connections?.[0]?.label).toBe("via npm");
    expect(s.connections?.[0]?.kind).toBe("uses");
    // undo — invertEntry swaps, so we apply toLabel="" / toKind=""
    s = applyEntry(s, invertEntry(edit)).state;
    expect(s.connections?.[0]?.label).toBeUndefined();
    expect(s.connections?.[0]?.kind).toBeUndefined();
    // redo
    s = applyEntry(s, edit).state;
    expect(s.connections?.[0]?.label).toBe("via npm");
    expect(s.connections?.[0]?.kind).toBe("uses");
  });

  it("preserves state.blocks when applying updateConnectionLabel", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const { state } = applyEntry(start, {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "",
      toLabel: "x",
      fromKind: "",
      toKind: "manual",
    });
    expect(state.blocks).toEqual([a, b]);
  });

  it("preserves from/to on the edge — only label/kind change", () => {
    const labelled: ComposeConnection = {
      ...conn,
      label: "old",
      kind: "uses",
    };
    const start = { ...makeState([a, b]), connections: [labelled] };
    const { state } = applyEntry(start, {
      type: "updateConnectionLabel",
      connectionId: "c-lab",
      fromLabel: "old",
      toLabel: "new",
      fromKind: "uses",
      toKind: "feeds",
    });
    expect(state.connections?.[0]?.from).toBe("a");
    expect(state.connections?.[0]?.to).toBe("b");
  });
});

// ─── v0.6.18: updateConnectionDir ───────────────────────────

describe("updateConnectionDir (v0.6.18)", () => {
  // Two blocks + one connection. Reused across the three cases
  // below so the only varying thing is the entry's toDir.
  const a: ComposeBlock = {
    id: "a",
    kind: "session",
    refId: "r-a",
    x: 0,
    y: 0,
    label: "A",
  };
  const b: ComposeBlock = {
    id: "b",
    kind: "session",
    refId: "r-b",
    x: 100,
    y: 0,
    label: "B",
  };
  const conn = { id: "c1", from: "a", to: "b" };

  it("flips forward → bidirectional, drop-pending-label semantics carry over", () => {
    const start = { ...makeState([a, b]), connections: [conn] };
    const { state } = applyEntry(start, {
      type: "updateConnectionDir",
      connectionId: "c1",
      fromDir: "",
      toDir: "bidirectional",
    });
    expect(state.connections?.[0]?.dir).toBe("bidirectional");
  });

  it("dropping dir back to forward is a no-op on the persisted JSON", () => {
    // v0.6.18: `forward` is the default — we delete the field
    // rather than setting `dir: "forward"`. The persisted board
    // matches what v0.6.17 would have written for the same
    // edge, so the v0.6.18 → v0.6.17 round-trip is lossless.
    const start = {
      ...makeState([a, b]),
      connections: [{ ...conn, dir: "bidirectional" as const }],
    };
    const { state } = applyEntry(start, {
      type: "updateConnectionDir",
      connectionId: "c1",
      fromDir: "bidirectional",
      toDir: "forward",
    });
    expect(state.connections?.[0]?.dir).toBeUndefined();
    expect("dir" in (state.connections?.[0] ?? {})).toBe(false);
  });

  it("undo round-trips: invert(updateConnectionDir(from→to)) = updateConnectionDir(to→from)", () => {
    // The undo stack stores the entry as-is; redo re-applies it
    // via applyEntry. To undo a dir change we need invertEntry
    // to swap fromDir/toDir so the future entry, when applied,
    // restores the previous direction.
    const entry: HistoryEntry = {
      type: "updateConnectionDir",
      connectionId: "c1",
      fromDir: "forward",
      toDir: "backward",
    };
    const inverted = invertEntry(entry);
    expect(inverted).toEqual({
      type: "updateConnectionDir",
      connectionId: "c1",
      fromDir: "backward",
      toDir: "forward",
    });
  });
});
