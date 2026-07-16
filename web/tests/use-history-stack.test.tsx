/**
 * v0.6.22: unit tests for the extracted `useHistoryStack`
 * hook. The underlying `applyEntry` / `invertEntry` pure
 * functions are already covered by `compose-history.test.ts`
 * (v0.6.2 + v0.6.9 + v0.6.18 + v0.6.19 + v0.6.20); this file
 * covers the React glue — the side effects (setState,
 * setSelectedId, announce), the dep-array wiring that decides
 * when each callback re-binds, and the `pushOrMergeMoveEntry`
 * merge behavior that's unique to the hook (the pure lib
 * doesn't know about coalescing).
 *
 * We use `renderHook` from React Testing Library so the
 * hook runs inside a real component tree, which means the
 * state setters it calls are actually wired up to a
 * useState somewhere — exactly the path ComposeBoard takes
 * in production.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryStack } from "../src/app/compose/use-history-stack";
import type {
  ComposeBlock,
  ComposeConnection,
  ComposeState,
  HistoryEntry,
} from "../src/lib/compose-history";
import { MAX_HISTORY } from "../src/lib/compose-history";

const A: ComposeBlock = {
  id: "a",
  kind: "session",
  refId: "r-a",
  x: 0,
  y: 0,
  label: "A",
};
const B: ComposeBlock = {
  id: "b",
  kind: "session",
  refId: "r-b",
  x: 100,
  y: 0,
  label: "B",
};

function makeState(
  blocks: ComposeBlock[] = [A],
  connections: ComposeConnection[] = [],
): ComposeState {
  return {
    blocks,
    connections,
    version: 6 as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "test",
  };
}

function makeOpts(initial: ComposeState) {
  // Captured mocks for the side effects. `announce` and
  // `setSelectedId` are spied on; the React state itself is
  // a real useState pair so we can read the current value
  // through the hook's return + call updates through the
  // returned setter.
  const announce = vi.fn();
  const setSelectedId = vi.fn();
  let tCalls: Array<{ key: string; params?: Record<string, unknown> }> = [];
  const t = (key: string, params?: Record<string, unknown>) => {
    tCalls.push({ key, params });
    return key; // echo the key as the i18n output for assertion
  };
  return { announce, setSelectedId, t, tCalls, initial };
}

describe("useHistoryStack (v0.6.22)", () => {
  describe("commit", () => {
    it("calls apply, pushes the entry, and announces the label", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {}, // unused — apply is mocked via the entry
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      const apply = vi.fn();
      act(() => {
        result.current.commit(
          { type: "add", block: A },
          apply,
          "added a block",
        );
      });

      expect(apply).toHaveBeenCalledTimes(1);
      expect(result.current.history.past).toEqual([{ type: "add", block: A }]);
      expect(result.current.history.future).toEqual([]);
      expect(opts.announce).toHaveBeenCalledWith("added a block");
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("omitting the label skips the announce", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.commit({ type: "add", block: A }, () => {});
      });

      expect(opts.announce).not.toHaveBeenCalled();
    });
  });

  describe("pushEntry", () => {
    it("records an entry without applying any state change", () => {
      // The distinguishing feature of pushEntry vs commit:
      // the caller has already mutated state externally and
      // only wants the history to reflect that. The hook
      // must not call a setState or apply function.
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      const entry: HistoryEntry = {
        type: "move",
        blockId: "a",
        fromX: 0,
        fromY: 0,
        toX: 10,
        toY: 0,
      };
      act(() => {
        result.current.pushEntry(entry);
      });

      expect(result.current.history.past).toEqual([entry]);
      expect(opts.announce).not.toHaveBeenCalled();
    });

    it("clears the future stack on push (any uncommitted redo branch is dropped)", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      // Seed a future entry by doing a commit, then an undo.
      act(() => {
        result.current.commit({ type: "add", block: A }, () => {});
      });
      act(() => {
        result.current.undo();
      });
      expect(result.current.history.future.length).toBe(1);

      // Now commit a new entry — the future must be cleared.
      act(() => {
        result.current.pushEntry({
          type: "move",
          blockId: "a",
          fromX: 0,
          fromY: 0,
          toX: 5,
          toY: 0,
        });
      });
      expect(result.current.history.future).toEqual([]);
    });
  });

  describe("pushOrMergeMoveEntry", () => {
    it("extends the previous move entry when blockId matches", () => {
      // v0.6.22: arrow-key held → many `moveBlock` calls in
      // quick succession. Each one would push a fresh
      // `move` entry and pollute the undo stack. The merge
      // logic extends the previous entry's `to` instead.
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "a",
          fromX: 0,
          fromY: 0,
          toX: 10,
          toY: 0,
        });
      });
      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "a",
          fromX: 0, // `from` is ignored on merge (the prior entry's from is kept)
          fromY: 0,
          toX: 20,
          toY: 0,
        });
      });
      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "a",
          fromX: 999, // ignored
          fromY: 999,
          toX: 30,
          toY: 0,
        });
      });

      // Should be ONE entry that spans the whole run:
      // from the original 0,0 to the final 30,0.
      expect(result.current.history.past).toEqual([
        { type: "move", blockId: "a", fromX: 0, fromY: 0, toX: 30, toY: 0 },
      ]);
    });

    it("pushes a new entry when the previous entry is a different type", () => {
      // e.g. user moves a block, then changes a connection's
      // color. The new entry is a different type so it must
      // not merge.
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.pushEntry({
          type: "updateConnectionColor",
          connectionId: "c1",
          fromColor: "",
          toColor: "#ff0000",
        });
      });
      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "a",
          fromX: 0,
          fromY: 0,
          toX: 10,
          toY: 0,
        });
      });

      expect(result.current.history.past.length).toBe(2);
    });

    it("pushes a new entry when blockId differs from the previous move", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "a",
          fromX: 0,
          fromY: 0,
          toX: 10,
          toY: 0,
        });
      });
      act(() => {
        result.current.pushOrMergeMoveEntry({
          type: "move",
          blockId: "b",
          fromX: 0,
          fromY: 0,
          toX: 10,
          toY: 0,
        });
      });

      expect(result.current.history.past.length).toBe(2);
    });
  });

  describe("clearHistory", () => {
    it("drops both past and future stacks", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.commit({ type: "add", block: A }, () => {});
      });
      act(() => {
        result.current.undo();
      });
      expect(result.current.history.past).toEqual([]);
      expect(result.current.history.future.length).toBe(1);

      act(() => {
        result.current.clearHistory();
      });
      expect(result.current.history).toEqual({ past: [], future: [] });
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe("undo / redo", () => {
    it("undo with empty past announces 'historyEmpty' and is a no-op", () => {
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      act(() => {
        result.current.undo();
      });
      expect(opts.announce).toHaveBeenCalledWith(
        "compose.announce.historyEmpty",
      );
      expect(result.current.history.past).toEqual([]);
    });

    it("undo applies the inverted entry and pushes onto future", () => {
      // Real round-trip: commit an `add` entry, then undo.
      // The hook should re-apply the state to remove the
      // block and announce "undone".
      const opts = makeOpts(makeState());
      let currentState: ComposeState = opts.initial;
      const setState = vi.fn(
        (next: ComposeState | ((prev: ComposeState) => ComposeState)) => {
          currentState =
            typeof next === "function"
              ? (next as (p: ComposeState) => ComposeState)(currentState)
              : next;
        },
      );
      const { result, rerender } = renderHook(
        ({ state }: { state: ComposeState }) =>
          useHistoryStack({
            state,
            setState,
            setSelectedId: opts.setSelectedId,
            announce: opts.announce,
            t: opts.t,
          }),
        { initialProps: { state: currentState } },
      );

      act(() => {
        result.current.commit(
          { type: "add", block: A },
          () => {
            currentState = { ...currentState, blocks: [A] };
          },
          "added",
        );
      });
      expect(result.current.history.past.length).toBe(1);
      rerender({ state: currentState });

      act(() => {
        result.current.undo();
      });
      // The hook should have called setState with the
      // inverted state (blocks: []).
      expect(setState).toHaveBeenCalled();
      // The announce should be the "undone" key.
      expect(opts.announce).toHaveBeenLastCalledWith("compose.announce.undone");
      // The future stack now has the original entry.
      expect(result.current.history.future.length).toBe(1);
      expect(result.current.history.past).toEqual([]);
    });

    it("redo re-applies the entry and announces 'redone'", () => {
      const opts = makeOpts(makeState());
      let currentState: ComposeState = opts.initial;
      const setState = vi.fn(
        (next: ComposeState | ((prev: ComposeState) => ComposeState)) => {
          currentState =
            typeof next === "function"
              ? (next as (p: ComposeState) => ComposeState)(currentState)
              : next;
        },
      );
      const { result, rerender } = renderHook(
        ({ state }: { state: ComposeState }) =>
          useHistoryStack({
            state,
            setState,
            setSelectedId: opts.setSelectedId,
            announce: opts.announce,
            t: opts.t,
          }),
        { initialProps: { state: currentState } },
      );

      act(() => {
        result.current.commit(
          { type: "add", block: A },
          () => {
            currentState = { ...currentState, blocks: [A] };
          },
          "added",
        );
      });
      rerender({ state: currentState });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });
      expect(opts.announce).toHaveBeenLastCalledWith("compose.announce.redone");
      expect(result.current.history.past.length).toBe(1);
      expect(result.current.history.future).toEqual([]);
    });
  });

  describe("MAX_HISTORY cap", () => {
    it("caps the past stack at MAX_HISTORY entries, dropping the oldest", () => {
      // v0.6.2: the cap is on the past stack only. Pushing
      // more than MAX_HISTORY entries keeps the most recent.
      // This test pushes 2 * MAX_HISTORY + 5 entries and
      // expects the final past to have exactly MAX_HISTORY
      // entries (the last MAX_HISTORY pushed).
      const opts = makeOpts(makeState());
      const { result } = renderHook(() =>
        useHistoryStack({
          state: opts.initial,
          setState: () => {},
          setSelectedId: opts.setSelectedId,
          announce: opts.announce,
          t: opts.t,
        }),
      );

      const total = 2 * MAX_HISTORY + 5;
      act(() => {
        for (let i = 0; i < total; i++) {
          result.current.pushEntry({
            type: "move",
            blockId: `b${i}`,
            fromX: 0,
            fromY: 0,
            toX: i,
            toY: 0,
          });
        }
      });

      expect(result.current.history.past.length).toBe(MAX_HISTORY);
      // The oldest kept entry should be at index `total -
      // MAX_HISTORY` (everything older was dropped). The
      // newest should be the very last one pushed.
      const first = result.current.history.past[0] as HistoryEntry;
      const last = result.current.history.past[MAX_HISTORY - 1] as HistoryEntry;
      expect(first).toMatchObject({ blockId: `b${total - MAX_HISTORY}` });
      expect(last).toMatchObject({ blockId: `b${total - 1}` });
    });
  });
});
