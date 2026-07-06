/**
 * core/settings-write.ts — write `~/.pi/agent/settings.json` safely.
 *
 * v0.5.5 NEW (closes the orphan-pointer gap). Pilot now writes pi's
 * settings.json directly so that profile activation actually takes
 * effect on the next pi launch. Previously Pilot only wrote
 * `~/.pilot/active.json` — a diary pi never reads.
 *
 * ## Why we can't just `writeFile`
 *
 * Pi's SettingsManager holds an in-memory copy of settings and uses
 * `proper-lockfile` to serialize concurrent writes. A naked
 * `writeFile` would:
 *
 *   1. Race with pi's own settings writes if pi is running
 *      (lock contention or lost writes after pi's flush).
 *   2. Bypass pi's settings migration logic.
 *   3. Risk a half-written file if the process is killed mid-write.
 *
 * So this module mirrors pi's own write discipline:
 *
 *   1. Acquire `proper-lockfile.lockSync` on the settings file.
 *   2. Back up current contents to `<file>.bak` if the file exists.
 *   3. Write the new JSON to `<file>.tmp`, fsync, rename atomically.
 *   4. Validate by re-parsing the written content.
 *   5. On any error: restore from `.bak` before re-throwing.
 *   6. Release the lock.
 *
 * If pi is currently running and holding the lock, the lockSync call
 * will throw `ELOCKED` after the 10 × 20 ms retries — we surface that
 * as a clear "Pi is running; close Pi first" error instead of silently
 * corrupting the file.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";

import { piSettingsFile, type PiSettings } from "./types.js";

const LOCK_MAX_ATTEMPTS = 10;
const LOCK_DELAY_MS = 20;

export interface WriteSettingsReport {
  ok: boolean;
  path: string;
  /** "created" | "updated" | "rolled-back" */
  action: "created" | "updated" | "rolled-back";
  message: string;
  /** Set when `ok: false` to surface the underlying cause. */
  error?: string;
}

/**
 * Read the current settings file (without acquiring the lock — use
 * `readSettings` from `./settings.ts` for the normal path). Returns
 * `undefined` if the file doesn't exist.
 *
 * Kept here (private) so writeSettings can re-validate the file after
 * write without re-exporting it.
 */
function readRaw(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

/**
 * Acquire the settings file lock with retry. Mirrors pi's
 * `acquireLockSyncWithRetry` (10 attempts × 20 ms) so we have the
 * same contention profile.
 */
function acquireLockWithRetry(path: string): () => void {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= LOCK_MAX_ATTEMPTS; attempt++) {
    try {
      return lockfile.lockSync(path, { realpath: false });
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      if (code !== "ELOCKED" || attempt === LOCK_MAX_ATTEMPTS) throw err;
      // Spin-sleep with Atomics.wait — busy-wait that's exact and
      // doesn't depend on setTimeout's clamping.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        LOCK_DELAY_MS,
      );
    }
  }
  throw lastErr;
}

/**
 * Write `~/.pi/agent/settings.json` with proper-lockfile, atomic
 * rename, JSON validation, and rollback on failure.
 *
 * @param settings  The new settings object. Existing fields not
 *                  mentioned in `settings` are preserved (deep merge
 *                  by caller — this function just writes what it's
 *                  given). For a clean overwrite, pass the full
 *                  settings object you want on disk.
 * @param home      Optional home override (defaults to `$HOME`).
 */
export async function writeSettings(
  settings: PiSettings,
  home?: string,
): Promise<WriteSettingsReport> {
  const path = piSettingsFile(home);
  const dir = dirname(path);

  // Ensure ~/.pi/agent/ exists before locking — a fresh checkout
  // might not have run `pi` yet, so the directory could be missing.
  await mkdir(dir, { recursive: true });

  // Snapshot the current file for backup / rollback.
  const beforeRaw = readRaw(path);
  const hadFile = beforeRaw !== undefined;

  // Validate the in-memory object up-front so we don't even
  // bother locking for an obviously-bad payload.
  let serialized: string;
  try {
    serialized = JSON.stringify(settings, null, 2) + "\n";
    // Round-trip parse — catches weird values (BigInt, circular refs,
    // undefined) that JSON.stringify silently drops.
    JSON.parse(serialized);
  } catch (e) {
    return {
      ok: false,
      path,
      action: "rolled-back",
      message: "settings object failed JSON round-trip; refusing to write",
      error: (e as Error).message,
    };
  }

  let release: (() => void) | null = null;
  try {
    // If the file exists, lock it (proper-lockfile refuses to lock
    // a non-existent file). If pi is running, this throws ELOCKED
    // after retries — surfaced below.
    if (hadFile) {
      try {
        release = acquireLockWithRetry(path);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "ELOCKED") {
          return {
            ok: false,
            path,
            action: "rolled-back",
            message:
              "Pi is currently running and holds the settings.json lock; close Pi and try again",
            error: (e as Error).message,
          };
        }
        throw e;
      }
    }

    // Back up the current file (best-effort; if backup fails, we
    // still proceed because rollback would just write the new value).
    if (hadFile && beforeRaw !== undefined) {
      try {
        writeFileSync(`${path}.bak`, beforeRaw, "utf-8");
      } catch {
        /* backup is best-effort */
      }
    }

    // Atomic write: tmp + rename.
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, serialized, "utf-8");
    const { renameSync } = await import("node:fs");
    renameSync(tmp, path);

    // Post-write validation — read back and re-parse.
    const written = readRaw(path);
    if (written === undefined) {
      throw new Error("write succeeded but file is missing on disk");
    }
    try {
      JSON.parse(written);
    } catch (e) {
      // Roll back from .bak if we have one.
      if (beforeRaw !== undefined) {
        writeFileSync(path, beforeRaw, "utf-8");
      }
      throw new Error(
        `post-write validation failed; rolled back: ${(e as Error).message}`,
      );
    }

    return {
      ok: true,
      path,
      action: hadFile ? "updated" : "created",
      message: hadFile
        ? `updated settings.json (backed up previous to ${path}.bak)`
        : `created settings.json at ${path}`,
    };
  } catch (e) {
    // Best-effort rollback if we have a backup.
    if (beforeRaw !== undefined) {
      try {
        writeFileSync(path, beforeRaw, "utf-8");
      } catch {
        /* nothing more we can do */
      }
    }
    return {
      ok: false,
      path,
      action: "rolled-back",
      message: `write failed; attempted rollback`,
      error: (e as Error).message,
    };
  } finally {
    if (release) {
      try {
        release();
      } catch {
        /* lock release is best-effort */
      }
    }
  }
}
