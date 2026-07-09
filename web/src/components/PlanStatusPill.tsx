import type { PlanStatus, TaskStatus, StepStatus } from "@/lib/types";

/**
 * <PlanStatusPill> — colored status badge for Plan / Task / Step.
 *
 * Reuses the design tokens added in v0.5.11 (`.pill` / `.pill.ok` /
 * `.pill.warn` / `.pill.error` / `.pill.neutral`) so the visual
 * treatment stays consistent across Plan header, task list, and
 * step list.
 *
 * `kind` chooses which i18n namespace to look up:
 *   - "plan"   → plans.status.{value}
 *   - "task"   → plans.taskStatus.{value}
 *   - "step"   → plans.stepStatus.{value}
 *
 * `t` is a translator function (passed in so this component stays
 * a server component — RSC forbids passing functions directly, but
 * the parent already has one in scope).
 */
export function PlanStatusPill({
  kind,
  value,
  t,
}: {
  kind: "plan" | "task" | "step";
  value: PlanStatus | TaskStatus | StepStatus;
  t: (k: string) => string;
}) {
  const key = `plans.${kind === "plan" ? "status" : `${kind}Status`}.${value}`;
  const tone = pillTone(value);
  return (
    <span className={`pill ${tone}`} aria-label={t(key)}>
      {t(key)}
    </span>
  );
}

/**
 * Map a status to a tone. Plan statuses use the broader plan-level
 * palette (draft = neutral, running = ok, failed/cancelled = warn/
 * error, etc.); task and step statuses follow the same color
 * convention so the UI feels unified.
 */
function pillTone(value: string): "ok" | "warn" | "error" | "neutral" {
  if (value === "completed") return "ok";
  if (value === "failed") return "error";
  if (value === "cancelled") return "warn";
  if (value === "skipped") return "neutral";
  if (value === "blocked") return "warn";
  if (value === "running") return "ok";
  // pending / draft / paused / unknown → neutral
  return "neutral";
}
