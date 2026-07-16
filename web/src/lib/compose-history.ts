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

import type {
  ComposeBlock,
  ComposeConnection,
  ComposeState,
  ConnectionLabelKind,
} from "./types";

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
  | { type: "removeConnection"; connection: ComposeConnection }
  | {
      /**
       * v0.6.9: edit a connection's free-text label and/or semantic
       * kind. The entry stores BEFORE/AFTER so undo/redo round-trips
       * work without re-fetching the live state. The connection id
       * is enough to find the edge — `from`/`to` don't need to be
       * tracked here.
       *
       * `""` (empty string) means "clear this field" — the React
       * layer normalises the user's empty textbox into `""` before
       * committing, so the history entry round-trips losslessly.
       * We intentionally don't use `undefined` because that would
       * collide with "field not touched in this entry".
       */
      type: "updateConnectionLabel";
      connectionId: string;
      fromLabel: string;
      toLabel: string;
      fromKind: ConnectionLabelKind | "";
      toKind: ConnectionLabelKind | "";
    }
  | {
      /**
       * v0.6.18: flip a connection's direction (forward / backward
       * / bidirectional). Kept as its own history entry type so
       * undoing a direction change doesn't also undo an unrelated
       * label edit. The entry stores BEFORE/AFTER for the same
       * reason as `updateConnectionLabel` — undo/redo round-trips
       * without re-fetching live state.
       *
       * `""` in fromDir/toDir is reserved for "this field wasn't
       * touched" but in practice both sides are always a valid
       * direction — we keep the `""` slot in case a future entry
       * shape needs to mix dir with other fields.
       */
      type: "updateConnectionDir";
      connectionId: string;
      fromDir: "forward" | "backward" | "bidirectional" | "";
      toDir: "forward" | "backward" | "bidirectional" | "";
    }
  | {
      /**
       * v0.6.19: change a connection's color. Hex CSS string
       * (`#rrggbb` from the native `<input type="color">`).
       * `""` (empty string) on either side means "use the theme
       * accent" — that's the default the SVG renderer falls back
       * to when the connection object doesn't have a `color` key.
       *
       * Same omit-the-default pattern as `updateConnectionDir`:
       * undoing a color change doesn't undo a dir change. Each
       * concern lives in its own history entry, so the user can
       * step back one change at a time.
       */
      type: "updateConnectionColor";
      connectionId: string;
      fromColor: string;
      toColor: string;
    };

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
    case "updateConnectionLabel": {
      // v0.6.9: rewrite just label + kind on the matching edge.
      // Selection doesn't change — the user was already looking
      // at this block; only the inline editor mutated.
      // ComposeState doesn't carry selection (selectedId is a
      // sibling useState in the React layer), so we return null
      // and let the React layer keep its existing selection.
      //
      // `""` in entry.toLabel/toKind means "clear this field";
      // anything else is the new value. We `delete` rather than
      // assign undefined so the resulting connection object
      // matches the schema (no `label: undefined` floating
      // around in JSON).
      const conns = state.connections ?? [];
      const updated = conns.map((c) => {
        if (c.id !== entry.connectionId) return c;
        const next: ComposeConnection = { ...c };
        if (entry.toLabel === "") {
          delete next.label;
        } else {
          next.label = entry.toLabel;
        }
        if (entry.toKind === "") {
          delete next.kind;
        } else {
          next.kind = entry.toKind;
        }
        return next;
      });
      return { state: { ...state, connections: updated }, selectedId: null };
    }
    case "updateConnectionDir": {
      // v0.6.18: same shape as the label update — find the edge
      // by id, swap its dir field. `""` toDir means "clear dir
      // (i.e. fall back to forward)" but in practice the React
      // layer always passes a valid direction value.
      const conns = state.connections ?? [];
      const updated = conns.map((c) => {
        if (c.id !== entry.connectionId) return c;
        const next: ComposeConnection = { ...c };
        if (entry.toDir === "" || entry.toDir === "forward") {
          // "forward" is the default — drop the field so the
          // JSON stays minimal and diff-against-old-boards
          // comparisons don't have to special-case the two
          // representations of the same value.
          delete next.dir;
        } else {
          next.dir = entry.toDir;
        }
        return next;
      });
      return { state: { ...state, connections: updated }, selectedId: null };
    }
    case "updateConnectionColor": {
      // v0.6.19: same omit-the-default pattern as the dir case.
      // `""` (empty string) on the toColor side means "use the
      // theme accent" — we drop the `color` key on the
      // connection object so the saved JSON doesn't carry a
      // useless `color: ""` that the server-side regex would
      // reject. The zod schema treats `undefined` and the
      // missing key identically, so this is safe.
      const conns = state.connections ?? [];
      const updated = conns.map((c) => {
        if (c.id !== entry.connectionId) return c;
        const next: ComposeConnection = { ...c };
        if (entry.toColor === "") {
          delete next.color;
        } else {
          next.color = entry.toColor;
        }
        return next;
      });
      return { state: { ...state, connections: updated }, selectedId: null };
    }
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
    case "updateConnectionLabel":
      // Swap before/after so undo flips back to `from` and redo
      // (which applies the entry as-is) restores `to`.
      return {
        type: "updateConnectionLabel",
        connectionId: entry.connectionId,
        fromLabel: entry.toLabel,
        toLabel: entry.fromLabel,
        fromKind: entry.toKind,
        toKind: entry.fromKind,
      };
    case "updateConnectionDir":
      // Same swap pattern as the label case.
      return {
        type: "updateConnectionDir",
        connectionId: entry.connectionId,
        fromDir: entry.toDir,
        toDir: entry.fromDir,
      };
    case "updateConnectionColor":
      // Same swap pattern as the label case.
      return {
        type: "updateConnectionColor",
        connectionId: entry.connectionId,
        fromColor: entry.toColor,
        toColor: entry.fromColor,
      };
  }
}
