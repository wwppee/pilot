#!/usr/bin/env node
/**
 * Pilot CLI entry point.
 *
 * Wires all command modules into a single `pilot` binary using commander.
 *
 * To add a new top-level command:
 *   1. Create `src/commands/<name>.ts` with `manifest` + `run` exports.
 *   2. Import + register it below.
 */

import { Command as Commander } from 'commander';
import { logger } from './utils/logger.js';
import { readSettings } from './core/settings.js';
import { PI_AGENT_DIR, type PilotContext } from './core/types.js';

import * as packCmd from './commands/pack.js';
import * as sessionCmd from './commands/session.js';
import * as doctorCmd from './commands/doctor.js';

/** All registered top-level commands. */
const commands = [packCmd, sessionCmd, doctorCmd] as const;

async function main(): Promise<void> {
  const program = new Commander();

  program
    .name('pilot')
    .description('Pilot — management plane for pi.dev coding agent')
    .version('0.1.0')
    .showHelpAfterError();

  for (const c of commands) {
    const sub = program.command(c.manifest.name).description(c.manifest.description);

    if (c.manifest.subcommands) {
      sub.addHelpText(
        'after',
        `\nSubcommands:\n  ${c.manifest.subcommands.join('\n  ')}\n`,
      );
    }

    // All commands accept variadic args — we dispatch internally.
    sub.allowExcessArguments(true).action(async (...actionArgs) => {
      // commander passes (cmd, ...positionalArgs, options). Strip the Command instance.
      const cmd = actionArgs[0];
      const args = actionArgs.slice(1, cmd.args.length);
      const ctx = await buildContext();
      try {
        const code = await c.run(args, ctx);
        process.exitCode = code;
      } catch (err) {
        logger.error((err as Error).message);
        process.exitCode = 1;
      }
    });
  }

  // Bare `pilot` → friendly greeting.
  program.action(() => {
    console.log(
      [
        'Pilot — pi.dev management plane',
        '',
        'Usage: pilot <command> [args]',
        '',
        'Commands:',
        ...commands.map((c) => `  ${c.manifest.name.padEnd(12)} ${c.manifest.description}`),
        '',
        'Tip: try `pilot doctor` first.',
      ].join('\n'),
    );
  });

  await program.parseAsync(process.argv);
}

async function buildContext(): Promise<PilotContext> {
  const settings = await readSettings();
  return {
    home: process.env['HOME'] ?? '',
    piAgentDir: PI_AGENT_DIR,
    settings,
    logger,
    isInteractive: Boolean(process.stdout.isTTY),
  };
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});