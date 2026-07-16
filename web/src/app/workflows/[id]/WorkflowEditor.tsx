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
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/pilot-browser";
import { useT } from "@/components/I18n";
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeOnFailure,
  WorkflowEdge,
  WorkflowProvider,
} from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; workflow: Workflow }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

const PROVIDERS: WorkflowProvider[] = [
  "anthropic",
  "openai",
  "google",
  "ollama",
  "custom",
];

const FAILURE_STRATEGIES: WorkflowNodeOnFailure[] = [
  "stop",
  "skip",
  "retry",
  "escalate",
];

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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
        "Duplicate failed: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  }, [state]);

  // Delete + navigate back to the list.
  const remove = useCallback(async () => {
    if (state.kind !== "ok") return;
    const ok = window.confirm(t("workflows.confirmDelete"));
    if (!ok) return;
    await api.deleteWorkflow(state.workflow.id);
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
            className="btn small secondary"
            onClick={() => void duplicate()}
            data-testid="workflow-duplicate"
          >
            {t("workflows.editor.duplicate")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void remove()}
            data-testid="workflow-delete"
          >
            {t("workflows.editor.delete")}
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => mutate((w) => ({ ...w, nodes: autoLayout(w) }))}
            data-testid="workflow-auto-layout"
          >
            {t("workflows.layoutBtn")}
          </button>
          <span
            className="text-xs text-[var(--text-muted)] ml-auto"
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
        />
      </div>

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
  onUpdate,
  onRemove,
  onAddEdge,
  t,
}: {
  index: number;
  node: WorkflowNode;
  allNodes: WorkflowNode[];
  onUpdate: (patch: Partial<WorkflowNode>) => void;
  onRemove: () => void;
  onAddEdge: (to: string) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  // Filter the "connect to" list to nodes we haven't already
  // connected to AND exclude self.
  const candidates = allNodes.filter(
    (n) => n.id !== node.id && !node.outputVar.startsWith(n.outputVar),
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

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.field.provider")}
          </span>
          <select
            value={node.model.provider}
            onChange={(e) =>
              onUpdate({ model: { ...node.model, provider: e.target.value } })
            }
            className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`workflows.provider.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.field.model")}
          </span>
          <input
            type="text"
            value={node.model.model}
            placeholder="claude-haiku-4-5"
            onChange={(e) =>
              onUpdate({ model: { ...node.model, model: e.target.value } })
            }
            className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded font-mono"
            data-testid="step-model"
          />
        </label>
      </div>

      <label className="text-xs space-y-1 block">
        <span className="text-[var(--text-muted)]">
          {t("workflows.field.systemPrompt")}
        </span>
        <textarea
          value={node.systemPrompt}
          rows={3}
          onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
          className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded font-mono"
          placeholder="You are a code reviewer. Given the following input, ..."
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.field.inputTemplate")}
          </span>
          <input
            type="text"
            value={node.inputTemplate}
            placeholder="{{steps.n1.output}}"
            onChange={(e) => onUpdate({ inputTemplate: e.target.value })}
            className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded font-mono"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.field.outputVar")}
          </span>
          <input
            type="text"
            value={node.outputVar}
            onChange={(e) => onUpdate({ outputVar: e.target.value })}
            className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded font-mono"
            data-testid="step-output-var"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs space-y-1">
          <span className="text-[var(--text-muted)]">
            {t("workflows.field.onFailure")}
          </span>
          <select
            value={node.onFailure}
            onChange={(e) =>
              onUpdate({
                onFailure: e.target.value as WorkflowNodeOnFailure,
              })
            }
            className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
          >
            {FAILURE_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {t(`workflows.onFailure.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {node.onFailure === "retry" || node.onFailure === "escalate" ? (
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-muted)]">
              {node.onFailure === "retry"
                ? t("workflows.field.retryCount")
                : t("workflows.field.escalateToModel")}
            </span>
            <input
              type={node.onFailure === "retry" ? "number" : "text"}
              value={
                node.onFailure === "retry"
                  ? String(node.retryCount ?? 0)
                  : (node.escalateToModel ?? "")
              }
              onChange={(e) =>
                onUpdate(
                  node.onFailure === "retry"
                    ? { retryCount: Number(e.target.value) }
                    : { escalateToModel: e.target.value },
                )
              }
              className="block w-full px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded font-mono"
            />
          </label>
        ) : (
          <div /> /* spacer to keep the grid even */
        )}
      </div>

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
}: {
  workflow: Workflow;
  t: (k: string, p?: Record<string, unknown>) => string;
}) {
  // v0.7.0: BFS from the source-most nodes (no incoming
  // edge) and lay out top-to-bottom by depth. The output is
  // the same data the SVG renders; we memoize so re-renders
  // that don't change the topology skip the layout work.
  const layout = useMemo(() => computeLayout(workflow), [workflow]);

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
          return (
            <g
              key={n.id}
              transform={`translate(${pos.col * colWidth}, ${pos.depth * rowHeight})`}
              data-node-id={n.id}
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ─── Layout helpers ─────────────────────────────────────

interface Positioned {
  id: string;
  col: number;
  depth: number;
}

interface Layout {
  positions: Record<string, Positioned>;
  cols: number;
  depth: number;
}

/**
 * v0.7.0: BFS from the source-most nodes. Each "level"
 * (no incoming edge from the same level or earlier) gets
 * its own column. The resulting (col, depth) is what the
 * SVG preview places the node at. v0.7.0 calls this
 * function on render for the preview; the same function
 * is reused by the "Auto-layout" button to write back
 * to `node.position` so the data is consistent across
 * page reloads.
 */
export function computeLayout(workflow: Workflow): Layout {
  const nodes = workflow.nodes;
  const edges = workflow.edges;
  if (nodes.length === 0) return { positions: {}, cols: 0, depth: 0 };

  // Build indegree + adjacency.
  const inDeg: Record<string, number> = {};
  const outAdj: Record<string, string[]> = {};
  for (const n of nodes) {
    inDeg[n.id] = 0;
    outAdj[n.id] = [];
  }
  for (const e of edges) {
    inDeg[e.to] = (inDeg[e.to] ?? 0) + 1;
    const out = outAdj[e.from];
    if (out) out.push(e.to);
  }

  // Sources: nodes with no incoming edge. If the graph has a
  // cycle, every node has at least one incoming edge, so we
  // pick the alphabetically-first node as a "seed" to break
  // the cycle. v0.7.1+ may surface the cycle visually.
  const sources = nodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  if (sources.length === 0) {
    sources.push(nodes.map((n) => n.id).sort()[0]!);
  }

  // BFS layering: each step's depth = max(depth of predecessors) + 1.
  const depth: Record<string, number> = {};
  const queue: Array<{ id: string; d: number }> = sources.map((s) => ({
    id: s,
    d: 0,
  }));
  // Track visited so cycles don't infinite-loop. v0.7.0 cycles
  // are a known limitation: the cycle stays at the depth of
  // the first visit. Same as any topological-sort on a cycle.
  const visited = new Set<string>();
  let maxDepth = 0;
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depth[id] = d;
    if (d > maxDepth) maxDepth = d;
    for (const next of outAdj[id] ?? []) {
      if (!visited.has(next)) {
        queue.push({ id: next, d: d + 1 });
      }
    }
  }
  // Any unvisited (cycle tail) lands at the maximum depth.
  for (const n of nodes) {
    if (!(n.id in depth)) depth[n.id] = maxDepth;
  }

  // Within each depth, group nodes into columns. The number
  // of columns is the widest row.
  const byDepth: Record<number, string[]> = {};
  for (const n of nodes) {
    const d = depth[n.id]!;
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(n.id);
  }
  const positions: Record<string, Positioned> = {};
  let cols = 0;
  for (const d of Object.keys(byDepth).map(Number)) {
    const row = byDepth[d]!;
    row.forEach((id, i) => {
      positions[id] = { id, col: i, depth: d };
    });
    if (row.length > cols) cols = row.length;
  }
  return { positions, cols: Math.max(1, cols), depth: maxDepth + 1 };
}

/**
 * v0.7.0: write back the auto-computed layout to each
 * node's `position` field. The SVG preview's coordinates
 * are derived from this field, so this is also what makes
 * the preview stable across reloads. We round to ints so
 * the JSON is human-readable; the SVG doesn't care about
 * sub-pixel precision at this scale.
 */
export function autoLayout(workflow: Workflow): WorkflowNode[] {
  const layout = computeLayout(workflow);
  return workflow.nodes.map((n) => {
    const pos = layout.positions[n.id];
    if (!pos) return n;
    return { ...n, position: { x: pos.col * 240, y: pos.depth * 80 } };
  });
}
