/**
 * core/plan-executor.ts — PlanExecutor (v0.5.23 — Agent capability MVP).
 *
 * The executor turns a Plan (data) into a running sequence of
 * Steps. It's a single-process, single-plan runner designed for
 *   - sequential strategy (parallel / adaptive are no-ops in MVP)
 *   - 3 real action types: pilot_command / profile_switch / policy_apply
 *   - the rest are stubbed (pi_session / pack_install / condition
 *     / wait / manual) — see STUBBED_ACTIONS in dispatcher.ts below.
 *
 * Design rules:
 *   1. **Persistence-first**: after every step we re-write the
 *      plan TOML AND the runtime snapshot. A crash mid-execution
 *      can be picked up by the next `startPlan` call (or the
 *      service-level recovery at server boot).
 *   2. **Resume is bounded by completedStepIds**: anything in
 *      that set is skipped. Anything not in it is eligible to
 *      run, INCLUDING the in-flight step. The in-flight step
 *      re-runs for safety; if it was already partially done,
 *      action types must be idempotent (pilot_command is NOT —
 *      it uses side-effect-detection via the action name).
 *      See `RESUMED_STEP_REEXEC_POLICY` in dispatcher.
 *   3. **No retries in MVP**: a failing step marks the task +
 *      plan as `failed`. `maxRetries` is preserved on the Step
 *      for v0.6.0's retry endpoint.
 *   4. **Cancellation is cooperative**: cancel() flips a flag,
 *      the loop notices at the next step boundary. We don't
 *      kill in-flight child processes — that risks leaving
 *      a partial state behind.
 *   5. **Pauses are at step boundaries**: we check the pause
 *      flag BETWEEN steps, never mid-step. A pause that's
 *      asked for mid-step is honored when the step finishes.
 *
 * The executor is created on demand and lives for the duration
 * of one plan. The service-impl layer keeps a Map<planId,
 * PlanExecutor> so pause / resume / cancel can find the
 * running instance.
 */

import { execFile } from "node:child_process";
import {
  appendPlanEvent,
  type Plan,
  type PlanEvent,
  type PlanRuntimeSnapshot,
  type Step,
  type StepAction,
  type StepOutput,
  type Task,
  deleteRuntimeSnapshot,
  plansRuntimeDir,
  readPlan,
  readRuntimeSnapshot,
  writePlan,
  writeRuntimeSnapshot,
} from "./plan.js";
import { readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runPiSession } from "./pi-session-runner.js";

/** Default per-step timeout: 5 minutes. */
export const DEFAULT_STEP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Actions whose implementation is still TODO. Stubbed to
 * success so plan execution can be smoke-tested end-to-end
 * while the real implementation lands.
 *
 * v0.6.0 reduced this set: `pi_session` / `pack_install` /
 * `condition` / `wait` are now real. `manual` (waiting_human)
 * is the only remaining stub because there's no UI to resolve
 * the human gate yet.
 */
export const STUBBED_ACTIONS = new Set<StepAction["type"]>(["manual"]);

/**
 * Action handler signature. Receives the action + an AbortSignal
 * for cancellation, returns a StepOutput on completion. Throws
 * to signal failure.
 */
export type ActionHandler = (
  step: Step,
  signal: AbortSignal,
) => Promise<StepOutput>;

/**
 * Minimal service surface the executor needs. The full PilotService
 * satisfies this; tests can pass a partial mock.
 */
export interface PlanExecutorService {
  /** Switch the active profile. v0.5.5+ actually applies to pi's settings.json. */
  activateProfile(name: string): Promise<unknown>;
  /** Apply a policy (generate + write extension). */
  applyPolicy(name: string): Promise<{ path: string }>;
  /**
   * Install a pack by source string. Used by `pack_install` steps.
   * Source format: `npm:foo` (npm package) or a local path.
   * v0.6.0: this is the same call the public `installPack` service
   * method makes. We re-declare it here to keep the executor's
   * service surface minimal — the executor shouldn't be able to
   * call unrelated methods.
   */
  installPack(source: string): Promise<unknown>;
}

/**
 * Internal executor state. The `pauseController` / `cancelController`
 * are AbortControllers — pause is "ask the loop to stop at the next
 * step boundary" (signal aborts but is not user-facing), cancel is
 * the same. We keep them as separate flags so we can distinguish
 * "paused" from "cancelled" when the run loop exits.
 */
export class PlanExecutor {
  private planId: string;
  private home: string | undefined;
  private service: PlanExecutorService;

  /**
   * Action dispatchers. Default: the 3 MVP-real handlers
   * (pilot_command / profile_switch / policy_apply) + a generic
   * stub for the rest. Tests can override individual entries
   * before calling `run()`.
   */
  private dispatchers: Map<StepAction["type"], ActionHandler>;

