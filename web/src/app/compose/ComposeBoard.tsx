"use client";

/**
 * ComposeBoard — the interactive canvas for the /compose page.
 *
 * v0.6.2 layout:
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │ Toolbar: undo/redo  ⌬  N blocks  skin  export  │  sticky top
 *   ├──────────┬───────────────────────┬──────────────┤
 *   │ Sidebar  │  Canvas (dotted grid) │  Inspector   │
 *   │ 280px    │  flex-1               │  320px       │
 *   │ search   │  blocks (ellipsis)    │  block info  │
 *   │ filter   │  hover/selected state │  + actions   │
 *   │ sections │                       │              │
 *   │  + drag  │                       │              │
 *   └──────────┴───────────────────────┴──────────────┘
 *
 * v0.6.2 behaviour:
 *   - Undo / Redo: Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z. History stack
 *     holds up to 50 entries (add / remove / move). Drag operations
 *     commit ONE history entry on dragend, not per-frame.
 *   - Sidebar items: minimum 44px tall, explicit "+" button to
 *     add-to-center, and a one-liner reminding users they can drag
 *     *or* click.
 *   - Block labels: ellipsis (was `word-break: break-all` which
 *     splits CJK and Latin mid-glyph).
 *   - Mobile (<1024px): inspector becomes a fixed bottom-sheet
 *     drawer; toolbar exposes an "Open details" button.
 *
 * Persistence: localStorage on every state change; Export/Import JSON.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComposeBlock,
  ComposeCatalog,
  ComposeConnection,
  ComposeEntity,
  ComposeEntityDetail,
  ComposeEntityKind,
  ComposeState,
} from "../../lib/types";
import {
  applyEntry,
  invertEntry,
  MAX_HISTORY,
  type HistoryEntry,
} from "../../lib/compose-history";
import { api, PilotApiError } from "../../lib/pilot-browser";
import { useT } from "@/components/I18n";

/**
 * Per-kind visual metadata. `label` is a translator function so we
 * can localize the entity names without having to keep them in sync
 * via constants. Emoji + tint stay constant — they map to brand
 * colors that don't vary by locale.
 */
type KindMeta = { label: string; emoji: string; tint: string };
type KindMetaBuilder = (t: (k: string) => string) => KindMeta;
const KIND_META: Record<ComposeEntityKind, KindMetaBuilder> = {
  session: (t) => ({
    label: t("compose.entity.session"),
    emoji: "💬",
    tint: "var(--accent)",
  }),
  pack: (t) => ({
    label: t("compose.entity.pack"),
    emoji: "📦",
    tint: "var(--cozy-accent-2)",
  }),
  profile: (t) => ({
    label: t("compose.entity.profile"),
    emoji: "🎛",
    tint: "var(--cozy-profile)",
  }),
  policy: (t) => ({
    label: t("compose.entity.policy"),
    emoji: "🛡",
    tint: "var(--hitl)",
  }),
  capability: (t) => ({
    label: t("compose.entity.capability"),
    emoji: "🧩",
    tint: "var(--cozy-accent)",
  }),
};

const STORAGE_KEY = "pilot-compose-state";
const VIEW_MODE_KEY = "pilot-compose-view-mode";

/**
 * Visual style of the compose canvas.
 *
 * - `modern` (default): flat SaaS look, dark theme, dotted grid —
 *   consistent with the rest of the Pilot dashboard (v0.4.4).
 * - `cozy`: 2.5D isometric skin per `docs/visual-style.md` Layer 2.
 *   Warm cream background, sage/amber palette, Outfit font, blocks
 *   have pseudo-element "depth faces" so they look like little cubes
 *   on a sandbox. Sandbox-only mode for visual flair.
 */
export type ViewMode = "modern" | "cozy";

interface DragState {
  blockId: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  // Pointer id so we don't lose track of multi-touch
  pointerId: number;
}

interface PendingDrop {
  entity: ComposeEntity;
  x: number;
  y: number;
}

function emptyState(): ComposeState {
  return {
    blocks: [],
    version: 2,
    updatedAt: new Date().toISOString(),
    name: "default",
  };
}

function loadState(): ComposeState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ComposeState> & {
      version?: number;
    };
    // v0.6.7: accept both v1 (no `connections` field) and v2. v1
    // saves load fine — `connections` is treated as `[]` until the
    // user adds an edge. Unknown future versions drop to empty
    // state (we'd rather lose board than silently mis-parse).
    if (
      (parsed.version as number | undefined) !== 1 &&
      (parsed.version as number | undefined) !== 2
    ) {
      return emptyState();
    }
    if (!Array.isArray(parsed.blocks)) return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    } as ComposeState;
  } catch {
    return emptyState();
  }
}

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "modern";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    return raw === "cozy" ? "cozy" : "modern";
  } catch {
    return "modern";
  }
}

function saveViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function saveState(state: ComposeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded — fail silently; user can export/import.
  }
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * v0.6.2: Apply a history entry to a ComposeState. Returns the new
 * state. Pure helper so undo + redo + the live-update after a
 * manual operation all share one code path.
 *
 * `selectId` is also returned so the caller can keep the selection
 * consistent: undoing a remove clears selection; redoing an add
 * selects the new block.
 *
 * (The implementation lives in `lib/compose-history.ts` so tests
 * can import it without rendering the React tree.)
 */

