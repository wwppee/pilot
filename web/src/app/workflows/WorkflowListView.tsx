"use client";

/**
 * v0.7.0: /workflows list view — client island.
 *
 * States: loading | ok | error | creating (the new-workflow
 * dialog). The "ok" state renders one card per workflow with
 * [Open] [Duplicate] [Delete] actions. v0.7.0 only ships these
 * three — there's no rename (kebab-case id is the canonical
 * name), no bulk operations (the dataset is small — single
 * workflows, not dozens), and no sharing (workflows reference
 * local tools and prompts that don't roundtrip well as JSON).
 *
 * "New workflow" opens a small dialog that asks for a
 * kebab-case id. We validate the id client-side (regex) before
 * round-tripping to the server; the server's zod schema
 * re-validates with the same regex so the contract is one
 * definition, not two.
 *
 * Duplicate = load → mutate id → save. We don't expose a
 * server endpoint for this; the client has the full data and
 * the operation is 3 lines. Adding a server `POST /workflows`
 * that copies an existing one would just be code that could
 * live in the client.
 *
 * Live-region announcements: every action fires an `announce`
 * so screen readers confirm what happened. The element is
 * visually hidden but readable.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/pilot-browser";
import { useT } from "@/components/I18n";
import type { Workflow, WorkflowSummary } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; workflows: WorkflowSummary[] }
  | { kind: "error"; message: string };

export function WorkflowListView() {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  // v0.7.1 (audit fix): the delete confirmation is now a
  // styled dialog (ConfirmDialog) instead of `window.confirm`.
  // The previous OS-native dialog didn't match the rest of
  // Pilot's UI and froze the main thread on Chromium. We
  // track which workflow is pending deletion so the dialog
  // can show its name; clicking confirm calls the API,
  // clicking cancel / Esc / backdrop just clears the state.
  const [deleting, setDeleting] = useState<WorkflowSummary | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const workflows = await api.workflows();
      setState({ kind: "ok", workflows });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const onDelete = useCallback(async (wf: WorkflowSummary) => {
    // v0.7.1 (audit fix): set the pending delete target,
    // the dialog opens and the actual API call happens
    // when the user clicks the confirm button. We do
    // this in two steps so the dialog is dismissable —
    // a single-step version (call API directly) would
    // make the dialog an "are you sure?" with no
    // take-back.
    setDeleting(wf);
  }, []);

  const onDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    const wf = deleting;
    setDeleting(null);
    const removed = await api.deleteWorkflow(wf.id);
    if (removed) {
      announce(t("workflows.delete") + ": " + wf.id);
      await reloadRef.current();
    }
  }, [deleting, announce, t]);

  const onDuplicate = useCallback(
    async (wf: WorkflowSummary) => {
      const full = await api.workflow(wf.id);
      if (!full) {
        announce(t("workflows.editor.error.loadFailed", { id: wf.id }));
        return;
      }
      // Generate a copy id by appending "-copy" / "-copy-N" until
      // we find a free one. For the MVP this is good enough —
      // 100 workflows and we just need a unique kebab-case
      // string. A v0.7.1+ "rename on duplicate" dialog can
      // ask the user for the new id explicitly.
      const existing = new Set(
        state.kind === "ok" ? state.workflows.map((w) => w.id) : [],
      );
      const candidates = [
        wf.id + "-copy",
        wf.id + "-copy-2",
        wf.id + "-copy-3",
      ];
      const newId = candidates.find((c) => !existing.has(c)) ?? wf.id + "-copy";
      try {
        const input: Omit<Workflow, "metadata"> = {
          id: newId,
          name: wf.name,
          description: wf.description,
          version: 1,
          nodes: full.nodes,
          edges: full.edges,
        };
        await api.saveWorkflow(newId, input);
        announce(t("workflows.duplicate") + ": " + newId);
        await reloadRef.current();
      } catch (e) {
        announce(
          t("workflows.editor.error.duplicateFailed", {
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    },
    [announce, state, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          className="btn primary"
          onClick={() => setCreating(true)}
          data-testid="workflows-new"
        >
          + {t("workflows.create")}
        </button>
      </div>

      {state.kind === "loading" ? (
        <p className="text-[var(--text-muted)] text-sm">…</p>
      ) : state.kind === "error" ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {state.message}
        </div>
      ) : state.workflows.length === 0 ? (
        <div className="surface rounded-lg p-6 text-sm text-center space-y-2">
          <p className="font-semibold text-[var(--text)]">
            {t("workflows.empty")}
          </p>
          <p className="text-[var(--text-muted)]">
            {t("workflows.empty.hint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="workflows-list">
          {state.workflows.map((wf) => (
            <li
              key={wf.id}
              className="surface rounded-lg p-4 flex items-center gap-4"
              data-workflow-id={wf.id}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/workflows/${encodeURIComponent(wf.id)}`}
                    className="font-semibold text-[var(--text)] hover:underline"
                    data-testid="workflows-item-name"
                  >
                    {wf.name || wf.id}
                  </Link>
                  <code className="text-xs text-[var(--text-muted)]">
                    {wf.id}
                  </code>
                </div>
                {wf.description ? (
                  <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                    {wf.description}
                  </p>
                ) : null}
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t("workflows.nodeCount", { n: wf.nodeCount })} ·{" "}
                  {t("workflows.edgeCount", { n: wf.edgeCount })} ·{" "}
                  {t("workflows.updatedAt", {
                    when: new Date(wf.updatedAt).toLocaleString(),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/workflows/${encodeURIComponent(wf.id)}`}
                  className="btn small secondary"
                >
                  {t("workflows.editor.open")}
                </Link>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => void onDuplicate(wf)}
                  aria-label={t("workflows.duplicate")}
                >
                  {t("workflows.duplicate")}
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => void onDelete(wf)}
                  aria-label={t("workflows.delete")}
                >
                  {t("workflows.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <NewWorkflowDialog
          onCancel={() => setCreating(false)}
          onCreated={async (newId) => {
            setCreating(false);
            announce(t("workflows.create") + ": " + newId);
            await reloadRef.current();
            // Navigate to the new workflow's editor.
            if (typeof window !== "undefined") {
              window.location.href = `/workflows/${encodeURIComponent(newId)}`;
            }
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open={!!deleting}
          title={t("workflows.delete")}
          description={t("workflows.confirmDelete")}
          confirmLabel={t("workflows.delete")}
          cancelLabel={t("workflows.editor.cancel")}
          destructive
          onConfirm={() => void onDeleteConfirm()}
          onCancel={() => setDeleting(null)}
          data-testid="workflows-delete-dialog"
        />
      ) : null}

      {/* Visually hidden but readable live region. Mirrors every
          successful action so screen readers can confirm the
          outcome. Standard a11y pattern — see the React docs
          "useLiveAnnouncer" recipe. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="workflows-announce"
      >
        {announcement}
      </div>
    </div>
  );
}

/**
 * v0.7.0: small dialog that asks for a kebab-case id and
 * creates an empty workflow (one node, no edges) before
 * redirecting to the editor. We don't pre-create a zero-node
 * workflow because the editor's "no nodes" empty state is
 * nicer to start from than a stub node the user immediately
 * deletes.
 */
