/**
 * core/plan.ts — Plan data model (v0.6.0 Agent capability layer).
 *
 * A Plan is Pilot's answer to "how do I get this done?" It breaks a
 * user goal into ordered Tasks, each with concrete Steps. Pilot can
 * then execute the Plan step-by-step, observe results, and adapt.
 *
 * Storage: `~/.pilot/plans/<id>.toml`
 * Runtime: `~/.pilot/runtime/plans/<id>.json` (execution state snapshot)
 * History: `~/.pilot/plans-history/<id>_<timestamp>.jsonl` (event log)
 *
 * Design rules:
 *   - Plans are declarative — they describe WHAT to do, not HOW to think.
 *   - Pilot doesn't run an LLM; it orchestrates Pi's execution.
 *   - Every Step has a clear action type with typed parameters.
 *   - Steps can depend on each other; Tasks can depend on other Tasks.
 *   - The Plan is the single source of truth for execution state.
 */

import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  unlink,
  stat,
  appendFile,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { z } from "zod";
import { pilotDir } from "./types.js";

// ─── Path helpers ─────────────────────────────────────────────

/** Directory for plan TOML files. */
export function plansDir(home?: string): string {
  return `${pilotDir(home)}/plans`;
}

/** Directory for execution history (JSONL event logs). */
export function plansHistoryDir(home?: string): string {
  return `${pilotDir(home)}/plans-history`;
}

/** Directory for runtime state snapshots. */
export function plansRuntimeDir(home?: string): string {
  return `${pilotDir(home)}/runtime/plans`;
}

/** Path to a single plan TOML. */
export function planPath(id: string, home?: string): string {
  return join(plansDir(home), `${id}.toml`);
}

// ─── Zod schemas ──────────────────────────────────────────────

/** Plan execution status. */
export const PlanStatusSchema = z.enum([
  "draft",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

/** Plan execution strategy. */
export const PlanStrategySchema = z.enum([
  "sequential",
  "parallel",
  "adaptive",
]);

/** Task execution status. */
export const TaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "blocked",
]);

/** Step execution status. */
export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

// ─── StepAction schemas ─────────────────────────────────────

/** Run a Pilot CLI command. */
const PilotCommandActionSchema = z.object({
  type: z.literal("pilot_command"),
  command: z.string(),
  args: z.array(z.string()).default([]),
});

/** Start a Pi session with a prompt. */
const PiSessionActionSchema = z.object({
  type: z.literal("pi_session"),
  prompt: z.string(),
  profile: z.string().optional(),
  cwd: z.string().optional(),
});

/** Switch the active Profile. */
const ProfileSwitchActionSchema = z.object({
  type: z.literal("profile_switch"),
  profile: z.string(),
});

/** Install a pack. */
const PackInstallActionSchema = z.object({
  type: z.literal("pack_install"),
  source: z.string(),
});

/** Apply a policy. */
const PolicyApplyActionSchema = z.object({
  type: z.literal("policy_apply"),
  policy: z.string(),
});

/** Wait for an external condition. */
const WaitActionSchema = z.object({
  type: z.literal("wait"),
  condition: z.string(),
  /** Timeout in milliseconds. Default 60000 (1 minute). */
  timeoutMs: z.number().default(60000),
});

/** Require human intervention. */
const ManualActionSchema = z.object({
  type: z.literal("manual"),
  prompt: z.string(),
});

// ─── StepOutput schema (used by both SubStep + Step) ────────

export const StepOutputSchema = z.object({
  /** Whether the step succeeded. */
  success: z.boolean(),
  /** Human-readable result summary. */
  summary: z.string().optional(),
  /** Structured output data (varies by action type). */
  data: z.record(z.unknown()).optional(),
  /** Error message if the step failed. */
  error: z.string().optional(),
  /** Duration in milliseconds. */
  durationMs: z.number().optional(),
  /** Token usage from Pi sessions (if applicable). */
  tokensUsed: z.number().optional(),
});

export type StepOutput = z.infer<typeof StepOutputSchema>;

/**
 * SubStepAction — what a `condition` action's then/else children can be.
 *
 * P0#5 (v0.5.7 review): the original `z.record(z.unknown())` accepted
 * any garbage; the executor would crash trying to use it as a Step.
 * We now validate children as proper SubSteps.
 *
 * Sub-steps are deliberately restricted — they can be any leaf action
 * but **NOT** a nested `condition`. This avoids the mutual-recursion
 * problem (a condition inside a condition inside a condition...) and
 * keeps the future executor implementation small. Users compose
 * complex branching with parallel tasks instead.
 */
