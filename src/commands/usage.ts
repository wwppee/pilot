/**
 * `pilot usage` — token usage & cost across local sessions.
 *
 * Subcommands (v0.4.2):
 *   today     Usage from today (local midnight to now)
 *   week      Last 7 days
 *   month     Last 30 days
 *   all       All sessions
 *
 * Output: total tokens, total cost (USD), then by-model and by-day
 * breakdowns. v0.4.2 reads AssistantMessage.usage from pi v3 JSONL.
 *
 * `--json` outputs the full UsageReport as JSON.
 */

import kleur from "kleur";
import type { Command, PilotContext } from "../core/types.js";
import type { UsageRange, UsageReport } from "../core/usage.js";

export const manifest: Command = {
  name: "usage",
  description: "Token usage & cost across local sessions (v0.4.2)",
  subcommands: ["today", "week", "month", "all"],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const json = args.includes("--json");

  let range: UsageRange;
  switch (sub) {
    case "today":
      range = { kind: "today" };
      break;
    case "week":
      range = { kind: "lastDays", days: 7 };
      break;
    case "month":
      range = { kind: "lastDays", days: 30 };
      break;
    case "all":
      range = { kind: "all" };
      break;
    case undefined:
      ctx.logger.error("Usage: pilot usage <today|week|month|all> [--json]");
      return 1;
    default:
      ctx.logger.error(`Unknown subcommand: ${sub}`);
      return 1;
  }

  const usage = await ctx.service.getUsage(range);

  if (json) {
    console.log(JSON.stringify(usage, null, 2));
    return 0;
  }

  printUsage(sub, usage, ctx);
  return 0;
}

function printUsage(
  rangeLabel: string,
  u: UsageReport,
  ctx: PilotContext,
): void {
  const tz = rangeLabel === "all" ? rangeLabel : `${rangeLabel} (local TZ)`;
  ctx.logger.info(`Usage — ${kleur.cyan(tz)}:`);
  console.log();

  if (u.totalAssistantMessages === 0) {
    console.log(kleur.dim("  No usage data yet (no sessions with AssistantMessage.usage)"));
    return;
  }

  console.log(`  sessions:    ${kleur.bold(String(u.totalSessions))}`);
  console.log(`  messages:    ${kleur.bold(String(u.totalAssistantMessages))}`);
  console.log(
    `  total tokens: ${kleur.bold(formatInt(u.totalTokens))}`,
  );
  console.log(
    `  total cost:   ${kleur.bold("$" + u.totalCost.toFixed(4))} ${kleur.dim("USD")}`,
  );

  if (u.byModel.length > 0) {
    console.log();
    console.log(kleur.underline("By model:"));
    console.log(
      `  ${"model".padEnd(28)}  ${"msgs".padStart(5)}  ${"in".padStart(10)}  ${"out".padStart(8)}  ${"cost".padStart(10)}`,
    );
    for (const m of u.byModel) {
      console.log(
        `  ${kleur.cyan(m.model.padEnd(28))}  ${String(m.messages).padStart(5)}  ${formatInt(m.input).padStart(10)}  ${formatInt(m.output).padStart(8)}  ${("$" + m.cost.toFixed(4)).padStart(10)}`,
      );
    }
  }

  if (u.byDay.length > 0) {
    console.log();
    console.log(kleur.underline("By day:"));
    for (const d of u.byDay) {
      const bar = "█".repeat(Math.min(20, Math.round(d.totalTokens / 5000)));
      console.log(
        `  ${d.date}  ${formatInt(d.totalTokens).padStart(8)} tok  ${kleur.cyan(bar)}`,
      );
    }
  }
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
