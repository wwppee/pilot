/**
 * profile-state — persisted "active profile" pointer.
 *
 * `~/.pilot/active.json` records which named profile the user has
 * currently activated. This is **separate** from the profile TOML
 * itself (which lives at `~/.pilot/profiles/<name>.toml`): the TOML
 * is the profile definition; active.json is the runtime pointer
 * ("which profile is in effect right now").
 *
 * Used by:
 *   - v0.4.12: `pilot profile use <name>` (CLI) / Web UI "Activate" button
 *   - v0.4.13: session snapshot records { activeProfile } in snapshot.json
 *   - v0.5.0+: Avatars read this as the "base profile" for diffing
 *
 * Why a separate file (not a flag inside the TOML)?
 *   - TOML is the profile definition; multiple things can reference it.
 *     "Which one is active" is session state, not config.
 *   - Activation is a write that Pi never needs to see; putting it
 *     in the TOML would force Pi to ignore it.
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { pilotDir } from "./types.js";

/**
 * Schema of `~/.pilot/active.json`.
 *
 * The file is intentionally tiny — just enough for a session-snapshot
 * or avatar to know "the user picked this one for the current session".
 * For full profile data, read `~/.pilot/profiles/<name>.toml` separately.
 */
export interface ActiveProfileState {
  /** Name of the profile marked as active (kebab-case, must exist in profiles/ dir). */
  name: string;
  /** ISO timestamp of when the user activated this profile. */
  activatedAt: string;
  /** Where the activation came from — useful for debug and audit. */
  source: "cli" | "web" | "auto";
}

/** Absolute path to `~/.pilot/active.json`. */
export function activeProfilePath(home?: string): string {
  return join(pilotDir(home), "active.json");
}

/**
 * Read the active profile pointer, or null if no profile is active.
 *
 * Returns null (not throws) if the file doesn't exist — that's the
 * normal "no profile activated yet" state.
 *
 * v0.5.6+: validates that the named profile actually exists in
 * `~/.pilot/profiles/`. If `active.json` points to a ghost profile
 * (e.g. the user deleted the TOML but the diary still references
 * it), the diary is auto-cleared and we return null — otherwise the
 * UI would show "pi-architect (active profile)" for a profile that
 * doesn't exist, which is misleading.
 *
 * The validation step is intentionally lazy (best-effort) — if the
 * profile read itself fails for any reason, we keep the diary
 * entry rather than nuking it on a transient read error.
 */
export async function readActiveProfile(
  home?: string,
): Promise<ActiveProfileState | null> {
  const path = activeProfilePath(home);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<ActiveProfileState>;
    // Minimal validation — corrupt file shouldn't crash the app,
    // just behave as if no profile is active.
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.activatedAt !== "string" ||
      typeof parsed.source !== "string"
    ) {
      return null;
    }
    const state = parsed as ActiveProfileState;

    // Ghost-profile guard (v0.5.6). Best-effort: only clear the
    // diary when we're confident the profile is actually gone.
    // Try a directory listing under ~/.pilot/profiles/ and look
    // for `<name>.toml`. We avoid importing the full readProfile
    // path here to keep this fast (called on every dashboard load).
    const profileFile = join(dirname(path), "profiles", `${state.name}.toml`);
    if (!existsSync(profileFile)) {
      // Clear the diary so the UI stops lying.
      try {
        await unlink(path);
      } catch {
        /* race with another process — fine */
      }
      return null;
    }

    return state;
  } catch {
    // JSON.parse failed or file unreadable — same response as
    // "no file": treat as no active profile. The next write will
    // overwrite the corrupt file.
    return null;
  }
}

/**
 * Mark a profile as active. Writes the small JSON pointer atomically
 * (write to a temp file + rename) so a crash mid-write can't leave
 * a half-written file.
 */
export async function writeActiveProfile(
  name: string,
  source: ActiveProfileState["source"] = "cli",
  home?: string,
): Promise<ActiveProfileState> {
  const path = activeProfilePath(home);
  const state: ActiveProfileState = {
    name,
    activatedAt: new Date().toISOString(),
    source,
  };
  // Ensure ~/.pilot/ exists (defensive — `pilot init` should have
  // already created it, but a user might run `profile use` from a
  // fresh checkout or a CI box that never ran init).
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  // atomic rename — falls back to unlink+write on platforms where
  // rename over an existing file is supported (everywhere we run)
  const { rename } = await import("node:fs/promises");
  await rename(tmp, path);
  return state;
}

/**
 * Clear the active profile pointer. No-op if no profile is active.
 */
export async function clearActiveProfile(home?: string): Promise<void> {
  const path = activeProfilePath(home);
  if (!existsSync(path)) return;
  await unlink(path);
}