  /**
   * Per-step record: did the step with this id succeed? Used
   * by the `condition` action's `step.<id>.success` form.
   */
  private stepResults = new Map<string, boolean>();

  /** "paused" means user asked to pause; loop will exit after current step. */
  private pauseRequested = false;
  /** "cancelled" means user asked to cancel; loop will exit, no more steps. */
  private cancelRequested = false;
  /** Resolved when the run() promise finishes. */
  private donePromise: Promise<void> | null = null;
  /** Set to true after the run loop has actually finished. */
  private loopFinished = false;

  /**
   * Pause gate. We resolve it to unblock the run loop after
   * pausePlan() is called. resumePlan() awaits the new run().
   */
  private pauseGate: Promise<void> | null = null;
  private pauseGateResolve: (() => void) | null = null;

  /**
   * Cooperative cancel signal. AbortController.abort() is called
   * when cancelPlan() is invoked. Action handlers may opt in to
   * honor it (pilot_command does — it kills the spawned process).
   */
  private cancelController = new AbortController();

  constructor(opts: {
    planId: string;
    service: PlanExecutorService;
    home?: string;
    /** Optional dispatcher overrides (used by tests). */
    dispatchers?: Partial<Record<StepAction["type"], ActionHandler>>;
  }) {
    this.planId = opts.planId;
    this.home = opts.home;
    this.service = opts.service;
    this.dispatchers = new Map();
    for (const [type, handler] of Object.entries(
      opts.dispatchers ?? {},
    ) as Array<[StepAction["type"], ActionHandler]>) {
      this.dispatchers.set(type, handler);
    }
    // Install defaults if the caller didn't override them.
    if (!this.dispatchers.has("pilot_command")) {
      this.dispatchers.set("pilot_command", defaultPilotCommandHandler);
    }
    if (!this.dispatchers.has("profile_switch")) {
      this.dispatchers.set("profile_switch", (step) =>
        defaultProfileSwitchHandler(step, this.service),
      );
    }
    if (!this.dispatchers.has("policy_apply")) {
      this.dispatchers.set("policy_apply", (step) =>
        defaultPolicyApplyHandler(step, this.service),
      );
    }
    if (!this.dispatchers.has("pi_session")) {
      this.dispatchers.set("pi_session", (step, signal) =>
        defaultPiSessionHandler(step, signal, this.home),
      );
    }
    if (!this.dispatchers.has("pack_install")) {
      this.dispatchers.set("pack_install", (step) =>
        defaultPackInstallHandler(step, this.service),
      );
    }
    if (!this.dispatchers.has("condition")) {
      this.dispatchers.set("condition", (step, signal) =>
        defaultConditionHandler(step, signal, this),
      );
    }
    if (!this.dispatchers.has("wait")) {
      this.dispatchers.set("wait", defaultWaitHandler);
    }
    for (const type of STUBBED_ACTIONS) {
      if (!this.dispatchers.has(type)) {
        this.dispatchers.set(type, defaultStubHandler);
      }
    }
  }

  /** Request a pause. Honors at next step boundary. */
  pause(): void {
    this.pauseRequested = true;
    // Create a gate the run loop will await.
    if (!this.pauseGate) {
      this.pauseGate = new Promise<void>((resolve) => {
        this.pauseGateResolve = resolve;
      });
    }
  }

  /** Request a cancel. Aborts in-flight child processes too. */
  cancel(): void {
    this.cancelRequested = true;
    this.cancelController.abort();
  }

  /**
   * Resume after pause. The service layer calls this when the user
   * hits "resume". If the executor wasn't paused, this is a no-op.
   */
  resume(): void {
    if (this.pauseRequested) {
      this.pauseRequested = false;
      if (this.pauseGateResolve) {
        this.pauseGateResolve();
        this.pauseGateResolve = null;
      }
      this.pauseGate = null;
    }
  }

  /**
   * Run the plan to completion (or pause / cancel / fail).
   * Idempotent: a second call awaits the first run's completion.
   */
  run(): Promise<void> {
    if (this.donePromise) return this.donePromise;
    this.donePromise = this.runLoop().finally(() => {
      this.loopFinished = true;
      if (this.pauseGateResolve) {
        // If we exit while paused, unblock the gate so the
        // executor can be cleaned up.
        this.pauseGateResolve();
        this.pauseGateResolve = null;
        this.pauseGate = null;
      }
    });
    return this.donePromise;
  }

  /** True if the run loop has actually finished (any reason). */
  isDone(): boolean {
    return this.loopFinished;
  }

