import type { PlanEvent, PlanEventType } from "@/lib/types";

/**
 * <PlanEventTimeline> — chronological list of plan lifecycle events.
 *
 * Reads from `~/.pilot/plans-history/<id>_*.jsonl` via the
 * `GET /plans/:id/events` endpoint. Each event shows:
 *   - timestamp (rendered as locale-aware time + date)
 *   - event type (translated, with a tone pill)
 *   - the `data` payload, summarized when it has taskId / stepId /
 *     summary / error fields
 *
 * Why a flat list and not a vertical timeline with connecting
 * lines: the user is reviewing what happened, not visualizing a
 * process flow. A bulleted list with timestamps reads faster than
 * a graphic for an event log.
 *
 * v0.5.13+: server-component safe (no "use client").
 */
export function PlanEventTimeline({
  events,
  t,
}: {
  events: PlanEvent[];
  t: (k: string) => string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] italic">
        {t("plans.detail.events.empty")}
      </p>
    );
  }

  return (
    <ol className="space-y-2 list-none">
      {events.map((event, i) => (
        <li
          key={`${event.timestamp}-${i}`}
          className="text-xs flex items-baseline gap-3"
        >
          <time
            dateTime={event.timestamp}
            className="text-[var(--text-muted)] font-mono shrink-0"
          >
            {formatTimestamp(event.timestamp)}
          </time>
          <span className={`pill ${toneForEvent(event.type)} shrink-0`}>
            {t(`plans.event.${event.type}`)}
          </span>
          <span className="text-[var(--text)] truncate">
            {summarizeData(event, t)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Compact human-readable timestamp. ISO → "07-09 13:42:08" (local
 * time). Skips the year because plans are recent; keeps the date
 * so users can spot yesterday's events at a glance.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Tone pill per event type. Plan-level events get stronger colors
 * (they're user-visible state changes); task/step events are more
 * neutral (verbose).
 */
function toneForEvent(
  type: PlanEventType,
): "ok" | "warn" | "error" | "neutral" {
  if (
    type === "plan_completed" ||
    type === "task_completed" ||
    type === "step_completed"
  )
    return "ok";
  if (
    type === "plan_failed" ||
    type === "task_failed" ||
    type === "step_failed"
  )
    return "error";
  if (type === "plan_cancelled" || type === "task_skipped") return "warn";
  return "neutral";
}

/**
 * Render a one-liner summary of the event payload. We pull the
 * fields that matter (taskId / stepId / summary / error / goal /
 * strategy) and show them verbatim — these strings are short and
 * were written by us (not user content), so no escaping needed.
 */
function summarizeData(event: PlanEvent, t: (k: string) => string): string {
  const d = event.data;
  // Try the most informative field first.
  if (typeof d.summary === "string") return d.summary;
  if (typeof d.error === "string") return d.error;
  if (typeof d.goal === "string") return d.goal;
  if (typeof d.taskId === "string")
    return `${t("plans.detail.tasks")}: ${d.taskId}`;
  if (typeof d.stepId === "string") return `step: ${d.stepId}`;
  if (typeof d.strategy === "string") return `strategy: ${d.strategy}`;
  return "—";
}
