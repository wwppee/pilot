/**
 * session-snapshot — derived per-session metadata for v0.4.13+.
 *
 * Each pi session (a `.jsonl` file under `~/.pi/agent/sessions/<cwd>/`)
 * gets a small derived snapshot written to
 * `~/.pilot/sessions/<id>/snapshot.json` containing the metadata
 * Pilot knows about that session:
 *
 *   {
 *     "sessionId":    "2026-06-30_22-41_abc123",
 *     "capturedAt":   "2026-07-04T12:00:00Z",
 *     "model":        "claude-opus-4-6",       // from first AssistantMessage
 *     "cwd":          "...encoded...",          // from SessionInfo.cwd
 *     "startedAt":    "2026-06-30T22:41:00Z",
 *     "lastUsedAt":   "2026-06-30T22:45:00Z",
 *     "entryCount":   47,
 *     "activeProfile": "pi-architect",          // from ~/.pilot/active.json at capture time
 *     "extensions":   ["pilot-policy-safe-bash"], // from ~/.pilot/extensions/*.ts at capture
 *     "note":         "v0.4.13 best-knowledge snapshot. v0.5.0 will replace with true history."
 *   }
 *
 * Snapshot honesty: "as-of" fields (profile, extensions) reflect what
 * was installed *at capture time*, not what was enabled *when the
 * session actually ran*. Pi doesn't log per-session "which extensions
 * were loaded"; that needs a real extension-trace hook which is
 * planned for v0.5.0. For now, the snapshot answers "what was
 * running on this machine the last time we looked" — useful for
 * `pilot diff` and Avatar baselines, just not for historical audit.
 *
 * Snapshots are derived, not authoritative — regenerating them
 * (e.g. after installing a new capability) updates the same file.
 * `~/.pi/agent/sessions/<id>.jsonl` remains the source of truth.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { piAgentDir, pilotDir } from "./types.js";
import { readSessionInfo } from "./jsonl-parser.js";
import { readActiveProfile } from "./profile-state.js";
import { listSources, readSettings } from "./settings.js";
import type { SessionInfo } from "./types.js";

/** Shape of `~/.pilot/sessions/<id>/snapshot.json`. */
export interface SessionSnapshot {
  sessionId: string;
  capturedAt: string;
  /** First assistant message's model — `undefined` if the session has no assistant entries. */
  model?: string;
  cwd?: string;
  startedAt?: string;
  lastUsedAt?: string;
  entryCount?: number;
  /** Snapshot is a best-knowledge view — not historical truth. */
  note: string;
  /** Currently active profile (v0.4.12 active.json). */
  activeProfile?: string;
  /** Source identifiers from pi settings.json at capture time (e.g. "npm:foo"). */
  packSources?: string[];
  /** Names of generated policy extensions at capture time. */
  extensions?: string[];
}

/** Absolute path to `~/.pilot/sessions/<id>/snapshot.json`. */
export function snapshotPath(sessionId: string, home?: string): string {
  return join(snapshotDir(home), `${sessionId}.json`);
}

/** Absolute path to `~/.pilot/sessions/`. */
export function snapshotDir(home?: string): string {
  return join(pilotDir(home), "sessions");
}

/**
 * Read a previously-derived snapshot, or null if none exists.
 */
export async function readSnapshot(
  sessionId: string,
  home?: string,
): Promise<SessionSnapshot | null> {
  const path = snapshotPath(sessionId, home);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (typeof parsed.sessionId !== "string") return null;
    return parsed as SessionSnapshot;
  } catch {
    return null;
  }
}

/**
 * Locate the .jsonl file for a session by id, then derive a fresh
 * snapshot from it (model, entry count, timestamps) + current
 * Pilot state (active profile, installed packs, generated extensions).
 *
 * Returns null if the session file no longer exists on disk — that
 * happens when users prune `~/.pi/agent/sessions/` outside of Pilot.
 */