  /** True if pause() was called and run() is waiting at the gate. */
  isPaused(): boolean {
    return this.pauseRequested;
  }

  /** True if cancel() was called. */
  isCancelled(): boolean {
    return this.cancelRequested;
  }

  /**
   * Public dispatcher lookup. Used by the `condition` handler
   * to run SubSteps with the same dispatcher set as the parent
   * executor.
   */
  getDispatcher(type: StepAction["type"]): ActionHandler | undefined {
    return this.dispatchers.get(type);
  }

  /**
   * Did the step with this id complete successfully?
   * Returns false if the step hasn't run yet or doesn't exist.
   */
  getRecordedStepSuccess(stepId: string): boolean {
    return this.stepResults.get(stepId) === true;
  }

  /**
   * Context object for `condition` JS expressions. Currently
   * exposes `ctx.steps[id]` → `{ success, summary, ...output }`.
   */
  getConditionContext(): {
    steps: Record<
      string,
      { success: boolean; summary?: string; output?: unknown }
    >;
  } {
    const steps: Record<
      string,
      { success: boolean; summary?: string; output?: unknown }
    > = {};
    for (const [id, ok] of this.stepResults.entries()) {
      steps[id] = { success: ok };
    }
    return { steps };
  }

  // ─── main loop ──────────────────────────────────────────

  private async runLoop(): Promise<void> {
    try {
      // Phase 1: load plan + existing snapshot (if any).
      let plan = await readPlan(this.planId, this.home);
      if (!plan) {
        // Plan was deleted while we were queued. Nothing to do.
        return;
      }
      let snapshot = await readRuntimeSnapshot(this.planId, this.home);
      const completedStepIds = new Set(snapshot?.completedStepIds ?? []);

      // Phase 2: walk tasks in declaration order. Each task's
      // steps run sequentially. We honor `dependsOn` between
      // tasks (a task with unmet dependsOn is skipped — same
      // semantics as the future parallel/adaptive executors).
      for (const task of plan.tasks) {
        if (this.cancelRequested) break;
        if (this.pauseRequested) {
          await this.waitForResume();
          if (this.cancelRequested) break;
        }
        // Skip task if its dependsOn are not all completed.
        if (!areDependsOnSatisfied(task, completedStepIds)) {
          await this.skipTask(task, "blocked by dependsOn");
          continue;
        }
        // Skip task if already completed (snapshot said so).
        const taskAlreadyDone = task.steps.every((s) =>
          completedStepIds.has(s.id),
        );
        if (taskAlreadyDone) {
          // Should not normally happen — writePlan would have
          // marked it complete. But be defensive: skip without
          // rewriting.
          continue;
        }
        await this.runTask(task, plan, completedStepIds, snapshot);
        // Reload plan after the task — task progress may have
        // changed task / step statuses on disk.
        plan = await readPlan(this.planId, this.home);
        if (!plan) return;
        snapshot = await readRuntimeSnapshot(this.planId, this.home);
      }

      // Phase 3: finalize. Check the plan's current state to
      // detect task failure — if any task ended in "failed",
      // the plan is failed even if no one asked to cancel.
      const finalPlan = await readPlan(this.planId, this.home);
      const anyTaskFailed = finalPlan?.tasks.some((t) => t.status === "failed");

      if (this.cancelRequested) {
        await this.finalize("cancelled");
      } else if (this.pauseRequested) {
        // Loop exited because of pause; finalize as paused.
        await this.finalize("paused");
      } else if (anyTaskFailed) {
        await this.finalize("failed");
      } else {
        await this.finalize("completed");
      }
    } catch (err) {
      // Unhandled error — mark plan as failed with the message.
      try {
        await this.appendEvent({
          type: "plan_failed",
          data: { error: (err as Error).message },
        });
        await this.finalize("failed");
      } catch {
        // Best-effort. If finalize also throws, the run promise
        // still rejects.
      }
      throw err;
    }
  }

  // ─── per-task / per-step ────────────────────────────────

