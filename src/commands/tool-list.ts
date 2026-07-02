/**
 * `pilot tool` — list tools available to pi.
 *
 * Subcommands (v0.4.2):
 *   ls        List all tools (built-in + npm extensions)
 *   inspect   Show details for one tool (TODO: v0.4.3)
 *
 * `--json` outputs the full inventory as JSON.
 */

import kleur from "kleur";
import type { Command, PilotContext } from "../core/types.js";
import type { ToolInventoryItem } from "../core/tool-inventory.js";

export const manifest: Command = {
  name: "tool",
  description: "Tool inventory (built-in + npm extensions) (v0.4.2)",
  subcommands: ["ls", "inspect"],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const json = args.includes("--json");

  if (sub !== "ls" && sub !== "inspect") {
    ctx.logger.error("Usage: pilot tool <ls|inspect> [--json] [name]");
    return 1;
  }

  const items = await ctx.service.listTools();

  if (sub === "inspect") {
    const name = args[1];
    if (!name) {
      ctx.logger.error("Usage: pilot tool inspect <name>");
      return 1;
    }
    const match = items.find((t) => t.name === name);
    if (!match) {
      ctx.logger.error(`Tool not found: ${name}`);
      return 1;
    }
    if (json) {
      console.log(JSON.stringify(match, null, 2));
    } else {
      printTool(match);
    }
    return 0;
  }

  // ls
  if (json) {
    console.log(JSON.stringify(items, null, 2));
    return 0;
  }
  printList(items);
  return 0;
}

function printList(items: ToolInventoryItem[]): void {
  console.log(kleur.bold("Tools") + kleur.dim(`  (${items.length} total)`));
  console.log();
  // Group by source
  const builtIns = items.filter((t) => t.source === "built-in");
  const npm = items.filter((t) => t.source === "npm");
  const ext = items.filter((t) => t.source === "extension");

  if (builtIns.length > 0) {
    console.log(kleur.underline("Built-in"));
    for (const t of builtIns) {
      const safetyColor =
        t.safety === "exec" ? kleur.red : t.safety === "write" ? kleur.yellow : kleur.cyan;
      console.log(
        `  ${kleur.cyan(t.name.padEnd(10))} ${safetyColor(t.safety.padEnd(8))} ${kleur.dim(t.description)}`,
      );
    }
  }
  if (ext.length > 0) {
    console.log();
    console.log(kleur.underline("Extensions (project-local)"));
    for (const t of ext) printToolLine(t);
  }
  if (npm.length > 0) {
    console.log();
    console.log(kleur.underline("Extensions (npm)"));
    for (const t of npm) printToolLine(t);
  }
}

function printToolLine(t: ToolInventoryItem): void {
  const flag = t.enabled ? kleur.green("●") : kleur.dim("○");
  console.log(
    `  ${flag} ${kleur.cyan(t.name.padEnd(28))} ${kleur.dim(t.description)}`,
  );
}

function printTool(t: ToolInventoryItem): void {
  console.log(kleur.bold(t.name));
  console.log(`  source:     ${t.source}`);
  console.log(`  safety:     ${t.safety}`);
  console.log(`  enabled:    ${t.enabled}`);
  if (t.packageName) console.log(`  package:    ${t.packageName}`);
  console.log(`  description: ${t.description}`);
}
