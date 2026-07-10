/**
 * SessionPanel — header strip showing the current pi session and
 * tree actions (rename / clone). The companion per-bubble fork
 * menu lives in `BubbleActions.tsx`.
 *
 * v0.5.17: added a `compact` prop for mobile — the rename + clone
 * buttons are hidden on small viewports; the page wires them into
 * an overflow menu elsewhere. The session name + message count
 * stay inline so users still see what session they're in.
 */
"use client";

import { useEffect, useState } from "react";
import { T, useT } from "@/components/I18n";

/**
 * Loose-typed RpcSessionState — narrowed from pi's SDK so the web
 * bundle stays light.
 */
export type SessionState = {
  sessionId: string;
  sessionName: string;
  sessionFile: string;
  messageCount: number;
  isStreaming: boolean;
};

export function emptySessionState(): SessionState {
  return {
    sessionId: "",
    sessionName: "",
    sessionFile: "",
    messageCount: 0,
    isStreaming: false,
  };
}

export function SessionPanel({
  sessionState,
  onRename,
  onClone,
  forkedFrom,
  compact = false,
}: {
  sessionState: SessionState;
  onRename: (name: string) => Promise<void> | void;
  onClone: () => Promise<void> | void;
  forkedFrom: string | null;
  /** Mobile / narrow: hide the rename + clone buttons (caller
   * puts them in an overflow menu). Defaults to false. */
  compact?: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraftName(sessionState.sessionName);
  }, [sessionState.sessionName, editing]);

  const startEdit = () => {
    setDraftName(sessionState.sessionName);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftName(sessionState.sessionName);
  };

  const saveEdit = async () => {
    const next = draftName.trim();
    if (next === sessionState.sessionName) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setEditing(false);
    } catch {
      // Stay in edit mode on error so the user can retry.
    } finally {
      setBusy(false);
    }
  };

  const displayName = sessionState.sessionName || t("try.session.unnamed");
  const countKey =
    sessionState.messageCount === 1
      ? "try.session.messageCount.one"
      : "try.session.messageCount.other";

  // Mobile compact: name + count as a single line, no rename
  // button, no clone button. Caller wires those into an
  // overflow menu elsewhere on the page.
  if (compact) {
    return (
      <div className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap text-sm min-h-[44px]">
        <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide shrink-0">
          <T k="try.session.title" />
        </span>
        <span className="font-medium truncate flex-1 min-w-0">
          {displayName}
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">
          {t(countKey, { count: sessionState.messageCount })}
        </span>
        {forkedFrom && (
          <span
            className="text-xs text-[var(--text-muted)] italic shrink-0"
            title={forkedFrom}
          >
            <T k="try.session.forkedFrom" params={{ name: forkedFrom }} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap text-sm min-h-[44px]">
      <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide shrink-0 hidden sm:inline">
        <T k="try.session.title" />
      </span>

      {editing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            placeholder={t("try.session.renamePlaceholder")}
            autoFocus
            disabled={busy}
            className="flex-1 min-w-0 surface-2 rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy || !draftName.trim()}
            className="btn"
          >
            <T k="try.session.renameSave" />
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={busy}
            className="btn secondary"
          >
            <T k="try.session.renameCancel" />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            id="session-panel-rename-btn"
            onClick={startEdit}
            disabled={!sessionState.sessionId}
            title={t("try.session.rename")}
            className="font-medium hover:underline focus:underline focus:outline-none truncate max-w-[40ch]"
          >
            {displayName}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            {t(countKey, { count: sessionState.messageCount })}
          </span>
        </>
      )}

      {forkedFrom && (
        <span
          className="text-xs text-[var(--text-muted)] italic"
          title={forkedFrom}
        >
          <T k="try.session.forkedFrom" params={{ name: forkedFrom }} />
        </span>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClone}
        disabled={!sessionState.sessionId || busy}
        title={t("try.session.cloneHint")}
        className="btn secondary"
      >
        <T k="try.session.clone" />
      </button>
    </div>
  );
}
