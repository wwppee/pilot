/**
 * AST-light scan of pi extension .ts files to extract registered tool names.
 *
 * Why regex and not a real AST parser (typescript-eslint, ts-morph)?
 *   - Pi extensions are small files, often <200 lines
 *   - We only need to extract `name: "..."` from a `pi.registerTool({ ... })` call
 *   - Adds zero deps
 *   - "Best-effort" — if the regex misses, we fall back to the npm package name
 *
 * Patterns we try, in order:
 *   1. `pi.registerTool({ name: "foo" ... })`  ← most common
 *   2. `pi.registerTool({ ... label: "Foo", name: "foo" ... })`  ← name anywhere
 *   3. `pi.registerTool(<variable>)`  ← indirection — skip (no static answer)
 *
 * Output is `{file, tools: [{name, label?}]}`. Used by `tool-inventory.ts`
 * to surface real extension tools in `pilot tool ls`.
 *
 * Limitations (documented; v0.4.3 is "best-effort"):
 *   - Can't resolve variables (e.g. `pi.registerTool(myToolDef)`)
 *   - Can't follow cross-file imports
 *   - Doesn't validate against a real TS parser
 *
 * See: docs/roadmap-pi-grounded.md (Layer 7 tool inventory).
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

export interface ScannedTool {
  /** Tool name as registered (used by LLM to call). */
  name: string;
  /** Human-readable label if found. */
  label?: string;
  /** Source line number (1-indexed) for audit. */
  line: number;
}

export interface ScannedExtension {
  /** Absolute path to the .ts file. */
  file: string;
  /** Display name (file basename, no ext). */
  displayName: string;
  /** Tools found in the file. */
  tools: ScannedTool[];
  /** File size in bytes (cheap heuristic for "is this empty"). */
  sizeBytes: number;
}

/**
 * Scan a single file for `pi.registerTool({ name: "..." })` calls.
 * Returns empty array if nothing found. Throws only on I/O error.
 */
export async function scanExtensionFile(
  file: string,
): Promise<ScannedExtension> {
  let content: string;
  let size: number;
  try {
    const buf = await readFile(file);
    content = buf.toString("utf-8");
    size = buf.length;
  } catch (err) {
    throw new Error(`Failed to read ${file}: ${(err as Error).message}`);
  }
  return parseExtensionFile(file, content, size);
}

/**
 * Pure parser — exposed for unit testing. Given a file's text, return
 * a ScannedExtension. Never throws on parse errors; returns what it can.
 */
export function parseExtensionFile(
  file: string,
  content: string,
  sizeBytes: number,
): ScannedExtension {
  const displayName = basename(file, ".ts");
  const tools: ScannedTool[] = [];

  // Find all `pi.registerTool({ ... })` blocks, then look for `name:`
  // inside each block. We use a non-greedy match because extensions
  // can have multiple registerTool calls in one file.
  const blockRe = /pi\.registerTool\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let m: RegExpExecArray | null;
  let line = 0;
  while ((m = blockRe.exec(content)) !== null) {
    // Approximate line number for the start of this match
    const before = content.slice(0, m.index);
    line = before.split("\n").length;
    const body = m[1]!;
    const nameMatch = /\bname\s*:\s*["'`]([^"'`]+)["'`]/.exec(body);
    if (!nameMatch) continue;
    const name = nameMatch[1]!;
    if (tools.some((t) => t.name === name)) continue; // dedup

    const labelMatch = /\blabel\s*:\s*["'`]([^"'`]+)["'`]/.exec(body);
    tools.push({
      name,
      ...(labelMatch ? { label: labelMatch[1]! } : {}),
      line,
    });
  }

  return { file, displayName, tools, sizeBytes };
}

/**
 * Scan a directory of extension files (recursively). Used by
 * `tool-inventory.ts` to discover extension tools from
 * `~/.pi/agent/extensions/`, `.pi/extensions/`, and npm packages
 * whose .ts files we have on disk.
 */
export async function scanExtensionDir(
  dir: string,
  options: { recursive?: boolean; maxFiles?: number } = {},
): Promise<ScannedExtension[]> {
  const { recursive = true, maxFiles = 200 } = options;

  let files: string[];
  try {
    files = await collectTsFiles(dir, recursive);
  } catch {
    return [];
  }
  if (files.length > maxFiles) files = files.slice(0, maxFiles);

  const results: ScannedExtension[] = [];
  for (const f of files) {
    try {
      const ext = await scanExtensionFile(f);
      // Skip index.ts in nested dirs (these are entry files, not tool defs)
      if (basename(f) === "index.ts" && ext.tools.length === 0) continue;
      results.push(ext);
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

/**
 * Convert a list of ScannedExtension to the simpler
 * `ToolInventoryItem` shape used by the rest of Pilot.
 *
 * @param extensions - what we found on disk
 * @param baseDir - the root we scanned from (for display)
 */
export function mergeScannedTools(
  extensions: ScannedExtension[],
  baseDir: string,
): Array<{
  name: string;
  label?: string;
  safety: "read" | "write" | "exec";
  source: string;
  extensionFile?: string;
}> {
  const out: Array<{
    name: string;
    label?: string;
    safety: "read" | "write" | "exec";
    source: string;
    extensionFile?: string;
  }> = [];

  for (const ext of extensions) {
    const rel = relative(baseDir, ext.file) || ext.displayName;
    for (const tool of ext.tools) {
      out.push({
        name: tool.name,
        ...(tool.label ? { label: tool.label } : {}),
        safety: inferSafety(tool.name),
        source: `extension:${rel}`,
        extensionFile: ext.file,
      });
    }
  }
  return out;
}

/** Infer safety class from a tool name. Heuristic. */
function inferSafety(name: string): "read" | "write" | "exec" {
  const n = name.toLowerCase();
  if (
    n.includes("read") ||
    n.includes("grep") ||
    n.includes("find") ||
    n.includes("list") ||
    n.includes("ls")
  ) {
    return "read";
  }
  if (
    n.includes("write") ||
    n.includes("edit") ||
    n.includes("create") ||
    n.includes("delete") ||
    n.includes("rm")
  ) {
    return "write";
  }
  return "exec";
}

/**
 * Recursively collect all .ts files under a directory. Symlinks are
 * not followed (avoid loops). Non-existent dir returns empty list.
 */
async function collectTsFiles(
  dir: string,
  recursive: boolean,
): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        recursive &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules"
      ) {
        out.push(...(await collectTsFiles(full, recursive)));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}