const SubStepActionSchema = z.discriminatedUnion("type", [
  PilotCommandActionSchema,
  PiSessionActionSchema,
  ProfileSwitchActionSchema,
  PackInstallActionSchema,
  PolicyApplyActionSchema,
  WaitActionSchema,
  ManualActionSchema,
]);

/**
 * SubStep is a Step without the `condition` action. Used as the
 * element type of `condition.then` / `condition.else`.
 */
const SubStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: SubStepActionSchema,
  status: StepStatusSchema.default("pending"),
  /** Input parameters for the action. */
  input: z.record(z.unknown()).default({}),
  /** Output from execution (populated after completion). */
  output: StepOutputSchema.optional(),
  /** How many times this step has been retried. */
  retryCount: z.number().default(0),
  /** Maximum retries before marking as failed. Default 2. */
  maxRetries: z.number().default(2),
  /** Timestamps. */
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

/** Conditional branching — sub-steps are validated as SubSteps. */
const ConditionActionSchema = z.object({
  type: z.literal("condition"),
  check: z.string(),
  then: z.array(SubStepSchema).default([]),
  else: z.array(SubStepSchema).default([]),
});

// ─── StepAction union ──

/** Discriminated union of all step actions. */
export const StepActionSchema = z.discriminatedUnion("type", [
  PilotCommandActionSchema,
  PiSessionActionSchema,
  ProfileSwitchActionSchema,
  PackInstallActionSchema,
  PolicyApplyActionSchema,
  ConditionActionSchema,
  WaitActionSchema,
  ManualActionSchema,
]);

export type StepAction = z.infer<typeof StepActionSchema>;

/** SubStep — a Step without the `condition` action. */
export type SubStep = z.infer<typeof SubStepSchema>;

// ─── Step schema ────────────────────────────────────────────

export const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: StepActionSchema,
  status: StepStatusSchema.default("pending"),
  /** Input parameters for the action. */
  input: z.record(z.unknown()).default({}),
  /** Output from execution (populated after completion). */
  output: StepOutputSchema.optional(),
  /** How many times this step has been retried. */
  retryCount: z.number().default(0),
  /** Maximum retries before marking as failed. Default 2. */
  maxRetries: z.number().default(2),
  /** Timestamps. */
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type Step = z.infer<typeof StepSchema>;

// ─── TaskResult schema ─────────────────────────────────────

