/**
 * v0.6.22: extracted the undo/redo stack from `ComposeBoard.tsx`
 * into this dedicated hook. The original code had 17 useState + 25
 * useCallback all in one file, and the history triplet (history
 * state + commit + undo + redo) was the most self-contained slice:
 * it doesn't read or write any other ComposeBoard state directly
 * (it only takes the state + setState + setSelectedId + announce +
 * t through the opts object), and the underlying pure logic
 * (applyEntry / invertEntry) already lives in
 * `lib/compose-history.ts` and is tested there.
 *
 * The hook owns the history { past, future } state and exposes:
 *   - `commit(entry, apply, label?)` — call this when the caller
 *     has a "before/after" of a state transition they want to
 *     make undoable. The `apply` callback mutates the state
 *     (usually via setState), the entry is pushed onto `past`,
 *     and `future` is cleared (any uncommitted redo branch is
 *     dropped — this is the standard editor behavior).
 *   - `pushEntry(entry)` — call this when the state mutation has
 *     ALREADY happened and you only want to record the transition
 *     in history. The single caller today is `endBlockDrag`,
 *     which streams the move during pointermove and only commits
 *     the final delta on pointerup; using `commit` there would
 *     re-apply the move and double the position.
 *   - `undo()` / `redo()` — apply the inverted / forward entry
 *     through the same `applyEntry` pure function the test
 *     suite covers. Announces the action through `t()` so the
 *     live region can say "Undone" / "Redone" (or
 *     "historyEmpty" if the stack is exhausted in that direction).
 *   - `canUndo` / `canRedo` — boolean convenience for the
 *     keyboard handler and any disabled-button affordance.
 *
 * Why this isn't a custom hook with internal state-only:
 * the history stack needs to read the *current* `state` to apply
 * inverted/forward entries during undo/redo. If the hook owned
 * the state, every mutation outside the hook would have to
 * round-trip through the hook. Easier to keep the state where it
 * is and pass it in.
 */

import { useCallback, useState } from "react";
import {
  applyEntry,
  invertEntry,
  MAX_HISTORY,
  type HistoryEntry,
  type HistoryState,
} from "../../lib/compose-history";
import type { ComposeState } from "../../lib/types";

export interface UseHistoryStackOpts {
  state: ComposeState;
  setState: React.Dispatch<React.SetStateAction<ComposeState>>;
  setSelectedId: (id: string | null) => void;
  announce: (msg: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export interface UseHistoryStackResult {
  history: HistoryState;
  commit: (entry: HistoryEntry, apply: () => void, label?: string) => void;
  /**
   * Push an entry onto the past stack without applying any state
   * change. Use when the state has already been mutated (e.g.
   * during a drag — the move is streamed on every pointermove
   * and only the final position delta belongs in history).
   * Clears the future stack the same way `commit` does.
   */
  pushEntry: (entry: HistoryEntry) => void;
  /**
   * Push a `move` entry, or extend the previous move entry if it
   * was a move on the same block. The arrow-key handler in
   * `ComposeBoard` uses this so that holding an arrow key for
   * N frames produces ONE undo step, not N. The caller is
   * responsible for the actual state update (this method only
   * touches the history stack).
   */
  pushOrMergeMoveEntry: (entry: HistoryEntry & { type: "move" }) => void;
  /**
   * Clear both past and future. Use when the canvas is
   * wholesale replaced — loading a saved board, importing a
   * JSON file, or clicking "Reset canvas" — so the user
   * can't accidentally undo their way back into a board they
   * just threw away.
   */
  clearHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistoryStack(
  opts: UseHistoryStackOpts,
): UseHistoryStackResult {
  const { state, setState, setSelectedId, announce, t } = opts;
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    future: [],
  });

  const commit = useCallback(
    (entry: HistoryEntry, apply: () => void, label?: string) => {
      apply();
      setHistory((h) => ({
        past: [...h.past, entry].slice(-MAX_HISTORY),
        future: [],
      }));
      if (label) announce(label);
    },
    [announce],
  );

  const pushEntry = useCallback((entry: HistoryEntry) => {
    setHistory((h) => ({
      past: [...h.past, entry].slice(-MAX_HISTORY),
      future: [],
    }));
  }, []);

  const pushOrMergeMoveEntry = useCallback(
    (entry: HistoryEntry & { type: "move" }) => {
      setHistory((h) => {
        const last = h.past[h.past.length - 1];
        if (last && last.type === "move" && last.blockId === entry.blockId) {
          // Extend the previous move's `to` instead of pushing
          // a new entry. The `from` stays pinned to the
          // pre-arrow-key position so undo lands at the start
          // of the whole arrow-key run, not just the last frame.
          const merged: HistoryEntry = {
            ...last,
            toX: entry.toX,
            toY: entry.toY,
          };
          return {
            past: [...h.past.slice(0, -1), merged],
            future: [],
          };
        }
        return {
          past: [...h.past, entry].slice(-MAX_HISTORY),
          future: [],
        };
      });
    },
    [],
  );

  const clearHistory = useCallback(() => {
    setHistory({ past: [], future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) {
        announce(t("compose.announce.historyEmpty"));
        return h;
      }
      const last = h.past[h.past.length - 1];
      if (!last) return h;
      const inverted = invertEntry(last);
      const { state: nextState, selectedId: nextSelected } = applyEntry(
        state,
        inverted,
      );
      setState(nextState);
      setSelectedId(nextSelected);
      announce(t("compose.announce.undone"));
      return {
        past: h.past.slice(0, -1),
        future: [last, ...h.future],
      };
    });
  }, [state, setState, setSelectedId, announce, t]);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) {
        announce(t("compose.announce.historyEmpty"));
        return h;
      }
      const [next, ...rest] = h.future;
      if (!next) return h;
      const { state: nextState, selectedId: nextSelected } = applyEntry(
        state,
        next,
      );
      setState(nextState);
      setSelectedId(nextSelected);
      announce(t("compose.announce.redone"));
      return {
        past: [...h.past, next].slice(-MAX_HISTORY),
        future: rest,
      };
    });
  }, [state, setState, setSelectedId, announce, t]);

  return {
    history,
    commit,
    pushEntry,
    pushOrMergeMoveEntry,
    clearHistory,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
