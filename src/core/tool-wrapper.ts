/**
 * v0.9.0: Tool Wrapper (A2 — "插拔式替换工具")
 *
 * pilot's policy layer (B1, v0.8.0 + v0.8.6) is a gate:
 * "should this tool call run, given the active policy?"
 * pilot's tool-wrapper layer (A2, v0.9.0) is a transform:
 * "given a tool call, produce a different tool call."
 *
 * Three wrapper kinds ship in v0.9.0:
 *
 *   - **retry**: wrap a tool so that isError: true
 *     results trigger up to N automatic retries with
 *     exponential backoff. The runtime hook (which
 *     lives in a future v0.9.x pi integration) reads
 *     the wrapper and rewrites the tool call's
 *     metadata.
 *
 *   - **log**: every call to the wrapped tool is
 *     recorded to a separate audit log (`tool-calls-wrapper.jsonl`
 *     in the same `~/.pilot/observability/` dir as
 *     the B2 record). The wrapper itself doesn't
 *     transform; it just adds a write side effect.
 *
 *   - **transform**: the call's args are passed
 *     through a regex replace / path normalize
 *     pipeline before execution. v0.9.0 ships one
 *     transform kind: denyPaths rewrite (a path
 *     matching the double-star + .env glob is
 *     rewritten to .env.redacted so the read still
 *     succeeds but the file contents are masked).
 *     This is the "插拔式" affordance: a wrapper
 *     doesn't replace the tool, it transforms the
 *     args in-flight.
 *
 * Wrappers are persisted in `~/.pilot/wrappers/<name>.toml`,
 * same pattern as `~/.pilot/policy/<name>.toml` but
 * a separate dir. The same `apply` / `unapply` flow
 * generates a `pilot-wrapper-<name>.ts` extension
 * that pi loads; v0.9.0 ships the contract (the
 * schema + the apply pipeline + the REST surface)
 * but the actual pi-side hook is a future v0.9.x
 * release. For now the wrapper data is round-trip
 * persistent + the apply endpoint returns a stub
 * "would generate this extension" path.
 *
 * A1 (tool marketplace) is design-only in v0.9.0;
 * the data model + UI + REST contract for "swap a
 * tool for another" is documented in
 * docs/roadmap-pi-grounded.md (a separate design
 * doc, not in this file).
 */

import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  unlink,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { z } from "zod";
import { pilotDir } from "./types.js";

// ─── Zod schemas ──────────────────────────────────────────

/** v0.9.0: per-wrapper config. Three kinds. */
export const ToolWrapperRetrySchema = z.object({
  kind: z.literal("retry"),
  /** Max retries before giving up. */
  maxRetries: z.number().int().min(1).max(10),
  /** Initial backoff in ms; doubled each retry. */
  initialBackoffMs: z.number().int().min(10).max(60_000),
});

export const ToolWrapperLogSchema = z.object({
  kind: z.literal("log"),
  /** Path to the audit log (relative to home). */
  logPath: z.string().default("observability/tool-calls-wrapper.jsonl"),
});

export const ToolWrapperTransformSchema = z.object({
  kind: z.literal("transform"),
  /** One of: rewrite-path-redact, rewrite-content-redact. */
  transform: z.enum([
    "rewrite-path-redact",
    "rewrite-content-redact",
  ]),
  /** Patterns the transform applies to (regexes). */
  patterns: z.array(z.string()).default([]),
});

export const ToolWrapperRuleSchema = z.discriminatedUnion("kind", [
  ToolWrapperRetrySchema,
  ToolWrapperLogSchema,
  ToolWrapperTransformSchema,
]);

export const ToolWrapperSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "name must be kebab-case"),
  description: z.string().optional(),
  /** Tool names this wrapper applies to (e.g. ["bash", "write"]). */
  tools: z.array(z.string()).min(1),
  /** Active rule (exactly one of retry / log / transform). */
  rule: ToolWrapperRuleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ToolWrapper = z.infer<typeof ToolWrapperSchema>;
export type ToolWrapperInput = Omit<
  ToolWrapper,
  "name" | "createdAt" | "updatedAt"
>;

// ─── Path helpers ──────────────────────────────────────

export function wrapperPath(name: string, home?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid wrapper name: "${name}". Must be kebab-case.`);
  }
  return join(pilotWrappersDir(home), `${name}.toml`);
}

export function pilotWrappersDir(home?: string): string {
  return join(pilotDir(home), "wrappers");
}

export function wrapperExtensionPath(
  name: string,
  home?: string,
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid wrapper name: "${name}"`);
  }
  return join(pilotDir(home), "extensions", `pilot-wrapper-${name}.ts`);
}

