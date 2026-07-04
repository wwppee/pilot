/**
 * core/avatar.ts — project-level "expected running config" (v0.5+).
 *
 * ## What is an Avatar
 *
 * A **snapshot of "what the user wanted this project to look like"**.
 * While a session snapshot (v0.4.13) records "what was running when
 * this session ran", an Avatar records "what *should* be running for
 * this cwd right now".
 *
 * Storing the encoded cwd as the filename key lets us have one Avatar
 * per project without polluting the user's home with subdirectories.
 * Avatar lives at `~/.pilot/avatars/<encoded-cwd>.json` — same
 * encoding scheme as pi's session dirs (base64url of the absolute path).
 *
 * ## Fields
 *
 *   - `encodedCwd`     — the encoding key, matches pi's session dir.
 *   - `capturedAt`     — when this Avatar was last written.
 *   - `profile`        — name of the profile that should be active.
 *   - `model`          — desired model identifier (denormalized from
 *                        the active profile's TOML for diff display).
 *   - `packSources`    — list of expected pack sources (e.g. `npm:foo`).
 *   - `extensions`     — generated policy extensions that should exist
 *                        (`pilot-policy-*`).
 *
 * Thinking level is **deliberately omitted** in v0.5.0 — pi v3 JSONL
 * doesn't record it, so we can't verify or capture it without a
 * dedicated extension hook. Add it back in v0.5.1 once the trace
 * hook (planned alongside v0.4.13's snapshot system) lands.
 *
 * ## Diff
 *
 * `diffAvatar(avatar, current)` produces a per-field status:
 *
 *   - `match`    — current matches the Avatar's expectation
 *   - `drift`    — both have values but they differ
 *   - `missing`  — Avatar expects something the current state doesn't have
 *   - `extra`    — current has something the Avatar doesn't mention
 *                  (informational, not a failure)
 *
 * Lists (packSources / extensions) are diffed set-style. Profile and
 * model are diffed as scalars.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pilotAvatarsDir } from "./types.js";
import { readSettings, listSources } from "./settings.js";
import { readActiveProfile } from "./profile-state.js";
import { listProfiles } from "./profile.js";
import { readdir } from "node:fs/promises";

/**
 * The persisted Avatar shape. Always includes `encodedCwd` +
 * `capturedAt`; everything else is optional so a brand-new capture
 * can omit fields the user hasn't set up yet.
 */
export interface Avatar {
  encodedCwd: string;
  capturedAt: string;
  profile?: string;
  model?: string;
  packSources: string[];
  extensions: string[];
}

/** The "current state" we diff an Avatar against. */
export interface AvatarCurrent {
  activeProfile?: string;
  /** Model from the active profile's TOML, if any. */
  model?: string;
  /** Installed pack sources. */
  packSources: string[];
  /** Generated policy extensions on disk. */
  extensions: string[];
}

/** Per-field diff result. `extra` is informational only. */
export type DiffStatus = "match" | "drift" | "missing" | "extra";

export interface AvatarDiffField<T> {
  status: DiffStatus;
  /** Avatar-side value (what the user wanted). */
  expected: T;
  /** Current-side value (what's actually in place). */
  actual: T;
}

export interface AvatarDiff {
  encodedCwd: string;
  capturedAt: string;
  profile: AvatarDiffField<string | undefined>;
  model: AvatarDiffField<string | undefined>;
  packSources: AvatarDiffField<string[]>;
  extensions: AvatarDiffField<string[]>;
  /** True if every field is `match` or `extra` (drift + missing = needs attention). */
  clean: boolean;
}

/** Absolute path to an Avatar file. */
export function avatarPath(encodedCwd: string, home?: string): string {
  return join(pilotAvatarsDir(home), `${encodedCwd}.json`);
}

/** Absolute path to `~/.pilot/avatars/`. */
export function avatarDir(home?: string): string {
  return pilotAvatarsDir(home);
}

/**
 * Read an Avatar for the given encoded cwd, or null if none exists.
 *
 * Returns null (not throws) when the file is missing — that's the
 * normal "no Avatar yet" state. Throws when the file exists but is
 * malformed (corrupted JSON, missing required fields).
 */