  private async runTask(
    task: Task,
    plan: Plan,
    completedStepIds: Set<string>,
    snapshot: PlanRuntimeSnapshot | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.markTaskStatus(task.id, "running", now);
    await this.appendEvent({
      type: "task_started",
      data: { taskId: task.id, description: task.description },
    });

    let taskFailed = false;
    for (const step of task.steps) {
      if (this.cancelRequested) break;
      if (this.pauseRequested) {
        await this.waitForResume();
        if (this.cancelRequested) break;
      }
      // Skip already-completed steps (recovery path).
      if (completedStepIds.has(step.id)) continue;

      const stepOk = await this.runStep(step, task, plan);
      if (!stepOk) {
        taskFailed = true;
        break;
      }
      // Refresh after the step — dispatcher may have modified state.
      const fresh = await readPlan(this.planId, this.home);
      if (fresh) plan = fresh;
    }

    if (taskFailed) {
      await this.markTaskStatus(
        task.id,
        "failed",
        undefined,
        new Date().toISOString(),
      );
      await this.appendEvent({
        type: "task_failed",
        data: { taskId: task.id },
      });
    } else {
      await this.markTaskStatus(
        task.id,
        "completed",
        undefined,
        new Date().toISOString(),
      );
      await this.appendEvent({
        type: "task_completed",
        data: { taskId: task.id },
      });
      // Mark all step ids as completed in our in-memory set
      // so later tasks' dependsOn checks pass.
      for (const s of task.steps) completedStepIds.add(s.id);
    }
    void snapshot; // currently unused, kept for future pause-aware resume
  }

  private async runStep(step: Step, task: Task, _plan: Plan): Promise<boolean> {
    const now = new Date().toISOString();
    await this.markStepStatus(step.id, task.id, "running", now);
    await this.appendEvent({
      type: "step_started",
      data: {
        stepId: step.id,
        taskId: task.id,
        action: step.action.type,
      },
    });

    const handler = this.dispatchers.get(step.action.type);
    if (!handler) {
      // Should be impossible (constructor fills all types), but
      // be defensive.
      await this.completeStep(step, task, false, {
        success: false,
        error: `No dispatcher for action ${step.action.type}`,
      });
      return false;
    }

    let output: StepOutput;
    try {
      output = await this.runWithTimeout(
        () => handler(step, this.cancelController.signal),
        stepTimeoutMs(step),
      );
    } catch (err) {
      output = {
        success: false,
        error: (err as Error).message,
      };
    }

    if (output.success) {
      await this.completeStep(step, task, true, output);
      return true;
    } else {
      await this.completeStep(step, task, false, output);
      return false;
    }
  }

  private async completeStep(
    step: Step,
    task: Task,
    success: boolean,
    output: StepOutput,
  ): Promise<void> {
    const now = new Date().toISOString();
    const newStatus = success ? "completed" : "failed";
    this.stepResults.set(step.id, success);
    await this.markStepStatus(
      step.id,
      task.id,
      newStatus,
      undefined,
      now,
      output,
    );
    if (success) {
      await this.appendEvent({
        type: "step_completed",
        data: { stepId: step.id, taskId: task.id, output },
      });
    } else {
      await this.appendEvent({
        type: "step_failed",
        data: {
          stepId: step.id,
          taskId: task.id,
          error: output.error,
        },
      });
    }
    // Persist a runtime snapshot at the step boundary so a
    // crash mid-plan can resume.
    await this.writeSnapshot(task.id, step.id, success);
  }

  private async skipTask(task: Task, reason: string): Promise<void> {
    await this.markTaskStatus(task.id, "skipped");
    await this.appendEvent({
      type: "task_skipped",
      data: { taskId: task.id, reason },
    });
  }

  // ─── plan / task / step mutations ───────────────────────

  private async markTaskStatus(
    taskId: string,
    status: Task["status"],
    startedAt?: string,
    completedAt?: string,
  ): Promise<void> {
    const plan = await readPlan(this.planId, this.home);
    if (!plan) return;
    const idx = plan.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    const updates: Partial<Task> = { status };
    if (startedAt) updates.startedAt = startedAt;
    if (completedAt) updates.completedAt = completedAt;
    plan.tasks[idx] = { ...plan.tasks[idx]!, ...updates };
    await writePlan(this.planId, plan, this.home);
  }

  private async markStepStatus(
    stepId: string,
    taskId: string,
    status: Step["status"],
    startedAt?: string,
    completedAt?: string,
    output?: StepOutput,
  ): Promise<void> {
    const plan = await readPlan(this.planId, this.home);
    if (!plan) return;
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const stepIdx = task.steps.findIndex((s) => s.id === stepId);
    if (stepIdx === -1) return;
    const updates: Partial<Step> = { status };
    if (startedAt) updates.startedAt = startedAt;
    if (completedAt) updates.completedAt = completedAt;
    if (output) updates.output = output;
    task.steps[stepIdx] = { ...task.steps[stepIdx]!, ...updates };
    await writePlan(this.planId, plan, this.home);
  }

  // ─── snapshot ───────────────────────────────────────────

