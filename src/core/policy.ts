/**
 * Tool policy data model + persistence.
 *
 * v0.4.3: a `ToolPolicy` is a named bundle of:
 *   - allow/deny lists (tool names)
 *   - path globs (for read / edit / write / bash)
 *   - command regexes (for bash)
 *   - sensitive patterns (for redact of LLM inputs)
 *   - per-tool approval (HITL flag)
 *
 * Policies live in `~/.pilot/policy/<name>.toml`. The CLI can apply
 * one by generating a `pilot-policy-<name>.ts` extension that pi
 * auto-loads from `~/.pilot/extensions/`. See `policy-extension.ts`.
 *
 * See: docs/roadmap-pi-grounded.md (Layer 2 policy section).
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

// ─── Zod schemas ──────────────────────────────────────────────

/**
 * Per-tool policy override. Applied in order:
 *   1. allow/deny list (deny wins)
 *   2. requireApproval → `pi.on("tool_call")` returns no-op but emits confirm UI
 *   3. path denylist (for read/edit/write tools)
 *   4. command denylist (for bash)
 *   5. sensitive-pattern redact (post-tool, mutates content)
 */
export const ToolPolicySchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "name must be kebab-case"),
  description: z.string().optional(),

  /**
   * Whitelist of tool names. If non-empty, only these tools are
   * callable. Dually, `deny` is applied as a secondary filter
   * (deny always wins).
   */
  allow: z.array(z.string()).default([]),
  /**
   * Blacklist of tool names. A denied tool returns
   * `{ block: true, reason: "denied by policy <name>" }` from the
   * generated extension.
   */
  deny: z.array(z.string()).default([]),

  /**
   * Glob patterns (using minimatch-style `*` and `**`) for paths
   * that `read` / `edit` / `write` may not touch. Examples:
   *   - `/etc/X`
   *   - `X/.env`
   *   - `X/secrets.json`
   */
  denyPaths: z.array(z.string()).default([]),
  /**
   * Regex patterns (substring match, case-sensitive) for `bash`
   * commands that should be blocked. Examples:
   *   - `^rm\\s+-rf\\s+/`
   *   - `mkfs`
   *   - fork-bomb signature
   */
  denyCommands: z.array(z.string()).default([]),

  /**
   * Regex patterns for content redaction in tool results (applied
   * via `pi.on("tool_result")`). Matched substrings are replaced
   * with `[REDACTED]`. Examples:
   *   - `sk-[A-Za-z0-9]{20,}` (OpenAI keys)
   *   - `ghp_[A-Za-z0-9]{20,}` (GitHub PATs)
   *   - `(?i)password=\\S+`
   */
  sensitivePatterns: z.array(z.string()).default([]),

  /**
   * Tool names that should pause for human confirmation before
   * execution. The generated extension emits `ctx.ui.confirm()`.
   * Examples: `["bash", "write"]`.
   */
  requireApproval: z.array(z.string()).default([]),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type ToolPolicyInput = Omit<
  ToolPolicy,
  "name" | "createdAt" | "updatedAt"
>;

// ─── Path helpers ──────────────────────────────────────────

/** Absolute path to a policy TOML. */
export function policyPath(name: string, home?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid policy name: "${name}". Must be kebab-case.`);
  }
  return join(pilotPoliciesDir(home), `${name}.toml`);
}

/** Absolute path to the policies directory. */
export function pilotPoliciesDir(home?: string): string {
  return join(pilotDir(home), "policy");
}

/** Path to the generated TypeScript extension that enforces this policy. */
export function policyExtensionPath(policyName: string, home?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(policyName)) {
    throw new Error(`Invalid policy name: "${policyName}"`);
  }
  return join(pilotDir(home), "extensions", `pilot-policy-${policyName}.ts`);
}

/** Path to the directory where generated extensions live. */
export function pilotExtensionsDir(home?: string): string {
  return join(pilotDir(home), "extensions");
}

// ─── Read / write ──────────────────────────────────────────

/** Read and parse a policy TOML. Throws ZodError on bad shape. */
export async function readPolicy(
  name: string,
  home?: string,
): Promise<ToolPolicy> {
  const file = policyPath(name, home);
  const raw = await readFile(file, "utf-8");
  const data: unknown = parseToml(raw);
  const obj = data as Record<string, unknown>;
  const injected = { name, ...obj };
  return ToolPolicySchema.parse(injected);
}

/** Safe variant — returns null on any error. */
export async function tryReadPolicy(
  name: string,
  home?: string,
): Promise<ToolPolicy | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return null;
  }
  try {
    return await readPolicy(name, home);
  } catch {
    return null;
  }
}

/** List all policies. Skips invalid TOML files. */
export async function listPolicies(home?: string): Promise<ToolPolicy[]> {
  const dir = pilotPoliciesDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: ToolPolicy[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".toml")) continue;
    const name = entry.slice(0, -".toml".length);
    const p = await tryReadPolicy(name, home);
    if (p) results.push(p);
  }
  return results;
}

/** Create or update a policy. */
export async function writePolicy(
  name: string,
  input: ToolPolicyInput,
  home?: string,
): Promise<ToolPolicy> {
  const now = new Date().toISOString();
  const file = policyPath(name, home);
  const dir = pilotPoliciesDir(home);

  // Read existing to preserve createdAt if updating
  const existing = await tryReadPolicy(name, home);
  const createdAt = existing?.createdAt ?? now;

  const full: ToolPolicy = {
    name,
    ...input,
    createdAt,
    updatedAt: now,
  };

  const validated = ToolPolicySchema.parse(full);

  // Strip the injected name (it's the file's identity)
  const { name: _omit, ...rest } = validated;
  await mkdir(dir, { recursive: true });
  await writeFile(file, stringifyToml(rest), "utf-8");
  return validated;
}

/** Delete a policy. No-op if it doesn't exist. Returns true if deleted. */
export async function deletePolicy(
  name: string,
  home?: string,
): Promise<boolean> {
  const file = policyPath(name, home);
  try {
    await stat(file);
  } catch {
    return false;
  }
  await unlink(file);
  return true;
}

/** Ensure the policies directory exists. Idempotent. */
export async function ensurePoliciesDir(home?: string): Promise<void> {
  await mkdir(pilotPoliciesDir(home), { recursive: true });
  await mkdir(pilotExtensionsDir(home), { recursive: true });
}
