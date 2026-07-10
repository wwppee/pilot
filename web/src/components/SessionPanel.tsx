/**
 * SessionPanel — header strip showing the current pi session and
 * tree actions (rename / clone). The companion per-bubble fork
 * menu lives in `BubbleActions.tsx`.
 *
 * v0.5.16: pi's session is a tree — each prompt can branch via
 * `fork(entryId)`. This panel surfaces the current leaf:
 *
 *   - `sessionId` + `sessionName` (from `get_state`)
 *   - Inline rename (calls `set_session_name`)
 *   - Clone the current branch into a new session file (calls
 *     `clone()` — emits a new session id; we re-fetch state after)
 *   - "Forked from X" indicator when the user just forked
 *
 * State syncing strategy: `get_state` is cheap and we only call it
 * on connect + after mutations. There's no public tree-change event
 * (pi doesn't emit `session_forked` / `session_switched`), so this
 * is the simplest reliable approach.
 */
"use client";

import { useEffect, useState } from "react";
import { T, useT } from "@/components/I18n";

/**
 * Loose-typed RpcSessionState — narrowed from pi's SDK so the web
 * bundle stays light. Only the fields we actually render.
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
}: {
  sessionState: SessionState;
  onRename: (name: string) => Promise<void> | void;
  onClone: () => Promise<void> | void;
  forkedFrom: string | null;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the editor draft whenever the underlying name changes
  // (e.g. after a successful rename).
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

  return (
    <div className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap text-sm">
      <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide">
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
            onClick={startEdit}
            disabled={!sessionState.sessionId}
            title={t("try.session.rename")}
            className="font-medium hover:underline focus:underline focus:outline-none"
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
