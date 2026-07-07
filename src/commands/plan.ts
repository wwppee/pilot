/**
 * `pilot plan` — Agent capability layer (v0.6.0).
 *
 * Manages execution Plans: create, list, show, run, pause, resume.
 *
 * Plans break a user goal into ordered Tasks with concrete Steps.
 * Each Step has a typed action (pilot_command, pi_session,
 * profile_switch, pack_install, etc.).
 *
 * Usage:
 *   pilot plan new "实现用户登录功能"
 *   pilot plan ls
 *   pilot plan show <id>
 *   pilot plan run <id>
 *   pilot plan pause <id>
 *   pilot plan resume <id>
 *   pilot plan cancel <id>
 *   pilot plan delete <id>
 *   pilot plan suggest-tools "解析 CSV"
 */

import kleur from "kleur";
import type { Command, PilotContext } from "../core/types.js";
import {
  generatePlanId,
  deriveTitle,
  listPlans,
  readPlan,
  writePlan,
  deletePlan,
  ensurePlanDirs,
  suggestTools,
} from "../core/plan.js";

export const manifest: Command = {
  name: "plan",
  description:
    "Manage execution plans — create, list, show, run, pause, resume, and delete plans.",
  subcommands: [
    "new",
    "ls",
    "show",
    "run",
    "pause",
    "resume",
    "cancel",
    "delete",
    "suggest-tools",
  ],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "new":
      return planNew(rest, ctx);
    case "ls":
      return planLs(ctx);
    case "show":
      return planShow(rest, ctx);
    case "run":
      return planRun(rest, ctx);
    case "pause":
      return planPause(rest, ctx);
    case "resume":
      return planResume(rest, ctx);
    case "cancel":
      return planCancel(rest, ctx);
    case "delete":
      return planDelete(rest, ctx);
    case "suggest-tools":
      return planSuggestTools(rest, ctx);
    default:
      ctx.logger.error(`Unknown subcommand: ${sub ?? "(none)"}`);
      ctx.logger.info(
        "Use: pilot plan {new|ls|show|run|pause|resume|cancel|delete|suggest-tools}",
      );
      return 1;
  }
}

// ─── Subcommands ────────────────────────────────────────────

async function planNew(args: string[], ctx: PilotContext): Promise<number> {
  const goal = args.join(" ").trim();
  if (!goal) {
    ctx.logger.error("Usage: pilot plan new <goal description>");
    return 1;
  }

  await ensurePlanDirs(ctx.home);

  const id = generatePlanId();
  const title = deriveTitle(goal);

  const plan = await writePlan(
    id,
    {
      goal,
      title,
      status: "draft",
      strategy: "sequential",
      context: { cwd: process.cwd() },
    },
    ctx.home,
  );

  ctx.logger.success(`✓ Plan created: ${kleur.cyan(id)}`);
  ctx.logger.info(`  Goal: ${plan.goal}`);
  ctx.logger.info(`  Title: ${plan.title}`);
  ctx.logger.info(`  Status: ${plan.status}`);
  ctx.logger.dim(`  View:  pilot plan show ${id}`);
  ctx.logger.dim(`  Run:   pilot plan run ${id}`);

  return 0;
}

async function planLs(ctx: PilotContext): Promise<number> {
  const plans = await listPlans(ctx.home);

  if (plans.length === 0) {
    ctx.logger.info("No plans yet. Create one:");
    ctx.logger.dim('  pilot plan new "your goal here"');
    return 0;
  }

  for (const plan of plans) {
    const statusColor = statusColorOf(plan.status);
    const tasksInfo = `${plan.tasks.filter((t) => t.status === "completed").length}/${plan.tasks.length} tasks`;
    ctx.logger.info(
      `${kleur.cyan(plan.id)} ${statusColor(`[${plan.status}]`)} ${kleur.bold(plan.title ?? plan.goal.slice(0, 40))} ${kleur.dim(tasksInfo)}`,
    );
  }

  return 0;
}

