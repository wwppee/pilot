/**
 * PilotService — the single API surface for everything Pilot can do.
 *
 * Everything the CLI / server / Web UI calls must go through this interface.
 * It exists so:
 *   1. CLI / server / web all share one implementation (no drift)
 *   2. Commands are pure renderers of service results (testable)
 *   3. Future: in-memory mock for tests, RPC proxy for server, etc.
 *
 * Design rules:
 *   - Service returns **data**, not formatted output. Colors/tables belong in commands.
 *   - Service throws on errors (commands catch + render). Don't return error objects.
 *   - Service is **read-mostly**. Write operations (install, uninstall) are explicit.
 *   - All async. No sync I/O.
 *
 * v0.2-b scope: covers what v0.1 already does + capability (data model done in v0.2-a).
 * v0.2-c: extend with stats / profile / session tree.
 * v0.3+: extend with avatars / forge eval.
 *
 * See: docs/architecture.md §3 for the full roadmap.
 */

import type { Capability } from './capability.js';
import type { InstalledPack, Pack, SessionInfo, SessionTree } from './types.js';

// ─── Filter / result types ──────────────────────────────────

/** Optional filters for listSessions. All filters AND together. */
export interface SessionFilter {
  /** Only sessions whose model matches (substring, case-insensitive). */
  model?: string;
  /** Only sessions with activity in the last N days. */
  sinceDays?: number;
  /** Only sessions from this encoded cwd dir. */
  cwd?: string;
}

/** A single hit in session full-text search. */
export interface SessionSearchHit {
  info: SessionInfo;
  /** Number of entries that matched the query. */
  hits: number;
}

/** A single health check in the doctor report. */
export interface DoctorCheck {
  ok: boolean;
  message: string;
  hint?: string;
}

/** Result of `pilot doctor`. */
export interface DoctorReport {
  /** True when all checks pass. */
  ok: boolean;
  /** Number of failing checks. */
  failed: number;
  /** All checks, in display order. */
  checks: DoctorCheck[];
}

// ─── The interface ──────────────────────────────────────────

export interface PilotService {
  // ─── Packs ────────────────────────────────────────────

  /** All installed pi sources, parsed and classified. */
  listPacks(): Promise<InstalledPack[]>;

  /** Search the npm registry for pi-related packages. */
  searchPacks(query: string): Promise<Pack[]>;

  /** Fetch full metadata for a single npm package. Returns null if 404. */
  getPack(name: string): Promise<Pack | null>;

  /**
   * Install a pack. Delegates to `pi install`.
   * @param source  npm:<name>, git:<url>, or local path. Plain names are auto-prefixed with `npm:`.
   * @throws if `pi` exits non-zero.
   */
  installPack(source: string): Promise<void>;

  // ─── Sessions ─────────────────────────────────────────

  /** List local sessions, optionally filtered. Most-recent first. */
  listSessions(filter?: SessionFilter): Promise<SessionInfo[]>;

  /** Full-text search across all session entries. Returns matches + per-file hit count. */
  searchSessions(
    query: string,
    options?: { caseSensitive?: boolean },
  ): Promise<SessionSearchHit[]>;

  /**
   * Read a session and return its DAG as a tree.
   *
   * @throws if no session with this id is found.
   */
  readSessionTree(id: string): Promise<SessionTree>;

  // ─── Doctor ───────────────────────────────────────────

  /** Run health checks. Returns a structured report — commands render it. */
  runDoctor(): Promise<DoctorReport>;

  // ─── Capabilities (v0.4+) ────────────────────────────

  /** All installed capabilities. Returns [] when store doesn't exist. */
  listCapabilities(): Promise<Capability[]>;

  /** Fetch a single capability by id. Returns null if not found or invalid. */
  getCapability(id: string): Promise<Capability | null>;
}