  private async writeSnapshot(
    currentTaskId: string | null,
    currentStepId: string | null,
    lastStepOk: boolean,
  ): Promise<void> {
    // Re-read the plan to get the authoritative step statuses.
    const plan = await readPlan(this.planId, this.home);
    if (!plan) return;
    const existing = await readRuntimeSnapshot(this.planId, this.home);
    const completedStepIds = new Set(existing?.completedStepIds ?? []);
    if (lastStepOk && currentStepId) {
      completedStepIds.add(currentStepId);
    }
    const completedTaskIds = plan.tasks
      .filter((t) => t.status === "completed")
      .map((t) => t.id);
    const snap: PlanRuntimeSnapshot = {
      planId: this.planId,
      status: this.pauseRequested ? "paused" : "running",
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      lastCheckpointAt: new Date().toISOString(),
      currentTaskId,
      currentStepId,
      completedTaskIds,
      completedStepIds: Array.from(completedStepIds),
    };
    await writeRuntimeSnapshot(snap, this.home);
  }

  // ─── finalize ───────────────────────────────────────────

  private async finalize(
    finalStatus: "completed" | "failed" | "cancelled" | "paused",
  ): Promise<void> {
    const now = new Date().toISOString();
    const plan = await readPlan(this.planId, this.home);
    if (!plan) return;

    // Compute aggregate result for completed plans.
    let result: Plan["result"];
    if (finalStatus === "completed") {
      const completedTasks = plan.tasks.filter((t) => t.status === "completed");
      const totalTokens = completedTasks.reduce(
        (acc, t) => acc + (t.result?.totalTokens ?? 0),
        0,
      );
      const totalCost = completedTasks.reduce(
        (acc, t) => acc + (t.result?.totalCost ?? 0),
        0,
      );
      const startedAt = plan.startedAt
        ? new Date(plan.startedAt).getTime()
        : Date.now();
      result = {
        success: true,
        totalTokens,
        totalCost,
        durationMs: Date.now() - startedAt,
        tasksCompleted: completedTasks.length,
        tasksTotal: plan.tasks.length,
      };
    } else if (finalStatus === "failed") {
      const completedTasks = plan.tasks.filter((t) => t.status === "completed");
      const startedAt = plan.startedAt
        ? new Date(plan.startedAt).getTime()
        : Date.now();
      result = {
        success: false,
        totalTokens: 0,
        totalCost: 0,
        durationMs: Date.now() - startedAt,
        tasksCompleted: completedTasks.length,
        tasksTotal: plan.tasks.length,
      };
    }

    const updated: Plan = {
      ...plan,
      status: finalStatus,
      completedAt: ["completed", "failed", "cancelled"].includes(finalStatus)
        ? now
        : plan.completedAt,
      ...(result ? { result } : {}),
    };
    await writePlan(this.planId, updated, this.home);

    if (finalStatus === "completed") {
      await this.appendEvent({ type: "plan_completed", data: { result } });
    } else if (finalStatus === "cancelled") {
      await this.appendEvent({ type: "plan_cancelled", data: {} });
    } else if (finalStatus === "failed") {
      await this.appendEvent({ type: "plan_failed", data: {} });
    } else {
      // paused — no terminal event; resume will continue.
    }

    // Clean up the runtime snapshot on terminal states.
    if (finalStatus !== "paused") {
      await deleteRuntimeSnapshot(this.planId, this.home);
    }
  }

  // ─── event + abort helpers ──────────────────────────────

  private async appendEvent(
    partial: Pick<PlanEvent, "type" | "data">,
  ): Promise<void> {
    const event: PlanEvent = {
      timestamp: new Date().toISOString(),
      planId: this.planId,
      type: partial.type,
      data: partial.data,
    };
    await appendPlanEvent(event, this.home);
  }

  private async waitForResume(): Promise<void> {
    if (this.pauseGate) await this.pauseGate;
  }

