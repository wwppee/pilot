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
    version: 1,
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