export async function readAvatar(
  encodedCwd: string,
  home?: string,
): Promise<Avatar | null> {
  const path = avatarPath(encodedCwd, home);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Avatar>;
    if (typeof parsed.encodedCwd !== "string") {
      throw new Error("avatar missing encodedCwd");
    }
    if (typeof parsed.capturedAt !== "string") {
      throw new Error("avatar missing capturedAt");
    }
    return {
      encodedCwd: parsed.encodedCwd,
      capturedAt: parsed.capturedAt,
      ...(typeof parsed.profile === "string" ? { profile: parsed.profile } : {}),
      ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
      packSources: Array.isArray(parsed.packSources)
        ? parsed.packSources.filter((s): s is string => typeof s === "string")
        : [],
      extensions: Array.isArray(parsed.extensions)
        ? parsed.extensions.filter((s): s is string => typeof s === "string")
        : [],
    };
  } catch (e) {
    throw new Error(
      `avatar at ${path} is malformed: ${(e as Error).message}`,
    );
  }
}

/**
 * Persist an Avatar atomically (tmp + rename). Creates
 * `~/.pilot/avatars/` if missing — defensive so a fresh checkout
 * can call `captureAvatar` without first running `pilot init`.
 */
export async function writeAvatar(
  avatar: Avatar,
  home?: string,
): Promise<Avatar> {
  const path = avatarPath(avatar.encodedCwd, home);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(avatar, null, 2) + "\n", "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, path);
  return avatar;
}

/**
 * Delete an Avatar. Used when a user wants to "forget" the expected
 * config for a project. Returns true if the file was removed.
 */
export async function deleteAvatar(
  encodedCwd: string,
  home?: string,
): Promise<boolean> {
  const path = avatarPath(encodedCwd, home);
  if (!existsSync(path)) return false;
  await unlink(path);
  return true;
}

/**
 * List every Avatar in `~/.pilot/avatars/`. Returns `[]` when the
 * directory doesn't exist. Sorted by encodedCwd for stable display.
 */
export async function listAvatars(home?: string): Promise<Avatar[]> {
  const dir = avatarDir(home);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir).catch(() => [] as string[]);
  const results: Avatar[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const avatar = await readAvatar(id, home).catch(() => null);
    if (avatar) results.push(avatar);
  }
  return results.sort((a, b) => a.encodedCwd.localeCompare(b.encodedCwd));
}

/**
 * Capture the current Pilot state into an Avatar. Pulls:
 *   - active profile (from ~/.pilot/active.json)
 *   - model (from the active profile's TOML)
 *   - packSources (from pi's settings.json sources[])
 *   - extensions (from ~/.pilot/extensions/pilot-policy-*.ts)
 *
 * Generated policy extensions listing is the same approach used in
 * session-snapshot.ts — kept duplicated so each core module stays
 * self-contained (no cross-imports).
 */
export async function captureAvatar(
  encodedCwd: string,
  home?: string,
): Promise<Avatar> {
  const [active, profiles, settings] = await Promise.all([
    readActiveProfile(home),
    listProfiles(home).catch(() => [] as Awaited<ReturnType<typeof listProfiles>>),
    readSettings(home),
  ]);

  // Resolve model from the active profile TOML.
  let model: string | undefined;
  if (active) {
    const prof = profiles.find((p) => p.name === active.name);
    if (prof?.model) model = prof.model;
  }

  const packSources = settings
    ? listSources(settings).map((s) => s.source)
    : [];

  const extensions = await listGeneratedPolicyExtensions(home);

  return writeAvatar(
    {
      encodedCwd,
      capturedAt: new Date().toISOString(),
      ...(active ? { profile: active.name } : {}),
      ...(model ? { model } : {}),
      packSources,
      extensions,
    },
    home,
  );
}

/**
 * Read the *current* state for an encodedCwd. Used by
 * `diffAvatar(avatar, current)` and the Web UI.
 */