function NewWorkflowDialog({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => Promise<void> | void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    const trimmed = id.trim();
    if (!ID_RE.test(trimmed)) {
      setError(t("workflows.invalidId"));
      return;
    }
    setBusy(true);
    try {
      const existing = await api.workflow(trimmed);
      if (existing) {
        setError(`id "${trimmed}" already exists`);
        return;
      }
      const empty: Omit<Workflow, "metadata"> = {
        id: trimmed,
        name: trimmed,
        description: "",
        version: 1,
        nodes: [],
        edges: [],
      };
      await api.saveWorkflow(trimmed, empty);
      await onCreated(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [id, onCreated, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="workflows-new-dialog"
      role="dialog"
      aria-modal="true"
    >
      <div className="surface rounded-lg p-5 w-full max-w-md space-y-3">
        <h2 className="text-lg font-semibold">{t("workflows.create")}</h2>
        <label className="block text-sm space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.newIdPrompt")}
          </span>
          <input
            type="text"
            value={id}
            placeholder="research-and-test"
            autoFocus
            disabled={busy}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className="block w-full mt-1 px-2 py-1 text-sm font-mono bg-[var(--bg)] border border-[var(--border)] rounded"
            data-testid="workflows-new-id"
          />
          <span className="text-xs text-[var(--text-muted)] block">
            {t("workflows.newIdHint")}
          </span>
        </label>
        {error ? (
          <p className="text-sm text-[var(--error)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn small secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t("workflows.editor.cancel")}
          </button>
          <button
            type="button"
            className="btn primary small"
            onClick={() => void submit()}
            disabled={busy || !id.trim()}
            data-testid="workflows-new-create"
          >
            {t("workflows.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
