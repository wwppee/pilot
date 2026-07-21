/**
 * /workflow — v1.0.1: 7-module nav placeholder for the Workflow module.
 *
 * Merges the 3 legacy workflow surfaces: Compose (visual canvas),
 * Plans (decomposed goals), Workflows (reusable templates). v1.0.2
 * will keep the canvas as the primary editor but unify the data
 * model so a plan and a workflow are the same thing under the hood
 * (a workflow is a plan that has been run at least once and saved).
 *
 * v1.0.2 will replace this stub with the real Workflow module:
 *   - canvas editor (the existing /compose) as primary view
 *   - list of plans / workflows with status (draft / running /
 *     completed / failed)
 *   - "extract workflow from session" button (Phase 4)
 *   - template marketplace (Phase 5)
 */
import { T } from "@/components/I18n";
export const dynamic = "force-dynamic";

export default function WorkflowPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="hub-h1">
          <T k="workflow.h1" />
        </h1>
        <p className="hub-subtitle">
          <T k="workflow.subtitle" />
        </p>
      </header>

      <div className="surface rounded-lg p-6 text-sm text-[var(--text-muted)]">
        <p className="mb-3">
          <strong className="text-[var(--text)]">
            <T k="workflow.comingSoon.title" />
          </strong>
        </p>
        <p className="mb-4">
          <T k="workflow.comingSoon.body" />
        </p>
        <p className="text-xs">
          <T k="workflow.comingSoon.routes" />
          <code className="kbd ml-1">/compose</code>
          <code className="kbd ml-1">/plans</code>
          <code className="kbd ml-1">/workflows</code>
        </p>
      </div>
    </div>
  );
}
