/**
 * v0.6.2: undo/redo history for the /compose canvas.
 *
 * v0.6.2 (original 3 entry kinds):
 *   - `add`    — a block was added (entry stores the full block so
 *                we can re-insert on undo).
 *   - `remove` — a block was removed (entry stores the full block
 *                so we can re-insert on undo).
 *   - `move`   — a block was dragged; only deltas are stored so the
 *                entry is small. Drag-end commits ONE entry, not
 *                per-frame.
 *
 * v0.6.7: adds two connection entries (add/remove). A connection
 * is `{id, from, to}` — the id is stable so undo can find the
 * exact same edge after a re-render.
 *
 * Why a separate module (vs inlining in ComposeBoard.tsx):
 *   - importable from tests without rendering the React tree
 *   - keeps the rule "history ops are pure functions of state" in
 *     one place — ComposeBoard just wires the UI
 */

import type { ComposeBlock, ComposeConnection, ComposeState } from "./types";

/** Max entries held in past[]; oldest are dropped on overflow. */
export const MAX_HISTORY = 50;

export type HistoryEntry =
  | { type: "add"; block: ComposeBlock }
  | { type: "remove"; block: ComposeBlock }
  | {
      type: "move";
      blockId: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | { type: "addConnection"; connection: ComposeConnection }
  | { type: "removeConnection"; connection: ComposeConnection };

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/**
 * Apply a history entry to a ComposeState. Returns the new state
 * and the block id that should be selected after the operation.
 * For `add` and `move`, the affected block stays selected. For
 * `remove` and `addConnection` / `removeConnection`, selection
 * clears (the user clicked a delete or a connect action that
 * wasn't tied to a block).
 */
export function applyEntry(
  state: ComposeState,
  entry: HistoryEntry,
): { state: ComposeState; selectedId: string | null } {
  switch (entry.type) {
    case "add":
      return {
        state: { ...state, blocks: [...state.blocks, entry.block] },
        selectedId: entry.block.id,
      };
    case "remove":
      return {
        state: {
          ...state,
          blocks: state.blocks.filter((b) => b.id !== entry.block.id),
        },
        selectedId: null,
      };
    case "move":
      return {
        state: {
          ...state,
          blocks: state.blocks.map((b) =>
            b.id === entry.blockId ? { ...b, x: entry.toX, y: entry.toY } : b,
          ),
        },
        selectedId: entry.blockId,
      };
    case "addConnection":
      return {
        state: {
          ...state,
          connections: [...(state.connections ?? []), entry.connection],
        },
        selectedId: null,
      };
    case "removeConnection":
      return {
        state: {
          ...state,
          connections: (state.connections ?? []).filter(
            (c) => c.id !== entry.connection.id,
          ),
        },
        selectedId: null,
      };
  }
}

/**
 * Invert a history entry — undo's twin. Used to push entries onto
 * the future stack when the user undoes.
 */
export function invertEntry(entry: HistoryEntry): HistoryEntry {
  switch (entry.type) {
    case "add":
      return { type: "remove", block: entry.block };
    case "remove":
      return { type: "add", block: entry.block };
    case "move":
      return {
        type: "move",
        blockId: entry.blockId,
        fromX: entry.toX,
        fromY: entry.toY,
        toX: entry.fromX,
        toY: entry.fromY,
      };
    case "addConnection":
      return { type: "removeConnection", connection: entry.connection };
    case "removeConnection":
      return { type: "addConnection", connection: entry.connection };
  }
}
