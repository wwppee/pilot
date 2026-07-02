/**
 * `pilot context` — show project context files (mirrors pi's auto-discovery).
 *
 * v0.4.2: walks cwd up to filesystem root + checks `~/.pi/agent/` for
 * AGENTS.md / CLAUDE.md. Surfaces README.md, .cursor/rules, CONTRIBUTING.md
 * as informational (not loaded by pi).
 *
 * Usage:
 *   pilot context ls [cwd]   # list all discovered context (default: cwd)
 *   pilot context show <name>  # show full content + metadata
 */

import kleur from "kleur";
import { readFile } from "node:fs/promises";
import type { Command, PilotContext } from "../core/types.js";
import type { ProjectContextRef } from "../core/project-context.js";

export const manifest: Command = {
  name: "context",
  description: "Project context files (AGENTS.md / CLAUDE.md etc.) (v0.4.2)",
  subcommands: ["ls", "show"],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const json = args.includes("--json");

  if (sub !== "ls" && sub !== "show") {
    ctx.logger.error("Usage: pilot context <ls|show> [cwd] [--json] [name]");
    return 1;
  }

  if (sub === "show") {
    // pilot context show <name> [cwd]
    const name = args[1];
    if (!name || name.startsWith("--")) {
      ctx.logger.error("Usage: pilot context show <name> [cwd]");
      return 1;
    }
    const cwd = args[2] && !args[2].startsWith("--") ? args[2] : process.cwd();
    const refs = await ctx.service.discoverProjectContext(cwd);
    const match = refs.find(
      (r) => r.filename === name || r.path.endsWith(name),
    );
    if (!match) {
      ctx.logger.error(`Context not found: ${name}`);
      return 1;
    }
    if (json) {
      console.log(JSON.stringify(match, null, 2));
    } else {
      await printShow(match);
    }
    return 0;
  }

  // ls: pilot context ls [cwd]
  const cwd = args[1] && !args[1].startsWith("--") ? args[1] : process.cwd();
  const refs = await ctx.service.discoverProjectContext(cwd);

  if (json) {
    console.log(JSON.stringify(refs, null, 2));
    return 0;
  }
  printList(refs, cwd);
  return 0;
}

function printList(refs: ProjectContextRef[], cwd: string): void {
  console.log(kleur.bold("Project Context") + kleur.dim(`  (cwd: ${cwd})`));
  console.log();
  if (refs.length === 0) {
    console.log(kleur.dim("  No context files discovered."));
    return;
  }
  const loaded = refs.filter((r) => r.loaded);
  const info = refs.filter((r) => !r.loaded);
  if (loaded.length > 0) {
    console.log(kleur.underline("Loaded by pi:"));
    for (const r of loaded) {
      const flag = kleur.green("●");
      console.log(
        `  ${flag} ${kleur.cyan(r.filename.padEnd(20))} ${kleur.dim(formatBytes(r.bytes).padStart(8))}  ${r.location}  ${kleur.dim(truncate(r.preview, 60))}`,
      );
    }
  }
  if (info.length > 0) {
    console.log();
    console.log(kleur.underline("Informational only:"));
    for (const r of info) {
      const flag = kleur.dim("○");
      console.log(
        `  ${flag} ${kleur.cyan(r.filename.padEnd(20))} ${kleur.dim(formatBytes(r.bytes).padStart(8))}  ${r.location}  ${kleur.dim(truncate(r.preview, 60))}`,
      );
    }
  }
}

async function printShow(r: ProjectContextRef): Promise<void> {
  console.log(kleur.bold(r.path));
  console.log(
    `  ${formatBytes(r.bytes)}  mtime: ${r.mtime}  loaded: ${r.loaded}`,
  );
  console.log();
  try {
    const content = await readFile(r.path, "utf-8");
    console.log(content);
  } catch (err) {
    console.log(kleur.red(`  (could not read: ${(err as Error).message})`));
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 3) + "..." : flat;
}
