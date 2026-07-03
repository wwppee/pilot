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

import { Command as Commander } from "commander";
import { logger } from "./utils/logger.js";
import { readSettings } from "./core/settings.js";
import { createService } from "./core/service-impl.js";
import { piAgentDir, type PilotContext } from "./core/types.js";
import { VERSION } from "./core/version.js";

import * as packCmd from "./commands/pack.js";
import * as sessionCmd from "./commands/session.js";
import * as doctorCmd from "./commands/doctor.js";
import * as serverCmd from "./commands/server.js";
import * as profileCmd from "./commands/profile.js";
import * as statsCmd from "./commands/stats.js";
import * as usageCmd from "./commands/usage.js";
import * as dashboardCmd from "./commands/dashboard.js";
import * as capabilityCmd from "./commands/capability.js";
import * as forgeCmd from "./commands/forge.js";
import * as toolListCmd from "./commands/tool-list.js";
import * as contextCmd from "./commands/context.js";
import * as policyCmd from "./commands/policy.js";
import * as initCmd from "./commands/init.js";

/** All registered top-level commands. */
const commands = [
  packCmd,
  sessionCmd,
  profileCmd,
  doctorCmd,
  serverCmd,
  statsCmd,
  usageCmd,
  dashboardCmd,
  capabilityCmd,
  forgeCmd,
  toolListCmd,
  contextCmd,
  policyCmd,
  initCmd,
] as const;

async function main(): Promise<void> {
  const program = new Commander();

  program
    .name("pilot")
    .description("Pilot — management plane for pi.dev coding agent")
    .version(VERSION)
    .showHelpAfterError();

  for (const c of commands) {
    const sub = program
      .command(c.manifest.name)
      .description(c.manifest.description)
      .allowUnknownOption(true)
      .allowExcessArguments(true);

    if (c.manifest.subcommands) {
      sub.addHelpText(
        "after",
        `\nSubcommands:\n  ${c.manifest.subcommands.join("\n  ")}\n`,
      );
    }

    // All commands accept variadic args — we dispatch internally.
    sub.action(async function (
      this: InstanceType<typeof Commander>,
      ..._actionArgs: unknown[]
    ) {
      // `this.args` is commander's full argv (positional + unknown options).
      // We pass them as-is to the command's run() for it to parse.
      const args = this.args;
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
        "Pilot — pi.dev management plane",
        "",
        "Usage: pilot <command> [args]",
        "",
        "Commands:",
        ...commands.map(
          (c) => `  ${c.manifest.name.padEnd(12)} ${c.manifest.description}`,
        ),
        "",
        "Tip: try `pilot doctor` first.",
      ].join("\n"),
    );
  });

  await program.parseAsync(process.argv);
}

async function buildContext(): Promise<PilotContext> {
  const home = process.env["HOME"] ?? "";
  const settings = await readSettings();
  return {
    home,
    piAgentDir: piAgentDir(home),
    settings,
    logger,
    isInteractive: Boolean(process.stdout.isTTY),
    service: createService({ home }),
  };
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
