/**
 * `pilot doctor` — health checks for your pi setup.
 *
 * Reads structured report from `ctx.service.runDoctor()` and renders it
 * as a checklist (or JSON with `--json`).
 *
 * The actual checks live in `core/service-impl.ts` (single source of truth).
 */

import kleur from 'kleur';
import type { PilotContext, Command } from '../core/types.js';
import type { DoctorCheck } from '../core/service.js';

export const manifest: Command = {
  name: 'doctor',
  description: 'Health checks for your pi setup',
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  if (args[0] === '--json') {
    const report = await ctx.service.runDoctor();
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  const report = await ctx.service.runDoctor();

  console.log(kleur.bold().underline('Pilot Doctor'));
  console.log(kleur.dim('Health check for your pi setup\n'));

  let failed = 0;
  for (const c of report.checks) {
    renderCheck(c);
    if (!c.ok) failed++;
  }

  console.log();
  if (failed === 0) {
    console.log(kleur.green('All checks passed.'));
    return 0;
  }
  console.log(kleur.yellow(`${failed} issue(s) found.`));
  return 1;
}

function renderCheck(c: DoctorCheck): void {
  const icon = c.ok ? kleur.green('✓') : kleur.red('✗');
  console.log(`  ${icon} ${c.message}`);
  if (!c.ok && c.hint) {
    console.log(kleur.dim(`    → ${c.hint}`));
  }
}