export const TaskResultSchema = z.object({
  success: z.boolean(),
  summary: z.string().optional(),
  totalTokens: z.number().optional(),
  totalCost: z.number().optional(),
  durationMs: z.number().optional(),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

// ─── Task schema ────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: TaskStatusSchema.default("pending"),
  /** Ordered steps within this task. */
  steps: z.array(StepSchema).default([]),
  /** IDs of tasks this task depends on (must complete first). */
  dependsOn: z.array(z.string()).default([]),
  /** Recommended Profile for this task. */
  profile: z.string().optional(),
  /** Tools this task requires (used for validation and pack installation). */
  requiredTools: z.array(z.string()).default([]),
  /** Estimated token consumption (informational). */
  estimatedTokens: z.number().optional(),
  /** Result after execution. */
  result: TaskResultSchema.optional(),
  /** Timestamps. */
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// ─── PlanContext schema ──────────────────────────────────────

export const PlanContextSchema = z.object({
  /** Working directory for plan execution. */
  cwd: z.string().optional(),
  /** Active profile at plan creation time. */
  activeProfile: z.string().optional(),
  /** Avatar snapshot (if applicable). */
  avatar: z.string().optional(),
  /** Environment variables for execution. */
  env: z.record(z.string()).optional(),
  /** Git branch (if in a git repo). */
  gitBranch: z.string().optional(),
});

export type PlanContext = z.infer<typeof PlanContextSchema>;

// ─── PlanResult schema ──────────────────────────────────────

export const PlanResultSchema = z.object({
  success: z.boolean(),
  summary: z.string().optional(),
  /** Aggregated token usage across all tasks. */
  totalTokens: z.number().default(0),
  /** Aggregated cost in USD. */
  totalCost: z.number().default(0),
  /** Total wall-clock duration. */
  durationMs: z.number().default(0),
  /** Tasks completed vs total. */
  tasksCompleted: z.number(),
  tasksTotal: z.number(),
});

export type PlanResult = z.infer<typeof PlanResultSchema>;

// ─── Plan schema ────────────────────────────────────────────

export const PlanSchema = z.object({
  /** Unique plan identifier (UUID or timestamp-based). */
  id: z.string(),
  /** User's goal — what they want to accomplish. */
  goal: z.string(),
  /** Short title (auto-generated from goal if not provided). */
  title: z.string().optional(),
  /** Execution status. */
  status: PlanStatusSchema.default("draft"),
  /** Execution strategy. */
  strategy: PlanStrategySchema.default("sequential"),
  /** Tasks that make up this plan. */
  tasks: z.array(TaskSchema).default([]),
  /** Execution context. */
  context: PlanContextSchema.default({}),
  /** Final result (populated on completion). */
  result: PlanResultSchema.optional(),
  /** Timestamps. */
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

/** Input shape for creating/updating a plan. */
export const PlanInputSchema = PlanSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanInput = z.infer<typeof PlanInputSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type PlanStrategy = z.infer<typeof PlanStrategySchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;

// ─── PlanError (HTTP status for service-layer errors) ────────

/**
 * P1#10 (v0.5.7 review): service-layer errors carry an HTTP status
 * so the server's error handler can map them correctly. Without
 * this, a "Plan not found" would be 500 instead of 404, and an
 * invalid state transition ("Plan is already completed") would be
 * 500 instead of 409. The CLI just shows the message — the status
 * is ignored outside the server.
 */
export class PlanError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

/**
 * Pre-built common error factories. Use these so error messages +
 * status codes stay consistent across service methods.
 */
export const PlanErrors = {
  notFound: (id: string) => new PlanError(`Plan not found: ${id}`, 404),
  alreadyRunning: (id: string) =>
    new PlanError(`Plan is already running: ${id}`, 409),
  alreadyCompleted: (id: string) =>
    new PlanError(`Plan is already completed: ${id}`, 409),
  notRunning: (id: string, current: string) =>
    new PlanError(`Plan is not running (current: ${current}): ${id}`, 409),
  notPaused: (id: string, current: string) =>
    new PlanError(`Plan is not paused (current: ${current}): ${id}`, 409),
  cannotCancel: (id: string, current: string) =>
    new PlanError(`Plan cannot be cancelled (current: ${current}): ${id}`, 409),
};

// ─── Plan ID generation ──────────────────────────────────────

/** Generate a plan ID from timestamp. */
export function generatePlanId(): string {
  const now = new Date();
  // Strip ISO separators AND the millisecond decimal + Z so the
  // timestamp portion is purely digits — matches the format used
  // by appendPlanEvent for event log filenames.
  const ts = now
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 15);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${ts}_${rnd}`;
}

/** Generate a task ID. */
export function generateTaskId(): string {
  return `task_${Math.random().toString(36).slice(2, 10)}`;
}

/** Generate a step ID. */
export function generateStepId(): string {
  return `step_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Read / write ──────────────────────────────────────────

/**
 * Read and parse a plan TOML.
 *
 * Returns null when the file doesn't exist (ENOENT). Throws a
 * `PlanError` with status 500 if the file exists but the content is
 * invalid TOML or doesn't match `PlanSchema` — that's a corruption,
 * not a "missing" case, and silently returning null would hide it.
 *
 * P1#6 (v0.5.7 review): the original implementation swallowed ALL
 * errors, making it impossible to tell "plan not found" from "plan
 * file is corrupt". With this split, the service layer can map
 * missing → 404 and corrupt → 500 + operator-visible error message.
 */
export async function readPlan(
  id: string,
  home?: string,
): Promise<Plan | null> {
  const file = planPath(id, home);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Any other read error (permission, IO) → bubble up; the service
    // layer will log + wrap.
    throw new PlanError(
      `Failed to read plan ${id}: ${(e as Error).message}`,
      500,
    );
  }
  let data: Record<string, unknown>;
  try {
    data = parseToml(raw) as Record<string, unknown>;
  } catch (e) {
    throw new PlanError(
      `Plan ${id} has invalid TOML: ${(e as Error).message}`,
      500,
    );
  }
  try {
    // Re-inject id before validation — writePlan strips it from TOML
    // (the filename IS the id) but the schema still requires the field.
    return PlanSchema.parse({ ...data, id });
  } catch (e) {
    throw new PlanError(
      `Plan ${id} failed schema validation: ${(e as Error).message}`,
      500,
    );
  }
}

/** List all plans. Returns [] if directory doesn't exist. */
export async function listPlans(home?: string): Promise<Plan[]> {
  const dir = plansDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: Plan[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".toml")) continue;
    const id = entry.slice(0, -".toml".length);
    const plan = await readPlan(id, home);
    if (plan) results.push(plan);
  }
  return results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Create or update a plan. When updating, `goal` can be omitted (uses existing). */
export async function writePlan(
  id: string,
  input: Partial<Plan> & { goal?: string },
  home?: string,
): Promise<Plan> {
  const now = new Date().toISOString();
  const file = planPath(id, home);
  const dir = plansDir(home);

  // Read existing to preserve createdAt and current task states
  const existing = await readPlan(id, home);
  if (!existing && !input.goal) {
    throw new Error("goal is required when creating a new plan");
  }
  const createdAt = existing?.createdAt ?? now;

  // Merge: existing values fill in for anything not provided
  const merged: Plan = {
    id,
    goal: input.goal ?? existing!.goal,
    title: input.title ?? existing?.title,
    status: input.status ?? existing?.status ?? "draft",
    strategy: input.strategy ?? existing?.strategy ?? "sequential",
    tasks: input.tasks ?? existing?.tasks ?? [],
    context: input.context ?? existing?.context ?? {},
    result: input.result ?? existing?.result,
    createdAt,
    updatedAt: now,
    startedAt: input.startedAt ?? existing?.startedAt,
    completedAt: input.completedAt ?? existing?.completedAt,
  };

  // Validate
  const validated = PlanSchema.parse(merged);

  // Serialize (strip id from TOML — it's the file identity)
  const { id: _omit, ...rest } = validated;
  await mkdir(dir, { recursive: true });
  await writeFile(
    file,
    stringifyToml(rest as Record<string, unknown>),
    "utf-8",
  );
  return validated;
}

/** Delete a plan. Returns true if it existed. */
export async function deletePlan(id: string, home?: string): Promise<boolean> {
  const file = planPath(id, home);
  try {
    await stat(file);
  } catch {
    return false;
  }
  await unlink(file);
  return true;
}

// ─── Utility: derive plan title from goal ────────────────────

/** Generate a short title from a goal string. Max 60 chars. */
export function deriveTitle(goal: string): string {
  // Remove common prefixes
  const cleaned = goal
    .replace(/^(帮我|请|我需要|实现|完成|修复|添加|创建|写一个|设计)\s*/i, "")
    .trim();
  // Truncate
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "...";
}

// ─── Tool suggestion (v0.6.0) ──────────────────────────────

/** Suggest tools and profile based on a goal description. */
export interface ToolSuggestion {
  goal: string;
  /** Tools that match the goal (by keyword matching). */
  matchedTools: Array<{
    name: string;
    source: string;
    safety: string;
    reason: string;
  }>;
  /** Profiles that might be relevant. */
  matchedProfiles: Array<{
    name: string;
    model?: string;
    packages?: string[];
    reason: string;
  }>;
}

/**
 * Simple keyword-based tool suggestion.
 *
 * This is a v0.6.0 baseline — it matches goal keywords against tool
 * names and descriptions. Future versions can use LLM-based matching.
 */
export function suggestTools(
  goal: string,
  tools: Array<{
    name: string;
    source: string;
    safety: string;
    description: string;
  }>,
  profiles: Array<{ name: string; model?: string; packages?: string[] }>,
): ToolSuggestion {
  const keywords = goal
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const matchedTools = tools
    .filter((t) => {
      const haystack = `${t.name} ${t.description}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    })
    .slice(0, 10)
    .map((t) => ({
      name: t.name,
      source: t.source,
      safety: t.safety,
      reason: `Matches keywords in your goal`,
    }));

  const matchedProfiles = profiles
    .filter((p) => {
      const haystack =
        `${p.name} ${(p.packages ?? []).join(" ")}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    })
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      ...(p.model ? { model: p.model } : {}),
      ...(p.packages ? { packages: p.packages } : {}),
      reason: `Matches keywords in your goal`,
    }));

  return { goal, matchedTools, matchedProfiles };
}