export async function deriveSnapshot(
  sessionId: string,
  home?: string,
): Promise<SessionSnapshot | null> {
  const sessionFilePath = await findSessionFile(sessionId, home);
  if (!sessionFilePath) return null;

  // Read SessionInfo — model, entries, startedAt, lastUsedAt.
  // (readSessionInfo doesn't fill `cwd`; we extract it from the
  // file path below so callers see the same shape listAllSessions
  // produces.)
  const info = await readSessionInfo(sessionFilePath, sessionId);
  const cwdFromPath = extractCwd(sessionFilePath);

  // Current Pilot state.
  const active = await readActiveProfile(home);
  const packSources = await readPackSources(home);
  const extensions = await listGeneratedExtensions(home);

  // Resolve cwd from SessionInfo or, failing that, from the file path.
  // (readSessionInfo doesn't fill cwd; we extract it from the dir name
  // so callers see the same shape listAllSessions produces.)
  const cwd: string | undefined = info.cwd ?? cwdFromPath;

  const snapshot: SessionSnapshot = {
    sessionId,
    capturedAt: new Date().toISOString(),
    note: "v0.4.13 best-knowledge snapshot. v0.5.0 will replace with true history.",
    ...(info.model !== undefined ? { model: info.model } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(info.startedAt !== undefined ? { startedAt: info.startedAt } : {}),
    ...(info.lastUsedAt !== undefined ? { lastUsedAt: info.lastUsedAt } : {}),
    ...(info.entries !== undefined ? { entryCount: info.entries } : {}),
    ...(active ? { activeProfile: active.name } : {}),
    ...(packSources.length > 0 ? { packSources } : {}),
    ...(extensions.length > 0 ? { extensions } : {}),
  };
  return snapshot;
}

/**
 * Derive + persist. Writes atomically (tmp + rename) so a crash
 * mid-write can't leave a half-written snapshot.
 */
export async function writeSnapshot(
  sessionId: string,
  home?: string,
): Promise<SessionSnapshot | null> {
  const snap = await deriveSnapshot(sessionId, home);
  if (!snap) return null;
  const path = snapshotPath(sessionId, home);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(snap, null, 2) + "\n", "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, path);
  return snap;
}

/**
 * Locate the absolute path of `<sessionId>.jsonl` under pi's
 * sessions dir, by walking `~/.pi/agent/sessions/<cwd>/`.
 *
 * v0.4.13 implementation: the cwd-encoded subdirs are opaque to
 * Pilot (we read them but don't decode), so we search all of them.
 * Sessions dirs typically have <100 subdirs so this is fine.
 */
async function findSessionFile(
  sessionId: string,
  home?: string,
): Promise<string | null> {
  const root = piAgentDir(home) + "/sessions";
  if (!existsSync(root)) return null;

  const cwdDirs: import("node:fs").Dirent[] = await readdir(root, {
    withFileTypes: true,
  }).catch(() => []);

  for (const d of cwdDirs) {
    if (!d.isDirectory()) continue;
    const candidate = join(root, d.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * List the names of generated policy extension files in
 * `~/.pilot/extensions/`. These are the ones installed by
 * `pilot policy apply`. Sorted alphabetically for stable snapshots.
 */
async function listGeneratedExtensions(home?: string): Promise<string[]> {
  const dir = join(pilotDir(home), "extensions");
  if (!existsSync(dir)) return [];
  try {
    const entries = await readdir(dir);
    return entries
      .filter((n) => n.startsWith("pilot-policy-") && n.endsWith(".ts"))
      .map((n) => basename(n, ".ts"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Pull the encoded cwd from a session file path. Pi stores sessions at
 * `~/.pi/agent/sessions/<encoded-cwd>/<id>.jsonl` where `<encoded-cwd>`
 * is an opaque string (e.g. `--home-me-proj--`). The cwd itself isn't
 * stored inside the JSONL, so the directory name is the only source.
 */
function extractCwd(filePath: string): string | undefined {
  // Split on /sessions/ and take the next segment.
  const idx = filePath.lastIndexOf(`${sep}sessions${sep}`);
  if (idx < 0) return undefined;
  const after = filePath.slice(idx + `${sep}sessions${sep}`.length);
  const seg = after.split(sep)[0];
  return seg && seg.length > 0 ? seg : undefined;
}

/**
 * Pull pack source identifiers from pi's settings.json — same call
 * service-impl.listPacks uses, minus the per-source manifest fetch
 * (we only need names for the snapshot, not enriched Pack records).
 *
 * Failures are non-fatal: settings.json may be missing or malformed;
 * snapshot still records what it can.
 */
async function readPackSources(home?: string): Promise<string[]> {
  try {
    const settings = await readSettings(home);
    return listSources(settings).map((s) => s.source);
  } catch {
    return [];
  }
}

/** Convenience: derive + persist for a session id, logging on failure. */
export async function ensureSnapshot(
  sessionId: string,
  home?: string,
): Promise<SessionSnapshot | null> {
  return writeSnapshot(sessionId, home);
}

/** Default TTL for "snapshot is fresh enough" — 24h. */
export const DEFAULT_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * v0.4.13: idempotent version of ensureSnapshot. Reuses the existing
 * snapshot if it's fresh (captured within `maxAgeMs`). Used by
 * `pilot session ls` to keep snapshots warm without re-parsing
 * every JSONL on every invocation.
 *
 * Returns the snapshot (existing or newly derived). Null if the
 * session file is gone.
 */
export async function ensureSnapshotIfStale(
  sessionId: string,
  maxAgeMs: number = DEFAULT_SNAPSHOT_TTL_MS,
  home?: string,
): Promise<SessionSnapshot | null> {
  const existing = await readSnapshot(sessionId, home);
  if (existing) {
    const age = Date.now() - new Date(existing.capturedAt).getTime();
    if (age >= 0 && age < maxAgeMs) {
      return existing;
    }
  }
  return writeSnapshot(sessionId, home);
}

/** Re-export for type-aware consumers (e.g. tests). */
export type { SessionInfo };
