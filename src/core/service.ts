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

import type { Capability } from "./capability.js";
import type { Profile, ProfileInput } from "./profile.js";
import type { ToolPolicy, ToolPolicyInput } from "./policy.js";
import { checkPolicy, type ToolCallInfo } from "./policy-engine.js";
import type { ProjectContextRef } from "./project-context.js";
import type { StatsRange, StatsReport } from "./stats.js";
import type { ToolInventoryItem } from "./tool-inventory.js";
import type { ToolTraceFilter } from "./tool-trace.js";
import type { UsageRange, UsageReport } from "./usage.js";
import type { InstalledPack, Pack, SessionInfo, SessionTree } from "./types.js";

export type PolicyDecision = ReturnType<typeof checkPolicy>;

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

  /**
   * Stream tool call events from a session. Each `ToolResultMessage`
   * yields one event with name, args, isError, latency, and content
   * preview. v0.4.2.
   */
  traceSessionTools(
    id: string,
    filter?: ToolTraceFilter,
  ): AsyncIterable<import("./tool-trace.js").ToolCallEvent>;

  // ─── Doctor ───────────────────────────────────────────

  /** Run health checks. Returns a structured report — commands render it. */
  runDoctor(): Promise<DoctorReport>;

  // ─── Profiles (v0.3.0+) ──────────────────────────────

  /** List all named profiles. */
  listProfiles(): Promise<Profile[]>;

  /** Fetch a single profile by name. Returns null if not found. */
  getProfile(name: string): Promise<Profile | null>;

  /** Create or update a profile. */
  setProfile(name: string, input: ProfileInput): Promise<Profile>;

  /** Delete a profile. Returns true if it existed. */
  deleteProfile(name: string): Promise<boolean>;

  // ─── Stats (v0.3.0+) ─────────────────────────────────

  /**
   * Aggregate usage stats across all sessions in the given range.
   *
   * @param range — `today` / `lastDays` / `all`. See StatsRange.
   */
  getStats(range: StatsRange): Promise<StatsReport>;

  /**
   * Aggregate token usage and cost across all sessions in the given range.
   *
   * v0.4.2: reads `AssistantMessage.usage` from pi v3 JSONL. Returns an
   * empty report when no sessions are present.
   */
  getUsage(range: UsageRange): Promise<UsageReport>;

  // ─── Tool inventory & project context (v0.4.2) ──────

  /** All tools available to pi (built-in + npm-installed extensions). */
  listTools(): Promise<ToolInventoryItem[]>;

  /** Project context files visible from `cwd` (mirrors pi's discovery). */
  discoverProjectContext(cwd: string): Promise<ProjectContextRef[]>;

  // ─── Tool policies (v0.4.3) ──────────────────────────

  /** List all tool policies in `~/.pilot/policy/`. */
  listPolicies(): Promise<ToolPolicy[]>;

  /** Fetch a single policy by name. Returns null if not found. */
  getPolicy(name: string): Promise<ToolPolicy | null>;

  /** Create or update a policy. */
  setPolicy(name: string, input: ToolPolicyInput): Promise<ToolPolicy>;

  /** Delete a policy. Returns true if it existed. */
  deletePolicy(name: string): Promise<boolean>;

  /**
   * Apply a policy by generating a `pilot-policy-<name>.ts`
   * extension and writing it to `~/.pilot/extensions/`.
   * Returns the absolute path to the generated file.
   */
  applyPolicy(name: string): Promise<{ path: string }>;

  /** Remove the generated extension for a policy. Idempotent. */
  unapplyPolicy(name: string): Promise<{ removed: boolean }>;

  /**
   * Dry-run a tool call against a policy. Used by `pilot policy check`
   * and the Web UI "test a rule" form.
   */
  checkPolicyCall(
    name: string,
    call: ToolCallInfo,
  ): Promise<{ policy: ToolPolicy; decision: PolicyDecision }>;

  // ─── Capabilities (v0.4+) ────────────────────────────

  /** All installed capabilities. Returns [] when store doesn't exist. */
  listCapabilities(): Promise<Capability[]>;

  /** Fetch a single capability by id. Returns null if not found or invalid. */
  getCapability(id: string): Promise<Capability | null>;
}