// ─── Plan execution history ──────────────────────────────────

/** A single event in the plan execution log. */
export interface PlanEvent {
  timestamp: string;
  planId: string;
  type: PlanEventType;
  data: Record<string, unknown>;
}

export type PlanEventType =
  | "plan_created"
  | "plan_started"
  | "plan_paused"
  | "plan_resumed"
  | "plan_completed"
  | "plan_failed"
  | "plan_cancelled"
  | "plan_deleted"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "task_skipped"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "waiting_human";

/** Append an event to the plan history log. */
export async function appendPlanEvent(
  event: PlanEvent,
  home?: string,
): Promise<void> {
  const dir = plansHistoryDir(home);
  await mkdir(dir, { recursive: true });
  const fileName = `${event.planId}_${event.timestamp.replace(/[-:T.Z]/g, "").slice(0, 15)}.jsonl`;
  const filePath = join(dir, fileName);
  await appendFile(filePath, JSON.stringify(event) + "\n", "utf-8");
}

/**
 * v0.5.13+: read every history event for a plan.
 *
 * Reads all `plans-history/<id>_*.jsonl` files, parses each line as
 * a `PlanEvent`, and returns them sorted ascending by timestamp.
 * Returns [] if no history files exist (plan was never started, or
 * history was wiped). Does NOT verify the plan exists — callers
 * should check via `readPlan` first.
 *
 * Why we read all matching files instead of one: appendPlanEvent
 * creates a new file each time the process restarts, so a long-running
 * plan may have multiple history files. We want every event.
 */
