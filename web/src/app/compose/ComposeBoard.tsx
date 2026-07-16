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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  BoardSummary,
  BoardInput,
  ComposeBlock,
  ComposeCatalog,
  ComposeConnection,
  ComposeEntity,
  ComposeEntityKind,
  ComposeState,
  ConnectionLabelKind,
} from "../../lib/types";
import {
  applyEntry,
  invertEntry,
  MAX_HISTORY,
  type HistoryEntry,
} from "../../lib/compose-history";
import { api } from "../../lib/pilot-browser";
import { useT } from "@/components/I18n";
import { BlockInspector, KIND_META } from "./Inspector";
import { BLOCK_H, BLOCK_W, ConnectionPath } from "./ConnectionPath";

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

const STORAGE_KEY = "pilot-compose-state";
const VIEW_MODE_KEY = "pilot-compose-view-mode";

function emptyState(): ComposeState {
  return {
    blocks: [],
    version: 6 as const,
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
    // v0.6.9: accept v1 (blocks only), v2 (blocks + connections),
    // v3 (connections may carry `label` + `kind`). v0.6.18 adds
    // v4 with `dir`, v0.6.19 adds v5 with `color`, v0.6.20 adds
    // v6 with `route`. All six load fine because the new fields
    // are optional — the schema validates on save but the
    // in-memory shape is backward-compatible. Unknown future
    // versions drop to empty state (we'd rather lose the board
    // than silently mis-parse).
    const v = parsed.version as number | undefined;
    if (v !== 1 && v !== 2 && v !== 3 && v !== 4 && v !== 5 && v !== 6) {
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
 * v0.6.11: shared validation for any "create a connection" path
 * (drag-to-create from the canvas handle, or the inspector
 * picker). Returns the new `ComposeConnection` if it's allowed,
 * or `null` if the request is rejected:
 *
 *   - self-loop (from === to)
 *   - duplicate edge (same from + to already exists)
 *   - stale endpoint (block was deleted between drag start
 *     and drop)
 *
 * Pure function of `state` — UI side effects (commit, setState,
 * announce, flip selection) stay in the caller's closure.
 */
function buildConnectionIfValid(
  fromId: string,
  toId: string,
  state: ComposeState,
  // v0.6.18: pass dir so the dedupe check considers
  // (from, to, dir) as the unique key — the same (from, to)
  // pair can have up to three connections (one per direction).
  dir: "forward" | "backward" | "bidirectional" = "forward",
): ComposeConnection | null {
  if (fromId === toId) return null;
  const conns = state.connections ?? [];
  if (
    conns.some(
      (c) => c.from === fromId && c.to === toId && (c.dir ?? "forward") === dir,
    )
  ) {
    return null;
  }
  if (
    !state.blocks.some((b) => b.id === fromId) ||
    !state.blocks.some((b) => b.id === toId)
  ) {
    return null;
  }
  return { id: genId(), from: fromId, to: toId, dir };
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
  // v0.6.8: in-flight connection drag. The user pointerdown'd on
  // a block's right-edge handle; we're tracking the cursor to
  // draw a ghost line, and pointerup will resolve to either a
  // new connection (target block under cursor) or a cancel
  // (empty canvas / outside). Canvas-relative coords (block.x/y
  // space) so we can reuse the same SVG overlay.
  const [pendingConnection, setPendingConnection] = useState<{
    fromId: string;
    pointerX: number;
    pointerY: number;
  } | null>(null);
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

  // v0.6.10: server-side board persistence. `serverPanel` is the
  // currently-open affordance (`save` or `load`); the actual state
  // for each lives in dedicated refs/states below. Status reflects
  // the in-flight request so the panel can show "Saving…" or
  // "Save failed" without a global toast.
  const [serverPanel, setServerPanel] = useState<"save" | "load" | null>(null);
  const [boardNameInput, setBoardNameInput] = useState("");
  const [boardList, setBoardList] = useState<BoardSummary[]>([]);
  const [boardListLoaded, setBoardListLoaded] = useState(false);
  type BoardStatus =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; id: string }
    | { kind: "error"; msg: string };
  const [boardStatus, setBoardStatus] = useState<BoardStatus>({ kind: "idle" });
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

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
      // v0.6.8: resolve an in-flight connection drag. We do this
      // FIRST (before sidebar drop / block drag), because a
      // connection drag never involves a block move — the handle
      // is on the block, not the block body, and the handle
      // pointerdown calls e.stopPropagation() to prevent the
      // block from interpreting it as a drag start. Mirrors the
      // inspector's `connectBlock` path but inlined here because
      // `connectBlock` is defined further down in the file and
      // this callback must close over `state` + `commit` (which
      // ARE available up here).
      if (pendingConnection) {
        const fromId = pendingConnection.fromId;
        const stack =
          typeof document.elementsFromPoint === "function"
            ? document.elementsFromPoint(e.clientX, e.clientY)
            : [];
        const targetEl = stack.find(
          (el) => el instanceof HTMLElement && el.dataset.blockId,
        );
        const targetId =
          targetEl instanceof HTMLElement
            ? (targetEl.dataset.blockId ?? null)
            : null;
        if (targetId) {
          // v0.6.11: shared validation with the inspector picker
          // (rejects self-loop / duplicate / stale endpoint).
          const newConn = buildConnectionIfValid(fromId, targetId, state);
          if (newConn) {
            const toBlock = state.blocks.find((b) => b.id === targetId);
            const labelFrom =
              state.blocks.find((b) => b.id === fromId)?.label ?? "";
            commit(
              { type: "addConnection", connection: newConn },
              () => {
                setState((s) => ({
                  ...s,
                  connections: [...(s.connections ?? []), newConn],
                }));
                setSelectedId(targetId);
              },
              t("compose.announce.connectionAdded", {
                from: labelFrom,
                to: toBlock?.label ?? "?",
              }),
            );
          }
        }
        setPendingConnection(null);
        return;
      }
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
    [pendingConnection, pendingDrop, drag, state, commit, t],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // v0.6.8: connection drag in progress — track the pointer
      // for the ghost line. (Block drag below is mutually
      // exclusive: `startBlockDrag` clears pendingConnection.)
      if (pendingConnection && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setPendingConnection({
          fromId: pendingConnection.fromId,
          pointerX: e.clientX - rect.left,
          pointerY: e.clientY - rect.top,
        });
        return;
      }
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
    [drag, pendingConnection],
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

  // ─── Connection drag (v0.6.8) ────────────────────────────
  // v0.6.8: pointerdown on a block's right-edge handle starts
  // a connection drag. We stopPropagation so the block itself
  // doesn't interpret the gesture as a move, and capture the
  // pointer on the handle so it tracks even when the cursor
  // leaves the block.
  const startConnectionDrag = useCallback(
    (block: ComposeBlock, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // The handle sits at the right edge mid-height; the ghost
      // line is drawn from that anchor to the current pointer.
      // The anchor is `(block.x + BLOCK_W, block.y + BLOCK_H/2)`
      // — see the SVG overlay below, which re-computes it from
      // `from.x` + `from.y` to keep the anchor a pure function
      // of the block's grid position (no separate ref to thread
      // through React state). Block dim is 220×80
      // (BLOCK_W/BLOCK_H in ConnectionPath).
      //
      // v0.6.13: removed the leftover "handleCanvasX/Y" mention
      // — that variable was already deleted by the v0.6.11
      // P3.12 refactor and the reference was a stale breadcrumb
      // that pointed at code that no longer existed.
      setPendingConnection({
        fromId: block.id,
        pointerX: e.clientX - rect.left,
        pointerY: e.clientY - rect.top,
      });
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
   *
   * v0.6.11: validation extracted to `buildConnectionIfValid` so
   * the drag-to-create path in `onCanvasPointerUp` shares the
   * same predicate. UI side effects (commit, setState, announce)
   * stay here.
   */
  const connectBlock = useCallback(
    (fromId: string, toId: string) => {
      const conn = buildConnectionIfValid(fromId, toId, state);
      if (!conn) return;
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

  // v0.6.9: edit a connection's free-text label and/or semantic
  // kind. The inputs are committed one entry at a time so undo
  // can step through character-by-character edits — same pattern
  // drag-to-move uses (one entry per drag-end, not per frame).
  const updateConnectionLabel = useCallback(
    (
      connectionId: string,
      nextLabel: string | undefined,
      nextKind: ConnectionLabelKind | undefined,
    ) => {
      const conns = state.connections ?? [];
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      // Empty string vs undefined: an empty textbox is the user's
      // way to clear the label. Normalize to undefined so the
      // SVG renderer can use `connection.label ? ...` without
      // worrying about empty strings. The ConnectionList <select>
      // never passes "" (it maps "" → undefined on the way out),
      // so we only normalise the label here.
      const normLabel = nextLabel?.trim() === "" ? undefined : nextLabel;
      // History entry uses "" to mean "clear this field" (vs the
      // original value which may also have been undefined → "").
      // Undefined can't appear inside an entry because
      // exactOptionalPropertyTypes won't let us build a literal
      // `label: undefined` field. See compose-history.ts.
      const fromLabel = conn.label ?? "";
      const toLabel = normLabel ?? "";
      const fromKind: ConnectionLabelKind | "" = conn.kind ?? "";
      const toKind: ConnectionLabelKind | "" = nextKind ?? "";
      if (fromLabel === toLabel && fromKind === toKind) return;
      commit(
        {
          type: "updateConnectionLabel",
          connectionId,
          fromLabel,
          toLabel,
          fromKind,
          toKind,
        },
        () => {
          setState((s) => ({
            ...s,
            connections: (s.connections ?? []).map((c) => {
              if (c.id !== connectionId) return c;
              const next: ComposeConnection = { ...c };
              if (normLabel === undefined) {
                delete next.label;
              } else {
                next.label = normLabel;
              }
              if (nextKind === undefined) {
                delete next.kind;
              } else {
                next.kind = nextKind;
              }
              return next;
            }),
          }));
        },
        t("compose.announce.connectionLabelUpdated", {
          label: normLabel ?? "",
        }),
      );
    },
    [state.connections, commit, t],
  );

  // v0.6.18: edit a connection's direction (forward / backward /
  // bidirectional). Kept separate from `updateConnectionLabel` so
  // the history entry shape stays narrow — one entry per
  // concern, instead of one entry that mixes label / kind / dir
  // (the latter would mean undoing a dir change also undid an
  // unrelated label edit, which is the wrong granularity for
  // an undo stack).
  const updateConnectionDir = useCallback(
    (
      connectionId: string,
      nextDir: "forward" | "backward" | "bidirectional",
    ) => {
      const conns = state.connections ?? [];
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      // Treat missing as "forward" so the no-op short-circuit
      // works against the actual rendered value, not a literal
      // undefined.
      const fromDir = conn.dir ?? "forward";
      if (fromDir === nextDir) return;
      commit(
        {
          type: "updateConnectionDir",
          connectionId,
          fromDir,
          toDir: nextDir,
        },
        () => {
          setState((s) => ({
            ...s,
            connections: (s.connections ?? []).map((c) => {
              if (c.id !== connectionId) return c;
              const next: ComposeConnection = { ...c };
              if (nextDir === "forward") {
                // v0.6.18: forward is the default — drop the
                // field so the JSON stays minimal and
                // duplicate-against-old-boards comparisons
                // don't have to consider both `undefined` and
                // `"forward"` as the same value (they are).
                delete next.dir;
              } else {
                next.dir = nextDir;
              }
              return next;
            }),
          }));
        },
        t("compose.announce.connectionDirUpdated", {
          dir: t(`compose.connection.dir.${nextDir}`),
        }),
      );
    },
    [state.connections, commit, t],
  );

  // v0.6.19: per-edge color override. Same history pattern as
  // `updateConnectionDir` — separate entry type so undoing a
  // color change doesn't undo a label or dir change. Empty /
  // undefined color means "use theme accent", which we encode
  // by deleting the `color` key on the connection object.
  //
  // The shape is intentionally symmetric to `updateConnectionDir`:
  // one concern, one entry, before/after values. That makes the
  // undo stack predictable — each Cmd-Z steps one logical
  // change, not a multi-field bundle.
  const updateConnectionColor = useCallback(
    (connectionId: string, nextColor: string | undefined) => {
      const conns = state.connections ?? [];
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      const fromColor = conn.color ?? "";
      const toColor = nextColor ?? "";
      if (fromColor === toColor) return;
      commit(
        {
          type: "updateConnectionColor",
          connectionId,
          fromColor,
          toColor,
        },
        () => {
          setState((s) => ({
            ...s,
            connections: (s.connections ?? []).map((c) => {
              if (c.id !== connectionId) return c;
              const next: ComposeConnection = { ...c };
              if (toColor === "") {
                // No override → drop the field. The renderer
                // falls back to the theme accent. Same pattern
                // as `updateConnectionDir` for `forward`.
                delete next.color;
              } else {
                next.color = toColor;
              }
              return next;
            }),
          }));
        },
        t("compose.announce.connectionColorUpdated", {
          color: toColor || t("compose.connection.color.default"),
        }),
      );
    },
    [state.connections, commit, t],
  );

  // v0.6.20: change a connection's routing style. Same
  // pattern as `updateConnectionDir` / `updateConnectionColor`:
  // separate history entry type, omit-the-default semantics,
  // one concern per entry. `curve` is the default — when the
  // user picks "curve" we drop the `route` key from the
  // connection so the saved JSON stays minimal and a v0.6.19
  // board round-trips through v0.6.20 byte-identical.
  const updateConnectionRoute = useCallback(
    (connectionId: string, nextRoute: "curve" | "orthogonal") => {
      const conns = state.connections ?? [];
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      const fromRoute = conn.route ?? "";
      if (fromRoute === nextRoute) return;
      commit(
        {
          type: "updateConnectionRoute",
          connectionId,
          fromRoute,
          toRoute: nextRoute,
        },
        () => {
          setState((s) => ({
            ...s,
            connections: (s.connections ?? []).map((c) => {
              if (c.id !== connectionId) return c;
              const next: ComposeConnection = { ...c };
              if (nextRoute === "curve") {
                // Default — drop the field. Same pattern
                // as `updateConnectionDir` for `forward` and
                // `updateConnectionColor` for empty-string.
                delete next.route;
              } else {
                next.route = nextRoute;
              }
              return next;
            }),
          }));
        },
        t("compose.announce.connectionRouteUpdated", {
          route: t(`compose.connection.route.${nextRoute}`),
        }),
      );
    },
    [state.connections, commit, t],
  );

  // ─── Server-side board persistence (v0.6.10) ────────────
  //
  // The web's localStorage is the canonical editor. These handlers
  // mirror the canvas state to `~/.pilot/compose-boards/<id>.json`
  // (on the server) so the user can move between machines / share
  // a layout. The dedicated /compose/boards list page with rename
  // + multi-delete lands in v0.6.11; for now the toolbar gives
  // us Save / Load affordances that hit the same API.

  const openSavePanel = useCallback(() => {
    setBoardNameInput(state.name ?? "");
    setBoardStatus({ kind: "idle" });
    setServerPanel("save");
  }, [state.name]);

  const openLoadPanel = useCallback(async () => {
    setServerPanel("load");
    if (boardListLoaded) return;
    try {
      const list = await api.composeBoards();
      setBoardList(list);
      setBoardListLoaded(true);
    } catch (e) {
      console.warn("composeBoards list fetch failed", e);
      // Show empty list + the user can retry by reopening the panel.
      setBoardList([]);
      setBoardListLoaded(true);
    }
  }, [boardListLoaded]);

  const closeServerPanel = useCallback(() => {
    setServerPanel(null);
    setBoardStatus({ kind: "idle" });
  }, []);

  const saveBoardToServer = useCallback(async () => {
    const name = boardNameInput.trim();
    if (!name) {
      setBoardStatus({ kind: "error", msg: t("compose.board.namePrompt") });
      return;
    }
    setBoardStatus({ kind: "saving" });
    try {
      // v0.6.11: same-name detection. The previous logic only
      // reused the last-saved id when `state.name === name` — so
      // renaming to "x", saving, renaming back to the original,
      // and saving again would create a duplicate board. We now
      // hit the server's list and match by name. If a different
      // id already owns this name, confirm the overwrite
      // explicitly before clobbering it.
      const sameName = await api
        .composeBoards()
        .then((list) => list.find((b) => b.name === name));
      let id: string;
      if (sameName) {
        if (sameName.id !== lastSavedId) {
          const ok = window.confirm(t("compose.board.confirmOverwrite"));
          if (!ok) {
            setBoardStatus({ kind: "idle" });
            return;
          }
        }
        id = sameName.id;
      } else if (lastSavedId && state.name === name) {
        // Fast path: same name we just saved under. Reuse the id
        // without a round-trip to the list endpoint.
        id = lastSavedId;
      } else {
        id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      // v0.6.11: only ship the fields the server's `BoardInput`
      // schema actually accepts. We don't send `id` (the path
      // owns file identity) or `updatedAt` (the server fills it
      // in from `now()` — the old version shipped a stale
      // client-side timestamp that the server then overwrote,
      // adding a round-trip's worth of clock skew).
      const payload: BoardInput = {
        name,
        blocks: state.blocks,
        connections: state.connections ?? [],
        version: state.version,
      };
      const saved = await api.saveComposeBoard(id, payload);
      setLastSavedId(saved.id);
      setBoardStatus({ kind: "saved", id: saved.id });
      // Update the local state.name so subsequent saves with the
      // same name hit the same id (overwrite path). Conditional
      // mutation + `delete` keeps exactOptionalPropertyTypes happy
      // (we can't spread `{name: undefined}` onto a slot typed
      // `name?: string`).
      setState((s) => {
        const next: ComposeState = { ...s };
        if (name) next.name = name;
        else delete next.name;
        return next;
      });
      // Refresh the load-list cache so the new board shows up.
      setBoardListLoaded(false);
      announce(t("compose.board.saved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBoardStatus({ kind: "error", msg });
      announce(t("compose.board.saveError"));
    }
  }, [boardNameInput, state, lastSavedId, announce, t]);

  const loadBoardFromServer = useCallback(
    async (id: string) => {
      try {
        const loaded = await api.composeBoard(id);
        if (!loaded) {
          setBoardStatus({ kind: "error", msg: t("compose.board.loadError") });
          return;
        }
        // The server returns a plain ComposeState (no `id` field on
        // state, but `name` and `updatedAt` are server-managed).
        // Replace the local canvas wholesale — v0.6.10 first cut
        // doesn't try to merge. `name` is optional in the type
        // so we conditionally spread to avoid the
        // exactOptionalPropertyTypes trap.
        const next: ComposeState = {
          blocks: loaded.blocks,
          connections: loaded.connections ?? [],
          version: loaded.version,
          updatedAt: loaded.updatedAt,
          ...(loaded.name ? { name: loaded.name } : {}),
        };
        setState(next);
        setLastSavedId(id);
        setSelectedId(null);
        setHistory({ past: [], future: [] });
        setServerPanel(null);
        setBoardStatus({ kind: "idle" });
        announce(t("compose.board.loaded"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setBoardStatus({ kind: "error", msg });
        announce(t("compose.board.loadError"));
      }
    },
    [announce, t],
  );

  // v0.6.12: when the user lands on /compose?board=<id> (from
  // the Boards list page's "Open" button), auto-load that board.
  // We only fire the load once per id — the effect tracks the
  // last id it triggered on, so re-renders (catalog fetch, state
  // updates) don't re-fire. After loading we strip `?board=`
  // from the URL so a refresh doesn't silently reload on top of
  // any in-progress local edits.
  const searchParams = useSearchParams();
  const requestedBoardId = searchParams.get("board");
  const lastAutoLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedBoardId) return;
    if (lastAutoLoadRef.current === requestedBoardId) return;
    lastAutoLoadRef.current = requestedBoardId;
    void loadBoardFromServer(requestedBoardId);
    // Strip the param without a navigation. Using `replace`
    // (not `push`) avoids polluting the back stack with the
    // URL that already served its purpose.
    const url = new URL(window.location.href);
    url.searchParams.delete("board");
    window.history.replaceState({}, "", url.toString());
  }, [requestedBoardId, loadBoardFromServer]);

  const deleteServerBoard = useCallback(
    async (id: string) => {
      const ok = window.confirm(t("compose.board.confirmDelete"));
      if (!ok) return;
      try {
        const removed = await api.deleteComposeBoard(id);
        if (!removed) {
          setBoardStatus({
            kind: "error",
            msg: t("compose.board.deleteError"),
          });
          return;
        }
        setBoardList((list) => list.filter((b) => b.id !== id));
        if (lastSavedId === id) setLastSavedId(null);
        announce(t("compose.board.deleted"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setBoardStatus({ kind: "error", msg });
        announce(t("compose.board.deleteError"));
      }
    },
    [lastSavedId, announce, t],
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
          // v0.6.11: accept v3 (v0.6.9 added connection label +
          // kind, but the export format is still ComposeState v3).
          // v0.6.9 export could only round-trip through a manual
          // edit, which broke the toolbar Export → Import loop.
          if (
            (parsed.version as number | undefined) !== 1 &&
            (parsed.version as number | undefined) !== 2 &&
            (parsed.version as number | undefined) !== 3
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
            onClick={openSavePanel}
            className="btn small"
            disabled={state.blocks.length === 0}
            title={t("compose.toolbar.saveTitle")}
            aria-label={t("compose.toolbar.saveTitle")}
            data-active={serverPanel === "save"}
          >
            ↑ {t("compose.toolbar.saveTitle")}
          </button>
          <button
            type="button"
            onClick={openLoadPanel}
            className="btn small secondary"
            title={t("compose.toolbar.loadTitle")}
            aria-label={t("compose.toolbar.loadTitle")}
            data-active={serverPanel === "load"}
          >
            ↓ {t("compose.toolbar.loadTitle")}
          </button>
          {/* v0.6.12: link out to the dedicated /compose/boards
              list page (multi-board picker + rename + bulk delete
              + copy-as-JSON share). The dropdown panel above stays
              in scope for quick in-canvas save/load; this is the
              "manage many boards" surface. */}
          <Link
            href="/compose/boards"
            className="btn small secondary"
            title={t("compose.boards.toolbar.openBoardsTitle")}
            aria-label={t("compose.boards.toolbar.openBoardsTitle")}
          >
            ≡ {t("compose.boards.toolbar.openBoards")}
          </Link>
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

      {/* v0.6.10: server-side board panels. Save / Load open as
          absolute-positioned dropdowns anchored to the toolbar —
          lighter than a modal and easier to keep state-resident.
          The dedicated /compose/boards list page lands in v0.6.11
          with full rename / multi-delete. */}
      {serverPanel ? (
        <div
          className="compose-server-panel"
          role="dialog"
          aria-label={
            serverPanel === "save"
              ? t("compose.toolbar.saveTitle")
              : t("compose.toolbar.loadTitle")
          }
        >
          <div className="compose-server-panel-header">
            <strong>
              {serverPanel === "save"
                ? t("compose.toolbar.saveTitle")
                : t("compose.toolbar.loadTitle")}
            </strong>
            <button
              type="button"
              className="btn small secondary"
              onClick={closeServerPanel}
              aria-label="×"
              title="×"
            >
              ×
            </button>
          </div>
          {serverPanel === "save" ? (
            <div className="compose-server-panel-body">
              <label className="muted small" htmlFor="compose-board-name">
                {t("compose.board.namePrompt")}
              </label>
              <input
                id="compose-board-name"
                type="text"
                className="compose-board-name-input"
                value={boardNameInput}
                placeholder={t("compose.board.namePlaceholder")}
                onChange={(e) => setBoardNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveBoardToServer();
                }}
                autoFocus
              />
              {boardStatus.kind === "error" ? (
                <p className="compose-board-status error small">
                  {boardStatus.msg}
                </p>
              ) : null}
              {boardStatus.kind === "saved" ? (
                <p className="compose-board-status success small">
                  ✓ {t("compose.board.saved")} · {boardStatus.id}
                </p>
              ) : null}
              <div className="compose-server-panel-actions">
                <button
                  type="button"
                  className="btn small"
                  onClick={saveBoardToServer}
                  disabled={boardStatus.kind === "saving"}
                >
                  {boardStatus.kind === "saving"
                    ? t("compose.board.saving")
                    : t("compose.toolbar.saveTitle")}
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={closeServerPanel}
                >
                  {t("btn.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="compose-server-panel-body">
              {boardList.length === 0 ? (
                <p className="muted small">{t("compose.board.empty")}</p>
              ) : (
                <ul className="compose-board-list">
                  {boardList.map((b) => (
                    <li key={b.id} className="compose-board-list-item">
                      <button
                        type="button"
                        className="compose-board-list-item-load"
                        onClick={() => loadBoardFromServer(b.id)}
                        title={b.id}
                      >
                        <span className="compose-board-list-name">
                          {b.name || b.id}
                        </span>
                        <span className="muted small">
                          {b.blockCount}{" "}
                          {t(
                            b.blockCount === 1
                              ? "compose.boardList.blockCount.one"
                              : "compose.boardList.blockCount.other",
                          )}{" "}
                          · {b.connectionCount}{" "}
                          {t(
                            b.connectionCount === 1
                              ? "compose.boardList.connectionCount.one"
                              : "compose.boardList.connectionCount.other",
                          )}{" "}
                          · {b.updatedAt.slice(0, 10)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={() => deleteServerBoard(b.id)}
                        aria-label={t("compose.board.confirmDelete")}
                        title={t("compose.board.confirmDelete")}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {boardStatus.kind === "error" ? (
                <p className="compose-board-status error small">
                  {boardStatus.msg}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

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
            {/* v0.6.9: arrowhead <marker>s. Two flavors so the
                selected edge can swap to a brighter head without
                duplicating geometry. `fill="context-stroke"` would
                also work in newer browsers but we keep the explicit
                `currentColor` so the path's own `color` CSS rule
                drives both line and head. */}
            <defs>
              <marker
                id="compose-arrow-default"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
              <marker
                id="compose-arrow-selected"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {(state.connections ?? []).map((c) => (
              <ConnectionPath
                key={c.id}
                connection={c}
                blocks={state.blocks}
                selected={c.id === selectedConnectionId}
                onSelect={() => setSelectedConnectionId(c.id)}
              />
            ))}
            {/* v0.6.8: ghost line for in-flight connection drag.
                Drawn from the source block's right-edge handle to
                the current pointer. Resets to null on cancel/finish. */}
            {pendingConnection
              ? (() => {
                  const from = state.blocks.find(
                    (b) => b.id === pendingConnection.fromId,
                  );
                  if (!from) return null;
                  const x1 = from.x + BLOCK_W;
                  const y1 = from.y + BLOCK_H / 2;
                  const x2 = pendingConnection.pointerX;
                  const y2 = pendingConnection.pointerY;
                  const dx = Math.max(Math.abs(x2 - x1) / 2, 60);
                  return (
                    <path
                      className="compose-connection-ghost"
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${
                        x2 - dx
                      } ${y2}, ${x2} ${y2}`}
                      fill="none"
                    />
                  );
                })()
              : null}
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
              onHandlePointerDown={(e) => startConnectionDrag(b, e)}
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
              onUpdateLabel={updateConnectionLabel}
              onUpdateDir={updateConnectionDir}
              onUpdateColor={updateConnectionColor}
              onUpdateRoute={updateConnectionRoute}
            />
          ) : (
            <div className="compose-inspector-empty">
              <p className="muted">{t("compose.canvasSelectBlock.keys")}</p>
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
  onHandlePointerDown,
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
  onHandlePointerDown: (e: React.PointerEvent) => void;
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
      {/* v0.6.8: right-edge connector handle. Visible only when
          the block is selected (otherwise it adds noise to the
          canvas). pointerdown is captured here so the gesture
          never bubbles to the block body (which would start a
          block-move drag). */}
      {selected ? (
        <button
          type="button"
          className="compose-block-handle"
          data-conn-handle="true"
          onPointerDown={onHandlePointerDown}
          onClick={(e) => e.stopPropagation()}
          aria-label={t("compose.handle.aria")}
          title={t("compose.handle.title")}
        />
      ) : null}
    </div>
  );
}
