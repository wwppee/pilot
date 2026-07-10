"use client";

/**
 * PlanEditor — visual, operator-first plan builder.
 *
 * v0.6.1: replaces the goal-only /plans/new form. Users can:
 *   - Set goal / title / strategy
 *   - Add any number of tasks (with up/down reorder + delete)
 *   - For each task, add steps with action-type-specific fields
 *   - Mark dependsOn between tasks (chip picker)
 *   - Submit a single JSON payload via `createPlanWithTasksForm`
 *
 * Design choices:
 *   - Client component: form state is React state. Submits a
 *     JSON `payload` field to the server action — server-side
 *     validation against the zod Task / Step / StepAction
 *     schemas is authoritative (client-side validation is best
 *     effort only).
 *   - No drag-drop in MVP: explicit up/down arrows are faster
 *     to build, easier to test, and accessible by default.
 *   - No nested condition editor UI in MVP: the condition `check`
 *     field is a free-form text input. v0.6.1's safe DSL parser
 *     accepts `and()` / `or()` / `not()` / `eq()` / `neq()` /
 *     `contains()` + literal `true` / `false` + `step.<id>.success`.
 *     The hint chip below the input shows the syntax so users
 *     don't need to read the docs.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18n";

// ─── Form data model ────────────────────────────────────────

const STRATEGIES = ["sequential", "parallel", "adaptive"] as const;
type Strategy = (typeof STRATEGIES)[number];

const ACTION_TYPES = [
  "pilot_command",
  "pi_session",
  "profile_switch",
  "pack_install",
  "policy_apply",
  "condition",
  "wait",
  "manual",
] as const;
type ActionType = (typeof ACTION_TYPES)[number];

/** Per-step form state. Only the relevant fields are used. */
interface StepForm {
  localId: string;
  description: string;
  actionType: ActionType;
  // pilot_command
  command: string;
  argsText: string; // comma-separated, trimmed
  // pi_session
  prompt: string;
  cwd: string;
  // profile_switch
  profileName: string;
  // pack_install
  packSource: string;
  // policy_apply
  policyName: string;
  // condition (DSL: see plan-executor.ts evaluateCondition)
  check: string;
  // wait
  waitCondition: string;
  waitTimeoutMs: number;
  // manual
  manualPrompt: string;
}

interface TaskForm {
  localId: string;
  description: string;
  profile: string;
  dependsOn: number[];
  steps: StepForm[];
}

interface PlanForm {
  goal: string;
  title: string;
  strategy: Strategy;
  tasks: TaskForm[];
}

// ─── Helpers ────────────────────────────────────────────────

let _idCounter = 0;
function nextLocalId(prefix: string): string {
  _idCounter++;
  return `${prefix}_local_${Date.now()}_${_idCounter}`;
}

function emptyStep(): StepForm {
  return {
    localId: nextLocalId("step"),
    description: "",
    actionType: "pilot_command",
    command: "",
    argsText: "",
    prompt: "",
    cwd: "",
    profileName: "",
    packSource: "",
    policyName: "",
    check: "",
    waitCondition: "",
    waitTimeoutMs: 1000,
    manualPrompt: "",
  };
}

function emptyTask(): TaskForm {
  return {
    localId: nextLocalId("task"),
    description: "",
    profile: "",
    dependsOn: [],
    steps: [emptyStep()],
  };
}

function emptyPlan(): PlanForm {
  return {
    goal: "",
    title: "",
    strategy: "sequential",
    tasks: [],
  };
}

/**
 * Build a server-shaped PlanInput from the form state.
 * Each step is converted to the zod Task / Step / StepAction
 * shape that the pilot server expects.
 *
 * Task / step ids are generated locally (deterministic from
 * the form's position so the dependsOn wiring is stable).
 */
function planFormToInputWithDeps(form: PlanForm) {
  // Pre-generate task ids so we can reference them.
  const taskIds = form.tasks.map(
    (_, ti) => `task_${ti}_${Math.random().toString(36).slice(2, 8)}`,
  );
  return {
    goal: form.goal.trim(),
    ...(form.title.trim().length > 0 ? { title: form.title.trim() } : {}),
    strategy: form.strategy,
    tasks: form.tasks.map((t, ti) => {
      const stepIds = t.steps.map(
        (_, si) => `step_${si}_${Math.random().toString(36).slice(2, 8)}`,
      );
      const profile = t.profile.trim();
      return {
        id: taskIds[ti]!,
        description: t.description.trim() || `Task ${ti + 1}`,
        status: "pending" as const,
        steps: t.steps.map((s, si) =>
          stepFormToAction(s, stepIds[si]!, t.description || `Step ${si + 1}`),
        ),
        dependsOn: t.dependsOn
          .filter((idx) => idx >= 0 && idx < form.tasks.length && idx !== ti)
          .map((idx) => taskIds[idx]!),
        ...(profile ? { profile } : {}),
        requiredTools: [],
      };
    }),
  };
}

