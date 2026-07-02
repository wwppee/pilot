/**
 * `pilot forge` — discover and absorb Pi packages into Capabilities (v0.4+).
 *
 * Subcommands (v0.4.1 MVP):
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
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readPackManifest, type PackManifest } from "../core/pack-manifest.js";
import { CapabilitySchema, type Capability } from "../core/capability.js";
import { pilotCapabilitiesDir } from "../core/types.js";
import type { Command, PilotContext } from "../core/types.js";

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
    const results = await ctx.service.searchPacks(q);
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
  const manifest = await readPackManifest(name);
  if (!manifest) {
    ctx.logger.error(`Package not found or no manifest: ${name}`);
    return 1;
  }
  printManifest(manifest);
  return 0;
}

function printManifest(m: PackManifest): void {
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

  const packManifest = await readPackManifest(name);
  if (!packManifest) {
    ctx.logger.error(`Package not found or no manifest: ${name}`);
    return 1;
  }

  const id = asId ?? deriveCapabilityId(packManifest);
  if (!isValidCapabilityId(id)) {
    ctx.logger.error(
      `Derived capability id "${id}" is invalid. Use kebab-case, or pass --as <id>.`,
    );
    return 1;
  }

  const cap = buildCapability(id, packManifest);
  const validation = CapabilitySchema.safeParse(cap);
  if (!validation.success) {
    ctx.logger.error(
      `Built capability failed schema validation: ${validation.error.issues[0]?.message}`,
    );
    return 1;
  }

  // Write the capability file
  const home = ctx.home || undefined;
  const capDir = join(pilotCapabilitiesDir(home), id);
  const capFile = join(capDir, "capability.json");
  await mkdir(capDir, { recursive: true });
  await writeFile(
    capFile,
    JSON.stringify(validation.data, null, 2) + "\n",
    "utf-8",
  );

  ctx.logger.success(`Absorbed ${kleur.cyan(name)} as ${kleur.green(id)}`);
  ctx.logger.info(`  ${capFile}`);
  return 0;
}

/**
 * Build a Capability object from a pack manifest.
 *
 * Maps the pack's `pi.kind` (extension/skill/theme/prompt) onto the
 * Capability type taxonomy (workflow/tool/integration/safety). Defaults
 * to "integration" when the kind is unset.
 */
function buildCapability(id: string, pack: PackManifest): Capability {
  const p = pack.pi ?? {};
  const mode = p.extension !== undefined ? "L2-wrapped" : "L1-referenced";
  const now = new Date().toISOString();
  return {
    id,
    title: pack.name,
    type: mapKindToType(p.kind),
    description:
      pack.description ?? `Absorbed from ${pack.name}@${pack.version}`,
    sources: [
      {
        type: "npm",
        ref: `npm:${pack.name}@${pack.version}`,
        mode,
      },
    ],
    artifacts: {},
    compatibility: {
      conflicts: [],
      requires: [],
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Map a pack's `pi.kind` onto the Capability `type` enum. */
function mapKindToType(kind: string | undefined): Capability["type"] {
  // Pack kinds: extension, skill, theme, prompt
  // Capability types: workflow, tool, integration, safety
  switch (kind) {
    case "skill":
      return "tool";
    case "prompt":
      return "workflow";
    case "theme":
      return "integration";
    case "extension":
    default:
      return "integration";
  }
}

/** Strip npm scope and lowercase, e.g. `@wwppee/foo` → `foo`. */
function deriveCapabilityId(pack: PackManifest): string {
  const base = pack.name.replace(/^@[^/]+\//, "").toLowerCase();
  return base;
}

function isValidCapabilityId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

// Re-export for tests
export const __test__ = {
  deriveCapabilityId,
  isValidCapabilityId,
  buildCapability,
};
