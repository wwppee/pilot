"use client";

/**
 * v0.6.12: rename dialog for a board.
 *
 * Local modal — we could reach for the browser's `prompt()` but
 * (a) it doesn't accept placeholders / labels, (b) it's blocked
 * in some sandboxed iframes (the Next.js dev preview can hit
 * this), and (c) we need i18n-aware placeholder + a "200 char
 * remaining" hint. A real modal is the right tool.
 *
 * Submit validation: name must be non-empty (after trim) and
 * ≤ 200 chars. We mirror the server's own validation rules so
 * the user sees a 400-style error inline rather than a flash
 * of "rename failed" from the network round-trip.
 *
 * Accessibility: focus the input on mount, return focus to
 * the row on close (via the parent re-rendering without this
 * dialog), Esc cancels, Enter submits.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import type { BoardSummary } from "@/lib/types";

const MAX_LENGTH = 200;

interface Props {
  board: BoardSummary;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void>;
}

export function RenameDialog({ board, onCancel, onConfirm }: Props) {
  const t = useT();
  const [value, setValue] = useState(board.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus + select-all on mount so the user can either accept
    // (Enter) or type a new name in one keystroke.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Esc cancels; Enter submits (when the input is focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError(t("compose.boards.renameDialog.label"));
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      // v0.6.13: was `Max ${MAX_LENGTH} characters` hardcoded;
      // i18n key with a placeholder lets zh users see "最多 200
      // 个字符" instead of the English error.
      setError(
        t("compose.boards.renameDialog.maxLengthError", { n: MAX_LENGTH }),
      );
      return;
    }
    if (trimmed === board.name) {
      onCancel();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
      onClick={(e) => {
        // Backdrop click cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="surface rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 id="rename-dialog-title" className="text-lg font-semibold">
          {t("compose.boards.renameDialog.title")}
        </h2>
        <label className="block text-sm space-y-1.5">
          <span className="text-[var(--text-muted)]">
            {t("compose.boards.renameDialog.label")}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={t("compose.boards.renameDialog.placeholder")}
            maxLength={MAX_LENGTH}
            className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-1.5"
            disabled={submitting}
          />
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {value.length}/{MAX_LENGTH}
          </span>
        </label>
        {error && (
          <p className="text-sm text-[var(--danger,#c44)]" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn small secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            {t("compose.boards.renameDialog.cancel")}
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => void submit()}
            disabled={submitting || value.trim().length === 0}
          >
            {t("compose.boards.renameDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