export default function ComposeBoard({
  initialCatalog,
}: {
  initialCatalog: ComposeCatalog;
}) {
  const t = useT();
  // v0.6.6 hydration fix: don't lazy-init from localStorage. SSR
  // and client first render must produce identical UI, so both
  // start from emptyState() / "modern". After hydration, the
  // useEffect below reads localStorage and re-renders. This kills
  // the "0 个块" vs "2 个块" hydration warning that had been
  // silently present since v0.4.4.
  const [state, setState] = useState<ComposeState>(emptyState);
  const [viewMode, setViewMode] = useState<ViewMode>("modern");
  useEffect(() => {
    setState(loadState());
    setViewMode(loadViewMode());
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [filter, setFilter] = useState<"all" | ComposeEntityKind>("all");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<{
    past: HistoryEntry[];
    future: HistoryEntry[];
  }>({ past: [], future: [] });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // v0.6.7: when non-null, the inspector shows a "Connect to..."
  // target picker for this block id. Cleared on dismiss or
  // successful connect.
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  // v0.6.7: which connection line is currently selected (for
  // visual emphasis and future click-to-delete; right now we
  // delete from the inspector list, not the line itself).
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  // v0.6.4: block ids that were just created this frame. Drives the
  // fade-in animation. Cleared automatically 320ms after creation.
  const [justAddedIds, setJustAddedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * v0.6.4: mark a block id as "just added" so the CSS animation
   * fires once, then clear after 320ms (animation runs 220ms; the
   * extra 100ms prevents flicker if the user adds another block
   * quickly).
   */
  const flashBlockAdded = useCallback((id: string) => {
    setJustAddedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setJustAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 320);
  }, []);

  // Persist on every state change.
  useEffect(() => {
    saveState({
      ...state,
      updatedAt: new Date().toISOString(),
    });
  }, [state]);

  // Persist view mode.
  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);

  // Accessibility: announce when blocks are added/removed/moved.
  // We use a polite aria-live region so screen readers speak changes
  // without interrupting the user.
  const [liveMessage, setLiveMessage] = useState("");
  const announce = useCallback((msg: string) => {
    // Clear first so identical consecutive messages still re-announce.
    setLiveMessage("");
    setTimeout(() => setLiveMessage(msg), 50);
  }, []);

  // Build a quick lookup map of catalog entities for hydration.
  const catalogIndex = useMemo(() => {
    const map = new Map<string, ComposeEntity>();
    const collect = (k: ComposeEntityKind, list: ComposeEntity[]) => {
      for (const e of list) map.set(`${k}:${e.id}`, e);
    };
    collect("session", initialCatalog.sessions);
    collect("pack", initialCatalog.packs);
    collect("profile", initialCatalog.profiles);
    collect("policy", initialCatalog.policies);
    collect("capability", initialCatalog.capabilities);
    return map;
  }, [initialCatalog]);

  /**
   * Push a history entry and clear the redo stack. Wraps the state
   * update so the user always sees an undoable operation paired with
   * the state change. `entry` must describe a state transition that
   * the caller has *just* applied (or is about to apply).
   */
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
  }, [state, announce, t]);

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
  }, [state, announce, t]);

  // ─── Drop from sidebar ───────────────────────────────────
  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // If a sidebar item was being dragged, finalize the drop.
      if (pendingDrop && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = Math.max(0, e.clientX - rect.left - 90);
        const y = Math.max(0, e.clientY - rect.top - 30);
        const block: ComposeBlock = {
          id: genId(),
          kind: pendingDrop.entity.kind,
          refId: pendingDrop.entity.id,
          x,
          y,
          label: pendingDrop.entity.label,
          ...(pendingDrop.entity.sublabel !== undefined
            ? { sublabel: pendingDrop.entity.sublabel }
            : {}),
          ...(pendingDrop.entity.href !== undefined
            ? { href: pendingDrop.entity.href }
            : {}),
        };
        commit(
          { type: "add", block },
          () => {
            setState((s) => ({ ...s, blocks: [...s.blocks, block] }));
            setSelectedId(block.id);
            flashBlockAdded(block.id);
          },
          t("compose.announce.addedBlock", { label: pendingDrop.entity.label }),
        );
        setPendingDrop(null);
        // On mobile, surface the new block in the inspector drawer.
        if (window.matchMedia("(max-width: 1023px)").matches) {
          setInspectorOpen(true);
        }
        return;
      }
      // Otherwise it was a canvas drag end — handled by the block.
      if (drag) {
        setDrag(null);
      }
      // Click on empty canvas = deselect.
      if (e.target === e.currentTarget) {
        setSelectedId(null);
      }
    },
    [pendingDrop, drag, commit, t],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, e.clientX - rect.left - drag.offsetX);
      const y = Math.max(0, e.clientY - rect.top - drag.offsetY);
      setState((s) => ({
        ...s,
        blocks: s.blocks.map((b) =>
          b.id === drag.blockId ? { ...b, x, y } : b,
        ),
      }));
    },
    [drag],
  );

  // ─── Sidebar drag (use a custom drag, not HTML5 DnD, for simplicity)
  const startSidebarDrag = useCallback(
    (entity: ComposeEntity, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      // Track mouse globally until pointerup; canvas pointerup will pick it up.
      setPendingDrop({ entity, x: 0, y: 0 });
    },
    [],
  );

  // ─── Block pointer drag ──────────────────────────────────
  const startBlockDrag = useCallback(
    (block: ComposeBlock, e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrag({
        blockId: block.id,
        offsetX: e.clientX - rect.left - block.x,
        offsetY: e.clientY - rect.top - block.y,
        startX: block.x,
        startY: block.y,
        pointerId: e.pointerId,
      });
      setSelectedId(block.id);
    },
    [],
  );

  /**
   * Commit a drag as a single move history entry. Called from the
   * block's pointerup. Skips committing if the block never moved
   * (e.g. accidental click) so undo doesn't fill with no-ops.
   */
  const endBlockDrag = useCallback(
    (blockId: string) => {
      if (!drag) return;
      const final = state.blocks.find((b) => b.id === blockId);
      if (!final) {
        setDrag(null);
        return;
      }
      if (final.x !== drag.startX || final.y !== drag.startY) {
        const entry: HistoryEntry = {
          type: "move",
          blockId,
          fromX: drag.startX,
          fromY: drag.startY,
          toX: final.x,
          toY: final.y,
        };
        setHistory((h) => ({
          past: [...h.past, entry].slice(-MAX_HISTORY),
          future: [],
        }));
      }
      setDrag(null);
    },
    [drag, state.blocks],
  );

  // ─── Keyboard ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Undo / Redo handled here too so users don't have to focus
      // the canvas first. We let the browser's default work for
      // INPUT/TEXTAREA/SELECT (so users can undo inside text fields).
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        if (inField) return;
        e.preventDefault();
        undo();
        return;
      }
      if (
        mod &&
        ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y")
      ) {
        if (inField) return;
        e.preventDefault();
        redo();
        return;
      }

      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Don't capture when typing in inputs
      if (inField) return;
      if (selectedId) {
        e.preventDefault();
        deleteBlock(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, undo, redo]);

  const deleteBlock = useCallback(
    (id: string) => {
      const removed = state.blocks.find((b) => b.id === id);
      if (!removed) return;
      commit(
        { type: "remove", block: removed },
        () => {
          setState((s) => ({
            ...s,
            blocks: s.blocks.filter((b) => b.id !== id),
          }));
          setSelectedId(null);
        },
        t("compose.announce.removedBlock", { label: removed.label }),
      );
    },
    [state.blocks, commit, t],
  );

  /**
   * v0.6.4: duplicate a block in place — new id, same kind/refId/label,
   * offset 24px down-right so the copy is visibly distinct. One history
   * entry (add), so undo removes the copy.
   */
  const duplicateBlock = useCallback(
    (id: string) => {
      const source = state.blocks.find((b) => b.id === id);
      if (!source) return;
      const copy: ComposeBlock = {
        ...source,
        id: genId(),
        x: source.x + 24,
        y: source.y + 24,
      };
      commit(
        { type: "add", block: copy },
        () => {
          setState((s) => ({ ...s, blocks: [...s.blocks, copy] }));
          setSelectedId(copy.id);
          flashBlockAdded(copy.id);
        },
        t("compose.announce.justAdded", { label: copy.label }),
      );
    },
    [state.blocks, commit, t, flashBlockAdded],
  );

  /**
   * v0.6.4: re-order a block within the blocks array. Z-order matters
   * for stacking — later blocks render on top. The history entry is
   * a remove + add pair so undo restores the previous position.
   */
  const moveBlockToIndex = useCallback(
    (id: string, toIndex: number) => {
      const from = state.blocks.findIndex((b) => b.id === id);
      if (from < 0 || from === toIndex) return;
      const block = state.blocks[from];
      if (!block) return;
      const reordered = [...state.blocks];
      reordered.splice(from, 1);
      const clamped = Math.max(0, Math.min(toIndex, reordered.length));
      reordered.splice(clamped, 0, block);
      commit(
        { type: "add", block },
        () => {
          setState((s) => ({ ...s, blocks: reordered }));
          setSelectedId(block.id);
        },
        t("compose.announce.justAdded", { label: block.label }),
      );
    },
    [state.blocks, commit, t],
  );

  /**
   * v0.6.7: add a directed edge from `fromId` to `toId`. Refuses
   * self-loops, duplicate edges, and edges whose endpoints are
   * not in the current block set (e.g. a stale block id left
   * over from a deleted entry).
   */
  const connectBlock = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const conn: ComposeConnection = {
        id: genId(),
        from: fromId,
        to: toId,
      };
      const conns = state.connections ?? [];
      if (conns.some((c) => c.from === fromId && c.to === toId)) return;
      if (
        !state.blocks.some((b) => b.id === fromId) ||
        !state.blocks.some((b) => b.id === toId)
      ) {
        return;
      }
      const fromBlock = state.blocks.find((b) => b.id === fromId);
      const toBlock = state.blocks.find((b) => b.id === toId);
      commit(
        { type: "addConnection", connection: conn },
        () => {
          setState((s) => ({
            ...s,
            connections: [...(s.connections ?? []), conn],
          }));
        },
        t("compose.announce.connectionAdded", {
          from: fromBlock?.label ?? "?",
          to: toBlock?.label ?? "?",
        }),
      );
      setConnectingFromId(null);
    },
    [state.connections, state.blocks, commit, t],
  );

  const disconnectConnection = useCallback(
    (connectionId: string) => {
      const conns = state.connections ?? [];
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      const fromBlock = state.blocks.find((b) => b.id === conn.from);
      const toBlock = state.blocks.find((b) => b.id === conn.to);
      commit(
        { type: "removeConnection", connection: conn },
        () => {
          setState((s) => ({
            ...s,
            connections: (s.connections ?? []).filter(
              (c) => c.id !== connectionId,
            ),
          }));
        },
        t("compose.announce.connectionRemoved", {
          from: fromBlock?.label ?? "?",
          to: toBlock?.label ?? "?",
        }),
      );
    },
    [state.connections, state.blocks, commit, t],
  );

  /**
   * Add a sidebar entity as a block in the canvas center. Used by
   * the explicit "+" button on each sidebar item (and the click
   * fallback). The drag-from-sidebar path lives in onCanvasPointerUp.
   *
   * v0.6.4: the previous version deferred the history push into
   * `queueMicrotask` inside the `setState` updater. React 18
   * Strict Mode runs the updater twice in dev, so the microtask
   * fired twice and history got two entries per click. Moved the
   * side effects out of the updater so dev and prod behave the
   * same.
   */
  const addBlockAtCenter = useCallback(
    (entity: ComposeEntity) => {
      // Stagger new blocks so they don't all stack at (0,0)
      const offset = (state.blocks.length % 6) * 24;
      const block: ComposeBlock = {
        id: genId(),
        kind: entity.kind,
        refId: entity.id,
        x: 40 + offset,
        y: 40 + offset,
        label: entity.label,
        ...(entity.sublabel !== undefined ? { sublabel: entity.sublabel } : {}),
        ...(entity.href !== undefined ? { href: entity.href } : {}),
      };
      setState((s) => ({ ...s, blocks: [...s.blocks, block] }));
      setHistory((h) => ({
        past: [...h.past, { type: "add" as const, block }].slice(-MAX_HISTORY),
        future: [],
      }));
      setSelectedId(block.id);
      flashBlockAdded(block.id);
      announce(t("compose.announce.addedBlock", { label: entity.label }));
    },
    [state.blocks, announce, t, flashBlockAdded],
  );

  /**
   * Move a block by (dx, dy) pixels. Used by arrow-key keyboard
   * navigation in the inspector and on focused blocks.
   */
  const moveBlock = useCallback((id: string, dx: number, dy: number) => {
    setState((s) => {
      const target = s.blocks.find((b) => b.id === id);
      if (!target) return s;
      const next = {
        ...target,
        x: Math.max(0, target.x + dx),
        y: Math.max(0, target.y + dy),
      };
      if (next.x === target.x && next.y === target.y) return s;
      // Arrow-key move is also a history entry, but coalesce
      // rapid presses: if the last entry is a move for the same
      // block, merge by extending its `to` instead of pushing
      // another. The `from` stays pinned to the pre-arrow-key
      // position so undo lands correctly.
      setHistory((h) => {
        const last = h.past[h.past.length - 1];
        if (last && last.type === "move" && last.blockId === id) {
          const merged: HistoryEntry = {
            ...last,
            toX: next.x,
            toY: next.y,
          };
          return {
            past: [...h.past.slice(0, -1), merged],
            future: [],
          };
        }
        const entry: HistoryEntry = {
          type: "move",
          blockId: id,
          fromX: target.x,
          fromY: target.y,
          toX: next.x,
          toY: next.y,
        };
        return {
          past: [...h.past, entry].slice(-MAX_HISTORY),
          future: [],
        };
      });
      return {
        ...s,
        blocks: s.blocks.map((b) => (b.id === id ? next : b)),
      };
    });
  }, []);

  /**
   * Handle keyboard on a focused block: arrow keys move, Delete removes.
   * Inspected at the canvas container level.
   */
  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectedId) return;
      const big = e.shiftKey ? 20 : 5;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          moveBlock(selectedId, -big, 0);
          announce(t("compose.announce.movedLeft", { n: big }));
          break;
        case "ArrowRight":
          e.preventDefault();
          moveBlock(selectedId, big, 0);
          announce(t("compose.announce.movedRight", { n: big }));
          break;
        case "ArrowUp":
          e.preventDefault();
          moveBlock(selectedId, 0, -big);
          announce(t("compose.announce.movedUp", { n: big }));
          break;
        case "ArrowDown":
          e.preventDefault();
          moveBlock(selectedId, 0, big);
          announce(t("compose.announce.movedDown", { n: big }));
          break;
        case "Escape":
          setSelectedId(null);
          announce(t("compose.announce.selectionCleared"));
          break;
      }
    },
    [selectedId, moveBlock, announce, t],
  );

  // ─── Export / Import ─────────────────────────────────────
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pilot-compose-${state.name ?? "default"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(
            String(reader.result),
          ) as Partial<ComposeState> & { version?: number };
          if (
            (parsed.version as number | undefined) !== 1 &&
            (parsed.version as number | undefined) !== 2
          ) {
            alert(t("compose.alert.invalidVersion"));
            return;
          }
          if (!Array.isArray(parsed.blocks)) {
            alert(t("compose.alert.invalidVersion"));
            return;
          }
          setState({
            ...emptyState(),
            ...parsed,
            connections: Array.isArray(parsed.connections)
              ? parsed.connections
              : [],
          });
          // Imported state replaces history; the user can still
          // undo the import itself, but subsequent operations
          // start fresh.
          setHistory({ past: [], future: [] });
          setSelectedId(null);
        } catch (e) {
          alert(
            t("compose.alert.invalidJson", {
              msg: e instanceof Error ? e.message : String(e),
            }),
          );
        }
      };
      reader.readAsText(file);
    },
    [t],
  );

  const resetCanvas = useCallback(() => {
    if (state.blocks.length === 0) return;
    if (!confirm(t("compose.confirm.removeAll"))) return;
    setState(emptyState());
    setSelectedId(null);
    setHistory({ past: [], future: [] });
  }, [state.blocks.length, t]);

  const selectedBlock = selectedId
    ? (state.blocks.find((b) => b.id === selectedId) ?? null)
    : null;

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sections: Array<{
      kind: ComposeEntityKind;
      label: string;
      emoji: string;
      items: ComposeEntity[];
    }> = [];
    const maybe = <K extends ComposeEntityKind>(
      kind: K,
      list: ComposeEntity[],
    ) => {
      if (filter !== "all" && filter !== kind) return;
      const meta = KIND_META[kind](t);
      const items = q
        ? list.filter(
            (e) =>
              e.label.toLowerCase().includes(q) ||
              (e.sublabel?.toLowerCase().includes(q) ?? false),
          )
        : list;
      if (items.length > 0)
        sections.push({
          kind,
          label: meta.label,
          emoji: meta.emoji,
          items,
        });
    };
    maybe("session", initialCatalog.sessions);
    maybe("pack", initialCatalog.packs);
    maybe("profile", initialCatalog.profiles);
    maybe("policy", initialCatalog.policies);
    maybe("capability", initialCatalog.capabilities);
    return sections;
    // t is intentionally stable (from useTranslate); re-running when
    // search/filter/catalog changes is enough.
  }, [initialCatalog, filter, search, t]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <div className="compose-page">
      {/* ─── Toolbar (v0.6.2) ─────────────────────────────── */}
      <div
        className="compose-toolbar"
        role="toolbar"
        aria-label="Compose toolbar"
      >
        <div className="compose-toolbar-group">
          <button
            type="button"
            className="btn small"
            onClick={undo}
            disabled={!canUndo}
            title={t("compose.toolbar.undoTitle")}
            aria-label={t("compose.toolbar.undoTitle")}
          >
            {canUndo
              ? t("compose.toolbar.undoWithCount", {
                  n: history.past.length,
                })
              : `↶ ${t("compose.toolbar.undo")}`}
          </button>
          <button
            type="button"
            className="btn small"
            onClick={redo}
            disabled={!canRedo}
            title={t("compose.toolbar.redoTitle")}
            aria-label={t("compose.toolbar.redoTitle")}
          >
            {canRedo
              ? t("compose.toolbar.redoWithCount", {
                  n: history.future.length,
                })
              : `↷ ${t("compose.toolbar.redo")}`}
          </button>
        </div>
        <span className="compose-toolbar-divider" aria-hidden="true" />
        <div
          className="compose-toolbar-status"
          aria-live="polite"
          aria-atomic="true"
        >
          {t(
            state.blocks.length === 1
              ? "compose.inspector.blockCount.one"
              : "compose.inspector.blockCount.other",
            { n: state.blocks.length },
          )}
        </div>
        <span className="compose-toolbar-spacer" />
        <div
          className="compose-toolbar-skin"
          role="group"
          aria-label={t("compose.toolbar.viewModeLabel")}
          title={t("compose.toolbar.viewModeTooltip")}
        >
          <button
            type="button"
            data-active={viewMode === "modern"}
            onClick={() => setViewMode("modern")}
          >
            {t("compose.toolbar.viewModeModern")}
          </button>
          <button
            type="button"
            data-active={viewMode === "cozy"}
            onClick={() => setViewMode("cozy")}
          >
            {t("compose.toolbar.viewModeCozy")}
          </button>
        </div>
        <span className="compose-toolbar-divider" aria-hidden="true" />
        <div className="compose-toolbar-group">
          <button
            type="button"
            onClick={exportJson}
            className="btn small"
            disabled={state.blocks.length === 0}
            title={t("compose.toolbar.exportTitle")}
            aria-label={t("compose.toolbar.exportTitle")}
          >
            ↓ {t("btn.export")}
          </button>
          <label
            className="btn small secondary"
            title={t("compose.toolbar.importTitle")}
          >
            ↑ {t("btn.import")}
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={resetCanvas}
            className="btn small danger"
            disabled={state.blocks.length === 0}
            title={t("compose.toolbar.clearTitle")}
            aria-label={t("compose.toolbar.clearTitle")}
          >
            {t("btn.clear")}
          </button>
        </div>
        {/* Mobile-only: opens the inspector drawer. */}
        <button
          type="button"
          className="btn small compose-toolbar-inspector-trigger"
          onClick={() => setInspectorOpen(true)}
          aria-label={t("compose.inspector.openDrawer")}
        >
          {t("compose.inspector.openDrawer")}
        </button>
      </div>

      <div className="compose-grid">
        {/* ─── Sidebar ─────────────────────────────────────── */}
        <aside className="compose-sidebar">
          <div className="compose-sidebar-header">
            <input
              type="text"
              placeholder={t("compose.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="compose-search"
              aria-label={t("btn.ariaSearchCatalog")}
            />
            <div className="compose-kind-filter">
              <button
                type="button"
                onClick={() => setFilter("all")}
                data-active={filter === "all"}
              >
                {t("compose.filterAll")}
              </button>
              {(Object.keys(KIND_META) as ComposeEntityKind[]).map((k) => {
                const meta = KIND_META[k](t);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    data-active={filter === k}
                    title={meta.label}
                    aria-label={meta.label}
                  >
                    {meta.emoji}
                  </button>
                );
              })}
            </div>
            <div className="compose-sidebar-affordance">
              <span aria-hidden="true">✋</span>
              {t("compose.sidebar.dragAffordance")}
            </div>
          </div>
          <div className="compose-sidebar-body">
            {filteredCatalog.length === 0 ? (
              <p className="muted small" style={{ padding: "0 12px" }}>
                {t("compose.emptySearch")}
              </p>
            ) : (
              filteredCatalog.map((sec) => (
                <div key={sec.kind} className="compose-section">
                  <h4>
                    <span aria-hidden="true">{sec.emoji}</span>
                    <span>{sec.label}</span>
                  </h4>
                  {sec.items.map((e) => {
                    // v0.6.4: dim the sidebar item the user is currently
                    // dragging out of the sidebar so it's clear which one
                    // is "in hand".
                    const isDragging =
                      pendingDrop !== null &&
                      pendingDrop.entity.id === e.id &&
                      pendingDrop.entity.kind === sec.kind;
                    return (
                      <div
                        key={`${sec.kind}:${e.id}`}
                        className="compose-sidebar-item"
                        data-dragging={isDragging}
                        style={{ borderLeftColor: KIND_META[sec.kind](t).tint }}
                        onPointerDown={(ev) => startSidebarDrag(e, ev)}
                        role="group"
                        aria-label={t("compose.aria.addEntity", {
                          kind: sec.label.toLowerCase(),
                          label: e.label,
                        })}
                        title={t("compose.dragHint")}
                      >
                        <div className="compose-sidebar-body-cell">
                          <div
                            className="compose-sidebar-label"
                            title={e.label}
                          >
                            {e.label}
                          </div>
                          {e.sublabel ? (
                            <div
                              className="compose-sidebar-sublabel"
                              title={e.sublabel}
                            >
                              {e.sublabel}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="compose-sidebar-add"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            addBlockAtCenter(e);
                          }}
                          aria-label={t("compose.sidebar.addAria", {
                            label: e.label,
                          })}
                          title={t("compose.sidebar.addAria", {
                            label: e.label,
                          })}
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ─── Canvas ──────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className={`compose-canvas ${viewMode === "cozy" ? "cozy" : "modern"}`}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onKeyDown={onCanvasKeyDown}
          data-pending={pendingDrop !== null}
          data-mode={viewMode}
          role="region"
          aria-label={t("btn.ariaComposeCanvas")}
          tabIndex={0}
        >
          {/* v0.6.7: SVG overlay for connection lines. Sits at the
              bottom of the canvas z-stack so blocks render on top
              of it. Width/height use the canvas's own dimensions
              (set by CSS) — we draw paths in canvas-relative
              coords because block.x/y are already canvas-relative. */}
          <svg
            className="compose-connections"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {(state.connections ?? []).map((c) => (
              <ConnectionPath
                key={c.id}
                connection={c}
                blocks={state.blocks}
                selected={c.id === selectedConnectionId}
                onSelect={() => setSelectedConnectionId(c.id)}
              />
            ))}
          </svg>

          {state.blocks.length === 0 && !pendingDrop ? (
            <div className="compose-empty" aria-hidden="true">
              <div className="compose-empty-title">
                {t("compose.empty.title")}
              </div>
              <ol className="compose-empty-steps">
                <li data-step="1">{t("compose.empty.step1")}</li>
                <li data-step="2">{t("compose.empty.step2")}</li>
                <li data-step="3">{t("compose.empty.step3")}</li>
              </ol>
              <p className="compose-empty-tip">
                {t("compose.empty.keyboardHint")}
              </p>
            </div>
          ) : null}
          {state.blocks.map((b) => (
            <ComposeBlockView
              key={b.id}
              block={b}
              selected={b.id === selectedId}
              justAdded={justAddedIds.has(b.id)}
              dragging={drag?.blockId === b.id}
              viewMode={viewMode}
              onPointerDown={(e) => startBlockDrag(b, e)}
              onPointerUp={() => endBlockDrag(b.id)}
              onClick={() => {
                setSelectedId(b.id);
                if (
                  typeof window !== "undefined" &&
                  window.matchMedia("(max-width: 1023px)").matches
                ) {
                  setInspectorOpen(true);
                }
              }}
              onDelete={() => deleteBlock(b.id)}
            />
          ))}
          {/* Live region for screen readers */}
          <div
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {liveMessage}
          </div>
        </div>

        {/* ─── Inspector ───────────────────────────────────── */}
        <aside
          className="compose-inspector"
          data-mobile-open={inspectorOpen ? "true" : "false"}
          aria-label={t("compose.inspector")}
        >
          <div className="compose-inspector-header">
            <h3>
              <span aria-hidden="true">🔍</span>
              <span>{t("compose.inspector")}</span>
            </h3>
            <button
              type="button"
              className="compose-inspector-mobile-close"
              onClick={() => setInspectorOpen(false)}
              aria-label={t("compose.inspector.closeDrawer")}
            >
              {t("compose.inspector.closeDrawer")}
            </button>
            <span className="muted small">
              {t(
                state.blocks.length === 1
                  ? "compose.inspector.blockCount.one"
                  : "compose.inspector.blockCount.other",
                { n: state.blocks.length },
              )}
            </span>
          </div>
          {selectedBlock ? (
            <BlockInspector
              block={selectedBlock}
              onDelete={() => deleteBlock(selectedBlock.id)}
              onDuplicate={() => duplicateBlock(selectedBlock.id)}
              onMoveToTop={() =>
                moveBlockToIndex(selectedBlock.id, state.blocks.length - 1)
              }
              onMoveToBottom={() => moveBlockToIndex(selectedBlock.id, 0)}
              catalogEntity={catalogIndex.get(
                `${selectedBlock.kind}:${selectedBlock.refId}`,
              )}
              allBlocks={state.blocks}
              connections={state.connections ?? []}
              connectingFromId={connectingFromId}
              onStartConnect={() => setConnectingFromId(selectedBlock.id)}
              onCancelConnect={() => setConnectingFromId(null)}
              onConnect={(toId) => connectBlock(selectedBlock.id, toId)}
              onDisconnect={disconnectConnection}
            />
          ) : (
            <div className="compose-inspector-empty">
              <p className="muted">
                {t("compose.canvasSelectBlock", {
                  del: "Delete",
                  esc: "Escape",
                })}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Block view ───────────────────────────────────────────

function ComposeBlockView({
  block,
  selected,
  dragging,
  justAdded,
  viewMode,
  onPointerDown,
  onPointerUp,
  onClick,
  onDelete,
}: {
  block: ComposeBlock;
  selected: boolean;
  dragging: boolean;
  justAdded: boolean;
  viewMode: ViewMode;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onClick: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const meta = KIND_META[block.kind](t);
  // In cozy mode we override the border tint per kind with the warm
  // palette so blocks read as "cubes" against cream sand.
  const cozyTint = (
    {
      session: "var(--cozy-accent)",
      pack: "var(--cozy-accent-2)",
      profile: "var(--cozy-text-muted)",
      policy: "var(--hitl)",
      capability: "var(--cozy-accent)",
    } as const
  )[block.kind];
  return (
    <div
      className={`compose-block ${viewMode === "cozy" ? "cozy" : "modern"}`}
      data-selected={selected}
      data-dragging={dragging}
      data-just-added={justAdded}
      data-mode={viewMode}
      style={{
        left: `${block.x}px`,
        top: `${block.y}px`,
        borderColor: viewMode === "cozy" ? cozyTint : meta.tint,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      role="group"
      tabIndex={selected ? 0 : -1}
      aria-label={`${meta.label}: ${block.label}${block.sublabel ? `, ${block.sublabel}` : ""}${selected ? t("compose.aria.selected") : ""}`}
      data-block-id={block.id}
    >
      <button
        type="button"
        className="compose-block-delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={t("btn.ariaRemoveBlock")}
        title={t("compose.removeBlock")}
      >
        ×
      </button>
      <div className="compose-block-header">
        <span className="compose-block-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <span className="compose-block-kind">{meta.label}</span>
      </div>
      <div className="compose-block-label" title={block.label}>
        {block.label}
      </div>
      {block.sublabel ? (
        <div className="compose-block-sublabel" title={block.sublabel}>
          {block.sublabel}
        </div>
      ) : null}
    </div>
  );
}

// ─── Inspector ─────────────────────────────────────────────

function BlockInspector({
  block,
  onDelete,
  onDuplicate,
  onMoveToTop,
  onMoveToBottom,
  catalogEntity,
  allBlocks,
  connections,
  connectingFromId,
  onStartConnect,
  onCancelConnect,
  onConnect,
  onDisconnect,
}: {
  block: ComposeBlock;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  catalogEntity: ComposeEntity | undefined;
  allBlocks: ComposeBlock[];
  connections: ComposeConnection[];
  connectingFromId: string | null;
  onStartConnect: () => void;
  onCancelConnect: () => void;
  onConnect: (toId: string) => void;
  onDisconnect: (connectionId: string) => void;
}) {
  const t = useT();
  const meta = KIND_META[block.kind](t);
  const stale = !catalogEntity;
  const href = block.href ?? catalogEntity?.href;

  // v0.6.5: fetch the real entity detail so the inspector can
  // show actual fields (cwd / size / packages / policy rules /
  // etc.) instead of just the cached label. Re-fetches when the
  // selected block changes; `stale` is handled separately.
  //
  // `hydrated` is the post-hydration guard. During SSR + the first
  // client paint, the detail block must render the same thing on
  // both sides (else React #418 hydration mismatch — `formatRelative`
  // uses `Date.now()` so it diverges between server and client).
  // We keep `detail` undefined until the first useEffect fires, and
  // only render the rich fields after `hydrated` is true.
  const [detail, setDetail] = useState<ComposeEntityDetail | null | undefined>(
    undefined,
  );
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    let cancelled = false;
    setDetail(undefined);
    api
      .composeEntityDetail(block.kind, block.refId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDetail(null);
          if (!(e instanceof PilotApiError && e.status === 404)) {
            console.warn("compose detail fetch failed", e);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [block.kind, block.refId]);

  return (
    <div className="compose-inspector-body">
      <header
        className="compose-inspector-card"
        style={{ borderLeftColor: meta.tint }}
      >
        <span className="emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <div>
          <div className="title" title={block.label}>
            {block.label}
          </div>
          <div className="muted small">
            {meta.label}
            {block.sublabel ? ` · ${block.sublabel}` : ""}
          </div>
        </div>
      </header>

      {stale ? (
        <p className="warn small">⚠ {t("compose.inspector.stale")}</p>
      ) : null}

      <dl className="compose-inspector-fields">
        <dt>id</dt>
        <dd className="mono small" title={block.id}>
          {block.id.slice(0, 8)}
        </dd>
        <dt>kind</dt>
        <dd>{block.kind}</dd>
        <dt>refId</dt>
        <dd className="mono small" title={block.refId}>
          {block.refId}
        </dd>
        <dt>position</dt>
        <dd>
          ({Math.round(block.x)}, {Math.round(block.y)})
        </dd>
      </dl>

      {hydrated && detail !== undefined ? (
        detail === null ? null : (
          <InspectorDetailFields detail={detail} />
        )
      ) : null}

      {/* v0.6.7: connections — incoming + outgoing edges for this
          block, with per-edge disconnect buttons. The "Connect to…"
          button toggles a small picker panel below. */}
      <div className="compose-inspector-connections">
        <div className="compose-inspector-connections-header">
          <h4>{t("compose.inspector.connections")}</h4>
          {connectingFromId === block.id ? (
            <button
              type="button"
              className="btn small secondary"
              onClick={onCancelConnect}
              aria-label={t("compose.inspector.cancelConnect")}
            >
              ✕
            </button>
          ) : allBlocks.length > 1 ? (
            <button
              type="button"
              className="btn small secondary"
              onClick={onStartConnect}
              title={t("compose.inspector.connect")}
            >
              + {t("compose.inspector.connect")}
            </button>
          ) : null}
        </div>
        {connectingFromId === block.id ? (
          <ConnectingPicker
            allBlocks={allBlocks}
            excludeId={block.id}
            existingConnections={connections}
            onPick={onConnect}
            onCancel={onCancelConnect}
          />
        ) : (
          <ConnectionList
            block={block}
            allBlocks={allBlocks}
            connections={connections}
            onDisconnect={onDisconnect}
          />
        )}
      </div>

      <div className="compose-inspector-actions">
        {href ? (
          <a className="btn small" href={href}>
            {t("compose.inspector.openDetail")}
          </a>
        ) : null}
        <button
          type="button"
          className="btn small secondary"
          onClick={onDuplicate}
          title={t("compose.inspector.duplicateTitle")}
          aria-label={t("compose.inspector.duplicateTitle")}
        >
          ⎘ {t("compose.inspector.duplicate")}
        </button>
        <button
          type="button"
          className="btn small secondary"
          onClick={onMoveToTop}
          aria-label={`${t("compose.inspector.moveTop")}`}
        >
          ⤒ {t("compose.inspector.moveTop")}
        </button>
        <button
          type="button"
          className="btn small secondary"
          onClick={onMoveToBottom}
          aria-label={t("compose.inspector.moveBottom")}
        >
          ⤓ {t("compose.inspector.moveBottom")}
        </button>
        <button type="button" className="btn small danger" onClick={onDelete}>
          {t("compose.inspector.remove")}
        </button>
      </div>
    </div>
  );
}

/**
 * v0.6.7: "Connect to..." picker — shown inside the inspector
 * when the user clicks the + button. Lists every other block
 * with a "Connect" button. Already-connected targets are
 * labelled as such so the user knows the edge already exists.
 */
function ConnectingPicker({
  allBlocks,
  excludeId,
  existingConnections,
  onPick,
  onCancel,
}: {
  allBlocks: ComposeBlock[];
  excludeId: string;
  existingConnections: ComposeConnection[];
  onPick: (toId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const candidates = allBlocks.filter((b) => b.id !== excludeId);
  if (candidates.length === 0) {
    return (
      <p className="muted small">{t("compose.inspector.noConnections")}</p>
    );
  }
  return (
    <ul
      className="compose-connect-picker"
      role="listbox"
      aria-label={t("compose.inspector.connectTo", { label: "" })}
    >
      {candidates.map((b) => {
        const alreadyConnected = existingConnections.some(
          (c) => c.from === excludeId && c.to === b.id,
        );
        return (
          <li key={b.id}>
            <button
              type="button"
              className="btn small secondary compose-connect-picker-item"
              disabled={alreadyConnected}
              onClick={() => onPick(b.id)}
              title={b.label}
            >
              <span className="muted small">{KIND_LABEL_FOR(b.kind)}</span>
              <span className="compose-connect-picker-label">{b.label}</span>
              {alreadyConnected ? (
                <span className="muted small">✓</span>
              ) : (
                <span className="muted small">→</span>
              )}
            </button>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          className="btn small secondary"
          onClick={onCancel}
        >
          ✕ {t("compose.inspector.closeDrawer")}
        </button>
      </li>
    </ul>
  );
}

/** Helper: pull the i18n key for a kind label without an i18n
 * function (the picker is rendered above the BlockInspector t). */
function KIND_LABEL_FOR(kind: ComposeEntityKind): string {
  switch (kind) {
    case "session":
      return "💬";
    case "pack":
      return "📦";
    case "profile":
      return "🎛";
    case "policy":
      return "🛡";
    case "capability":
      return "🧩";
  }
}

/**
 * v0.6.7: list the edges touching this block (incoming +
 * outgoing) with per-edge disconnect buttons. Empty state
 * shows a "no connections yet" hint.
 */
function ConnectionList({
  block,
  allBlocks,
  connections,
  onDisconnect,
}: {
  block: ComposeBlock;
  allBlocks: ComposeBlock[];
  connections: ComposeConnection[];
  onDisconnect: (connectionId: string) => void;
}) {
  const t = useT();
  const outgoing = connections.filter((c) => c.from === block.id);
  const incoming = connections.filter((c) => c.to === block.id);
  const all = [
    ...outgoing.map((c) => ({
      c,
      other: allBlocks.find((b) => b.id === c.to),
      dir: "from" as const,
    })),
    ...incoming.map((c) => ({
      c,
      other: allBlocks.find((b) => b.id === c.from),
      dir: "to" as const,
    })),
  ];
  if (all.length === 0) {
    return (
      <p className="muted small">{t("compose.inspector.noConnections")}</p>
    );
  }
  return (
    <ul className="compose-connection-list">
      {all.map(({ c, other, dir }) => (
        <li key={c.id} className="compose-connection-item">
          <span className="muted small" aria-hidden="true">
            {dir === "from" ? "→" : "←"}
          </span>
          <span
            className="compose-connection-label"
            title={other?.label ?? "?"}
          >
            {other?.label ?? "?"}
          </span>
          <button
            type="button"
            className="btn small secondary compose-connection-disconnect"
            onClick={() => onDisconnect(c.id)}
            aria-label={t("compose.inspector.disconnect")}
            title={t("compose.inspector.disconnect")}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * v0.6.5: kind-specific real-entity field renderer. Shows the
 * fields that make the entity actually useful — not just the
 * cached label/sublabel.
 */
function InspectorDetailFields({ detail }: { detail: ComposeEntityDetail }) {
  const t = useT();
  switch (detail.kind) {
    case "session":
      return (
        <dl className="compose-inspector-fields">
          {detail.cwd ? (
            <>
              <dt>{t("compose.inspector.detail.cwd")}</dt>
              <dd className="mono small" title={detail.cwd}>
                {detail.cwd}
              </dd>
            </>
          ) : null}
          {detail.model ? (
            <>
              <dt>{t("compose.inspector.detail.model")}</dt>
              <dd>{detail.model}</dd>
            </>
          ) : null}
          <>
            <dt>{t("compose.inspector.detail.entries")}</dt>
            <dd>{detail.entries}</dd>
          </>
          <>
            <dt>{t("compose.inspector.detail.size")}</dt>
            <dd>{formatBytes(detail.sizeBytes)}</dd>
          </>
          {detail.startedAt ? (
            <>
              <dt>{t("compose.inspector.detail.firstUsed")}</dt>
              <dd className="mono small" title={detail.startedAt}>
                {formatRelative(detail.startedAt)}
              </dd>
            </>
          ) : null}
          {detail.lastUsedAt ? (
            <>
              <dt>{t("compose.inspector.detail.lastUsed")}</dt>
              <dd className="mono small" title={detail.lastUsedAt}>
                {formatRelative(detail.lastUsedAt)}
              </dd>
            </>
          ) : null}
          {detail.firstUserPreview ? (
            <>
              <dt>{t("compose.inspector.detail.preview")}</dt>
              <dd
                className="small"
                style={{ fontStyle: "italic" }}
                title={detail.firstUserPreview}
              >
                “{detail.firstUserPreview}”
              </dd>
            </>
          ) : null}
        </dl>
      );
    case "pack":
      return (
        <dl className="compose-inspector-fields">
          <dt>{t("compose.inspector.detail.source")}</dt>
          <dd className="mono small" title={detail.source}>
            {detail.source}
          </dd>
          <dt>{t("compose.inspector.detail.type")}</dt>
          <dd>{detail.packKind}</dd>
          <dt>{t("compose.inspector.detail.enabled")}</dt>
          <dd>{detail.enabled ? "✓" : "✗"}</dd>
        </dl>
      );
    case "profile":
      return (
        <dl className="compose-inspector-fields">
          {detail.model ? (
            <>
              <dt>{t("compose.inspector.detail.model")}</dt>
              <dd>{detail.model}</dd>
            </>
          ) : null}
          {detail.provider ? (
            <>
              <dt>{t("compose.inspector.detail.provider")}</dt>
              <dd>{detail.provider}</dd>
            </>
          ) : null}
          {detail.thinking ? (
            <>
              <dt>{t("compose.inspector.detail.thinking")}</dt>
              <dd>{detail.thinking}</dd>
            </>
          ) : null}
          {detail.team ? (
            <>
              <dt>{t("compose.inspector.detail.team")}</dt>
              <dd>{detail.team}</dd>
            </>
          ) : null}
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd
                className="small"
                style={{ whiteSpace: "pre-wrap" }}
                title={detail.description}
              >
                {detail.description}
              </dd>
            </>
          ) : null}
          <>
            <dt>{t("compose.inspector.detail.packages")}</dt>
            <dd>
              {detail.packages.length > 0
                ? detail.packages.join(", ")
                : t("compose.inspector.detail.noneCount")}
            </dd>
          </>
        </dl>
      );
    case "policy":
      return (
        <dl className="compose-inspector-fields">
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd
                className="small"
                style={{ whiteSpace: "pre-wrap" }}
                title={detail.description}
              >
                {detail.description}
              </dd>
            </>
          ) : null}
          {renderRuleList(t, t("compose.inspector.detail.allow"), detail.allow)}
          {renderRuleList(t, t("compose.inspector.detail.deny"), detail.deny)}
          {renderRuleList(
            t,
            t("compose.inspector.detail.denyPaths"),
            detail.denyPaths,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.denyCommands"),
            detail.denyCommands,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.sensitivePatterns"),
            detail.sensitivePatterns,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.requireApproval"),
            detail.requireApproval,
          )}
        </dl>
      );
    case "capability":
      return (
        <dl className="compose-inspector-fields">
          {detail.title ? (
            <>
              <dt>{t("compose.inspector.detail.title")}</dt>
              <dd>{detail.title}</dd>
            </>
          ) : null}
          {detail.type ? (
            <>
              <dt>{t("compose.inspector.detail.type")}</dt>
              <dd>{detail.type}</dd>
            </>
          ) : null}
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd
                className="small"
                style={{ whiteSpace: "pre-wrap" }}
                title={detail.description}
              >
                {detail.description}
              </dd>
            </>
          ) : null}
          <dt>{t("compose.inspector.detail.sources")}</dt>
          <dd>
            {detail.sources.length > 0
              ? detail.sources.map((s) => `${s.type}:${s.ref}`).join(", ")
              : t("compose.inspector.detail.noneCount")}
          </dd>
          {detail.conflicts.length > 0 ? (
            <>
              <dt>{t("compose.inspector.detail.conflicts")}</dt>
              <dd>{detail.conflicts.join(", ")}</dd>
            </>
          ) : null}
          {detail.requires.length > 0 ? (
            <>
              <dt>{t("compose.inspector.detail.requires")}</dt>
              <dd>{detail.requires.join(", ")}</dd>
            </>
          ) : null}
        </dl>
      );
  }
}

function renderRuleList(
  t: (k: string) => string,
  label: string,
  items: string[],
) {
  return (
    <>
      <dt>
        {label} ({items.length})
      </dt>
      <dd
        className="small"
        title={
          items.length > 0
            ? items.join("\n")
            : t("compose.inspector.detail.noneCount")
        }
      >
        {items.length > 0
          ? items.join(", ")
          : t("compose.inspector.detail.noneCount")}
      </dd>
    </>
  );
}

/** Format bytes as KB / MB so the inspector shows something readable. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format an ISO timestamp as a short relative time. Avoids a
 * runtime dep on a date-fns-style library — the inspector is a
 * small surface, "3 days ago" is enough.
 */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

/**
 * v0.6.7: one connection line as an SVG path. Reads the from/to
 * block's position + dimensions from the blocks array and draws
 * a cubic bezier between the right edge of `from` and the left
 * edge of `to`. Block dimensions are pinned to the ComposeBlockView
 * styles (220×80-ish) — if those change, update BLOCK_W / BLOCK_H
 * below.
 */
const BLOCK_W = 220;
const BLOCK_H = 80;

function ConnectionPath({
  connection,
  blocks,
  selected,
  onSelect,
}: {
  connection: ComposeConnection;
  blocks: ComposeBlock[];
  selected: boolean;
  onSelect: () => void;
}) {
  const from = blocks.find((b) => b.id === connection.from);
  const to = blocks.find((b) => b.id === connection.to);
  if (!from || !to) return null;
  const x1 = from.x + BLOCK_W;
  const y1 = from.y + BLOCK_H / 2;
  const x2 = to.x;
  const y2 = to.y + BLOCK_H / 2;
  const dx = Math.max(Math.abs(x2 - x1) / 2, 60);
  const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  return (
    <g
      data-connection-id={connection.id}
      data-selected={selected}
      className="compose-connection-path"
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={selected ? 2.5 : 1.5}
        opacity={selected ? 1 : 0.6}
      />
    </g>
  );
}
