"use client";

/**
 * v0.6.12: /compose/boards list view.
 *
 * Pure client component — data is fetched on mount via the
 * /api/pilot/* proxy (token stays server-side), and all
 * mutations (rename / delete / copy-as-JSON) flow through the
 * same browser-side api. Reloading the list after a mutation
 * is a single `api.composeBoards()` call, no diffing needed
 * (cheap enough on summary shape).
 *
 * States: loading | ok | error. Empty is `ok` with `[]`.
 *
 * Bulk operations: a Set<id> tracks the user's selection;
 * a sticky bottom bar appears once any row is selected.
 *
 * Live-region announcements: a visually-hidden <div> mirrors
 * every successful action so screen readers can confirm "board
 * X deleted" without focus shifting.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/pilot-browser";
import { useT } from "@/components/I18n";
import type { BoardSummary } from "@/lib/types";
import { BoardRow } from "./BoardRow";
import { RenameDialog } from "./RenameDialog";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; boards: BoardSummary[] }
  | { kind: "error"; message: string };

export function BoardListView() {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<BoardSummary | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const boards = await api.composeBoards();
      setState({ kind: "ok", boards });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  // Expose the latest reload to the imperative handlers below
  // without re-creating them on every render.
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const toggleSelected = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // (kept for future: toggle-all is wired below)

  const allVisibleIds =
    state.kind === "ok" ? state.boards.map((b) => b.id) : [];
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(allVisibleIds));
  }, [allSelected, allVisibleIds]);

  // ─── Handlers ───────────────────────────────────────

  const onRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      await api.renameComposeBoard(renaming.id, newName);
      announce(t("compose.boards.announce.renamed", { name: newName }));
      setRenaming(null);
      await reloadRef.current();
    },
    [renaming, announce, t],
  );

  const onDeleteOne = useCallback(
    async (board: BoardSummary) => {
      const ok = window.confirm(
        t("compose.boards.confirm.delete", { name: board.name }),
      );
      if (!ok) return;
      await api.deleteComposeBoard(board.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(board.id);
        return next;
      });
      announce(t("compose.boards.announce.deleted", { name: board.name }));
      await reloadRef.current();
    },
    [announce, t],
  );

  const onShareOne = useCallback(
    async (board: BoardSummary) => {
      const full = await api.composeBoard(board.id);
      if (!full) {
        window.alert(t("compose.boards.error.title"));
        return;
      }
      const payload = {
        id: board.id,
        name: board.name,
        version: 3 as const,
        blocks: full.blocks,
        connections: full.connections ?? [],
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      announce(t("compose.boards.announce.copied", { name: board.name }));
    },
    [announce, t],
  );

  const onDeleteBulk = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = window.confirm(
      t("compose.boards.confirm.bulkDelete", { n: ids.length }),
    );
    if (!ok) return;
    let failed = 0;
    for (const id of ids) {
      try {
        await api.deleteComposeBoard(id);
      } catch {
        failed++;
      }
    }
    setSelected(new Set());
    if (failed > 0) {
      // v0.6.13: was a hardcoded `(${failed} failed)` suffix
      // appended to an English message; i18n key with both
      // {n} and {m} placeholders now produces "已删除 N 个
      // 画板，M 个失败" in zh.
      window.alert(
        t("compose.boards.announce.bulkDeletedWithFailures", {
          n: ids.length - failed,
          m: failed,
        }),
      );
    } else {
      announce(t("compose.boards.announce.bulkDeleted", { n: ids.length }));
    }
    await reloadRef.current();
  }, [selected, announce, t]);

  const onShareBulk = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const payloads: Array<{
      id: string;
      name: string;
      version: 3;
      blocks: unknown[];
      connections: unknown[];
    }> = [];
    for (const id of ids) {
      try {
        const full = await api.composeBoard(id);
        const summary =
          state.kind === "ok" ? state.boards.find((b) => b.id === id) : null;
        if (full && summary) {
          payloads.push({
            id,
            name: summary.name,
            version: 3,
            blocks: full.blocks,
            connections: full.connections ?? [],
          });
        }
      } catch {
        // Skip individual failures — announce later
      }
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payloads, null, 2));
      announce(
        t("compose.boards.announce.copied", {
          name: t("compose.boards.bulk.selected", { n: payloads.length }),
        }),
      );
    } catch (e) {
      window.alert(
        t("compose.boards.error.title") +
          `: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [selected, state, announce, t]);

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Live region for screen-reader announcements. Always
          present in the DOM so SR can pick up changes without
          focus shifting. */}
      <div
        ref={(el) => {
          // No-op; keeps the ref pattern for future focus mgmt.
          if (el) {
            el.dataset["mounted"] = "1";
          }
        }}
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Toolbar row — select-all + bulk bar */}
      {state.kind === "ok" && state.boards.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label={
                allSelected
                  ? t("compose.boards.bulk.clear")
                  : t("compose.boards.bulk.selectAll")
              }
            />
            <span>
              {t("compose.boards.bulk.selected", { n: selected.size })}
            </span>
          </label>
        </div>
      )}

      {/* State: loading */}
      {state.kind === "loading" && (
        <div
          className="surface rounded-lg p-6 text-sm text-[var(--text-muted)]"
          role="status"
        >
          {t("compose.boards.loading")}
        </div>
      )}

      {/* State: error */}
      {state.kind === "error" && (
        <div className="surface rounded-lg p-6 text-sm space-y-2">
          <p className="font-semibold">{t("compose.boards.error.title")}</p>
          <p className="text-[var(--text-muted)]">
            {t("compose.boards.error.hint")}
          </p>
          <p className="text-[var(--text-muted)] text-xs font-mono">
            {state.message}
          </p>
          <button
            type="button"
            className="btn small"
            onClick={() => void reload()}
          >
            {t("compose.boards.error.retry")}
          </button>
        </div>
      )}

      {/* State: ok-empty */}
      {state.kind === "ok" && state.boards.length === 0 && (
        <div className="surface rounded-lg p-6 text-sm space-y-3">
          <p className="font-semibold">{t("compose.boards.empty.title")}</p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            {t("compose.boards.empty.hint")}
          </p>
          <p>
            <a href="/compose" className="text-[var(--accent)] hover:underline">
              {t("compose.boards.empty.cta")} →
            </a>
          </p>
        </div>
      )}

      {/* State: ok-with-rows */}
      {state.kind === "ok" && state.boards.length > 0 && (
        <div
          className="surface rounded-lg overflow-hidden"
          role="region"
          aria-label={t("compose.boards.title")}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <th
                  className="px-3 py-2 w-8"
                  aria-label={t("compose.boards.column.selectAria")}
                />
                <th className="px-3 py-2">{t("compose.boards.column.name")}</th>
                <th className="px-3 py-2 w-24 text-right">
                  {t("compose.boards.column.blocks.one")}
                </th>
                <th className="px-3 py-2 w-32 text-right">
                  {t("compose.boards.column.connections.one")}
                </th>
                <th className="px-3 py-2 w-44">
                  {t("compose.boards.column.updated")}
                </th>
                <th className="px-3 py-2 w-44 text-right">
                  {t("compose.boards.column.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.boards.map((board) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  checked={selected.has(board.id)}
                  onToggle={(on) => toggleSelected(board.id, on)}
                  onRename={() => setRenaming(board)}
                  onDelete={() => void onDeleteOne(board)}
                  onShare={() => void onShareOne(board)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk action bar — sticky bottom when anything is selected */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 surface rounded-full shadow-lg px-4 py-2 flex items-center gap-3 text-sm"
          role="region"
          aria-label={t("compose.boards.bulk.selected", { n: selected.size })}
        >
          <span className="font-medium">
            {t("compose.boards.bulk.selected", { n: selected.size })}
          </span>
          <button
            type="button"
            className="btn small danger"
            onClick={() => void onDeleteBulk()}
          >
            {t("compose.boards.bulk.deleteSelected")}
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => void onShareBulk()}
          >
            {t("compose.boards.bulk.copySelected")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setSelected(new Set())}
          >
            {t("compose.boards.bulk.clear")}
          </button>
        </div>
      )}

      {/* Rename modal — only mounted while a board is being renamed */}
      {renaming && (
        <RenameDialog
          board={renaming}
          onCancel={() => setRenaming(null)}
          onConfirm={(name) => onRenameConfirm(name)}
        />
      )}
    </div>
  );
}