async function planShow(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan show <plan-id>");
    return 1;
  }

  const plan = await readPlan(id, ctx.home);
  if (!plan) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  const statusColor = statusColorOf(plan.status);
  ctx.logger.info(kleur.bold(`Plan: ${plan.title ?? plan.goal}`));
  ctx.logger.info(`  ID:      ${kleur.cyan(plan.id)}`);
  ctx.logger.info(`  Status:  ${statusColor(plan.status)}`);
  ctx.logger.info(`  Goal:    ${plan.goal}`);
  ctx.logger.info(`  Strategy: ${plan.strategy}`);
  ctx.logger.info(`  Created: ${plan.createdAt}`);
  ctx.logger.info(`  Updated: ${plan.updatedAt}`);

  if (plan.context.cwd) {
    ctx.logger.info(`  CWD:     ${plan.context.cwd}`);
  }
  if (plan.context.activeProfile) {
    ctx.logger.info(`  Profile: ${plan.context.activeProfile}`);
  }

  if (plan.result) {
    ctx.logger.info(
      `  Result:  ${plan.result.success ? kleur.green("SUCCESS") : kleur.red("FAILED")}`,
    );
    ctx.logger.info(
      `  Tasks:   ${plan.result.tasksCompleted}/${plan.result.tasksTotal}`,
    );
    ctx.logger.info(`  Tokens:  ${plan.result.totalTokens.toLocaleString()}`);
    ctx.logger.info(`  Cost:    $${plan.result.totalCost.toFixed(4)}`);
    ctx.logger.info(`  Duration: ${formatDuration(plan.result.durationMs)}`);
  }

  // Tasks
  if (plan.tasks.length > 0) {
    ctx.logger.info("");
    ctx.logger.info(kleur.bold("Tasks:"));

    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i]!;
      if (!task) continue;
      const taskStatusColor = taskStatusColorOf(task.status);
      const prefix = plan.tasks.length > 1 ? `${i + 1}. ` : "   ";

      ctx.logger.info(
        `${prefix}${taskStatusColor(`[${task.status}]`)} ${task.description}`,
      );

      if (task.profile) {
        ctx.logger.dim(`      profile: ${task.profile}`);
      }
      if (task.requiredTools.length > 0) {
        ctx.logger.dim(`      tools: ${task.requiredTools.join(", ")}`);
      }
      if (task.dependsOn.length > 0) {
        ctx.logger.dim(`      depends: ${task.dependsOn.join(", ")}`);
      }

      // Steps
      for (const step of task.steps) {
        const stepStatusColor = stepStatusColorOf(step.status);
        const actionLabel = formatAction(step.action);
        ctx.logger.dim(
          `      ${stepStatusColor(`[${step.status}]`)} ${actionLabel}`,
        );
        if (step.output) {
          ctx.logger.dim(
            `         ${step.output.success ? kleur.green("✓") : kleur.red("✗")} ${step.output.summary ?? ""}`,
          );
        }
        if (step.output?.error) {
          ctx.logger.error(`         Error: ${step.output.error}`);
        }
      }
    }
  } else {
    ctx.logger.dim("  (no tasks yet — add tasks via the Web UI or API)");
  }

  return 0;
}

async function planRun(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan run <plan-id>");
    return 1;
  }

  const plan = await readPlan(id, ctx.home);
  if (!plan) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  if (plan.status === "running") {
    ctx.logger.warn("Plan is already running.");
    return 0;
  }

  if (plan.status === "completed") {
    ctx.logger.warn(
      "Plan is already completed. Create a new plan or reset this one.",
    );
    return 1;
  }

  // Update status to running
  const now = new Date().toISOString();
  await writePlan(
    id,
    {
      ...plan,
      status: "running",
      startedAt: plan.startedAt ?? now,
    },
    ctx.home,
  );

  ctx.logger.success(`▶ Plan started: ${kleur.cyan(id)}`);

  if (plan.tasks.length === 0) {
    ctx.logger.warn("  No tasks to execute. Add tasks first.");
    return 0;
  }

  // Execute tasks sequentially (v0.6.0 baseline)
  // Future versions will implement the full executor with feedback
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i]!;
    if (!task) continue;

    // Check dependencies
    for (const depId of task.dependsOn) {
      const dep = plan.tasks.find((t) => t.id === depId);
      if (!dep || dep.status !== "completed") {
        ctx.logger.warn(
          `  Task "${task.description}" blocked by dependency "${depId}"`,
        );
        task.status = "blocked";
        continue;
      }
    }

    ctx.logger.info(
      `  Task ${i + 1}/${plan.tasks.length}: ${task.description}`,
    );
    // In v0.6.0, we only update the status. The actual executor comes in v0.7.0.
    ctx.logger.dim("  (execution engine coming in v0.7.0)");
  }

  return 0;
}

async function planPause(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan pause <plan-id>");
    return 1;
  }

  const plan = await readPlan(id, ctx.home);
  if (!plan) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  if (plan.status !== "running") {
    ctx.logger.warn(`Plan is not running (current status: ${plan.status})`);
    return 1;
  }

  await writePlan(id, { ...plan, status: "paused" }, ctx.home);
  ctx.logger.success(`⏸ Plan paused: ${kleur.cyan(id)}`);
  return 0;
}

async function planResume(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan resume <plan-id>");
    return 1;
  }

  const plan = await readPlan(id, ctx.home);
  if (!plan) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  if (plan.status !== "paused") {
    ctx.logger.warn(`Plan is not paused (current status: ${plan.status})`);
    return 1;
  }

  await writePlan(id, { ...plan, status: "running" }, ctx.home);
  ctx.logger.success(`▶ Plan resumed: ${kleur.cyan(id)}`);
  return 0;
}

