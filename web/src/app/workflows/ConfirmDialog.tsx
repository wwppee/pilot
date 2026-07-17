"use client";

/**
 * v0.7.1: small confirmation dialog used by /workflows list
 * + editor for destructive actions (delete). Replaces the
 * `window.confirm()` call that v0.7.0 used — `window.confirm`
 * is a native OS dialog that doesn't match the rest of
 * Pilot's UI (e.g. the NewWorkflowDialog in the same file,
 * the RenameDialog in /compose/boards) and freezes the
 * main thread on Chromium-based browsers.
 *
 * The dialog is intentionally minimal: a title, a
 * description line, two buttons. No portal, no animation —
 * the rest of Pilot's dialogs (RenameDialog, NewWorkflowDialog)
 * follow the same "fixed inset-0 overlay + a surface card"
 * pattern, so this matches the visual language.
 *
 * The parent owns the `open` state and gets the
 * confirmation via `onConfirm` (called when the user
 * clicks the confirm button) or `onCancel` (called when
 * they click cancel / press Esc / click the backdrop).
 * The dialog itself doesn't know what "confirming" means.
 */

import { useCallback, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  "data-testid"?: string;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  "data-testid": testId,
}: Props) {
  // Esc to cancel — standard modal behavior. We don't trap
  // focus inside the dialog yet (would need a real focus
  // trap library); the buttons are at the bottom of a
  // small card so tabbing reaches them quickly. v0.7.1+ UI
  // polish can add a proper focus trap.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  // Focus the cancel button on open so Enter doesn't
  // accidentally fire the destructive action.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only close if the click is on the backdrop itself,
      // not on the card (the card's children would also
      // bubble up).
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      onClick={handleBackdrop}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="surface rounded-lg p-5 w-full max-w-md space-y-3 outline-none"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-[var(--text-muted)]">{description}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn small secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn small ${destructive ? "" : "primary"}`}
            // v0.7.1: the destructive variant intentionally
            // does NOT get the .primary class so it doesn't
            // look like a positive action — the red-ish tint
            // comes from the existing `:hover` rules on
            // .btn.secondary in the global stylesheet. If
            // we add a destructive palette token later
            // (e.g. `bg-error`), this is the one spot to
            // switch to it.
            style={
              destructive
                ? { color: "var(--error)", borderColor: "var(--error)" }
                : undefined
            }
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
