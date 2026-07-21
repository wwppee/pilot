/**
 * v1.1.1: user-editable context discovery rules.
 *
 * v0.5.8 hardcoded the discovery rules (filenames priority
 * order, search paths, "informational" file list) inside
 * `project-context.ts`. v1.1.1 surfaces the three most
 * important knobs as a Pilot-owned JSON file so users can
 * adjust them without recompiling Pilot.
 *
 * Storage: `~/.pilot/context-rules.json` — Pilot's own
 * directory, never written into `~/.pi/agent/`. Missing
 * file = the v0.5.8 defaults.
 *
 * Schema (all keys optional):
 *   {
 *     "filenames": ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"],
 *     "searchPaths": ["agentDir", "cwd", "ancestor"],
 *     "infoFiles": ["README.md", ".cursor/rules", "CONTRIBUTING.md"]
 *   }
 *
 * We only enforce presence (non-empty array) — order in
 * `filenames` is priority order, and order in `searchPaths`
 * is the lookup sequence. `infoFiles` is the set of files
 * surfaced for visibility but not loaded by pi.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pilotDir } from "./types.js";

const RULES_FILENAME = "context-rules.json";

const DEFAULTS = {
  filenames: ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"],
  searchPaths: ["agentDir", "cwd", "ancestor"],
  infoFiles: ["README.md", ".cursor/rules", "CONTRIBUTING.md"],
} as const;

export interface ContextRules {
  filenames: string[];
  searchPaths: string[];
  infoFiles: string[];
}

function rulesPath(home?: string): string {
  return join(pilotDir(home), RULES_FILENAME);
}

export async function readContextRules(home?: string): Promise<ContextRules> {
  try {
    const raw = await readFile(rulesPath(home), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Merge over defaults so a partial file (e.g. only
      // `filenames` set) still returns all three keys.
      return {
        filenames: Array.isArray(parsed.filenames)
          ? parsed.filenames.filter((s: unknown) => typeof s === "string")
          : [...DEFAULTS.filenames] as string[],
        searchPaths: Array.isArray(parsed.searchPaths)
          ? parsed.searchPaths.filter((s: unknown) => typeof s === "string")
          : [...DEFAULTS.searchPaths] as string[],
        infoFiles: Array.isArray(parsed.infoFiles)
          ? parsed.infoFiles.filter((s: unknown) => typeof s === "string")
          : [...DEFAULTS.infoFiles] as string[],
      };
    }
    return { ...DEFAULTS, filenames: [...DEFAULTS.filenames], searchPaths: [...DEFAULTS.searchPaths], infoFiles: [...DEFAULTS.infoFiles] };
  } catch {
    return { ...DEFAULTS, filenames: [...DEFAULTS.filenames], searchPaths: [...DEFAULTS.searchPaths], infoFiles: [...DEFAULTS.infoFiles] };
  }
}

export async function writeContextRules(
  rules: ContextRules,
  home?: string,
): Promise<{ mtime: string; rules: ContextRules }> {
  // Light validation: each list must be a non-empty array
  // of strings. Empty arrays would silently disable discovery.
  for (const k of ["filenames", "searchPaths", "infoFiles"] as const) {
    if (
      !Array.isArray(rules[k]) ||
      rules[k].length === 0 ||
      rules[k].some((s) => typeof s !== "string" || s.length === 0)
    ) {
      throw new Error(`${k} must be a non-empty array of non-empty strings`);
    }
  }
  const path = rulesPath(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(rules, null, 2) + "\n", "utf-8");
  const s = await readFile(path, "utf-8");
  return { mtime: new Date().toISOString(), rules: JSON.parse(s) };
}

/** Re-export the defaults so the UI can show them when no
 *  override file is present. */
export const DEFAULT_CONTEXT_RULES: ContextRules = {
  filenames: [...DEFAULTS.filenames],
  searchPaths: [...DEFAULTS.searchPaths],
  infoFiles: [...DEFAULTS.infoFiles],
};
