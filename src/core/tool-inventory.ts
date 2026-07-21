/**
 * Tool inventory — list every tool available to pi.
 *
 * v0.4.3: read-only enumeration of:
 *   1. Built-in tools (hardcoded — the 7 names documented in `pi --help`)
 *   2. npm-installed extensions under `~/.pi/agent/npm/` (one entry per package)
 *   3. Project-local extensions under `~/.pi/agent/extensions/` and
 *      `.pi/extensions/` — parsed via `extension-scanner.ts` to extract
 *      actual `pi.registerTool()` calls. Each registered tool is its
 *      own inventory entry with the extension's source file.
 *
 * See: docs/roadmap-pi-grounded.md (Layer 7 tool inventory).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { piAgentDir } from "./types.js";
import { scanExtensionDir, mergeScannedTools } from "./extension-scanner.js";

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
  /**
   * For source-discovered extensions: the .ts file that registered
   * this tool. Useful for the UI to link "click here to see the source".
   */
  extensionFile?: string;
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
 * `~/.pi/agent/extensions/*.ts` (and `.pi/extensions/`) are scanned
 * with `extension-scanner.ts` to extract real `pi.registerTool()` calls.
 *
 * v1.0.4: layered on top of `tools-state.ts` — each tool's
 * `enabled` field is `inventory.enabled AND (state[name] ?? true)`.
 * Built-ins are inventory-enabled by definition; npm extensions
 * are inventory-enabled when their package is installed. The
 * state file lets the user toggle individual tools off without
 * uninstalling the package.
 */
export async function listToolInventory(
  home?: string,
): Promise<ToolInventoryItem[]> {
  const out: ToolInventoryItem[] = [];

  // v1.0.4: read the per-tool enable/disable override once
  // at the top so we can apply it to every entry. Missing
  // file → no overrides, all tools keep their inventory default.
  const { readToolsState } = await import("./tools-state.js");
  const state = await readToolsState(home);

  // 1. Built-ins — always available, always enabled
  for (const b of BUILT_INS) {
    out.push({
      name: b.name,
      source: "built-in",
      safety: b.safety,
      description: b.description,
      // v1.0.4: built-ins are inventory-enabled; respect the
      // state override if the user explicitly disabled one.
      enabled: state[b.name] !== false,
      installed: true,
    });
  }

  // 2. npm-installed extensions (one entry per package)
  const npm = await loadNpmPackages(home);
  for (const pkg of npm) {
    out.push({
      name: pkg.name,
      source: "npm",
      safety: "exec", // conservative default; refine when AST scan finds real tools
      description: pkg.description ?? `npm package ${pkg.name}@${pkg.version}`,
      packageName: pkg.name,
      // v1.0.4: AND the inventory's package-enabled flag with
      // the per-tool state override. Default-true if the
      // override entry is missing.
      enabled: pkg.enabled && state[pkg.name] !== false,
      installed: true,
    });
  }

  // 3. Project-local extensions (v0.4.3) — AST scan to find real tools
  const extDirs = [
    join(piAgentDir(home), "extensions"),
    // Project-local `.pi/extensions/` is read relative to cwd by the caller.
    // We don't know cwd here; the server adds it explicitly.
  ];
  for (const dir of extDirs) {
    const scanned = await scanExtensionDir(dir, { recursive: true });
    const merged = mergeScannedTools(scanned, dir);
    for (const m of merged) {
      // If a scanned tool name collides with an npm package name,
      // prefer the npm entry (it has version + description). The
      // extension file's tool is the same logic exposed differently.
      if (out.some((o) => o.name === m.name)) continue;
      out.push({
        name: m.name,
        source: "extension",
        safety: m.safety,
        description: `Registered by extension: ${m.source}`,
        // v1.0.4: project-local extensions also respect the
        // user override.
        enabled: state[m.name] !== false,
        installed: true,
        ...(m.extensionFile ? { extensionFile: m.extensionFile } : {}),
      });
    }
  }

  return out;
}

/**
 * Like `listToolInventory` but also scans a project-local `.pi/extensions/`
 * directory. Used by the server to surface tools available in the
 * user's working directory.
 */
export async function listToolInventoryWithProject(
  home: string | undefined,
  projectExtDir: string | undefined,
): Promise<ToolInventoryItem[]> {
  const out = await listToolInventory(home);
  if (!projectExtDir) return out;
  const scanned = await scanExtensionDir(projectExtDir, { recursive: true });
  const merged = mergeScannedTools(scanned, projectExtDir);
  for (const m of merged) {
    if (out.some((o) => o.name === m.name)) continue;
    out.push({
      name: m.name,
      source: "extension",
      safety: m.safety,
      description: `Registered by extension: ${m.source}`,
      enabled: true,
      installed: true,
      ...(m.extensionFile ? { extensionFile: m.extensionFile } : {}),
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
