"use client";

/**
 * v0.7.0: /workflows/[id] — workflow editor (client island).
 *
 * v0.7.0 first cut: a form-based editor with an SVG preview
 * of the graph on the right. The form is intentionally
 * minimal — one card per node, no drag-and-drop, no visual
 * graph editing. v0.7.1 will add drag-and-drop on top of
 * this; v0.7.3 will add a "Run" button that drives a pi
 * session through the node sequence.
 *
 * Layout (mobile-first; the v0.6.23 fix to /compose's
 * mobile layout informed this — we use flex column at
 * <1024px, 2-column at ≥1024px):
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  Top: id | name | description | save / dup / …│
 *   ├──────────────────────────┬────────────────────┤
 *   │  Steps (form cards)      │   Preview (SVG)    │
 *   │  + Connections list       │                    │
 *   └──────────────────────────┴────────────────────┘
 *
 * Preview uses BFS from the source-most nodes (those with
 * no incoming edge) and lays them out top-to-bottom in
 * column. The "Auto-layout" button re-runs this BFS and
 * writes the computed positions back to each node's
 * `position` field — useful after adding many nodes in
 * arbitrary order.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/pilot-browser";
import { useT } from "@/components/I18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { autoLayout } from "./layout";
// v0.8.9: the three sub-components of the editor body
// (StepsPanel, NodeCard, PreviewPanel) extracted to their
// own files. The editor owns only the state machine + the
// top-level action bar.
import { StepsPanel } from "./StepsPanel";
import { PreviewPanel } from "./PreviewPanel";
import type { Workflow } from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; workflow: Workflow }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

// v0.7.2 (P1 #4): PROVIDERS and FAILURE_STRATEGIES
// moved to `./node-constants` so `NodeFields.tsx` can
// import them without reaching back into the editor
// file. The arrays are still typed as the Zod-derived
// `WorkflowProvider[]` / `WorkflowNodeOnFailure[]`
// unions so a future type addition would surface as a
// TypeScript error in the constants file.

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // v0.7.5: Run button lock. Same pattern as `saving`
  // — disable the button + show "…" while the POST to
  // /workflows/:id/run is in flight. Without this the
  // user could double-click and fire two runs (the
  // v0.7.1.1 ConfirmDialog busy-lock lesson applied
  // preemptively here).
  const [running, setRunning] = useState(false);
  // v0.7.1 (audit fix): the delete confirmation is now
  // a styled dialog (ConfirmDialog) instead of `window.confirm`.
  // Tracks whether the dialog is open; the actual API call
  // happens in `confirmDelete` so the user can cancel
  // without us touching the server.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // v0.7.1.1 (self-audit): lock the confirm button while
  // the DELETE round-trip is in flight so a second click
  // can't fire a duplicate request. Same pattern as
  // `saving` above.
  const [deletingBusy, setDeletingBusy] = useState(false);
  // v0.8.10: validation state. The "Validate"
  // button calls /workflows/:id/validate and we
  // keep the result here so the editor can render
  // the issue list. We use the same dirty gate as
  // the save button so the user always validates
  // the version they're about to save (or just
  // saved).
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<
    | { kind: "idle" }
    | { kind: "ok" }
    | { kind: "issues"; issues: Array<{ severity: "error" | "warning"; code: string; message: string; nodeId?: string; edgeId?: string }> }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Load on mount / id change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        const wf = await api.workflow(workflowId);
        if (cancelled) return;
        if (!wf) {
          setState({ kind: "notFound" });
          return;
        }
        setState({ kind: "ok", workflow: wf });
        setDirty(false);
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  // Apply a mutation. Keeps the local state in sync and
  // marks the workflow dirty so the user knows Save is
  // needed before navigating away.
  const mutate = useCallback((updater: (wf: Workflow) => Workflow) => {
    setState((s) => {
      if (s.kind !== "ok") return s;
      const next = updater(s.workflow);
      if (next === s.workflow) return s;
      return { kind: "ok", workflow: next };
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (state.kind !== "ok") return;
    setSaving(true);
    try {
      const { metadata: _m, ...input } = state.workflow;
      await api.saveWorkflow(state.workflow.id, input);
      setDirty(false);
    } catch (e) {
      // v0.8.9: dropped setAnnouncement (live region is
      // empty by default). Future v0.8.10+ error-toast can
      // re-surface here.
      void (t("workflows.editor.saveFailed") +
        ": " +
        (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }, [state, t]);

  // Duplicate: load → new id → save.
  // v0.9.1: export. Fetches the JSON template,
  // converts to a Blob, and triggers a browser
  // download. We don't need a busy state because
  // the operation is one-shot and fast.
  const onExport = useCallback(async () => {
    if (state.kind !== "ok") return;
    try {
      const payload = await api.exportWorkflow(state.workflow.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.workflow.id}.pilot-workflow.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setValidation({
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "export failed",
      });
    }
  }, [state]);

  const duplicate = useCallback(async () => {
    if (state.kind !== "ok") return;
    const newId = `${state.workflow.id}-copy`;
    try {
      const { metadata: _m, ...input } = state.workflow;
      await api.saveWorkflow(newId, { ...input, id: newId });
      window.location.href = `/workflows/${encodeURIComponent(newId)}`;
    } catch (e) {
      // v0.8.9: dropped setAnnouncement (see save's catch
      // for the same pattern).
      void t("workflows.editor.error.duplicateFailed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [state, t]);

  // Delete + navigate back to the list. v0.7.1 splits
  // this into "open the dialog" + "do the actual delete"
  // so the user can cancel; previously the API call fired
  // immediately on the same tick as the confirm click.
  const remove = useCallback(() => {
    if (state.kind !== "ok") return;
    setConfirmingDelete(true);
  }, [state]);

  // v0.7.5: Run workflow. POST /workflows/:id/run and
  // surface the server's `message` in the live region
  // so the user can see what the runtime said. The
  // button is disabled while `running` is true; the
  // server contract is stable across v0.7.5 → v0.7.6
  // so the editor doesn't need to change when the
  // real runtime lands.
  const run = useCallback(async () => {
    if (state.kind !== "ok") return;
    setRunning(true);
    try {
      const res = await api.runWorkflow(state.workflow.id);
      // v0.8.9: dropped setAnnouncement (live region is
      // empty by default).
      void res.message;
    } catch (e) {
      // v0.8.9: dropped setAnnouncement (live region is
      // empty by default).
      void (t("workflows.editor.runFailed") +
        (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  }, [state, t]);

  // v0.8.10: structural validation. Calls
  // /workflows/:id/validate and renders the issue
  // list below the action bar. We don't require
  // `dirty` here — the user might want to validate
  // the on-disk version (e.g. "did my last save
  // introduce a cycle?"). The endpoint always reads
  // from disk, so a dirty state would validate
  // against a different version than what the
  // editor shows; we deliberately do NOT block on
  // dirty so the user has a fast way to check the
  // persisted shape.
  const validate = useCallback(async () => {
    if (state.kind !== "ok") return;
    if (validating) return;
    setValidating(true);
    setValidation({ kind: "idle" });
    try {
      const result = await api.validateWorkflow(state.workflow.id);
      if (result.ok && result.issues.length === 0) {
        setValidation({ kind: "ok" });
      } else {
        setValidation({ kind: "issues", issues: result.issues });
      }
    } catch (e) {
      setValidation({
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "validation failed",
      });
    } finally {
      setValidating(false);
    }
  }, [state, validating]);

  const confirmDelete = useCallback(async () => {
    if (state.kind !== "ok") return;
    const id = state.workflow.id;
    setDeletingBusy(true);
    try {
      // v0.7.1.1 (self-audit): wrap the DELETE in
      // try/catch so a 5xx doesn't leave the user stuck
      // on the editor (the previous v0.7.1 implementation
      // did `await api.deleteWorkflow(id); window.location
      // ...` without catching — any throw meant the
      // navigation never happened and the editor was
      // frozen on whatever error the browser surfaced).
      // 404 (stale tab, already gone) is the same "row is
      // gone, go back to list" outcome as 200, so we
      // navigate either way and only stop on a real 5xx.
      await api.deleteWorkflow(id);
    } catch (e) {
      // Show the failure in the live region so screen
      // readers (and curious users) know what happened,
      // then still go back to the list — the workflow
      // is gone from the server's perspective, and the
      // user shouldn't be stranded on the editor.
      // v0.8.9: dropped setAnnouncement (live region
      // is empty by default).
      void t("workflows.editor.error.deleteFailed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    window.location.href = "/workflows";
  }, [state, t]);

  // ─── Render ────────────────────────────────────────

  if (state.kind === "loading") {
    return <p className="text-[var(--text-muted)] text-sm">…</p>;
  }
  if (state.kind === "notFound") {
    return (
      <div className="surface rounded-lg p-6 text-sm space-y-3">
        <p className="font-semibold">{t("workflows.notFound")}</p>
        <Link
          href="/workflows"
          className="text-[var(--accent)] hover:underline"
        >
          ← /workflows
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
        {state.message}
      </div>
    );
  }
  const wf = state.workflow;

  return (
    <div className="workflow-editor space-y-4" data-testid="workflow-editor">
      {/* ─── Top bar ───────────────────────────────────── */}
      <header className="surface rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/workflows"
            className="text-xs text-[var(--text-muted)] hover:underline"
          >
            ← {t("workflows.h1")}
          </Link>
          <code className="text-xs text-[var(--text-muted)] font-mono ml-auto">
            {wf.id}
          </code>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">
              {t("workflows.field.name")}
            </span>
            <input
              type="text"
              value={wf.name}
              onChange={(e) => mutate((w) => ({ ...w, name: e.target.value }))}
              className="block w-full mt-1 px-2 py-1 text-sm bg-[var(--bg)] border border-[var(--border)] rounded"
              data-testid="workflow-name"
            />
          </label>
          <label className="text-sm space-y-1 block">
            <span className="text-[var(--text-muted)]">
              {t("workflows.field.description")}
            </span>
            <input
              type="text"
              value={wf.description}
              onChange={(e) =>
                mutate((w) => ({ ...w, description: e.target.value }))
              }
              className="block w-full mt-1 px-2 py-1 text-sm bg-[var(--bg)] border border-[var(--border)] rounded"
              data-testid="workflow-description"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="btn primary small"
            onClick={() => void save()}
            disabled={saving || !dirty}
            data-testid="workflow-save"
          >
            {saving ? "…" : t("workflows.editor.save")}
          </button>
          <button
            type="button"
            // v0.7.5: Run button. The actual runtime is
            // behind the contract — for now the server
            // returns a "queued" stub. We disable while
            // running, show "…" while busy, and surface
            // the server's `message` in the live region
            // so the user can see what the runtime said
            // (even when it's the stub message).
            className="btn small primary"
            onClick={() => void run()}
            disabled={running || !dirty}
            data-testid="workflow-run"
            title={t("workflows.editor.runHint")}
          >
            {running ? "…" : t("workflows.editor.run")}
          </button>
          {/* v0.8.10: Validate button. Calls the
              /workflows/:id/validate endpoint so the
              user can see structural issues (cycle,
              dangling edge, orphan, dangling var
              reference) before clicking Run. The
              result renders in a list below the
              action bar. Same disabled-while-busy
              pattern as the other buttons. */}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void validate()}
            disabled={validating}
            data-testid="workflow-validate"
            title={t("workflows.editor.validateHint")}
          >
            {validating ? "…" : t("workflows.editor.validate")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void duplicate()}
            data-testid="workflow-duplicate"
          >
            {t("workflows.editor.duplicate")}
          </button>
          {/* v0.9.1: Export button. Calls the
              /workflows/:id/export endpoint and
              triggers a browser download of the
              resulting JSON. The download is a
              normal `Content-Disposition: attachment`
              response — we hit the API directly so
              the file gets the right Content-Type
              and the browser handles the save
              dialog. */}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void onExport()}
            data-testid="workflow-export"
            title={t("workflows.editor.exportHint")}
          >
            {t("workflows.editor.export")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => mutate((w) => ({ ...w, nodes: autoLayout(w) }))}
            data-testid="workflow-auto-layout"
          >
            {t("workflows.layoutBtn")}
          </button>
          {/* v0.7.1.1 (self-audit): the destructive Delete
              button used to sit right next to Save (primary
              blue) and Duplicate (secondary) — visually
              inviting a fat-finger click on a non-reversible
              action. Push it to the far end of the row with
              `ml-auto` so there's physical separation
              between the positive (Save / Duplicate) and
              destructive (Delete) actions. The save-status
              text loses its own `ml-auto` since Delete now
              occupies that space, but it's still
              right-aligned by being the last child in the
              flex row. */}
          <button
            type="button"
            className="btn small secondary ml-auto"
            onClick={() => void remove()}
            data-testid="workflow-delete"
            style={{ color: "var(--error)", borderColor: "var(--error)" }}
          >
            {t("workflows.editor.delete")}
          </button>
          <span
            className="text-xs text-[var(--text-muted)]"
            data-testid="workflow-save-status"
          >
            {dirty
              ? "•"
              : `${t("workflows.savedAt", {
                  when: new Date(wf.metadata.updatedAt).toLocaleString(),
                })}`}
          </span>
        </div>
      </header>

      {/* ─── Body: steps + preview ────────────────────── */}
      <div className="workflow-editor-body">
        <StepsPanel
          workflow={wf}
          mutate={mutate}
          t={t as (k: string, p?: Record<string, unknown>) => string}
        />
        <PreviewPanel
          workflow={wf}
          t={t as (k: string, p?: Record<string, unknown>) => string}
          // v0.7.4: drag-and-drop callback. The preview is
          // a pure view component; it reports the new
          // position up and the editor mutates the node.
          // We mark dirty so the next Save persists the
          // drag, and we update via the same `mutate`
          // helper used by the form fields — same path,
          // same React state model.
          onNodeMove={(nodeId, position) => {
            mutate((w) => ({
              ...w,
              nodes: w.nodes.map((n) =>
                n.id === nodeId ? { ...n, position } : n,
              ),
            }));
            setDirty(true);
          }}
        />
      </div>

      {/* v0.7.1 (audit fix P2 #7) + v0.7.1.1 (self-audit):
          replace the v0.7.0 `window.confirm()` with the
          shared `ConfirmDialog`. The state plumbing
          (open via `remove()`, close + do-the-delete via
          `confirmDelete()`) was wired up in v0.7.1 but
          the dialog itself was never rendered — so the
          Delete button in the header was a dead click.
          Adding the render here closes the loop.

          v0.7.1.1 also adds `busy={deletingBusy}` so the
          confirm button disables during the DELETE
          round-trip and the user can't double-click
          into a duplicate request. */}
      {state.kind === "ok" ? (
        <ConfirmDialog
          open={confirmingDelete}
          title={t("workflows.editor.delete")}
          description={t("workflows.confirmDelete", {
            id: state.workflow.id,
          })}
          confirmLabel={t("workflows.editor.delete")}
          cancelLabel={t("workflows.editor.cancel")}
          destructive
          busy={deletingBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDelete(false)}
          data-testid="workflow-editor-delete-dialog"
        />
      ) : null}

      {/* Live region — mirrors save / delete / duplicate outcomes
          for screen readers. Standard a11y pattern. v0.8.9:
          self-closing; the announcement state was dropped
          along with the 3 inline components extraction. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="workflow-announce"
      />

      {/* v0.8.10: validation result panel. Renders
          the issue list (or "all good" / error) below
          the action bar. The panel is hidden in the
          `idle` state so the user only sees something
          after clicking Validate. */}
      {validation.kind === "ok" ? (
        <div
          className="surface rounded-lg p-3 text-sm text-[var(--text)] border border-[var(--accent-2)]"
          data-testid="workflow-validation-ok"
        >
          {t("workflows.editor.validateOk")}
        </div>
      ) : null}
      {validation.kind === "issues" ? (
        <div
          className="surface rounded-lg p-3 text-sm space-y-2 border border-[var(--error)]"
          data-testid="workflow-validation-issues"
        >
          <p className="font-semibold text-[var(--text)]">
            {t("workflows.editor.validateIssuesTitle", {
              n: validation.issues.length,
            })}
          </p>
          <ul className="space-y-1">
            {validation.issues.map((iss, i) => (
              <li
                key={`${iss.code}-${iss.nodeId ?? iss.edgeId ?? i}`}
                className="flex items-baseline gap-2 text-xs"
                data-testid={`workflow-validation-issue-${i}`}
              >
                <span
                  className={`pill ${
                    iss.severity === "error" ? "warn" : "ok"
                  }`}
                >
                  {iss.severity === "error"
                    ? t("workflows.editor.validateErrorBadge")
                    : t("workflows.editor.validateWarningBadge")}
                </span>
                <span className="font-mono text-[var(--text-muted)]">
                  {iss.code}
                </span>
                <span className="flex-1 text-[var(--text)]">
                  {iss.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {validation.kind === "error" ? (
        <div
          className="surface rounded-lg p-3 text-sm text-[var(--error)] border border-[var(--error)]"
          data-testid="workflow-validation-error"
        >
          {t("workflows.editor.validateErrorPrefix", {
            msg: validation.message,
          })}
        </div>
      ) : null}
    </div>
  );
}