async function planCancel(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan cancel <plan-id>");
    return 1;
  }

  const plan = await readPlan(id, ctx.home);
  if (!plan) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  if (plan.status !== "running" && plan.status !== "paused") {
    ctx.logger.warn(
      `Plan cannot be cancelled (current status: ${plan.status})`,
    );
    return 1;
  }

  await writePlan(
    id,
    {
      ...plan,
      status: "cancelled",
      completedAt: new Date().toISOString(),
    },
    ctx.home,
  );
  ctx.logger.success(`✕ Plan cancelled: ${kleur.cyan(id)}`);
  return 0;
}

async function planDelete(args: string[], ctx: PilotContext): Promise<number> {
  const id = args[0];
  if (!id) {
    ctx.logger.error("Usage: pilot plan delete <plan-id>");
    return 1;
  }

  const deleted = await deletePlan(id, ctx.home);
  if (!deleted) {
    ctx.logger.error(`Plan not found: ${id}`);
    return 1;
  }

  ctx.logger.success(`🗑 Plan deleted: ${kleur.cyan(id)}`);
  return 0;
}

async function planSuggestTools(
  args: string[],
  ctx: PilotContext,
): Promise<number> {
  const goal = args.join(" ").trim();
  if (!goal) {
    ctx.logger.error("Usage: pilot plan suggest-tools <goal description>");
    return 1;
  }

  const [tools, profiles] = await Promise.all([
    ctx.service.listTools(),
    ctx.service.listProfiles(),
  ]);

  const toolItems = tools.map((t) => ({
    name: t.name,
    source: t.source,
    safety: t.safety,
    description: t.description,
  }));

  const profileItems = profiles.map((p) => ({
    name: p.name,
    ...(p.model ? { model: p.model } : {}),
    ...(p.packages ? { packages: p.packages } : {}),
  }));

  const suggestion = suggestTools(goal, toolItems, profileItems);

  if (suggestion.matchedTools.length > 0) {
    ctx.logger.info(kleur.bold("Matched tools:"));
    for (const t of suggestion.matchedTools) {
      ctx.logger.info(`  ${kleur.cyan(t.name)} (${t.source}/${t.safety})`);
    }
  } else {
    ctx.logger.info("No matching tools found. All available tools:");
    for (const t of toolItems.slice(0, 10)) {
      ctx.logger.dim(`  ${t.name} (${t.source})`);
    }
  }

  if (suggestion.matchedProfiles.length > 0) {
    ctx.logger.info("");
    ctx.logger.info(kleur.bold("Matched profiles:"));
    for (const p of suggestion.matchedProfiles) {
      ctx.logger.info(
        `  ${kleur.cyan(p.name)}${p.model ? ` (model: ${p.model})` : ""}`,
      );
    }
  } else {
    ctx.logger.info("");
    ctx.logger.info("No matching profiles. Available:");
    for (const p of profileItems.slice(0, 5)) {
      ctx.logger.dim(`  ${p.name}${p.model ? ` (model: ${p.model})` : ""}`);
    }
  }

  return 0;
}

// ─── Helpers ────────────────────────────────────────────────

function statusColorOf(status: string): (s: string) => string {
  switch (status) {
    case "draft":
      return kleur.dim;
    case "running":
      return kleur.cyan;
    case "paused":
      return kleur.yellow;
    case "completed":
      return kleur.green;
    case "failed":
      return kleur.red;
    case "cancelled":
      return kleur.dim;
    default:
      return (s: string) => s;
  }
}

function taskStatusColorOf(status: string): (s: string) => string {
  switch (status) {
    case "pending":
      return kleur.dim;
    case "running":
      return kleur.cyan;
    case "completed":
      return kleur.green;
    case "failed":
      return kleur.red;
    case "skipped":
      return kleur.dim;
    case "blocked":
      return kleur.yellow;
    default:
      return (s: string) => s;
  }
}

function stepStatusColorOf(status: string): (s: string) => string {
  return taskStatusColorOf(status);
}

function formatAction(action: Record<string, unknown>): string {
  switch (action.type) {
    case "pilot_command":
      return `pilot ${(action as { command: string }).command} ${((action as { args: string[] }).args ?? []).join(" ")}`;
    case "pi_session":
      return `pi session: "${(action as { prompt: string }).prompt.slice(0, 50)}..."`;
    case "profile_switch":
      return `switch profile: ${(action as { profile: string }).profile}`;
    case "pack_install":
      return `install: ${(action as { source: string }).source}`;
    case "policy_apply":
      return `apply policy: ${(action as { policy: string }).policy}`;
    case "condition":
      return `condition: ${(action as { check: string }).check.slice(0, 50)}`;
    case "wait":
      return `wait: ${(action as { condition: string }).condition.slice(0, 50)}`;
    case "manual":
      return `manual: ${(action as { prompt: string }).prompt.slice(0, 50)}`;
    default:
      return String(action.type);
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}
