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

/**
 * v1.1.1.1 (= v2.0.5): the canonical "v0.5.8" filename
 * priority list is now the **fallback** when the user has no
 * `~/.pilot/context-rules.json`. The live `filenames` list
 * is read at the top of `discoverProjectContext` from
 * `readContextRules()` — see below. `DEFAULT_CONTEXT_RULES`
 * is the import that the runner falls back to when the
 * helper bails (we never directly use the const anymore,
 * it's the static-shape sentinel for tests / tooltips).
 */
import { DEFAULT_CONTEXT_RULES } from "./context-rules.js";
void DEFAULT_CONTEXT_RULES;

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

  // v1.1.1.1 (= v2.0.5): load the user's rules before the
  // walk. The hardcoded v0.5.8 constants are now fallbacks —
  // the user's overrides in ~/.pilot/context-rules.json take
  // precedence. Reading once at the top of the function
  // (rather than per-iteration) means a `getcwd` swap or
  // a hot-reload of the file shows up next call but not
  // mid-walk, which is the right granularity.
  const { readContextRules } = await import("./context-rules.js");
  const rules = await readContextRules(home);
  // `infoFiles` is sourced from the rules; the other two
  // (filenames, searchPaths) are read in the helper below.

  // 1. Agent dir (global) — only the first matching filename
  const agentDir = piAgentDir(home);
  const agentRef = await loadFirstContextFromDir(agentDir, rules.filenames);
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
    const ref = await loadFirstContextFromDir(currentDir, rules.filenames);
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

  // 3. Informational-only files (just in cwd, not loaded by pi).
  // v1.1.1.1 (= v2.0.5): read the user-editable list from
  // ~/.pilot/context-rules.json. The hardcoded `info` array
  // below is now the **fallback** when the rules file is
  // missing. The same `rules` value is sourced from
  // context-rules.ts (imported above) so filenames / search
  // paths / info files all come from one place.
  const { infoFiles } = rules;
  const info: Array<{ name: string; label: string }> = infoFiles.map(
    (name) => ({ name, label: name }),
  );
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
  filenames: readonly string[],
): Promise<Omit<ProjectContextRef, "loaded" | "location"> | null> {
  for (const name of filenames) {
    const path = join(dir, name);
    const ref = await tryRef(path, name, dir);
    if (ref) return ref;
  }
  return null;
}

/** Re-export for test convenience. The const itself is no
 *  longer read inside `loadFirstContextFromDir`; the value
 *  is sourced from `~/.pilot/context-rules.json` per call.
 *  Kept for any out-of-tree tests that import it. */
export const __test__ = {
  get PI_CONTEXT_FILENAMES() {
    return DEFAULT_CONTEXT_RULES.filenames;
  },
};

// ─── Read / write (v1.0.3) ──────────────────────────────────

/**
 * v1.0.3: read the content of a discovered context file.
 *
 * `path` must be in the list returned by `discoverProjectContext(cwd)` —
 * we cross-check to prevent path traversal (a `/context/file?path=/etc/passwd`
 * would otherwise succeed). Returns `null` if the path isn't part of the
 * discovered set.
 *
 * The "discover then cross-check" pattern is intentional: we re-run
 * discovery each call rather than trust a stored list, so if the user
 * creates AGENTS.md between calls, the new file is immediately readable.
 */
export async function readContextFile(
  cwd: string,
  path: string,
  home?: string,
): Promise<{ content: string; ref: ProjectContextRef } | null> {
  const refs = await discoverProjectContext(cwd, home);
  const ref = refs.find((r) => r.path === path);
  if (!ref) return null;
  try {
    const content = await readFile(path, "utf-8");
    return { content, ref };
  } catch {
    return null;
  }
}

/**
 * v1.0.3: write the content of a discovered, *loaded* context file.
 *
 * Only files where `loaded === true` (i.e. canonical AGENTS.md /
 * CLAUDE.md and their .MD uppercase variant) are writable.
 * Informational files (README.md / .cursor/rules / CONTRIBUTING.md)
 * are read-only through this endpoint — they're surfaced in the
 * dashboard for visibility but Pilot doesn't author them.
 *
 * Returns the new mtime on success, or `null` if the path isn't
 * writable (not discovered, or informational-only). Throws if the
 * write itself fails (permission denied, disk full, etc.).
 */
export async function writeContextFile(
  cwd: string,
  path: string,
  content: string,
  home?: string,
): Promise<{ mtime: string; ref: ProjectContextRef } | null> {
  const refs = await discoverProjectContext(cwd, home);
  const ref = refs.find((r) => r.path === path);
  if (!ref || !ref.loaded) return null;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf-8");
  const s = await stat(path);
  return { mtime: s.mtime.toISOString(), ref };
}