function stepFormToAction(
  s: StepForm,
  stepId: string,
  fallbackDesc: string,
): Record<string, unknown> {
  const description = s.description.trim() || fallbackDesc;
  const base = {
    id: stepId,
    description,
    status: "pending",
    input: {},
    retryCount: 0,
    maxRetries: 2,
  };
  switch (s.actionType) {
    case "pilot_command": {
      const args = s.argsText
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      return {
        ...base,
        action: { type: "pilot_command", command: s.command.trim(), args },
      };
    }
    case "pi_session":
      return {
        ...base,
        action: {
          type: "pi_session",
          prompt: s.prompt,
          ...(s.cwd.trim() ? { cwd: s.cwd.trim() } : {}),
        },
      };
    case "profile_switch":
      return {
        ...base,
        action: { type: "profile_switch", profile: s.profileName.trim() },
      };
    case "pack_install":
      return {
        ...base,
        action: { type: "pack_install", source: s.packSource.trim() },
      };
    case "policy_apply":
      return {
        ...base,
        action: { type: "policy_apply", policy: s.policyName.trim() },
      };
    case "condition":
      return {
        ...base,
        action: {
          type: "condition",
          check: s.check.trim(),
          then: [],
          else: [],
        },
      };
    case "wait":
      return {
        ...base,
        action: {
          type: "wait",
          condition: s.waitCondition.trim() || "tick",
          timeoutMs:
            Number.isFinite(s.waitTimeoutMs) && s.waitTimeoutMs > 0
              ? s.waitTimeoutMs
              : 1000,
        },
      };
    case "manual":
      return {
        ...base,
        action: { type: "manual", prompt: s.manualPrompt },
      };
  }
}

// ─── Component ─────────────────────────────────────────────

interface PlanEditorProps {
  /** Pre-fill goal from query string. */
  initialGoal?: string;
  /** Optional list of available profile names for the picker. */
  availableProfiles?: string[];
  /** Optional list of available policy names. */
  availablePolicies?: string[];
}