// ─── Read / write ──────────────────────────────────────

export async function readWrapper(
  name: string,
  home?: string,
): Promise<ToolWrapper> {
  const file = wrapperPath(name, home);
  const raw = await readFile(file, "utf-8");
  const data: unknown = parseToml(raw);
  const obj = data as Record<string, unknown>;
  const injected = { name, ...obj };
  return ToolWrapperSchema.parse(injected);
}

export async function tryReadWrapper(
  name: string,
  home?: string,
): Promise<ToolWrapper | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return null;
  }
  try {
    return await readWrapper(name, home);
  } catch {
    return null;
  }
}

export async function listWrappers(home?: string): Promise<ToolWrapper[]> {
  const dir = pilotWrappersDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: ToolWrapper[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".toml")) continue;
    const name = entry.slice(0, -".toml".length);
    const w = await tryReadWrapper(name, home);
    if (w) results.push(w);
  }
  return results;
}

export async function writeWrapper(
  name: string,
  input: ToolWrapperInput,
  home?: string,
): Promise<ToolWrapper> {
  const now = new Date().toISOString();
  const file = wrapperPath(name, home);
  const dir = pilotWrappersDir(home);

  const existing = await tryReadWrapper(name, home);
  const createdAt = existing?.createdAt ?? now;

  const full: ToolWrapper = {
    name,
    ...input,
    createdAt,
    updatedAt: now,
  };

  const validated = ToolWrapperSchema.parse(full);
  const { name: _omit, ...rest } = validated;
  await mkdir(dir, { recursive: true });
  await writeFile(file, stringifyToml(rest), "utf-8");
  return validated;
}

export async function deleteWrapper(
  name: string,
  home?: string,
): Promise<boolean> {
  const file = wrapperPath(name, home);
  try {
    await stat(file);
  } catch {
    return false;
  }
  await unlink(file);
  return true;
}

export async function ensureWrappersDir(home?: string): Promise<void> {
  await mkdir(pilotWrappersDir(home), { recursive: true });
  await mkdir(join(pilotDir(home), "extensions"), { recursive: true });
}

// ─── Apply (generate extension) ──────────────────────────

/**
 * v0.9.0: apply a wrapper by generating a
 * `pilot-wrapper-<name>.ts` extension. The generated
 * file is a no-op stub today — the real pi-side hook
 * lands in v0.9.x. The stub exists so:
 *
 *   1. The apply / unapply flow can be exercised
 *      end-to-end (a real file appears in
 *      `~/.pilot/extensions/`).
 *   2. When the pi hook is added, the generated
 *      stub is replaced with the real implementation
 *      and the user's existing `pilot wrapper apply`
 *      calls become meaningful without re-issuing
 *      them.
 */
export async function applyWrapper(
  name: string,
  home?: string,
): Promise<{ path: string; bytes: number }> {
  await ensureWrappersDir(home);
  const wrapper = await readWrapper(name, home);
  const path = wrapperExtensionPath(name, home);
  const stub = generateWrapperStub(wrapper);
  await writeFile(path, stub, "utf-8");
  return { path, bytes: Buffer.byteLength(stub, "utf-8") };
}

export async function unapplyWrapper(
  name: string,
  home?: string,
): Promise<{ removed: boolean }> {
  const path = wrapperExtensionPath(name, home);
  try {
    await stat(path);
  } catch {
    return { removed: false };
  }
  await unlink(path);
  return { removed: true };
}

/**
 * The stub extension. v0.9.0 ships this as a
 * well-formed TypeScript file that pi will load
 * (so the apply flow is observable end-to-end) but
 * doesn't actually transform anything. The pi-side
 * wrapper runtime is a v0.9.x feature.
 */
function generateWrapperStub(wrapper: ToolWrapper): string {
  return `// Auto-generated by \`pilot wrapper apply ${wrapper.name}\`
// v0.9.0 stub — the real pi-side hook is in a future
// release. This file exists so the apply / unapply
// flow is observable end-to-end.
//
// Wrapper kind: ${wrapper.rule.kind}
// Tools: ${wrapper.tools.join(", ")}
//
// When the pi integration lands, replace this stub
// with the real implementation. The apply flow does
// NOT need to be re-run after the swap (the file path
// stays the same).
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // No-op. The real hook reads the wrapper config
  // from \`~/.pilot/wrappers/${wrapper.name}.toml\` and
  // installs the transform on the registered tools.
  void pi;
}
`;
}
