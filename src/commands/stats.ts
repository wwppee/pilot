/**
 * `pilot stats` — usage analytics across local sessions.
 *
 * Subcommands (v0.3.0-c):
 *   today      Stats from today (UTC midnight to now)
 *   week       Last 7 days
 *   month      Last 30 days
 *   all        All sessions
 *
 * Output: total sessions / messages / tool calls, then by-model,
 * by-tool, by-day breakdowns.
 *
 * `--json` outputs the full StatsReport as JSON.
 */

import kleur from 'kleur';
import type { Command, PilotContext } from '../core/types.js';
import type { StatsRange, StatsReport } from '../core/stats.js';

export const manifest: Command = {
  name: 'stats',
  description: 'Usage analytics across local sessions',
  subcommands: ['today', 'week', 'month', 'all'],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const json = args.includes('--json');

  let range: StatsRange;
  switch (sub) {
    case 'today':
      range = { kind: 'today' };
      break;
    case 'week':
      range = { kind: 'lastDays', days: 7 };
      break;
    case 'month':
      range = { kind: 'lastDays', days: 30 };
      break;
    case 'all':
      range = { kind: 'all' };
      break;
    case undefined:
      ctx.logger.error('Usage: pilot stats <today|week|month|all> [--json]');
      return 1;
    default:
      ctx.logger.error(`Unknown subcommand: ${sub}`);
      return 1;
  }

  const stats = await ctx.service.getStats(range);

  if (json) {
    console.log(JSON.stringify(stats, null, 2));
    return 0;
  }

  printStats(sub, stats, ctx);
  return 0;
}

function printStats(
  rangeLabel: string,
  stats: StatsReport,
  ctx: PilotContext,
): void {
  ctx.logger.info(`Stats — ${kleur.cyan(rangeLabel)}:`);
  console.log();
  console.log(`  sessions:    ${kleur.bold(String(stats.totalSessions))}`);
  console.log(`  messages:    ${kleur.bold(String(stats.totalMessages))}`);
  console.log(`  tool calls:  ${kleur.bold(String(stats.totalToolCalls))}`);

  if (stats.byModel.length > 0) {
    console.log();
    console.log(kleur.underline('By model:'));
    for (const m of stats.byModel) {
      console.log(
        `  ${kleur.cyan(m.model.padEnd(28))} ${String(m.messages).padStart(6)} messages`,
      );
    }
  }

  if (stats.byTool.length > 0) {
    console.log();
    console.log(kleur.underline('By tool:'));
    const top = stats.byTool.slice(0, 10);
    for (const t of top) {
      console.log(
        `  ${kleur.cyan(t.tool.padEnd(20))} ${String(t.count).padStart(6)} calls`,
      );
    }
    if (stats.byTool.length > top.length) {
      console.log(kleur.dim(`  ... and ${stats.byTool.length - top.length} more`));
    }
  }

  if (stats.byDay.length > 0) {
    console.log();
    console.log(kleur.underline('By day:'));
    for (const d of stats.byDay) {
      const bar = '█'.repeat(Math.min(20, Math.round(d.messages / 5)));
      console.log(
        `  ${d.date}  ${String(d.messages).padStart(5)} msg  ${kleur.cyan(bar)}`,
      );
    }
  }
}