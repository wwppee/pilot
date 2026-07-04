/**
 * `pilot forge` — discover and absorb Pi packages into Capabilities.
 *
 * v0.4.14: logic moved to `core/forge.ts` so the Web UI can call the
 * same operations through PilotService. This file is now a thin CLI
 * wrapper around the shared core helpers.
 *
 * Subcommands:
 *   search <query>    Search npm for packages that look forge-able
 *   inspect <name>    Read a package's manifest and show what would be absorbed
 *   absorb <name>     Pull a package's manifest and create a Capability in
 *                     ~/.pilot/capabilities/<id>/capability.json
 *                     (L1 mode — just reference, no adapter yet)
 *
 * Future (v0.5+):
 *   eval <id>         Run evals.yaml tasks
 *   build <id>        Have Pi generate an L2 adapter / L3 spec
 *   install <id>      Apply a capability to the active settings
 *
 * See: docs/forge-and-avatars.md
 */

import kleur from "kleur";
import {
  ForgeAbsorbError,
  buildCapability,
  deriveCapabilityId,
  forgeAbsorb,
  forgeInspect,
  forgeSearch,
  isValidCapabilityId,
  mapKindToType,
  type ForgeInspectResult,
} from "../core/forge.js";
import type { Command, PilotContext } from "../core/types.js";

/**
 * Re-export core helpers for the existing test suite
 * (test/unit/commands.test.ts → "internal helpers map kinds correctly").
 * Web UI goes through `service.forgeAbsorb` etc. directly — this is
 * only here so the CLI test of these helpers still resolves.
 */
export const __test__ = {
  buildCapability,
  deriveCapabilityId,
  isValidCapabilityId,
  mapKindToType,
};

export const manifest: Command = {
  name: "forge",
  description:
    "Forge new Capabilities from npm packages (search / inspect / absorb)",
  subcommands: ["search <query>", "inspect <name>", "absorb <name>"],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];

  if (sub === "search") {
    return runSearch(args, ctx);
  }
  if (sub === "inspect") {
    return runInspect(args, ctx);
  }
  if (sub === "absorb") {
    return runAbsorb(args, ctx);
  }
  if (sub === undefined) {
    ctx.logger.error("Usage: pilot forge <search|inspect|absorb> [args]");
    return 1;
  }
  ctx.logger.error(`Unknown subcommand: ${sub}`);
  return 1;
}

// ─── search ──────────────────────────────────────────────────

async function runSearch(args: string[], ctx: PilotContext): Promise<number> {
  const q = args[1];
  if (!q || q.length < 2) {
    ctx.logger.error("Usage: pilot forge search <query>  (min 2 chars)");
    return 1;
  }
  try {
    const results = await forgeSearch(q);
    if (results.length === 0) {
      ctx.logger.info("No matching packages.");
      return 0;
    }
    ctx.logger.info(`${results.length} result(s):\n`);
    for (const r of results.slice(0, 20)) {
      const desc = r.description
        ? `  ${kleur.dim(r.description.slice(0, 60))}`
        : "";
      console.log(
        `  ${kleur.cyan(r.name.padEnd(28))} ${kleur.cyan(r.version)}${desc}`,
      );
    }
    return 0;
  } catch (e) {
    ctx.logger.error(`Search failed: ${(e as Error).message}`);
    return 1;
  }
}

// ─── inspect ─────────────────────────────────────────────────

async function runInspect(args: string[], ctx: PilotContext): Promise<number> {
  const name = args[1];
  if (!name) {
    ctx.logger.error("Usage: pilot forge inspect <name>");
    return 1;
  }
  let result: ForgeInspectResult | null;
  try {
    result = await forgeInspect(name);
  } catch (e) {
    ctx.logger.error(`Inspect failed: ${(e as Error).message}`);
    return 1;
  }
  if (!result) {
    ctx.logger.error(`Package not found or no manifest: ${name}`);
    return 1;
  }
  printManifest(result.manifest);
  return 0;
}

function printManifest(m: ForgeInspectResult["manifest"]): void {
  console.log(`${kleur.cyan(m.name)} — v${m.version}`);
  if (m.description) console.log(`\n${m.description}\n`);
  if (m.pi) {
    const p = m.pi;
    console.log(kleur.bold("Manifest (`pi` field)"));
    console.log(
      `  kind:        ${p.kind ?? kleur.dim("(unset — falling back to name heuristic)")}`,
    );
    console.log(
      `  sources:     ${p.extension !== undefined ? "1 extension" : kleur.dim("none")}`,
    );
    if (p.skills && p.skills.length > 0) {
      console.log(`  skills:      ${p.skills.length} (${p.skills.join(", ")})`);
    }
    if (p.themes && p.themes.length > 0) {
      console.log(`  themes:      ${p.themes.length} (${p.themes.join(", ")})`);
    }
    if (p.prompts && p.prompts.length > 0) {
      console.log(
        `  prompts:     ${p.prompts.length} (${p.prompts.join(", ")})`,
      );
    }
    if (p.commands && p.commands.length > 0) {
      console.log(`  commands:    ${p.commands.join(", ")}`);
    }
    if (p.keybindings && p.keybindings.length > 0) {
      console.log(`  keybindings: ${p.keybindings.length}`);
    }
    console.log();
    const inferredMode =
      p.extension !== undefined
        ? "L1-referenced"
        : "L1-referenced (skill/theme/prompt)";
    console.log(
      kleur.dim(`Absorb would create a Capability with mode: ${inferredMode}`),
    );
  } else {
    console.log(
      kleur.dim("No `pi` field — would absorb as L1-referenced only."),
    );
  }
}

// ─── absorb ──────────────────────────────────────────────────

async function runAbsorb(args: string[], ctx: PilotContext): Promise<number> {
  const name = args[1];
  const asFlag = args.indexOf("--as");
  const asId = asFlag >= 0 ? args[asFlag + 1] : undefined;

  if (!name) {
    ctx.logger.error("Usage: pilot forge absorb <name> [--as <capability-id>]");
    return 1;
  }

  try {
    const result = await forgeAbsorb(name, asId, ctx.home || undefined);
    ctx.logger.success(
      `Absorbed ${kleur.cyan(name)} as ${kleur.green(result.id)}`,
    );
    ctx.logger.info(`  ${result.path}`);
    return 0;
  } catch (e) {
    if (e instanceof ForgeAbsorbError) {
      ctx.logger.error(e.message);
      return 1;
    }
    ctx.logger.error(`Absorb failed: ${(e as Error).message}`);
    return 1;
  }
}