/**
 * Tool inventory — list every tool available to pi.
 *
 * v0.4.2: read-only enumeration of:
 *   1. Built-in tools (hardcoded — the 7 names documented in `pi --help`)
 *   2. npm-installed extensions under `~/.pi/agent/npm/`
 *
 * For v0.4.2 we don't yet parse extension .ts files to extract
 * `pi.registerTool()` calls — that's a v0.4.3 AST scan. We just
 * surface the extension names that are *available* (installed and
 * enabled in settings).
 *
 * See: docs/v0.4.2-dev-plan.md §4.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { piAgentDir } from "./types.js";

// ─── Types ──────────────────────────────────────────────────

/** Where a tool comes from. */
export type ToolSource = "built-in" | "extension" | "npm";

/** Safety classification. Pi's CLI docs describe each tool's risk. */
export type ToolSafety = "read" | "write" | "exec" | "network" | "secret";

/** One tool in the inventory. */
export interface ToolInventoryItem {
  /** Tool name, e.g. "read", "bash", "pi-subagents.delegate". */
  name: string;
  /** Where the tool comes from. */
  source: ToolSource;
  /** Safety classification — used for HITL policy UI. */
  safety: ToolSafety;
  /** Short description (one line). */
  description: string;
  /**
   * For npm-installed extensions: the parent npm package name.
   * `undefined` for built-ins and project-local extensions.
   */
  packageName?: string;
  /**
   * Whether the tool is currently enabled in pi's settings.json.
   * Built-ins are always true. Extensions inherit from their package.
   */
  enabled: boolean;
  /** Whether the tool is registered (npm-installed) or just available. */
  installed: boolean;
}

// ─── Built-in tool catalog ──────────────────────────────────
//
// These 7 tools are hardcoded into pi (per `pi --help` "Built-in Tool
// Names"). They are always available unless explicitly disabled via
// `--no-builtin-tools` or `--exclude-tools`.

interface BuiltInDef {
  name: string;
  safety: ToolSafety;
  description: string;
}

const BUILT_INS: BuiltInDef[] = [
  { name: "read", safety: "read", description: "Read file contents" },
  {
    name: "write",
    safety: "write",
    description: "Write files (creates/overwrites)",
  },
  {
    name: "edit",
    safety: "write",
    description: "Edit files with find/replace",
  },
  { name: "bash", safety: "exec", description: "Execute bash commands" },
  {
    name: "grep",
    safety: "read",
    description: "Search file contents (off by default)",
  },
  {
    name: "find",
    safety: "read",
    description: "Find files by glob pattern (off by default)",
  },
  {
    name: "ls",
    safety: "read",
    description: "List directory contents (off by default)",
  },
];

// ─── Inventory ──────────────────────────────────────────────

/**
 * List all tools available to pi.
 *
 * Built-ins are always included. npm-installed extensions are pulled
 * from `~/.pi/agent/npm/package.json`. Project-local extensions under
 * `~/.pi/agent/extensions/*.ts` are not parsed in v0.4.2 (would
 * require AST scan) — they show up only if registered through npm.
 */
export async function listToolInventory(
  home?: string,
): Promise<ToolInventoryItem[]> {
  const out: ToolInventoryItem[] = [];

  // 1. Built-ins — always available, always enabled
  for (const b of BUILT_INS) {
    out.push({
      name: b.name,
      source: "built-in",
      safety: b.safety,
      description: b.description,
      enabled: true,
      installed: true,
    });
  }

  // 2. npm-installed extensions
  const npm = await loadNpmPackages(home);
  for (const pkg of npm) {
    out.push({
      name: pkg.name,
      source: "npm",
      safety: "exec", // conservative default; refine in v0.4.3
      description: pkg.description ?? `npm package ${pkg.name}@${pkg.version}`,
      packageName: pkg.name,
      enabled: pkg.enabled,
      installed: true,
    });
  }

  return out;
}

// ─── Internal ───────────────────────────────────────────────

interface NpmPkgSummary {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
}

/**
 * Read `~/.pi/agent/npm/package.json` to enumerate installed extensions.
 *
 * Falls back to a `{}` if the file is missing. The `enabled` flag is
 * derived from a per-package enable file in `~/.pi/agent/npm/<pkg>/.enabled`
 * — if absent, defaults to true. (v0.4.2 simplification: any
 * installed package is treated as enabled.)
 */
async function loadNpmPackages(home?: string): Promise<NpmPkgSummary[]> {
  const npmDir = join(piAgentDir(home), "npm");
  let packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    const raw = await readFile(join(npmDir, "package.json"), "utf-8");
    packageJson = JSON.parse(raw);
  } catch {
    return [];
  }

  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  if (!deps) return [];

  const summaries: NpmPkgSummary[] = [];
  for (const [name, versionRaw] of Object.entries(deps)) {
    // Strip leading ^ / ~ / etc.
    const version = versionRaw.replace(/^[\^~]/, "");
    let description: string | undefined;
    try {
      const pkgRaw = await readFile(
        join(npmDir, "node_modules", name, "package.json"),
        "utf-8",
      );
      const pkg = JSON.parse(pkgRaw) as { description?: string };
      description = pkg.description;
    } catch {
      // Skip description if can't read.
    }
    summaries.push({
      name,
      version,
      ...(description ? { description } : {}),
      enabled: true,
    });
  }

  return summaries;
}

/** Re-export for test convenience. */
export const __test__ = { BUILT_INS };
