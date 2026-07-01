/**
 * `pilot capability` — manage installed Capabilities (v0.3.9+, read-only).
 *
 * A Capability is a verifiable behavior unit composed from one or more
 * Pi packages. For now this command is read-only (ls / show). The
 * full lifecycle (forge / eval / publish) ships in v0.4.
 *
 * Subcommands:
 *   ls      List all installed capabilities
 *   show    Show details for one capability by id
 */

import kleur from "kleur";
import type { Capability } from "../core/capability.js";
import type { Command, PilotContext } from "../core/types.js";

export const manifest: Command = {
  name: "capability",
  description: "List or show installed Capabilities (read-only in v0.3.9)",
  subcommands: ["ls", "show <id>"],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];

  if (sub === undefined || sub === "ls") {
    const list = (await ctx.service.listCapabilities()) as Capability[];
    if (list.length === 0) {
      ctx.logger.info("No capabilities installed. Forge ships in v0.4.");
      return 0;
    }
    ctx.logger.info(`${list.length} capability/capabilities:\n`);
    for (const c of list) {
      const tag = c.type ? ` ${kleur.cyan(`[${c.type}]`)}` : "";
      console.log(`  ${kleur.green(c.id)}${tag}  ${kleur.dim(c.title)}`);
    }
    return 0;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) {
      ctx.logger.error("Usage: pilot capability show <id>");
      return 1;
    }
    const cap = (await ctx.service.getCapability(id)) as Capability | null;
    if (!cap) {
      ctx.logger.error(`Not found: ${kleur.cyan(id)}`);
      return 1;
    }
    printCapability(cap);
    return 0;
  }

  ctx.logger.error(`Unknown subcommand: ${sub}`);
  return 1;
}

function printCapability(c: Capability): void {
  console.log(`${kleur.cyan(c.id)} — ${kleur.bold(c.title)}`);
  if (c.description) console.log(`\n${c.description}\n`);
  if (c.type) console.log(`  type:         ${c.type}`);
  if (c.sources && c.sources.length > 0) {
    console.log(`  sources:      ${c.sources.length} source(s)`);
    for (const s of c.sources) {
      const mode = s.mode ? ` [${s.mode}]` : "";
      console.log(`                - ${s.type}: ${s.ref}${mode}`);
    }
  }
  if (c.compatibility) {
    if (c.compatibility.conflicts.length > 0) {
      console.log(`  conflicts:    ${c.compatibility.conflicts.join(", ")}`);
    }
    if (c.compatibility.requires.length > 0) {
      console.log(`  requires:     ${c.compatibility.requires.join(", ")}`);
    }
  }
  if (c.metadata) {
    console.log(
      `  created:      ${c.metadata.createdAt}\n  updated:      ${c.metadata.updatedAt}`,
    );
  }
}
