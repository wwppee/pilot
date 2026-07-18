"use client";

/**
 * v0.8.9: <StepsPanel> extracted from WorkflowEditor.tsx
 * (v0.7.2 backlog closed). The panel is the left side of
 * the editor: a "+ Add step" button, a list of NodeCards
 * (one per workflow node), and a compact edges list at
 * the bottom.
 *
 * The panel is where most of the workflow mutation logic
 * lives — add / update / remove nodes, add / remove edges
 * — because the panel owns the data shape (every mutator
 * derives from a single `mutate(updater)` callback the
 * parent provides). The mutators are closed over `mutate`
 * so the panel can use them from per-card callbacks
 * without lifting every handler up to the editor.
 *
 * Why a separate file from NodeCard? NodeCard is a single
 * step; StepsPanel is the list of steps + the edges list +
 * the add button. Different concerns, different files. A
 * future test can mount just the panel (no editor state)
 * and exercise the mutator contract directly.
 */

import { useCallback } from "react";
import { NodeCard } from "./NodeCard";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/lib/types";

export interface StepsPanelProps {
  workflow: Workflow;
  /**
   * Functional setter — the panel calls
   * `mutate((w) => ({ ...w, ...patch }))` to apply a
   * change. The parent owns the state; the panel just
   * describes the transition. This pattern keeps the
   * panel testable in isolation: a test can pass
   * `mutate={setState}` from a `useState` and assert
   * on the resulting Workflow.
   */
  mutate: (updater: (wf: Workflow) => Workflow) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}

export function StepsPanel({ workflow, mutate, t }: StepsPanelProps) {
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
        // Removing a node also removes any edge that
        // referenced it. A dangling edge is invalid by
        // the time the workflow is read back from disk,
        // so we have to do this somewhere — the panel
        // owns the data shape so it owns the cascade.
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

      {/* Edges list — kept compact. The edge graph is
          also rendered in the right panel (PreviewPanel);
          this list is the only place to add / remove
          edges without going through the SVG picker. */}
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
