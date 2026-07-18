"use client";

/**
 * v0.8.9: <NodeCard> extracted from WorkflowEditor.tsx
 * (v0.7.2 backlog closed). The card is the per-step
 * UI block: name + #index badge + remove button +
 * the NodeFields form (provider / model / system
 * prompt / input / output / on-failure strategy)
 * + the "connect to" picker.
 *
 * This component is pure: every state-changing op
 * (update / remove / add-edge) is a callback from
 * the parent. The parent owns the Workflow and
 * mutates it; the card just renders + reports user
 * intent.
 *
 * Why a separate file from NodeFields? NodeFields
 * is the form fields block (a presentational
 * fragment of inputs). NodeCard is the surrounding
 * chrome — name input (shares the row with #index +
 * ×), NodeFields, the connect picker. Splitting
 * them keeps each file <200 lines and lets a future
 * test focus on either piece.
 */

import { useState } from "react";
import { NodeFields } from "./NodeFields";
import type { WorkflowNode } from "@/lib/types";

export interface NodeCardProps {
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
}

export function NodeCard({
  index,
  node,
  allNodes,
  connectedToIds,
  availableVars,
  onUpdate,
  onRemove,
  onAddEdge,
  t,
}: NodeCardProps) {
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

      {/* The form fields block (provider / model / system
          prompt / input template / output var / on-failure
          strategy + retry/escalate) lives in NodeFields. The
          `name` input above stays here because it shares the
          row with the `#index` badge and the `×` remove
          button — pulling it into NodeFields would either
          duplicate markup or split a fragment mid-render,
          both worse than the current one-field-in-parent,
          rest-in-child split. The `t` function is passed
          through so NodeFields doesn't need its own
          `useT()`. */}
      <NodeFields
        node={node}
        onUpdate={onUpdate}
        t={t}
        availableVars={availableVars}
      />

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
