/**
 * BubbleActions — small hover menu for chat bubbles. v0.5.16+
 * exposes `onFork` so each user bubble can spawn a new branch.
 *
 * The fork flow is two-step:
 *   1. Click "Fork from here" → opens a confirm panel
 *   2. Confirm → parent calls `get_fork_messages` to map the
 *      bubble's local id to pi's `entryId`, then `fork(entryId)`
 *
 * We keep the confirm step explicit because forking creates a new
 * session file — easy to undo but disruptive if accidental.
 */
"use client";

import { useState } from "react";
import { T, useT } from "@/components/I18n";

export function BubbleActions({
  onFork,
  disabled,
}: {
  /** Async so the parent can show a busy state while resolving
   * entryId + calling `fork()`. */
  onFork: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (disabled) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onFork();
      setConfirming(false);
    } catch {
      // Stay open on error so the user can retry / cancel.
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 transition-opacity"
        title={t("try.session.forkHere")}
      >
        <T k="try.session.forkHere" />
      </button>
    );
  }

  return (
    <div className="text-xs surface-2 rounded p-2 space-y-2 mt-1 max-w-xs">
      <p className="text-[var(--text-muted)]">
        <T k="try.session.forkConfirm" />
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="btn"
        >
          <T k="try.session.forkButton" />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="btn secondary"
        >
          <T k="try.session.forkCancel" />
        </button>
      </div>
    </div>
  );
}
