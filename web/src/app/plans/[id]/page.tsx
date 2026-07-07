/**
 * /plans/[id] — Plan detail page.
 *
 * v0.5.7: shows Plan metadata + Tasks + Steps + lifecycle controls
 * (Start / Pause / Resume / Cancel / Delete). Tasks and Steps come
 * from the TOML on disk via service.getPlan().
 *
 * Why server-component: lifecycle controls are forms that POST to
 * server actions. The page renders status badges with colors that
 * come from the i18n dict + Tailwind-free inline styles. All state
 * stays in the URL via search params (created=1, started=1, etc.).
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import type { Plan, PlanStatus, StepAction } from "@/lib/types";
import { T } from "@/components/I18n";
import { SubmitButton, DeleteButton } from "@/components/Buttons";
import {
  startPlanForm,
  pausePlanForm,
  resumePlanForm,
  cancelPlanForm,
  deletePlanForm,
} from "@/lib/actions";
import { negotiateLocale, renderT } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    started?: string;
    paused?: string;
    resumed?: string;
    cancelled?: string;
    error?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(id);

  let plan: Plan | null = null;
  let notFound = false;
  let loadError: string | null = null;
  try {
    plan = await api.plan(decoded);
    if (!plan) notFound = true;
  } catch (e) {
    loadError = (e as Error).message;
  }

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const statusLabel = (s: PlanStatus): string =>
    renderT(locale, `plans.status.${s}`);
  const statusColor = (s: PlanStatus): string => {
    switch (s) {
      case "draft":
        return "var(--text-muted)";
      case "running":
        return "var(--accent)";
      case "paused":
        return "var(--accent-2)";
      case "completed":
        return "var(--accent-2)";
      case "failed":
        return "var(--error)";
      case "cancelled":
        return "var(--text-muted)";
    }
  };

  // Helper — which lifecycle buttons to show given current status.
  // Service layer is the real source of truth for transitions; the
  // client just hides buttons the server would reject anyway.
  const can = {
    start: plan?.status === "draft",
    pause: plan?.status === "running",
    resume: plan?.status === "paused",
    cancel: plan?.status === "running" || plan?.status === "paused",
  };

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/plans">
          ← <T k="plans.h1" />
        </Link>
      </div>

      {/* Banner area — banner per search param */}
      {sp.created && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--accent-2)" }}
          role="status"
        >
          ✓ <T k="plans.action.created" />:{" "}
          <code className="kbd">{decoded}</code>
        </div>
      )}
      {sp.started && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--accent-2)" }}
          role="status"
        >
          ▶ <T k="plans.detail.executorNote" />
        </div>
      )}
      {sp.paused && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--accent-2)" }}
          role="status"
        >
          ⏸ <T k="plans.action.paused" />
        </div>
      )}
      {sp.resumed && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--accent-2)" }}
          role="status"
        >
          ▶ <T k="plans.action.resumed" />
        </div>
      )}
      {sp.cancelled && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--text-muted)" }}
          role="status"
        >
          ✕ <T k="plans.action.cancelled" />
        </div>
      )}
      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {sp.error}
        </div>
      )}

      {notFound && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          Plan <code className="kbd">{decoded}</code> not found.
        </div>
      )}
      {loadError && !notFound && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {loadError}
        </div>
      )}

      {plan && (
        <>
          {/* Header */}
          <header className="surface rounded-lg p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h1 className="text-xl font-bold">
                <T k="plans.detail.h1" params={{ id: plan.id }} />
              </h1>
              <span
                className="text-sm font-medium"
                style={{ color: statusColor(plan.status) }}
              >
                {statusLabel(plan.status)}
              </span>
            </div>
            <p className="text-sm mt-2 text-[var(--text)]">{plan.goal}</p>
            <div className="text-xs text-[var(--text-muted)] mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <T k="plans.detail.strategy" />:{" "}
                <code className="kbd">{plan.strategy}</code>
              </span>
              <span>
                <T k="plans.detail.created" />:{" "}
                <code className="kbd">{plan.createdAt}</code>
              </span>
              <span>
                <T k="plans.detail.updated" />:{" "}
                <code className="kbd">{plan.updatedAt}</code>
              </span>
              {plan.startedAt && (
                <span>
                  <T k="plans.detail.started" />:{" "}
                  <code className="kbd">{plan.startedAt}</code>
                </span>
              )}
              {plan.completedAt && (
                <span>
                  <T k="plans.detail.completed" />:{" "}
                  <code className="kbd">{plan.completedAt}</code>
                </span>
              )}
            </div>
          </header>

          {/* Context */}
          {(plan.context.cwd ||
            plan.context.activeProfile ||
            plan.context.gitBranch) && (
            <section className="surface rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
                <T k="plans.detail.context" />
              </h2>
              <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                {plan.context.cwd && (
                  <>
                    <dt className="text-[var(--text-muted)]">
                      <T k="plans.detail.cwd" />
                    </dt>
                    <dd>
                      <code className="kbd">{plan.context.cwd}</code>
                    </dd>
                  </>
                )}
                {plan.context.activeProfile && (
                  <>
                    <dt className="text-[var(--text-muted)]">
                      <T k="plans.detail.profile" />
                    </dt>
                    <dd>
                      <code className="kbd">{plan.context.activeProfile}</code>
                    </dd>
                  </>
                )}
                {plan.context.gitBranch && (
                  <>
                    <dt className="text-[var(--text-muted)]">branch</dt>
                    <dd>
                      <code className="kbd">{plan.context.gitBranch}</code>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          )}

          {/* Tasks */}
          <section className="surface rounded-lg p-4">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              <T k="plans.detail.tasks" /> ({plan.tasks.length})
            </h2>
            {plan.tasks.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                <T k="plans.detail.noTasks" />
              </p>
            ) : (
              <ol className="space-y-3 list-none">
                {plan.tasks.map((task, i) => (
                  <li
                    key={task.id}
                    className="border-l-2 pl-3"
                    style={{
                      borderColor:
                        task.status === "completed"
                          ? "var(--accent-2)"
                          : task.status === "running"
                            ? "var(--accent)"
                            : task.status === "failed"
                              ? "var(--error)"
                              : "var(--border)",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <p className="text-sm">
                        <span className="text-[var(--text-muted)] mr-1">
                          {i + 1}.
                        </span>
                        <span className="font-medium">{task.description}</span>
                      </p>
                      <span className="text-xs text-[var(--text-muted)]">
                        [{task.status}]
                      </span>
                    </div>
                    {(task.profile || task.requiredTools.length > 0) && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {task.profile && (
                          <span>
                            profile:{" "}
                            <code className="kbd">{task.profile}</code>{" "}
                          </span>
                        )}
                        {task.requiredTools.length > 0 && (
                          <span>
                            tools:{" "}
                            {task.requiredTools.map((t, ti) => (
                              <span key={t}>
                                <code className="kbd">{t}</code>
                                {ti < task.requiredTools.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </span>
                        )}
                      </p>
                    )}
                    {task.steps.length > 0 && (
                      <ul className="mt-2 space-y-1 list-none">
                        {task.steps.map((step) => (
                          <li
                            key={step.id}
                            className="text-xs text-[var(--text-muted)]"
                          >
                            <span className="mr-1">↳</span>
                            <span className="font-mono">
                              {formatAction(step.action)}
                            </span>
                            <span className="ml-2">[{step.status}]</span>
                            {step.output && (
                              <span
                                className="ml-2"
                                style={{
                                  color: step.output.success
                                    ? "var(--accent-2)"
                                    : "var(--error)",
                                }}
                              >
                                {step.output.success ? "✓" : "✗"}{" "}
                                {step.output.summary ?? step.output.error ?? ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Lifecycle controls */}
          <section className="surface rounded-lg p-4">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              <T k="plans.detail.actions" />
            </h2>
            <div className="flex flex-wrap gap-2">
              {can.start && (
                <form action={startPlanForm}>
                  <input type="hidden" name="id" value={plan.id} />
                  <SubmitButton pendingLabel="…">
                    ▶ <T k="plans.action.start" />
                  </SubmitButton>
                </form>
              )}
              {can.pause && (
                <form action={pausePlanForm}>
                  <input type="hidden" name="id" value={plan.id} />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm rounded surface-2 text-[var(--text)] hover:border-[var(--accent-2)]"
                  >
                    ⏸ <T k="plans.action.pause" />
                  </button>
                </form>
              )}
              {can.resume && (
                <form action={resumePlanForm}>
                  <input type="hidden" name="id" value={plan.id} />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm rounded surface-2 text-[var(--text)] hover:border-[var(--accent-2)]"
                  >
                    ▶ <T k="plans.action.resume" />
                  </button>
                </form>
              )}
              {can.cancel && (
                <form action={cancelPlanForm}>
                  <input type="hidden" name="id" value={plan.id} />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm rounded surface-2 text-[var(--text)] hover:border-[var(--error)]"
                    style={{ color: "var(--error)" }}
                  >
                    ✕ <T k="plans.action.cancel" />
                  </button>
                </form>
              )}
              <span className="flex-1" />
              <DeleteButton
                name={plan.id}
                label={`🗑 ${renderT(locale, "plans.action.delete")}`}
                action={deletePlanForm}
                confirmMessage={renderT(locale, "plans.detail.confirmDelete")}
              />
            </div>
            {can.start && (
              <p className="text-xs text-[var(--text-muted)] mt-3">
                <T k="plans.detail.startHint" />
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function formatAction(action: StepAction): string {
  switch (action.type) {
    case "pilot_command":
      return `pilot ${action.command} ${(action.args ?? []).join(" ")}`.trim();
    case "pi_session":
      return `pi session: "${action.prompt.slice(0, 60)}${action.prompt.length > 60 ? "…" : ""}"`;
    case "profile_switch":
      return `switch profile: ${action.profile}`;
    case "pack_install":
      return `install: ${action.source}`;
    case "policy_apply":
      return `apply policy: ${action.policy}`;
    case "condition":
      return `if ${action.check.slice(0, 60)}`;
    case "wait":
      return `wait: ${action.condition.slice(0, 60)}`;
    case "manual":
      return `manual: ${action.prompt.slice(0, 60)}`;
  }
}