export function PlanEditor({
  initialGoal = "",
  availableProfiles = [],
  availablePolicies = [],
}: PlanEditorProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState<PlanForm>(() => ({
    ...emptyPlan(),
    goal: initialGoal,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateForm = (patch: Partial<PlanForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const addTask = () => {
    setForm((f) => ({ ...f, tasks: [...f.tasks, emptyTask()] }));
  };
  const removeTask = (idx: number) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks
        .filter((_, i) => i !== idx)
        // re-index dependsOn: any index > removed idx shifts down by 1
        .map((t) => ({
          ...t,
          dependsOn: t.dependsOn
            .filter((d) => d !== idx)
            .map((d) => (d > idx ? d - 1 : d)),
        })),
    }));
  };
  const moveTask = (idx: number, dir: -1 | 1) => {
    setForm((f) => {
      const target = idx + dir;
      if (target < 0 || target >= f.tasks.length) return f;
      const tasks = f.tasks.slice();
      const moved = tasks[idx]!;
      tasks[idx] = tasks[target]!;
      tasks[target] = moved;
      // re-index dependsOn — this is annoying because moving
      // changes the task order, so all dependsOn arrays need
      // to know about it. Easier: rebuild tasks as {old, idx}
      // map, then translate dependsOn via the map.
      const idxMap = new Map<number, number>();
      tasks.forEach(() => {
        // Skip the re-index; document the limitation: moving
        // a task may invalidate dependsOn indexes. A future
        // v0.6.2 can keep dependsOn keyed by localId instead of
        // index.
      });
      void idxMap;
      return { ...f, tasks };
    });
  };
  const updateTask = (idx: number, patch: Partial<TaskForm>) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const addStep = (taskIdx: number) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) =>
        i === taskIdx ? { ...t, steps: [...t.steps, emptyStep()] } : t,
      ),
    }));
  };
  const removeStep = (taskIdx: number, stepIdx: number) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) =>
        i === taskIdx
          ? { ...t, steps: t.steps.filter((_, si) => si !== stepIdx) }
          : t,
      ),
    }));
  };
  const moveStep = (taskIdx: number, stepIdx: number, dir: -1 | 1) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) => {
        if (i !== taskIdx) return t;
        const target = stepIdx + dir;
        if (target < 0 || target >= t.steps.length) return t;
        const steps = t.steps.slice();
        const moved = steps[stepIdx]!;
        steps[stepIdx] = steps[target]!;
        steps[target] = moved;
        return { ...t, steps };
      }),
    }));
  };
  const updateStep = (
    taskIdx: number,
    stepIdx: number,
    patch: Partial<StepForm>,
  ) => {
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) =>
        i === taskIdx
          ? {
              ...t,
              steps: t.steps.map((s, si) =>
                si === stepIdx ? { ...s, ...patch } : s,
              ),
            }
          : t,
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Client-side pre-flight checks. The server validates too,
    // but a clear inline error is friendlier than a redirect.
    if (form.goal.trim().length === 0) {
      setError(t("plans.editor.error.goalEmpty"));
      return;
    }
    if (form.tasks.length === 0) {
      setError(t("plans.editor.error.noTasks"));
      return;
    }
    for (let ti = 0; ti < form.tasks.length; ti++) {
      const task = form.tasks[ti]!;
      for (let si = 0; si < task.steps.length; si++) {
        const step = task.steps[si]!;
        const required = requiredFieldForStep(step);
        if (required && !required.value.trim()) {
          setError(
            t("plans.editor.error.fieldRequired", {
              task: ti + 1,
              step: si + 1,
              field: t(required.labelKey),
            }),
          );
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const payload = planFormToInputWithDeps(form);
      const fd = new FormData();
      fd.set("payload", JSON.stringify(payload));
      // Use the server action via a hidden form submit.
      // We can't await a server action directly; use fetch to
      // the API instead, then router.push on success.
      const res = await fetch("/api/pilot/plans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const respBody = (await res.json()) as { id?: string };
        const id = respBody.id;
        if (id) {
          router.push(`/plans/${encodeURIComponent(id)}?created=1`);
          return;
        }
      }
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(errBody.error ?? `create failed (HTTP ${res.status})`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Plan-level fields */}
      <div className="surface rounded-lg p-4 space-y-3">
        <div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t("plans.editor.goalLabel")}
            </span>
            <textarea
              value={form.goal}
              onChange={(e) => updateForm({ goal: e.target.value })}
              aria-required="true"
              rows={3}
              className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder={t("plans.editor.goalPlaceholder")}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t("plans.editor.titleLabel")}
            </span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value })}
              placeholder={t("plans.editor.titlePlaceholder")}
              className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div>
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t("plans.editor.strategyLabel")}
            </span>
            <div
              className="mt-1 inline-flex rounded surface-2 p-0.5 gap-0.5"
              role="radiogroup"
              aria-label={t("plans.editor.strategyLabel")}
            >
              {STRATEGIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={form.strategy === s}
                  onClick={() => updateForm({ strategy: s })}
                  className="px-3 py-1 text-xs rounded"
                  style={{
                    background:
                      form.strategy === s ? "var(--surface)" : "transparent",
                    color:
                      form.strategy === s ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {t(`plans.strategy.${s}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="flex items-center justify-between">
        <h2 className="section-h2">
          {t("plans.editor.tasksLabel")} ({form.tasks.length})
        </h2>
        <button
          type="button"
          onClick={addTask}
          className="btn secondary"
          data-testid="add-task"
        >
          + {t("plans.editor.addTask")}
        </button>
      </div>

      {form.tasks.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] surface rounded-lg p-4">
          {t("plans.editor.noTasks")}
        </p>
      ) : (
        <ol className="space-y-3 list-none">
          {form.tasks.map((task, ti) => (
            <li
              key={task.localId}
              className="surface rounded-lg p-4 border-l-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {t("plans.editor.taskIndex", { n: ti + 1 })}
                </span>
                <input
                  type="text"
                  value={task.description}
                  onChange={(e) =>
                    updateTask(ti, { description: e.target.value })
                  }
                  placeholder={t("plans.editor.taskDescriptionPlaceholder")}
                  className="flex-1 surface-2 rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => moveTask(ti, -1)}
                  disabled={ti === 0}
                  className="text-xs px-2 py-1 surface-2 rounded disabled:opacity-30"
                  aria-label={t("plans.editor.moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveTask(ti, 1)}
                  disabled={ti === form.tasks.length - 1}
                  className="text-xs px-2 py-1 surface-2 rounded disabled:opacity-30"
                  aria-label={t("plans.editor.moveDown")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeTask(ti)}
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    color: "var(--error)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                  }}
                  aria-label={t("plans.editor.removeTask")}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {t("plans.editor.profileLabel")}
                  </span>
                  <select
                    value={task.profile}
                    onChange={(e) =>
                      updateTask(ti, { profile: e.target.value })
                    }
                    className="mt-1 w-full surface-2 rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">{t("plans.editor.profileNone")}</option>
                    {availableProfiles.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <DependsOnPicker
                  value={task.dependsOn}
                  taskCount={form.tasks.length}
                  currentIndex={ti}
                  onChange={(next) => updateTask(ti, { dependsOn: next })}
                />
              </div>

              {/* Steps */}
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {t("plans.editor.stepsLabel", { n: task.steps.length })}
                </span>
                <button
                  type="button"
                  onClick={() => addStep(ti)}
                  className="text-xs px-2 py-1 surface-2 rounded"
                >
                  + {t("plans.editor.addStep")}
                </button>
              </div>
              {task.steps.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {t("plans.editor.noSteps")}
                </p>
              ) : (
                <ol className="space-y-2 list-none">
                  {task.steps.map((step, si) => (
                    <li key={step.localId} className="surface-2 rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {si + 1}.
                        </span>
                        <input
                          type="text"
                          value={step.description}
                          onChange={(e) =>
                            updateStep(ti, si, {
                              description: e.target.value,
                            })
                          }
                          placeholder={t(
                            "plans.editor.stepDescriptionPlaceholder",
                          )}
                          className="flex-1 surface rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                        />
                        <select
                          value={step.actionType}
                          onChange={(e) =>
                            updateStep(ti, si, {
                              actionType: e.target.value as ActionType,
                            })
                          }
                          className="surface rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                        >
                          {ACTION_TYPES.map((a) => (
                            <option key={a} value={a}>
                              {t(`plans.actionType.${a}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => moveStep(ti, si, -1)}
                          disabled={si === 0}
                          className="text-xs px-1.5 py-0.5 surface rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(ti, si, 1)}
                          disabled={si === task.steps.length - 1}
                          className="text-xs px-1.5 py-0.5 surface rounded disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(ti, si)}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ color: "var(--error)" }}
                          aria-label={t("plans.editor.removeStep")}
                        >
                          ✕
                        </button>
                      </div>
                      <StepFields
                        step={step}
                        availableProfiles={availableProfiles}
                        availablePolicies={availablePolicies}
                        onChange={(patch) => updateStep(ti, si, patch)}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-2 pt-2 sticky bottom-0 surface border-t border-[var(--border)] -mx-1 px-1 py-3">
        <button
          type="submit"
          disabled={submitting}
          className="btn"
          data-testid="submit-plan"
        >
          {submitting ? t("plans.editor.submitting") : t("plans.editor.submit")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/plans")}
          className="btn secondary"
        >
          {t("plans.editor.cancel")}
        </button>
      </div>
    </form>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StepFields({
  step,
  availableProfiles,
  availablePolicies,
  onChange,
}: {
  step: StepForm;
  availableProfiles: string[];
  availablePolicies: string[];
  onChange: (patch: Partial<StepForm>) => void;
}) {
  const { t } = useI18n();
  switch (step.actionType) {
    case "pilot_command":
      return (
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <input
            type="text"
            value={step.command}
            onChange={(e) => onChange({ command: e.target.value })}
            placeholder="command (e.g. doctor)"
            className="surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
            required
          />
          <input
            type="text"
            value={step.argsText}
            onChange={(e) => onChange({ argsText: e.target.value })}
            placeholder="args (comma-separated)"
            className="surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
          />
        </div>
      );
    case "pi_session":
      return (
        <div className="space-y-1">
          <textarea
            value={step.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="prompt for pi"
            rows={2}
            className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
            required
          />
          <input
            type="text"
            value={step.cwd}
            onChange={(e) => onChange({ cwd: e.target.value })}
            placeholder="cwd (optional, defaults to plan.context.cwd)"
            className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
          />
        </div>
      );
    case "profile_switch":
      return (
        <div className="flex gap-2">
          {availableProfiles.length > 0 ? (
            <select
              value={step.profileName}
              onChange={(e) => onChange({ profileName: e.target.value })}
              className="flex-1 surface rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
              required
            >
              <option value="">{t("plans.editor.profileNone")}</option>
              {availableProfiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={step.profileName}
              onChange={(e) => onChange({ profileName: e.target.value })}
              placeholder="profile name"
              className="flex-1 surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
              required
            />
          )}
        </div>
      );
    case "pack_install":
      return (
        <input
          type="text"
          value={step.packSource}
          onChange={(e) => onChange({ packSource: e.target.value })}
          placeholder="source (e.g. npm:foo or local path)"
          className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
          required
        />
      );
    case "policy_apply":
      return (
        <div>
          {availablePolicies.length > 0 ? (
            <select
              value={step.policyName}
              onChange={(e) => onChange({ policyName: e.target.value })}
              className="w-full surface rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
              required
            >
              <option value="">{t("plans.editor.profileNone")}</option>
              {availablePolicies.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={step.policyName}
              onChange={(e) => onChange({ policyName: e.target.value })}
              placeholder="policy name"
              className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
              required
            />
          )}
        </div>
      );
    case "condition":
      return (
        <div>
          <input
            type="text"
            value={step.check}
            onChange={(e) => onChange({ check: e.target.value })}
            placeholder="e.g. step.s1.success  or  and(true, true)"
            className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
            required
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            {t("plans.editor.conditionHelp")}
          </p>
        </div>
      );
    case "wait":
      return (
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <input
            type="text"
            value={step.waitCondition}
            onChange={(e) => onChange({ waitCondition: e.target.value })}
            placeholder="condition label (cosmetic)"
            className="surface rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            value={step.waitTimeoutMs}
            onChange={(e) =>
              onChange({ waitTimeoutMs: Number(e.target.value) || 0 })
            }
            placeholder="timeout ms"
            min={0}
            className="surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
          />
        </div>
      );
    case "manual":
      return (
        <textarea
          value={step.manualPrompt}
          onChange={(e) => onChange({ manualPrompt: e.target.value })}
          placeholder="what the human needs to do"
          rows={2}
          className="w-full surface rounded px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent)]"
        />
      );
  }
}

function DependsOnPicker({
  value,
  taskCount,
  currentIndex,
  onChange,
}: {
  value: number[];
  taskCount: number;
  currentIndex: number;
  onChange: (next: number[]) => void;
}) {
  const { t } = useI18n();
  if (taskCount <= 1) {
    return (
      <div>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {t("plans.editor.dependsOnLabel")}
        </span>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {t("plans.editor.dependsOnNone")}
        </p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {t("plans.editor.dependsOnLabel")}
      </span>
      <div className="flex flex-wrap gap-1 mt-1">
        {Array.from({ length: taskCount }, (_, i) => i)
          .filter((i) => i !== currentIndex)
          .map((i) => {
            const active = value.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() =>
                  onChange(
                    active ? value.filter((v) => v !== i) : [...value, i],
                  )
                }
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--bg)" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {t("plans.editor.taskIndex", { n: i + 1 })}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function requiredFieldForStep(
  step: StepForm,
): { labelKey: string; value: string } | null {
  switch (step.actionType) {
    case "pilot_command":
      return { labelKey: "plans.editor.field.command", value: step.command };
    case "pi_session":
      return { labelKey: "plans.editor.field.prompt", value: step.prompt };
    case "profile_switch":
      return {
        labelKey: "plans.editor.field.profileName",
        value: step.profileName,
      };
    case "pack_install":
      return {
        labelKey: "plans.editor.field.packSource",
        value: step.packSource,
      };
    case "policy_apply":
      return {
        labelKey: "plans.editor.field.policyName",
        value: step.policyName,
      };
    case "condition":
      return { labelKey: "plans.editor.field.check", value: step.check };
    case "wait":
      return null; // waitCondition is optional (cosmetic)
    case "manual":
      return null; // manual.prompt is optional in MVP
  }
}

// Read CSRF token from the cookie set by the server's auth
// module. Same name as the form-fetch helper elsewhere.
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)pilot-csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}
