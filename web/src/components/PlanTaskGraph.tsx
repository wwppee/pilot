import type { PlanTask } from "@/lib/types";
import { PlanStatusPill } from "./PlanStatusPill";

/**
 * <PlanTaskGraph> — read-only visualization of task dependencies.
 *
 * Layout: a 3-column grid showing, for each task, the task card
 * (with status pill + description) and the list of task ids it
 * depends on. We also pre-compute "blocks" (forward edges: tasks
 * that wait for THIS one) so the user can see the full picture
 * without scrolling.
 *
 *   task_a  [pending]  describe...  depends on: —               blocks: task_b
 *   task_b  [pending]  describe...  depends on: task_a           blocks: task_c
 *
 * Why this shape and not a real SVG/D3 DAG: v0.5.13 ships without
 * the real PlanExecutor, so animated layouts would over-promise.
 * This explicit table makes every edge visible at a glance and
 * works without JS — pure server component.
 *
 * v0.5.13+: server-component safe (no "use client").
 */
export function PlanTaskGraph({
  tasks,
  t,
}: {
  tasks: PlanTask[];
  t: (k: string) => string;
}) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] italic">
        {t("plans.detail.graph.empty")}
      </p>
    );
  }

  // Compute forward adjacency (who waits for me?) once.
  const forward = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      const list = forward.get(dep) ?? [];
      list.push(task.id);
      forward.set(dep, list);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--text-muted)]">
            <th className="text-left font-medium pb-2 pr-3">
              {t("plans.detail.tasks")}
            </th>
            <th className="text-left font-medium pb-2 pr-3">
              {t("plans.detail.dependsOn")}
            </th>
            <th className="text-left font-medium pb-2 pr-3">
              {t("plans.detail.blocks")} →
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const blocks = forward.get(task.id) ?? [];
            const blockedBy = task.dependsOn;
            return (
              <tr
                key={task.id}
                className="border-t border-[var(--border)] align-top"
              >
                <td className="py-2 pr-3">
                  <div className="flex items-baseline gap-2">
                    <code className="kbd">{task.id}</code>
                    <PlanStatusPill kind="task" value={task.status} t={t} />
                  </div>
                  <div className="text-[var(--text)] mt-1 max-w-md">
                    {task.description}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  {blockedBy.length === 0 ? (
                    <span className="text-[var(--text-muted)] italic">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {blockedBy.map((id) => (
                        <li key={id}>
                          <code className="kbd">{id}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {blocks.length === 0 ? (
                    <span className="text-[var(--text-muted)] italic">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {blocks.map((id) => (
                        <li key={id}>
                          <code className="kbd">{id}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