export async function readCurrentState(
  home?: string,
): Promise<AvatarCurrent> {
  const [active, profiles, settings] = await Promise.all([
    readActiveProfile(home),
    listProfiles(home).catch(() => [] as Awaited<ReturnType<typeof listProfiles>>),
    readSettings(home),
  ]);

  let model: string | undefined;
  if (active) {
    const prof = profiles.find((p) => p.name === active.name);
    if (prof?.model) model = prof.model;
  }

  return {
    ...(active ? { activeProfile: active.name } : {}),
    ...(model ? { model } : {}),
    packSources: settings
      ? listSources(settings).map((s) => s.source)
      : [],
    extensions: await listGeneratedPolicyExtensions(home),
  };
}

/**
 * Compute the diff between an Avatar (expected) and the current state
 * (actual). Pure function — no fs side-effects beyond reading what
 * `readCurrentState` already loaded.
 */
export function diffAvatar(
  avatar: Avatar,
  current: AvatarCurrent,
): AvatarDiff {
  const profile: AvatarDiffField<string | undefined> = {
    expected: avatar.profile,
    actual: current.activeProfile,
    status: scalarStatus(avatar.profile, current.activeProfile),
  };

  const model: AvatarDiffField<string | undefined> = {
    expected: avatar.model,
    actual: current.model,
    status: scalarStatus(avatar.model, current.model),
  };

  const packSources = diffSet(avatar.packSources, current.packSources);
  const extensions = diffSet(avatar.extensions, current.extensions);

  // `clean` means nothing needs fixing. `extra` items in the current
  // state are informational (user installed more stuff than the
  // Avatar mentioned) — they're not failures.
  const clean =
    profile.status !== "drift" &&
    profile.status !== "missing" &&
    model.status !== "drift" &&
    model.status !== "missing" &&
    packSources.status !== "drift" &&
    packSources.status !== "missing" &&
    extensions.status !== "drift" &&
    extensions.status !== "missing";

  return {
    encodedCwd: avatar.encodedCwd,
    capturedAt: avatar.capturedAt,
    profile,
    model,
    packSources,
    extensions,
    clean,
  };
}

/** Scalar status helper — undefined means "no expectation" / "no value". */
function scalarStatus<T>(
  expected: T | undefined,
  actual: T | undefined,
): DiffStatus {
  if (expected === undefined && actual === undefined) return "match";
  if (expected === undefined) return "extra";
  if (actual === undefined) return "missing";
  return expected === actual ? "match" : "drift";
}

/** Set-style diff — same helper shape as scalar but for string[]. */
function diffSet(
  expected: string[],
  actual: string[],
): AvatarDiffField<string[]> {
  const e = new Set(expected);
  const a = new Set(actual);

  // `match` when sets are equal.
  if (e.size === a.size && [...e].every((x) => a.has(x))) {
    return { expected, actual, status: "match" };
  }

  const missing = [...e].filter((x) => !a.has(x));
  const extra = [...a].filter((x) => !e.has(x));

  // Three non-equal cases:
  //   - missing > 0, extra = 0 → `missing` (current is short of expectations)
  //   - missing = 0, extra > 0 → `extra`   (current has more than expected — informational)
  //   - both > 0                  → `drift`  (sets disagree on both sides)
  if (missing.length > 0 && extra.length === 0) {
    return { expected, actual, status: "missing" };
  }
  if (missing.length === 0 && extra.length > 0) {
    return { expected, actual, status: "extra" };
  }
  return { expected, actual, status: "drift" };
}

/**
 * Same listing helper as session-snapshot.ts: keep self-contained,
 * no cross-imports. Filters to `pilot-policy-*.ts` (generated) and
 * strips the `.ts` suffix so diffs compare just the policy name.
 */
async function listGeneratedPolicyExtensions(home?: string): Promise<string[]> {
  const dir = join(pilotAvatarsDir(home), "..", "extensions");
  if (!existsSync(dir)) return [];
  try {
    const entries = await readdir(dir);
    return entries
      .filter((n) => n.startsWith("pilot-policy-") && n.endsWith(".ts"))
      .map((n) => n.slice(0, -".ts".length))
      .sort();
  } catch {
    return [];
  }
}