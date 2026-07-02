/**
 * Project context auto-discovery.
 *
 * v0.4.2: mirrors `@earendil-works/pi-coding-agent`'s `loadProjectContextFiles`
 * algorithm (see `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js`).
 * Pi looks for these filenames in this order, case-sensitive:
 *
 *   1. agentDir (i.e. `~/.pi/agent/`) — global context
 *   2. cwd
 *   3. each parent of cwd up to filesystem root
 *
 * Filenames: `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`.
 * Duplicates by path are deduped.
 *
 * Pilot additionally surfaces a few non-Pi files (README.md, .cursor/rules,
 * CONTRIBUTING.md) as "informational" — they're not loaded into the
 * prompt but are useful for the user to see at a glance.
 *
 * See: docs/v0.4.2-dev-plan.md §3.
 */

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { piAgentDir } from "./types.js";

// ─── Types ──────────────────────────────────────────────────

/** A discovered context file, with metadata. */
export interface ProjectContextRef {
  /** Absolute path. */
  path: string;
  /** Just the filename, e.g. "AGENTS.md". */
  filename: string;
  /** Where it was found, e.g. "<cwd>" or "~/parent/.." */
  location: string;
  /** True if pi will load this into the prompt (canonical AGENTS.md / CLAUDE.md). */
  loaded: boolean;
  /** File size in bytes. */
  bytes: number;
  /** ISO 8601 modification time. */
  mtime: string;
  /** First ~200 chars (single line, ellipsised). */
  preview: string;
}

// ─── Discovery ──────────────────────────────────────────────

/** Filenames pi searches for, in priority order. */
const PI_CONTEXT_FILENAMES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

/**
 * Discover project context files visible from `cwd`.
 *
 * The algorithm mirrors pi's `loadProjectContextFiles`:
 *   1. Check `~/.pi/agent/` (agentDir) for any of the canonical names
 *   2. Walk from cwd up to filesystem root, checking each dir for canonical names
 *   3. Dedup by absolute path
 *
 * After pi's discovery, also scan cwd (one level only) for the
 * "informational" files (README.md, .cursor/rules, CONTRIBUTING.md)
 * which pi doesn't load but the user might find useful.
 */
export async function discoverProjectContext(
  cwd: string,
  home?: string,
): Promise<ProjectContextRef[]> {
  const refs: ProjectContextRef[] = [];
  const seen = new Set<string>();

  // 1. Agent dir (global) — only the first matching filename
  const agentDir = piAgentDir(home);
  const agentRef = await loadFirstContextFromDir(agentDir);
  if (agentRef) {
    refs.push({ ...agentRef, location: `~`, loaded: true });
    seen.add(agentRef.path);
  }

  // 2. Walk cwd up to root — one context per dir (first match wins)
  const root = resolve("/");
  const ancestor: ProjectContextRef[] = [];
  let currentDir = resolve(cwd);
  while (true) {
    if (currentDir !== resolve(cwd)) {
      // Skip the cwd itself here — handled below
    }
    const ref = await loadFirstContextFromDir(currentDir);
    if (ref && !seen.has(ref.path)) {
      ancestor.unshift({
        ...ref,
        location: currentDir === cwd ? "<cwd>" : `<parent:${currentDir}>`,
        loaded: true,
      });
      seen.add(ref.path);
    }
    if (currentDir === root) break;
    const parent = resolve(currentDir, "..");
    if (parent === currentDir) break;
    currentDir = parent;
  }
  refs.push(...ancestor);

  // 3. Informational-only files (just in cwd, not loaded by pi)
  const info: Array<{ name: string; label: string }> = [
    { name: "README.md", label: "README" },
    { name: ".cursor/rules", label: ".cursor/rules" },
    { name: "CONTRIBUTING.md", label: "CONTRIBUTING" },
  ];
  for (const f of info) {
    const path = join(cwd, f.name);
    if (seen.has(path)) continue;
    const ref = await tryRef(path, f.name, "<cwd>");
    if (ref) refs.push({ ...ref, loaded: false });
  }

  return refs;
}

/**
 * Helper: read file metadata + first 200 chars of content.
 *
 * Returns null if file doesn't exist or isn't readable. Sorted to the
 * front of callers' results when present.
 */
async function tryRef(
  path: string,
  filename: string,
  location: string,
): Promise<Omit<ProjectContextRef, "loaded"> | null> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    const content = await readFile(path, "utf-8");
    return {
      path,
      filename,
      location,
      bytes: s.size,
      mtime: s.mtime.toISOString(),
      preview: previewText(content),
    };
  } catch {
    return null;
  }
}

/** First ~200 chars, single-line, ellipsised. */
function previewText(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? flat.slice(0, 197) + "..." : flat;
}

/**
 * Try each canonical filename in priority order; return the first hit.
 * Mirrors pi's `loadContextFileFromDir`.
 */
async function loadFirstContextFromDir(
  dir: string,
): Promise<Omit<ProjectContextRef, "loaded" | "location"> | null> {
  for (const name of PI_CONTEXT_FILENAMES) {
    const path = join(dir, name);
    const ref = await tryRef(path, name, dir);
    if (ref) return ref;
  }
  return null;
}

/** Re-export for test convenience. */
export const __test__ = { PI_CONTEXT_FILENAMES };
