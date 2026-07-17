/**
 * v0.7.2 (P1 #4): extracted from `WorkflowEditor.tsx`.
 * These two arrays drive the `<select>` options in the
 * node editor's provider and on-failure pickers. They
 * live in their own file because:
 *   - the editor file is too big already (was 950 lines),
 *   - `NodeFields.tsx` needs them (and shouldn't have to
 *     reach into the editor file just to import two
 *     const arrays),
 *   - v0.7.3+ can add validation helpers ("is this
 *     provider supported by the local pi?", "is this
 *     strategy allowed when the node has no fallback
 *     model?") without touching the editor file.
 *
 * The arrays are typed as `WorkflowProvider[]` and
 * `WorkflowNodeOnFailure[]` so a future addition to
 * either type would surface as a TypeScript error here
 * (the picker would silently lack the new option
 * otherwise — same failure mode the v0.6.18 connection
 * direction had before the per-edge `<select>` was
 * switched to read from the type union).
 */

import type { WorkflowProvider, WorkflowNodeOnFailure } from "@/lib/types";

export const PROVIDERS: WorkflowProvider[] = [
  "anthropic",
  "openai",
  "google",
  "ollama",
  "custom",
];

export const FAILURE_STRATEGIES: WorkflowNodeOnFailure[] = [
  "stop",
  "skip",
  "retry",
  "escalate",
];
