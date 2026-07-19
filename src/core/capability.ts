/**
 * Capability data model.
 *
 * A Capability is a verifiable, reproducible, composable behavior unit
 * that can be added to a Pilot Avatar. It's NOT a package — multiple
 * packages can contribute to one capability, and one package can
 * provide multiple capabilities.
 *
 * v0.2 first cut: data model + Zod schema + path helpers + load/list.
 * The full lifecycle (Forge / eval / install) ships in v0.4.
 *
 * See: docs/forge-and-avatars.md §2 for the full design rationale.
 */

import { readFile, readdir } from "node:fs/promises";
import { safeIsDirectory } from "./fs-utils.js";
import { join } from "node:path";
import { z } from "zod";
import { pilotCapabilitiesDir } from "./types.js";

// ─── Zod schemas ──────────────────────────────────────────────

/**
 * Source of a capability — how it relates to upstream Pi packages.
 *
 * L1-referenced:  direct dependency on an external package
 * L2-wrapped:     external + Pilot wrapper / skill / prompt
 * L3-distilled:   spec extracted, Pilot rewrites as its own package
 * L4-native:      built into Pilot core
 */
export const CapabilitySourceSchema = z.object({
  type: z.enum(["npm", "git", "local", "pilot-native"]),
  ref: z.string().min(1),
  mode: z.enum(["L1-referenced", "L2-wrapped", "L3-distilled", "L4-native"]),
});

export const CapabilityArtifactsSchema = z.object({
  extensions: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  prompts: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
});

export const CapabilityEvalSchema = z.object({
  /** 0..1, where 1 = all eval tasks pass consistently. */
  score: z.number().min(0).max(1),
  lastRun: z.string().datetime(),
  fixtureCount: z.number().int().nonnegative(),
});

export const CapabilityCompatibilitySchema = z.object({
  /** Other capability ids that conflict with this one. */
  conflicts: z.array(z.string()).default([]),
  /** Required environment / runtime constraints (e.g. "node>=20"). */
  requires: z.array(z.string()).default([]),
});

export const CapabilityMetadataSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Human-readable attribution — NOT an implementation source. */
  inspiredBy: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const CapabilitySchema = z.object({
  /** Kebab-case id, used as directory name. */
  id: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "id must be kebab-case (a-z, 0-9, single -)",
    ),
  title: z.string().min(1),
  type: z.enum(["workflow", "tool", "integration", "safety"]),
  description: z.string(),

  sources: z.array(CapabilitySourceSchema).min(1),
  artifacts: CapabilityArtifactsSchema,

  eval: CapabilityEvalSchema.optional(),
  compatibility: CapabilityCompatibilitySchema.default({
    conflicts: [],
    requires: [],
  }),
  metadata: CapabilityMetadataSchema,
});

// ─── TypeScript types (derived from schemas) ─────────────────

export type CapabilitySource = z.infer<typeof CapabilitySourceSchema>;
export type CapabilityArtifacts = z.infer<typeof CapabilityArtifactsSchema>;
export type CapabilityEval = z.infer<typeof CapabilityEvalSchema>;
export type CapabilityCompatibility = z.infer<
  typeof CapabilityCompatibilitySchema
>;
export type CapabilityMetadata = z.infer<typeof CapabilityMetadataSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type CapabilityType = Capability["type"];
export type CapabilitySourceMode = CapabilitySource["mode"];

// ─── Validation ───────────────────────────────────────────────

/**
 * Parse and validate a capability.json from disk.
 *
 * @throws ZodError if the file is missing, malformed, or doesn't match the schema.
 */
export async function loadCapability(
  id: string,
  home?: string,
): Promise<Capability> {
  const file = join(capabilityDir(id, home), "capability.json");
  const raw = await readFile(file, "utf-8");
  const json: unknown = JSON.parse(raw);
  return CapabilitySchema.parse(json);
}

/**
 * Safe variant of loadCapability — returns null on any error (missing file,
 * malformed JSON, schema mismatch). Use this when scanning many capabilities
 * and you want to skip bad ones.
 */
export async function tryLoadCapability(
  id: string,
  home?: string,
): Promise<Capability | null> {
  try {
    return await loadCapability(id, home);
  } catch {
    return null;
  }
}

/**
 * List all installed capabilities. Returns [] if the directory doesn't exist
 * or no valid capabilities are found.
 *
 * v0.9.9: switched from `readdir(dir)` + per-entry `stat()`
 * to `readdir(dir, { withFileTypes: true })` + `safeIsDirectory()`.
 * The old code did one `stat()` syscall per entry (O(n) on a
 * large capabilities dir); the new code does zero in the
 * common case and one only for the Windows symlink/junction
 * edge case that `Dirent.isDirectory()` gets wrong.
 * agegr/pi-web (commit 7878ec4) saw ~80x latency improvement
 * with the same change; pilot should see comparable numbers
 * on `listCapabilities` (the heaviest filesystem path in
 * the dashboard's per-refresh call graph).
 */
export async function listCapabilities(home?: string): Promise<Capability[]> {
  const dir = pilotCapabilitiesDir(home);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: Capability[] = [];
  for (const entry of entries) {
    // v0.9.9: `safeIsDirectory` is cross-platform — on
    // Windows it falls back to stat() when the dirent
    // says no, so symlinked capability dirs aren't
    // silently dropped.
    if (!(await safeIsDirectory(entry, dir))) continue;
    const cap = await tryLoadCapability(entry.name, home);
    if (cap) results.push(cap);
  }
  return results;
}

// ─── Path helpers ─────────────────────────────────────────────

/** Absolute path to a capability's directory: ~/.pilot/capabilities/<id>/. */
export function capabilityDir(id: string, home?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(
      `Invalid capability id: "${id}". Must be kebab-case (a-z, 0-9, single dashes).`,
    );
  }
  return join(pilotCapabilitiesDir(home), id);
}

/** Path to a capability's spec.md (human-readable description). */
export function capabilitySpecPath(id: string, home?: string): string {
  return join(capabilityDir(id, home), "spec.md");
}

/** Path to a capability's evals.yaml (evaluation definitions). */
export function capabilityEvalsPath(id: string, home?: string): string {
  return join(capabilityDir(id, home), "evals.yaml");
}
