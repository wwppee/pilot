/**
 * Profile data model.
 *
 * A Profile is a named set of Pilot settings — model, thinking level,
 * meta-pack team, etc. — that the user can switch between per-project.
 *
 * Profiles are stored in `~/.pilot/profiles/<name>.toml` (global) or
 * `<cwd>/.pilot/profile.toml` (project-level).
 *
 * v0.5.5: Pilot now writes `~/.pi/agent/settings.json` directly when
 * activating a profile (via `applyProfileToPi`). The earlier
 * "never writes to settings.json" stance was changed because the
 * `~/.pilot/active.json` pointer was orphaned — pi never read it, so
 * profile activation was theatrical. Now `service.activateProfile`
 * merges the profile's model + thinking + packages into pi's
 * settings.json (with proper-lockfile + backup + rollback), then
 * writes the Pilot diary at `~/.pilot/active.json`. The next pi
 * launch picks up the change.
 *
 * See: docs/architecture.md §1, docs/roadmap.md §2.
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
import { pilotProfilesDir } from "./types.js";

// ─── Zod schemas ──────────────────────────────────────────────

export const ThinkingLevelSchema = z.enum([
  "off",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export const ProfileSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "name must be kebab-case"),
  description: z.string().optional(),
  model: z.string().optional(),
  thinking: ThinkingLevelSchema.optional(),
  /** Name of a meta-pack team to install when this profile is active. */
  team: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Input shape — what callers pass when creating/updating. */
export const ProfileInputSchema = ProfileSchema.omit({
  name: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ──────────────────────────────────────────────────

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;

// ─── Path helpers ──────────────────────────────────────────

/** Absolute path to a global profile TOML. */
export function profilePath(name: string, home?: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid profile name: "${name}". Must be kebab-case.`);
  }
  return join(pilotProfilesDir(home), `${name}.toml`);
}

/** Absolute path to the project-level profile override. */
export function projectProfilePath(cwd: string = process.cwd()): string {
  return join(cwd, ".pilot", "profile.toml");
}

/** Absolute path to the global profiles directory. */
export function profilesDir(home?: string): string {
  return pilotProfilesDir(home);
}

// ─── Read / write ──────────────────────────────────────────

/** Read and parse a profile TOML. Throws ZodError on bad shape. */
export async function readProfile(
  name: string,
  home?: string,
): Promise<Profile> {
  const file = profilePath(name, home);
  const raw = await readFile(file, "utf-8");
  const data: unknown = parseToml(raw);

  // Inject name + timestamps (TOML stores everything else; we add these for the schema).
  const obj = data as Record<string, unknown>;
  const injected = {
    name,
    ...obj,
  };

  return ProfileSchema.parse(injected);
}

/** Safe variant — returns null on any error. */
export async function tryReadProfile(
  name: string,
  home?: string,
): Promise<Profile | null> {
  try {
    return await readProfile(name, home);
  } catch {
    return null;
  }
}

/** List all profiles. Skips invalid TOML files. */
export async function listProfiles(home?: string): Promise<Profile[]> {
  const dir = profilesDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: Profile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".toml")) continue;
    const name = entry.slice(0, -".toml".length);
    const profile = await tryReadProfile(name, home);
    if (profile) results.push(profile);
  }
  return results;
}

/**
 * Create or update a profile.
 *
 * Overwrites if it exists. Writes with timestamps.
 */
export async function writeProfile(
  name: string,
  input: ProfileInput,
  home?: string,
): Promise<Profile> {
  const now = new Date().toISOString();
  const file = profilePath(name, home);
  const dir = profilesDir(home);

  // Read existing to preserve createdAt if updating
  const existing = await tryReadProfile(name, home);
  const createdAt = existing?.createdAt ?? now;

  const full: Profile = {
    name,
    ...input,
    createdAt,
    updatedAt: now,
  };

  // Validate before writing
  const validated = ProfileSchema.parse(full);

  // Serialize (strip the injected name — it's the file's identity)
  const { name: _omit, ...rest } = validated;
  await mkdir(dir, { recursive: true });
  await writeFile(file, stringifyToml(rest), "utf-8");
  return validated;
}

/** Delete a profile. No-op if it doesn't exist. Returns true if deleted. */
export async function deleteProfile(
  name: string,
  home?: string,
): Promise<boolean> {
  const file = profilePath(name, home);
  try {
    await stat(file);
  } catch {
    return false;
  }
  await unlink(file);
  return true;
}

/** Ensure the profiles directory exists. Idempotent. */
export async function ensureProfilesDir(home?: string): Promise<void> {
  const dir = profilesDir(home);
  await mkdir(dir, { recursive: true });
}