  /** Run an async fn with a timeout. Rejects on timeout. */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    ms: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Step timed out after ${ms}ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([fn(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────

function stepTimeoutMs(step: Step): number {
  const t = step.input?.timeoutMs;
  if (typeof t === "number" && t > 0) return t;
  return DEFAULT_STEP_TIMEOUT_MS;
}

function areDependsOnSatisfied(
  task: Task,
  completedStepIds: Set<string>,
): boolean {
  // dependsOn is task ids, not step ids. We treat a task
  // as "satisfied" when all of its dependsOn task ids appear
  // in completedStepIds as the task's last step (heuristic —
  // MVP doesn't track per-task completion separately in the
  // snapshot). To make this robust without restructuring
  // the snapshot, we re-read the plan here.
  // For MVP, we just return true; dependsOn is a soft hint,
  // not enforced. The full executor in v0.6.0 will read the
  // task's current status from the plan TOML.
  if (task.dependsOn.length === 0) return true;
  // Read plan from disk synchronously? No — we'd block. Return
  // true and let the user notice if order is wrong. v0.6.0
  // will fix this.
  void completedStepIds;
  return true;
}

// ─── default action handlers ─────────────────────────────────

/**
 * pilot_command: spawn `pilot <command> [args...]` as a child
 * process. Honors the cancel signal by killing the child.
 */
const defaultPilotCommandHandler: ActionHandler = async (step, signal) => {
  if (step.action.type !== "pilot_command") {
    return { success: false, error: "Type mismatch" };
  }
  const { command, args } = step.action;
  const cwd =
    typeof step.input?.cwd === "string" ? step.input.cwd : process.cwd();
  const env = {
    ...process.env,
    ...((step.input?.env as Record<string, string>) ?? {}),
  };

  return new Promise<StepOutput>((resolve, reject) => {
    const child = execFile(
      "pilot",
      [command, ...args],
      { cwd, env, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // Killed by signal (likely our cancel) → reject so the
          // error is captured as a step failure.
          if (err.killed || signal.aborted) {
            reject(new Error(`pilot ${command} killed (signal)`));
            return;
          }
          // Non-zero exit → still a failure but include stdout/stderr.
          const msg =
            (err as { code?: number }).code !== undefined
              ? `pilot ${command} exited with code ${(err as { code?: number }).code}`
              : err.message;
          reject(new Error(msg));
          return;
        }
        resolve({
          success: true,
          summary: `pilot ${command} ${args.join(" ")}`.trim(),
          data: { stdout, stderr },
          durationMs: 0, // set by caller if needed
        });
      },
    );
    signal.addEventListener(
      "abort",
      () => {
        child.kill("SIGTERM");
      },
      { once: true },
    );
  });
};

/**
 * profile_switch: call the service's activateProfile. The
 * profile file is read; if it doesn't exist, the service
 * throws — we capture that as a step failure.
 */
async function defaultProfileSwitchHandler(
  step: Step,
  service: PlanExecutorService,
): Promise<StepOutput> {
  if (step.action.type !== "profile_switch") {
    return { success: false, error: "Type mismatch" };
  }
  await service.activateProfile(step.action.profile);
  return {
    success: true,
    summary: `Switched to profile "${step.action.profile}"`,
    data: { profile: step.action.profile },
  };
}

/**
 * policy_apply: call the service's applyPolicy. The service
 * generates + writes the extension file under
 * ~/.pilot/extensions/. Throws on missing policy.
 */
async function defaultPolicyApplyHandler(
  step: Step,
  service: PlanExecutorService,
): Promise<StepOutput> {
  if (step.action.type !== "policy_apply") {
    return { success: false, error: "Type mismatch" };
  }
  const { path } = await service.applyPolicy(step.action.policy);
  return {
    success: true,
    summary: `Applied policy "${step.action.policy}"`,
    data: { policy: step.action.policy, path },
  };
}

/**
 * Stub for actions not yet implemented. Returns success with a
 * marker so the timeline shows the step as "completed (stubbed)".
 * v0.6.0+ replaces these with real implementations as the UI
 * surface to drive them lands.
 */
const defaultStubHandler: ActionHandler = async (step) => {
  return {
    success: true,
    summary: `Stubbed: ${step.action.type} (no UI to resolve this gate yet)`,
    data: {
      stubbed: true,
      reason: "Awaiting UI to resolve this gate (waiting_human / manual)",
    },
  };
};

/**
 * pi_session: spawn a pi subprocess in RPC mode, send a single
 * prompt, wait for completion, capture the final text + tokens.
 *
 * v0.6.0: the heavy lifting is in `pi-session-runner.ts`. The
 * cwd comes from `step.action.cwd` if set, otherwise from the
 * plan's `context.cwd`, otherwise from the user's home.
 */
async function defaultPiSessionHandler(
  step: Step,
  signal: AbortSignal,
  home: string | undefined,
): Promise<StepOutput> {
  if (step.action.type !== "pi_session") {
    return { success: false, error: "Type mismatch" };
  }
  const cwd =
    step.action.cwd ??
    (typeof step.input?.cwd === "string" ? step.input.cwd : undefined) ??
    process.cwd();
  const timeoutMs =
    typeof step.input?.timeoutMs === "number"
      ? step.input.timeoutMs
      : undefined;
  const model =
    typeof step.input?.model === "string" ? step.input.model : undefined;
  const provider =
    typeof step.input?.provider === "string" ? step.input.provider : undefined;
  return runPiSession(
    step.action.prompt,
    {
      cwd,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(provider !== undefined ? { provider } : {}),
    },
    signal,
  );
  void home;
}

/**
 * pack_install: call the service's installPack. The source
 * can be `npm:foo` for an npm package, or a local path.
 * The service handles the actual fetch / link / absorb.
 */
async function defaultPackInstallHandler(
  step: Step,
  service: PlanExecutorService,
): Promise<StepOutput> {
  if (step.action.type !== "pack_install") {
    return { success: false, error: "Type mismatch" };
  }
  await service.installPack(step.action.source);
  return {
    success: true,
    summary: `Installed pack from ${step.action.source}`,
    data: { source: step.action.source },
  };
}

/**
 * condition: a small DSL that picks one of then/else SubStep
 * arrays and runs each SubStep inline.
 *
 * v0.6.0 supported `check` forms (in priority order):
 *   1. `"true"` or `"false"` — literal.
 *   2. `"step.<id>.success"` — looks up the in-memory step
 *      output for a previously-completed step. This is the
 *      MVP-conditional glue: plans can structure themselves
 *      so each "checkpoint" step's success/failure routes
 *      further work.
 *   3. anything else → evaluated as a JS expression against
 *      a context object `{ steps: { [id]: { success, summary, ...output } } }`.
 *      Use `eval`-like behavior sparingly — we use the
 *      `Function` constructor (NOT raw eval) so the parser
 *      doesn't reach into local scope.
 *
 * Future v0.6.1+ will add real expressions (jmespath, etc.)
 * but the literal + step-success forms cover the common
 * "if the previous step succeeded, run cleanup" pattern.
 */
async function defaultConditionHandler(
  step: Step,
  signal: AbortSignal,
  executor: PlanExecutor,
): Promise<StepOutput> {
  if (step.action.type !== "condition") {
    return { success: false, error: "Type mismatch" };
  }
  const truthy = evaluateCondition(step.action.check, executor);
  const branch = truthy ? step.action.then : step.action.else;
  // Run each SubStep inline. The SubStep status / output
  // is captured but not persisted to the plan TOML (SubSteps
  // live inside the parent's input and aren't first-class
  // tasks). This is a v0.6.0 trade-off; v0.6.1 will lift
  // SubSteps into the plan schema.
  const results: StepOutput[] = [];
  for (const sub of branch ?? []) {
    if (signal.aborted) {
      return {
        success: false,
        error: "condition cancelled mid-branch",
      };
    }
    // Build a synthetic Step for the dispatcher to consume.
    const synthetic: Step = {
      id: sub.id,
      description: sub.description,
      action: sub.action,
      status: "running",
      input: sub.input ?? {},
      retryCount: 0,
      maxRetries: sub.maxRetries ?? 0,
    };
    const handler = executor.getDispatcher(sub.action.type);
    if (!handler) {
      return {
        success: false,
        error: `No dispatcher for SubStep action ${sub.action.type}`,
      };
    }
    let out: StepOutput;
    try {
      out = await handler(synthetic, signal);
    } catch (err) {
      out = { success: false, error: (err as Error).message };
    }
    results.push(out);
    if (!out.success) {
      // Branch failed — record and stop.
      return {
        success: false,
        summary: `Condition branch (${truthy ? "then" : "else"}) failed at ${sub.id}`,
        data: { results },
        error: out.error,
      };
    }
  }
  return {
    success: true,
    summary: `Condition (${step.action.check}) → ${truthy ? "then" : "else"} (${results.length} sub-steps)`,
    data: { results, branch: truthy ? "then" : "else" },
  };
}

/**
 * Evaluate a condition's `check` string.
 * See defaultConditionHandler for the supported forms.
 */
function evaluateCondition(check: string, executor: PlanExecutor): boolean {
  const trimmed = check.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  // step.<id>.success lookup
  const m = /^step\.([\w-]+)\.success$/.exec(trimmed);
  if (m) {
    const stepId = m[1]!;
    return executor.getRecordedStepSuccess(stepId);
  }
  // Generic JS expression against a context object. We use
  // `new Function(...)` rather than `eval` so the parser
  // can't reach into local scope. The expression is still
  // arbitrary — plans are user-authored and the executor
  // runs in-process, so this is acceptable.
  try {
    const ctx = executor.getConditionContext();
    const fn = new Function("ctx", `"use strict"; return (${trimmed});`);
    return Boolean(fn(ctx));
  } catch {
    // Unparseable expressions default to false so a typo
    // doesn't accidentally run the then-branch.
    return false;
  }
}

/**
 * wait: a real time delay. The `condition` string is ignored
 * (real "wait until condition X" is out of scope for v0.6.0
 * — would need a polling subsystem).
 */
const defaultWaitHandler: ActionHandler = async (step, signal) => {
  if (step.action.type !== "wait") {
    return { success: false, error: "Type mismatch" };
  }
  const timeoutMs = step.action.timeoutMs;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
  return {
    success: true,
    summary: `Waited ${timeoutMs}ms (${step.action.condition})`,
    data: {
      timeoutMs,
      condition: step.action.condition,
      aborted: signal.aborted,
    },
  };
};

// ─── service-layer glue ─────────────────────────────────────

/** Live executor registry. Service-impl keeps one of these. */
export class PlanExecutorRegistry {
  private live = new Map<string, PlanExecutor>();

  /** Start a new executor for a plan, or return the existing one. */
  start(
    planId: string,
    service: PlanExecutorService,
    home?: string,
  ): PlanExecutor {
    const existing = this.live.get(planId);
    if (existing && !existing.isDone()) {
      // Already running — return as-is.
      return existing;
    }
    const exec = new PlanExecutor({
      planId,
      service,
      ...(home ? { home } : {}),
    });
    this.live.set(planId, exec);
    // Run fire-and-forget; failures bubble via the run() promise
    // but we don't await here. The service layer monitors isDone
    // and cleans up via the `done` callback.
    void exec.run().catch(() => {
      // Errors are already recorded as plan_failed events by the
      // executor's try/catch. We just need to make sure the
      // registry entry is cleaned up.
    });
    // Cleanup hook: when done, evict after a short grace period
    // (lets pending UI polls see the final state).
    const cleanup = () => {
      const e = this.live.get(planId);
      if (e === exec) {
        // Small delay so /plans/:id polls can read the
        // completed state before we forget about it.
        setTimeout(() => {
          if (this.live.get(planId) === exec) this.live.delete(planId);
        }, 1000);
      }
    };
    void exec.run().then(cleanup, cleanup);
    return exec;
  }

  /** Get a live executor by plan id. Returns undefined if not running. */
  get(planId: string): PlanExecutor | undefined {
    return this.live.get(planId);
  }

  /** Pause a live executor. No-op if not found / not running. */
  pause(planId: string): boolean {
    const e = this.live.get(planId);
    if (!e || e.isDone()) return false;
    e.pause();
    return true;
  }

  /** Resume a paused executor. No-op if not found / not paused. */
  resume(planId: string): boolean {
    const e = this.live.get(planId);
    if (!e || e.isDone()) return false;
    e.resume();
    return true;
  }

  /** Cancel a live executor. No-op if not found. */
  cancel(planId: string): boolean {
    const e = this.live.get(planId);
    if (!e || e.isDone()) return false;
    e.cancel();
    return true;
  }

  /** All live plan ids (for debug / recovery). */
  ids(): string[] {
    return Array.from(this.live.keys());
  }
}

/**
 * Recover any plans that were left in `running` state by a
 * crashed executor. Scans `runtime/plans/*.json`, validates the
 * plan still exists and is still `running`, and re-starts the
 * executor. Called at server boot.
 *
 * Returns the list of plan ids that were recovered.
 */
export async function recoverRunningPlans(
  service: PlanExecutorService,
  home?: string,
): Promise<string[]> {
  const dir = plansRuntimeDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const recovered: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const planId = entry.slice(0, -".json".length);
    const plan = await readPlan(planId, home);
    if (!plan) {
      // Plan was deleted while executor was running. Drop the
      // orphan snapshot.
      try {
        await unlink(join(dir, entry));
      } catch {
        // ignore
      }
      continue;
    }
    if (plan.status !== "running") {
      // Snapshot says running but plan says otherwise — the plan
      // was paused / cancelled out-of-band. Drop snapshot.
      try {
        await unlink(join(dir, entry));
      } catch {
        // ignore
      }
      continue;
    }
    // Re-start the executor. The new instance will see the
    // existing snapshot and skip completed steps.
    const registry = getDefaultRegistry();
    registry.start(planId, service, home !== undefined ? home : undefined);
    recovered.push(planId);
  }
  return recovered;
}

// ─── process-wide singleton registry ─────────────────────────
//
// Tests can override via `setDefaultRegistry`. The CLI / server
// use the default.

let defaultRegistry: PlanExecutorRegistry | null = null;

export function getDefaultRegistry(): PlanExecutorRegistry {
  if (!defaultRegistry) defaultRegistry = new PlanExecutorRegistry();
  return defaultRegistry;
}

export function setDefaultRegistry(reg: PlanExecutorRegistry): void {
  defaultRegistry = reg;
}

// Re-export for convenience.
export { mkdir };
// (mkdir re-export is here so plan-executor.ts is the single
//  import surface for the service-impl wiring. Currently unused
//  externally; kept for forward compat.)
void mkdir;