export async function listPlanEvents(
  planId: string,
  home?: string,
): Promise<PlanEvent[]> {
  const dir = plansHistoryDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const prefix = `${planId}_`;
  const matching = entries.filter(
    (e) => e.startsWith(prefix) && e.endsWith(".jsonl"),
  );
  if (matching.length === 0) return [];

  const events: PlanEvent[] = [];
  for (const file of matching) {
    let raw: string;
    try {
      raw = await readFile(join(dir, file), "utf-8");
    } catch {
      // Per-file read error: skip. Don't fail the whole listing —
      // a partial history is still useful.
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as PlanEvent);
      } catch {
        // Skip malformed lines — same partial-tolerance rationale.
      }
    }
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return events;
}

// ─── Ensure directories ─────────────────────────────────────

/** Ensure all plan-related directories exist. */
export async function ensurePlanDirs(home?: string): Promise<void> {
  await Promise.all([
    mkdir(plansDir(home), { recursive: true }),
    mkdir(plansHistoryDir(home), { recursive: true }),
    mkdir(plansRuntimeDir(home), { recursive: true }),
  ]);
}

// ─── Runtime snapshot (v0.5.23 — PlanExecutor) ─────────────

/**
 * Path to a single plan's runtime snapshot.
 *
 * The runtime snapshot is the executor's "I was here" bookmark —
 * written after every step so a crash can pick up where we left
 * off. Deleted on plan completion / cancellation / failure.
 */
export function planRuntimePath(id: string, home?: string): string {
  return join(plansRuntimeDir(home), `${id}.json`);
}

/**
 * In-memory representation of where the executor is. Persisted to
 * `runtime/plans/<id>.json` after every step + on every pause /
 * cancel so we can resume cleanly after a crash.
 *
 * The executor considers anything in `completedStepIds` as already
 * done and skips it on resume. Anything not in that set is
 * eligible to run. Currently-running step is recorded as
 * `currentStepId` so a resumed executor can decide whether to
 * re-run the in-flight step (we currently re-run it for safety;
 * pi_session steps are idempotent-ish and the other action types
 * have stronger retry semantics).
 */
export interface PlanRuntimeSnapshot {
  planId: string;
  status: "running" | "paused";
  /** Wall-clock when the executor first started. */
  startedAt: string;
  /** Wall-clock of the most recent snapshot write. */
  lastCheckpointAt: string;
  /** The task the executor is currently working on (if any). */
  currentTaskId: string | null;
  /** The step the executor is currently working on (if any). */
  currentStepId: string | null;
  /** All task ids that have fully completed (all steps done). */
  completedTaskIds: string[];
  /** All step ids that have completed (across all tasks). */
  completedStepIds: string[];
}

/** Write the runtime snapshot. Atomic via tmp + rename. */
export async function writeRuntimeSnapshot(
  snapshot: PlanRuntimeSnapshot,
  home?: string,
): Promise<void> {
  const dir = plansRuntimeDir(home);
  await mkdir(dir, { recursive: true });
  const file = planRuntimePath(snapshot.planId, home);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf-8");
  await rename(tmp, file);
}

/**
 * Read the runtime snapshot for a plan. Returns `null` if the
 * file doesn't exist (i.e. the plan has never been started, or
 * it completed and was cleaned up).
 */
export async function readRuntimeSnapshot(
  id: string,
  home?: string,
): Promise<PlanRuntimeSnapshot | null> {
  const file = planRuntimePath(id, home);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    return JSON.parse(raw) as PlanRuntimeSnapshot;
  } catch {
    // Corrupt snapshot — treat as missing so the executor can
    // restart from scratch. The plan TOML is the source of truth.
    return null;
  }
}

/** Delete the runtime snapshot. Used on plan completion / cancellation. */
export async function deleteRuntimeSnapshot(
  id: string,
  home?: string,
): Promise<boolean> {
  const file = planRuntimePath(id, home);
  try {
    await unlink(file);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
