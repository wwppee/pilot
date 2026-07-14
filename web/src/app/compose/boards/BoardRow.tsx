"use client";

/**
 * v0.6.12: a single row in the /compose/boards list.
 *
 * Pure presentational — receives the board summary + a set of
 * action callbacks from `BoardListView`. Keeps `BoardListView`
 * free of row-level JSX so the table can re-render thousands
 * of rows (in practice: hundreds) without re-allocating the
 * big parent tree.
 */

import { useT } from "@/components/I18n";
import type { BoardSummary } from "@/lib/types";

interface Props {
  board: BoardSummary;
  checked: boolean;
  onToggle: (on: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
}

function formatUpdated(iso: string): string {
  // The server's updatedAt is ISO 8601 in UTC. We format a
  // compact "YYYY-MM-DD HH:MM" in the user's local TZ — same
  // convention as the rest of Pilot's date displays. Locale-
  // aware (Intl) is overkill for a compact stamp.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BoardRow({
  board,
  checked,
  onToggle,
  onRename,
  onDelete,
  onShare,
}: Props) {
  const t = useT();
  const blocksLabel = t(
    board.blockCount === 1
      ? "compose.boards.column.blocks.one"
      : "compose.boards.column.blocks.other",
    { n: board.blockCount },
  );
  const connsLabel = t(
    board.connectionCount === 1
      ? "compose.boards.column.connections.one"
      : "compose.boards.column.connections.other",
    { n: board.connectionCount },
  );

  return (
    <tr className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-hover)]">
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={t("compose.boards.bulk.selected", { n: checked ? 1 : 0 })}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{board.name}</span>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {board.id}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums align-top">
        {board.blockCount}{" "}
        <span className="text-[var(--text-muted)]">{blocksLabel}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums align-top">
        {board.connectionCount}{" "}
        <span className="text-[var(--text-muted)]">{connsLabel}</span>
      </td>
      <td className="px-3 py-2 align-top text-[var(--text-muted)] tabular-nums">
        {formatUpdated(board.updatedAt)}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <a
            href={`/compose?board=${encodeURIComponent(board.id)}`}
            className="btn small"
            title={t("compose.boards.openTitle")}
            aria-label={t("compose.boards.openTitle")}
          >
            {t("compose.boards.open")}
          </a>
          <button
            type="button"
            className="btn small secondary"
            onClick={onRename}
            title={t("compose.boards.action.renameTitle")}
            aria-label={t("compose.boards.action.renameTitle")}
          >
            {t("compose.boards.action.rename")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={onShare}
            title={t("compose.boards.action.shareTitle")}
            aria-label={t("compose.boards.action.shareTitle")}
          >
            {t("compose.boards.action.share")}
          </button>
          <button
            type="button"
            className="btn small danger"
            onClick={onDelete}
            title={t("compose.boards.action.deleteTitle")}
            aria-label={t("compose.boards.action.deleteTitle")}
          >
            {t("compose.boards.action.delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}
