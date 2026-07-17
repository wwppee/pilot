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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/pilot-browser";
import { useT } from "@/components/I18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { autoLayout, computeLayout, truncate } from "./layout";
import { NodeFields } from "./NodeFields";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/lib/types";

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
  const [announcement, setAnnouncement] = useState("");

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
      setAnnouncement(t("workflows.editor.saved"));
    } catch (e) {
      setAnnouncement(
        t("workflows.editor.saveFailed") +
          ": " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setSaving(false);
    }
  }, [state, t]);

  // Duplicate: load → new id → save.
  const duplicate = useCallback(async () => {
    if (state.kind !== "ok") return;
    const newId = `${state.workflow.id}-copy`;
    try {
      const { metadata: _m, ...input } = state.workflow;
      await api.saveWorkflow(newId, { ...input, id: newId });
      window.location.href = `/workflows/${encodeURIComponent(newId)}`;
    } catch (e) {
      setAnnouncement(
        t("workflows.editor.error.duplicateFailed", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
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
      setAnnouncement(res.message);
    } catch (e) {
      setAnnouncement(
        t("workflows.editor.runFailed") +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setRunning(false);
    }
  }, [state, t]);

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
      setAnnouncement(
        t("workflows.editor.error.deleteFailed", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
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
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void duplicate()}
            data-testid="workflow-duplicate"
          >
            {t("workflows.editor.duplicate")}
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
          for screen readers. Standard a11y pattern. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="workflow-announce"
      >
        {announcement}
      </div>
    </div>
  );
}

// ─── Steps panel (left) ──────────────────────────────────

function StepsPanel({
  workflow,
  mutate,
  t,
}: {
  workflow: Workflow;
  mutate: (updater: (wf: Workflow) => Workflow) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}) {
  const addNode = useCallback(() => {
    mutate((w) => {
      const id = `n${w.nodes.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
      const newNode: WorkflowNode = {
        id,
        name: `Step ${w.nodes.length + 1}`,
        kind: "step",
        model: { provider: "anthropic", model: "" },
        systemPrompt: "",
        inputTemplate: "",
        outputVar: id.replace(/-/g, "_"),
        tools: [],
        onFailure: "stop",
        position: { x: 0, y: w.nodes.length * 100 },
      };
      return { ...w, nodes: [...w.nodes, newNode] };
    });
  }, [mutate]);

  const updateNode = useCallback(
    (id: string, patch: Partial<WorkflowNode>) => {
      mutate((w) => ({
        ...w,
        nodes: w.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }));
    },
    [mutate],
  );

  const removeNode = useCallback(
    (id: string) => {
      mutate((w) => ({
        ...w,
        // v0.7.0: removing a node also removes any edge that
        // referenced it. A v0.7.1+ UX would orphan the edges
        // and surface them as broken; for MVP the silent
        // cascade is what the data model implies (a dangling
        // edge is invalid by the time the workflow is read
        // back from disk, so we have to do this somewhere).
        nodes: w.nodes.filter((n) => n.id !== id),
        edges: w.edges.filter((e) => e.from !== id && e.to !== id),
      }));
    },
    [mutate],
  );

  const addEdge = useCallback(
    (from: string, to: string) => {
      mutate((w) => {
        if (from === to) return w;
        // Skip duplicates — the user might click "connect"
        // twice by accident. Dedup on (from, to) so a future
        // "data-mapping" extension can attach metadata to the
        // edge without re-introducing duplicates.
        if (w.edges.some((e) => e.from === from && e.to === to)) return w;
        const edge: WorkflowEdge = {
          id: `e${w.edges.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
          from,
          to,
        };
        return { ...w, edges: [...w.edges, edge] };
      });
    },
    [mutate],
  );

  const removeEdge = useCallback(
    (id: string) => {
      mutate((w) => ({ ...w, edges: w.edges.filter((e) => e.id !== id) }));
    },
    [mutate],
  );

  return (
    <section
      className="workflow-steps surface rounded-lg p-4 space-y-3"
      data-testid="workflow-steps"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {t("workflows.editor.addNode")}
        </h2>
        <button
          type="button"
          className="btn small primary"
          onClick={addNode}
          data-testid="workflow-add-step"
        >
          + {t("workflows.editor.addNode")}
        </button>
      </div>
      {workflow.nodes.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {t("workflows.editor.noNodes")}
        </p>
      ) : (
        <ul className="space-y-3">
          {workflow.nodes.map((node, i) => (
            <NodeCard
              key={node.id}
              index={i + 1}
              node={node}
              allNodes={workflow.nodes}
              // v0.7.1 (audit fix): pass the *actual* set of
              // node ids this node is already connected to,
              // derived from `workflow.edges`. The previous
              // version filtered by `outputVar.startsWith`,
              // which was a typo / leftover from a different
              // design and had nothing to do with whether two
              // nodes were already connected. With the real
              // data the picker now correctly hides nodes that
              // already have an edge from this one.
              connectedToIds={
                new Set(
                  workflow.edges
                    .filter((e) => e.from === node.id)
                    .map((e) => e.to),
                )
              }
              // v0.8.3: pre-compute the list of available
              // variables (other nodes' outputVar values)
              // so NodeFields can offer them as a dropdown
              // for inputTemplate. We exclude the current
              // node's own outputVar (a node can't feed
              // itself). This is the "necessary abstraction
              // = don't make the user type a string that
              // has to match another node's value" part of
              // the v0.8.x series.
              availableVars={workflow.nodes
                .filter((n) => n.id !== node.id && n.outputVar)
                .map((n) => n.outputVar)}
              onUpdate={(patch) => updateNode(node.id, patch)}
              onRemove={() => removeNode(node.id)}
              onAddEdge={(to) => addEdge(node.id, to)}
              t={t}
            />
          ))}
        </ul>
      )}

      {/* Edges list — kept compact. v0.7.1 will render the
          edge graph in the right panel only, not as a
          separate list. For MVP the list is the only
          place to add / remove edges without going through
          the SVG preview. */}
      <div className="border-t border-[var(--border)] pt-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t("workflows.editor.addEdge")}
        </h3>
        {workflow.edges.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("workflows.editor.noEdges")}
          </p>
        ) : (
          <ul className="space-y-1">
            {workflow.edges.map((e) => {
              const fromName =
                workflow.nodes.find((n) => n.id === e.from)?.name ?? e.from;
              const toName =
                workflow.nodes.find((n) => n.id === e.to)?.name ?? e.to;
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 text-xs"
                  data-edge-id={e.id}
                >
                  <code className="text-[var(--text-muted)]">{e.from}</code>
                  <span aria-hidden="true">→</span>
                  <code className="text-[var(--text-muted)]">{e.to}</code>
                  <span className="text-[var(--text)] truncate flex-1">
                    {fromName} → {toName}
                  </span>
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={() => removeEdge(e.id)}
                    aria-label={t("workflows.editor.removeEdge")}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Node card ──────────────────────────────────────────

function NodeCard({
  index,
  node,
  allNodes,
  connectedToIds,
  availableVars,
  onUpdate,
  onRemove,
  onAddEdge,
  t,
}: {
  index: number;
  node: WorkflowNode;
  allNodes: WorkflowNode[];
  /**
   * v0.7.1 (audit fix): the set of node ids this node is
   * already connected to (i.e. the `to` side of an edge
   * originating from `node.id`). Computed once in the
   * parent so the candidate picker can hide already-
   * connected nodes. Without this, the picker would let
   * the user create duplicate edges (silently deduped by
   * `addEdge`, but only as a no-op — a confusing UX where
   * "click Connect" appears to do nothing).
   */
  connectedToIds: Set<string>;
  /**
   * v0.8.3: the list of variable names (other nodes'
   * outputVar values) the inputTemplate dropdown can
   * offer. Computed in the parent so a node can never
   * feed itself. If empty, the field falls back to the
   * free-form text input (no available variables yet).
   */
  availableVars: string[];
  onUpdate: (patch: Partial<WorkflowNode>) => void;
  onRemove: () => void;
  onAddEdge: (to: string) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  // v0.7.1 (audit fix): the "connect to" picker must show
  // (a) every other node, (b) minus nodes we're already
  // connected to, (c) minus ourselves. The previous code
  // filtered by `outputVar.startsWith(...)` which had
  // nothing to do with whether two nodes were connected —
  // it was a leftover from an earlier design that used
  // `outputVar` as a way to express "depends on" before
  // edges existed.
  const candidates = allNodes.filter(
    (n) => n.id !== node.id && !connectedToIds.has(n.id),
  );
  return (
    <li
      className="workflow-step surface-2 rounded p-3 space-y-2"
      data-step-id={node.id}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] font-mono">
          #{index}
        </span>
        <input
          type="text"
          value={node.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1 px-2 py-1 text-sm bg-[var(--bg)] border border-[var(--border)] rounded"
          data-testid="step-name"
        />
        <button
          type="button"
          className="btn small secondary"
          onClick={onRemove}
          aria-label={t("workflows.editor.removeNode")}
        >
          ×
        </button>
      </div>

      {/* v0.7.2 (P1 #4): the form fields block (provider
          / model / system prompt / input template / output
          var / on-failure strategy + retry/escalate) moved
          to `./NodeFields`. The `name` input above stays
          here because it shares the row with the `#index`
          badge and the `×` remove button — pulling it
          into `NodeFields` would either duplicate markup
          or split a fragment mid-render, both worse than
          the current one-field-in-parent, rest-in-child
          split. The `t` function is passed through so
          `NodeFields` doesn't need its own `useT()`. */}
      <NodeFields node={node} onUpdate={onUpdate} t={t} availableVars={availableVars} />

      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-[var(--text-muted)]">
          {t("workflows.editor.addEdge")}
        </span>
        {connectOpen ? (
          <select
            autoFocus
            onBlur={() => setConnectOpen(false)}
            onChange={(e) => {
              if (e.target.value) {
                onAddEdge(e.target.value);
                setConnectOpen(false);
              }
            }}
            className="px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
          >
            <option value="">—</option>
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setConnectOpen(true)}
            disabled={candidates.length === 0}
            data-testid="step-connect"
          >
            + {t("workflows.editor.addEdge")}
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Preview panel (right) ──────────────────────────────

function PreviewPanel({
  workflow,
  t,
  onNodeMove,
}: {
  workflow: Workflow;
  t: (k: string, p?: Record<string, unknown>) => string;
  // v0.7.4: drag-and-drop callback. The preview is a
  // pure view component; it doesn't own the workflow
  // state. When the user drops a node, we report the
  // new (x, y) up so the editor can mutate + mark dirty.
  onNodeMove: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  // v0.7.0: BFS from the source-most nodes (no incoming
  // edge) and lay out top-to-bottom by depth. The output is
  // the same data the SVG renders; we memoize so re-renders
  // that don't change the topology skip the layout work.
  const layout = useMemo(() => computeLayout(workflow), [workflow]);

  // v0.7.4: drag state. `dragging` holds the node id being
  // dragged plus the offset between the mouse and the
  // node's top-left corner (so a click in the middle of a
  // node doesn't jump the corner to the cursor). `svgRef`
  // is used to convert client coordinates to SVG viewBox
  // coordinates via the CTM (current transformation matrix).
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // v0.7.4: pointer move + up are bound at the document
  // level (not the SVG level) so the drag continues even
  // when the cursor leaves the SVG bounds. The handlers
  // do nothing when `dragging` is null so the global
  // listeners are inert in the common case.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!svgRef.current) return;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      // Convert screen coords to SVG viewBox coords.
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const newX = Math.max(0, Math.round(local.x - dragging.offsetX));
      const newY = Math.max(0, Math.round(local.y - dragging.offsetY));
      onNodeMove(dragging.nodeId, { x: newX, y: newY });
    };
    const onUp = () => setDragging(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [dragging, onNodeMove]);

  if (workflow.nodes.length === 0) {
    return (
      <aside
        className="workflow-preview surface rounded-lg p-6 text-sm text-center text-[var(--text-muted)]"
        data-testid="workflow-preview"
      >
        <p>{t("workflows.editor.preview")}</p>
        <p className="text-xs mt-2">{t("workflows.editor.noNodes")}</p>
      </aside>
    );
  }

  const nodeWidth = 200;
  const nodeHeight = 56;
  const colWidth = 240;
  const rowHeight = 80;

  return (
    <aside
      className="workflow-preview surface rounded-lg p-4 overflow-auto"
      data-testid="workflow-preview"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
        {t("workflows.editor.preview")}
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {t("workflows.editor.layoutHint")}
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.cols * colWidth} ${Math.max(1, layout.depth) * rowHeight}`}
        width="100%"
        style={{ minHeight: "320px" }}
        role="img"
        aria-label={t("workflows.editor.preview")}
      >
        {/* Edges first so they sit under the nodes. */}
        {workflow.edges.map((e) => {
          const from = layout.positions[e.from];
          const to = layout.positions[e.to];
          if (!from || !to) return null;
          const x1 = from.col * colWidth + nodeWidth;
          const y1 = from.depth * rowHeight + nodeHeight / 2;
          const x2 = to.col * colWidth;
          const y2 = to.depth * rowHeight + nodeHeight / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke="var(--accent)"
              strokeWidth={1.5}
              fill="none"
              opacity={0.7}
              data-edge-from={e.from}
              data-edge-to={e.to}
            />
          );
        })}
        {workflow.nodes.map((n) => {
          const pos = layout.positions[n.id];
          if (!pos) return null;
          const isDragging = dragging?.nodeId === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${pos.col * colWidth}, ${pos.depth * rowHeight})`}
              data-node-id={n.id}
              data-testid={`workflow-preview-node-${n.id}`}
              style={{
                cursor: isDragging ? "grabbing" : "grab",
                opacity: isDragging ? 0.8 : 1,
              }}
              onPointerDown={(e) => {
                // v0.7.4: start a drag. The offset is the
                // distance from the cursor to the node's
                // top-left corner so the node doesn't jump
                // on the first move. SVG createSVGPoint +
                // matrixTransform is the standard way to
                // convert client coords to viewBox coords.
                if (!svgRef.current) return;
                e.preventDefault();
                const ctm = svgRef.current.getScreenCTM();
                if (!ctm) return;
                const pt = svgRef.current.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const local = pt.matrixTransform(ctm.inverse());
                setDragging({
                  nodeId: n.id,
                  offsetX: local.x - pos.col * colWidth,
                  offsetY: local.y - pos.depth * rowHeight,
                });
              }}
            >
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={1.5}
              />
              <text
                x={10}
                y={20}
                fontSize={12}
                fontWeight={600}
                fill="var(--text)"
              >
                {truncate(n.name, 22)}
              </text>
              <text
                x={10}
                y={38}
                fontSize={10}
                fill="var(--text-muted)"
                fontFamily="monospace"
              >
                {n.model.provider}/{truncate(n.model.model || "—", 18)}
              </text>
              <text
                x={10}
                y={50}
                fontSize={10}
                fill="var(--text-muted)"
                fontFamily="monospace"
              >
                → {n.outputVar}
              </text>
            </g>
          );
        })}
      </svg>
    </aside>
  );
}

// v0.7.2 (P1 #4): the layout helpers (`truncate`,
// `computeLayout`, `autoLayout`) and their supporting
// `Positioned` / `Layout` interfaces moved to `./layout`.
// The editor no longer needs to know how the BFS works —
// it just imports the pre-laid-out positions and renders.
// The web test `workflow-layout.test.ts` now imports
// from `./layout` directly (which is what a test of a
// pure function should be doing).
