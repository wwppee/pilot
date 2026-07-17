/**
 * v0.7.2 (P1 #4): extracted from `NodeCard` inside
 * `WorkflowEditor.tsx`. The fields block (provider / model /
 * system prompt / input template / output var / on-failure
 * strategy + retry/escalate) was about 150 lines of pure
 * form markup that didn't share state with the rest of
 * `NodeCard` (the connect-to picker is a separate concern).
 *
 * Note: the `name` input is *not* here — it lives in
 * `NodeCard`'s header row, where the user sees
 * `#1  [name input]  [×]` side-by-side. Pulling it
 * here would either duplicate the markup or require
 * splitting the fragment mid-render, both worse than
 * the current "one field lives in the parent, the
 * rest live in the child" split.
 *
 * Splitting it out gives us:
 *   - a self-contained component that's easy to test in
 *     isolation (just feed a node + onUpdate + t),
 *   - one fewer thing in the editor's main file (which
 *     was pushing 1000 lines), and
 *   - a place where v0.7.3+ can add field-level features
 *     (e.g. validation, character counters, conditional
 *     helper text) without growing the editor file.
 *
 * All behavior is identical to the v0.7.1.1 inline version.
 * `data-testid`s on `step-model` and `step-output-var`
 * are preserved so existing RTL tests keep passing.
 * (`step-name` stays in `NodeCard`.)
 */

import type { WorkflowNode, WorkflowNodeOnFailure } from "@/lib/types";
import { PROVIDERS, FAILURE_STRATEGIES } from "./node-constants";

export interface NodeFieldsProps {
  node: WorkflowNode;
  onUpdate: (patch: Partial<WorkflowNode>) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}

export function NodeFields({ node, onUpdate, t }: NodeFieldsProps) {
  return (
    <>
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
    </>
  );
}
