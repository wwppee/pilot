/**
 * Settings reader for `~/.pi/agent/settings.json`.
 *
 * v0.5.5+: This module is now paired with `core/settings-write.ts` so
 * Pilot can both READ and WRITE pi's settings — the historical "Pilot
 * never writes to settings.json" stance is gone. The write path uses
 * proper-lockfile + backup + JSON validation + rollback to avoid
 * corrupting pi's config. See `core/settings-write.ts`.
 *
 * Reading remains the same as before: graceful degradation on missing
 * / malformed files (returns `null`).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  piSettingsFile,
  packageSourceOf,
  type PiPackageSource,
  type PiSettings,
} from "./types.js";

/**
 * Read and parse the global pi settings file.
 *
 * @returns The parsed settings, or null if the file is missing / malformed.
 */
export async function readSettings(home?: string): Promise<PiSettings | null> {
  const file = piSettingsFile(home);
  if (!existsSync(file)) {
    return null;
  }

  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as PiSettings;
  } catch {
    // Malformed JSON — return null so callers can handle it.
    // We intentionally swallow the error here; commands will surface it.
    return null;
  }
}

/**
 * Return the list of installed packages (`packages` field), or `[]` if
 * settings is missing. Each item is the raw `PackageSource` shape —
 * call `packageSourceOf(...)` if you need the string specifier.
 */
export function listPackages(settings: PiSettings | null): PiPackageSource[] {
  if (!settings || !Array.isArray(settings.packages)) return [];
  return settings.packages;
}

/**
 * Convenience: list installed packages as their canonical source
 * strings (skips the union-typing hassle at call sites).
 */
export function listPackageSources(settings: PiSettings | null): string[] {
  return listPackages(settings).map(packageSourceOf);
}

/**
 * Back-compat alias for `listPackageSources` — kept so existing
 * callers (avatar.ts, session-snapshot.ts, etc.) don't break. New
 * code should use `listPackageSources` (clearer name) or
 * `listPackages` (when the raw `PackageSource` shape is needed).
 *
 * v0.5.5: was `listSources` reading the old `settings.sources` field.
 * Pi renamed the field to `packages`; we follow.
 */
export function listSources(settings: PiSettings | null): string[] {
  return listPackageSources(settings);
}
