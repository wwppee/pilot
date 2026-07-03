"use client";

/**
 * ComposeBoard — the interactive canvas for the /compose page.
 *
 * Layout (CSS grid):
 *
 *   ┌──────────┬─────────────────┬──────────────┐
 *   │ Sidebar  │   Canvas (SVG)  │  Inspector   │
 *   │ 280px    │   flex-1        │  320px       │
 *   │          │                 │              │
 *   └──────────┴─────────────────┴──────────────┘
 *
 * Interaction:
 *   - Sidebar item: drag-and-drop onto canvas (HTML5 DnD via Pointer Events)
 *   - Canvas block: pointer-drag to move; click to select
 *   - Selected block: shown in Inspector with metadata + actions
 *   - Delete: click ✕ on block, or Delete/Backspace when selected
 *   - Save/load: localStorage on every change, plus Export/Import JSON
 *
 * Why client-only:
 *   - Pointer Events for drag
 *   - localStorage for persistence
 *   - File API for import/export
 *
 * Persistence strategy:
 *   - Auto-save to `localStorage["pilot-compose-state"]` on every change
 *   - Export = download current state as JSON
 *   - Import = upload JSON, validate against ComposeState shape, merge
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComposeBlock,
  ComposeCatalog,
  ComposeEntity,
  ComposeEntityKind,
  ComposeState,
} from "../../lib/types";

const KIND_META: Record<
  ComposeEntityKind,
  { label: string; emoji: string; tint: string }
> = {
  session: { label: "Session", emoji: "💬", tint: "var(--accent)" },
  pack: { label: "Pack", emoji: "📦", tint: "#d49050" },
  profile: { label: "Profile", emoji: "🎛", tint: "#7b8fa1" },
  policy: { label: "Policy", emoji: "🛡", tint: "#9c5fbb" },
  capability: { label: "Capability", emoji: "🧩", tint: "#4f7a64" },
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
    version: 1,
    updatedAt: new Date().toISOString(),
    name: "default",
  };
}

function loadState(): ComposeState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as ComposeState;
    if (parsed.version !== 1 || !Array.isArray(parsed.blocks)) {
      return emptyState();
    }
    return parsed;
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

export default function ComposeBoard({
  initialCatalog,
}: {
  initialCatalog: ComposeCatalog;
}) {
  const [state, setState] = useState<ComposeState>(() => loadState());
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [filter, setFilter] = useState<"all" | ComposeEntityKind>("all");
  const [search, setSearch] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

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
        setState((s) => ({ ...s, blocks: [...s.blocks, block] }));
        setSelectedId(block.id);
        setPendingDrop(null);
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
    [pendingDrop, drag],
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
        pointerId: e.pointerId,
      });
      setSelectedId(block.id);
    },
    [],
  );

  // ─── Keyboard ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (selectedId) {
        e.preventDefault();
        deleteBlock(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const deleteBlock = useCallback(
    (id: string) => {
      setState((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }));
      setSelectedId(null);
      const removed = state.blocks.find((b) => b.id === id);
      if (removed) announce(`Removed block ${removed.label}`);
    },
    [announce, state.blocks],
  );

  /**
   * Add a sidebar entity as a block in the canvas center.
   * Used by keyboard users (Enter on a sidebar item) and as a
   * fallback for mouse users who don't want to drag.
   */
  const addBlockAtCenter = useCallback(
    (entity: ComposeEntity) => {
      setState((s) => {
        // Stagger new blocks so they don't all stack at (0,0)
        const offset = (s.blocks.length % 6) * 24;
        const block: ComposeBlock = {
          id: genId(),
          kind: entity.kind,
          refId: entity.id,
          x: 40 + offset,
          y: 40 + offset,
          label: entity.label,
          ...(entity.sublabel !== undefined
            ? { sublabel: entity.sublabel }
            : {}),
          ...(entity.href !== undefined ? { href: entity.href } : {}),
        };
        return { ...s, blocks: [...s.blocks, block] };
      });
      setSelectedId(/* will be set after state update */ null);
      announce(`Added ${entity.label} block to canvas`);
    },
    [announce],
  );

  /**
   * Move a block by (dx, dy) pixels. Used by arrow-key keyboard
   * navigation in the inspector and on focused blocks.
   */
  const moveBlock = useCallback((id: string, dx: number, dy: number) => {
    setState((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.id === id
          ? { ...b, x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) }
          : b,
      ),
    }));
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
          announce(`Moved block left ${big} pixels`);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveBlock(selectedId, big, 0);
          announce(`Moved block right ${big} pixels`);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveBlock(selectedId, 0, -big);
          announce(`Moved block up ${big} pixels`);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveBlock(selectedId, 0, big);
          announce(`Moved block down ${big} pixels`);
          break;
        case "Escape":
          setSelectedId(null);
          announce("Selection cleared");
          break;
      }
    },
    [selectedId, moveBlock, announce],
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

  const importJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ComposeState;
        if (parsed.version !== 1 || !Array.isArray(parsed.blocks)) {
          alert("Invalid compose file (version mismatch)");
          return;
        }
        setState(parsed);
      } catch (e) {
        alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const resetCanvas = useCallback(() => {
    if (state.blocks.length === 0) return;
    if (!confirm("Remove all blocks from the canvas?")) return;
    setState(emptyState());
    setSelectedId(null);
  }, [state.blocks.length]);

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
      label: string,
      emoji: string,
      list: ComposeEntity[],
    ) => {
      if (filter !== "all" && filter !== kind) return;
      const items = q
        ? list.filter(
            (e) =>
              e.label.toLowerCase().includes(q) ||
              (e.sublabel?.toLowerCase().includes(q) ?? false),
          )
        : list;
      if (items.length > 0) sections.push({ kind, label, emoji, items });
    };
    maybe("session", "Sessions", "💬", initialCatalog.sessions);
    maybe("pack", "Packs", "📦", initialCatalog.packs);
    maybe("profile", "Profiles", "🎛", initialCatalog.profiles);
    maybe("policy", "Policies", "🛡", initialCatalog.policies);
    maybe("capability", "Capabilities", "🧩", initialCatalog.capabilities);
    return sections;
  }, [initialCatalog, filter, search]);

  return (
    <div className="compose-grid">
      {/* ─── Sidebar ─────────────────────────────────────── */}
      <aside className="compose-sidebar">
        <div className="compose-sidebar-header">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="compose-search"
            aria-label="Search catalog"
          />
          <div className="compose-kind-filter">
            <button
              type="button"
              onClick={() => setFilter("all")}
              data-active={filter === "all"}
            >
              all
            </button>
            {(Object.keys(KIND_META) as ComposeEntityKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                data-active={filter === k}
                title={KIND_META[k].label}
              >
                {KIND_META[k].emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="compose-sidebar-body">
          {filteredCatalog.length === 0 ? (
            <p className="muted small">
              No matches. Adjust the filter or search.
            </p>
          ) : (
            filteredCatalog.map((sec) => (
              <div key={sec.kind} className="compose-section">
                <h4>
                  <span>{sec.emoji}</span> {sec.label}
                </h4>
                {sec.items.map((e) => (
                  <button
                    type="button"
                    key={`${sec.kind}:${e.id}`}
                    className="compose-sidebar-item"
                    style={{ borderLeftColor: KIND_META[sec.kind].tint }}
                    onPointerDown={(ev) => startSidebarDrag(e, ev)}
                    onClick={() => addBlockAtCenter(e)}
                    aria-label={`Add ${sec.label.toLowerCase()} "${e.label}" to canvas`}
                    title="Drag to canvas, or press Enter to add to center"
                  >
                    <div className="compose-sidebar-label">{e.label}</div>
                    {e.sublabel ? (
                      <div className="compose-sidebar-sublabel">
                        {e.sublabel}
                      </div>
                    ) : null}
                  </button>
                ))}
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
        aria-label="Compose canvas. When a block is selected, use arrow keys to move it, Delete to remove, Escape to deselect."
        tabIndex={0}
      >
        {state.blocks.length === 0 && !pendingDrop ? (
          <div className="compose-empty">
            <p>
              👆 Drag from the sidebar to add blocks. Keyboard users: Tab to a
              sidebar item and press <kbd>Enter</kbd>.
            </p>
          </div>
        ) : null}
        {state.blocks.map((b) => (
          <ComposeBlockView
            key={b.id}
            block={b}
            selected={b.id === selectedId}
            dragging={drag?.blockId === b.id}
            viewMode={viewMode}
            onPointerDown={(e) => startBlockDrag(b, e)}
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
      <aside className="compose-inspector">
        <div className="compose-inspector-header">
          <h3>Inspector</h3>
          <span className="muted small">
            {state.blocks.length} block
            {state.blocks.length === 1 ? "" : "s"}
          </span>
        </div>
        {selectedBlock ? (
          <BlockInspector
            block={selectedBlock}
            onDelete={() => deleteBlock(selectedBlock.id)}
            catalogEntity={catalogIndex.get(
              `${selectedBlock.kind}:${selectedBlock.refId}`,
            )}
          />
        ) : (
          <div className="compose-inspector-empty">
            <p className="muted">
              Click a block on the canvas to inspect it. Press <kbd>Delete</kbd>{" "}
              to remove the selected one.
            </p>
          </div>
        )}
        <div className="compose-inspector-footer">
          <button
            type="button"
            onClick={() =>
              setViewMode(viewMode === "modern" ? "cozy" : "modern")
            }
            className="btn small"
            data-active={viewMode === "cozy"}
            title={
              viewMode === "modern"
                ? "Switch to 2.5D cozy sandbox skin"
                : "Switch back to modern flat look"
            }
          >
            {viewMode === "modern" ? "🌿 Cozy" : "🌑 Modern"}
          </button>
          <span className="compose-inspector-divider" />
          <button type="button" onClick={exportJson} className="btn small">
            Export
          </button>
          <label className="btn small secondary">
            Import
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
          >
            Clear
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─── Block view ───────────────────────────────────────────

function ComposeBlockView({
  block,
  selected,
  dragging,
  viewMode,
  onPointerDown,
  onDelete,
}: {
  block: ComposeBlock;
  selected: boolean;
  dragging: boolean;
  viewMode: ViewMode;
  onPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
}) {
  const meta = KIND_META[block.kind];
  // In cozy mode we override the border tint per kind with the warm
  // palette so blocks read as "cubes" against cream sand.
  const cozyTint = (
    {
      session: "var(--cozy-accent)",
      pack: "var(--cozy-accent-2)",
      profile: "var(--cozy-text-muted)",
      policy: "#9c5fbb",
      capability: "var(--cozy-accent)",
    } as const
  )[block.kind];
  return (
    <div
      className={`compose-block ${viewMode === "cozy" ? "cozy" : "modern"}`}
      data-selected={selected}
      data-dragging={dragging}
      data-mode={viewMode}
      style={{
        left: `${block.x}px`,
        top: `${block.y}px`,
        borderColor: viewMode === "cozy" ? cozyTint : meta.tint,
      }}
      onPointerDown={onPointerDown}
      role="group"
      tabIndex={selected ? 0 : -1}
      aria-label={`${meta.label}: ${block.label}${block.sublabel ? `, ${block.sublabel}` : ""}${selected ? ", selected" : ""}`}
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
        aria-label="Remove block"
        title="Remove block"
      >
        ×
      </button>
      <div className="compose-block-header">
        <span className="compose-block-emoji">{meta.emoji}</span>
        <span className="compose-block-kind">{meta.label}</span>
      </div>
      <div className="compose-block-label">{block.label}</div>
      {block.sublabel ? (
        <div className="compose-block-sublabel">{block.sublabel}</div>
      ) : null}
    </div>
  );
}

// ─── Inspector ─────────────────────────────────────────────

function BlockInspector({
  block,
  onDelete,
  catalogEntity,
}: {
  block: ComposeBlock;
  onDelete: () => void;
  catalogEntity: ComposeEntity | undefined;
}) {
  const meta = KIND_META[block.kind];
  const stale = !catalogEntity;
  const href = block.href ?? catalogEntity?.href;
  return (
    <div className="compose-inspector-body">
      <header
        className="compose-inspector-card"
        style={{ borderLeftColor: meta.tint }}
      >
        <span className="emoji">{meta.emoji}</span>
        <div>
          <div className="title">{block.label}</div>
          <div className="muted small">
            {meta.label}
            {block.sublabel ? ` · ${block.sublabel}` : ""}
          </div>
        </div>
      </header>

      {stale ? (
        <p className="warn small">
          ⚠ Not in current catalog — entity may have been deleted. Block is
          preserved with cached label.
        </p>
      ) : null}

      <dl className="compose-inspector-fields">
        <dt>id</dt>
        <dd className="mono small">{block.id.slice(0, 8)}</dd>
        <dt>kind</dt>
        <dd>{block.kind}</dd>
        <dt>refId</dt>
        <dd className="mono small">{block.refId}</dd>
        <dt>position</dt>
        <dd>
          ({Math.round(block.x)}, {Math.round(block.y)})
        </dd>
      </dl>

      <div className="compose-inspector-actions">
        {href ? (
          <a className="btn small" href={href}>
            Open detail page →
          </a>
        ) : null}
        <button type="button" className="btn small danger" onClick={onDelete}>
          Remove
        </button>
      </div>
    </div>
  );
}
