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
import type { ActiveProfileState } from "./profile-state.js";
import type { ToolPolicy, ToolPolicyInput } from "./policy.js";
import { checkPolicy, type ToolCallInfo } from "./policy-engine.js";
import type { ProjectContextRef } from "./project-context.js";
import type { StatsRange, StatsReport } from "./stats.js";
import type { ToolInventoryItem } from "./tool-inventory.js";
import type { ToolTraceFilter } from "./tool-trace.js";
import type { UsageRange, UsageReport } from "./usage.js";
import type { InstalledPack, Pack, SessionInfo, SessionTree } from "./types.js";
import type { SessionSnapshot } from "./session-snapshot.js";
import type { SessionTemplate } from "./session-template.js";
import type { Avatar, AvatarCurrent, AvatarDiff } from "./avatar.js";
import type { CapabilityDiff } from "./capability-diff.js";

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

  /**
   * Uninstall a pack by name. Delegates to `pi uninstall`.
   * Throws if the pack isn't installed.
   *
   * v0.4.12: completes the CRUD loop (was install-only before).
   * Accepts both bare package names ("pi-subagents") and prefixed
   * ones ("npm:pi-subagents"). Always normalizes to `npm:<name>`.
   */
  uninstallPack(name: string): Promise<void>;

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
   * Derive a fresh snapshot for a session (model, cwd, entry count,
   * active profile, generated extensions). Returns null if the
   * session file no longer exists on disk — which can happen when
   * users prune `~/.pi/agent/sessions/` outside of Pilot.
   *
   * v0.4.13: snapshot is "best-knowledge" — model + cwd come from
   * the JSONL, profile/extensions come from current Pilot state at
   * capture time. Real per-session history lands in v0.5.0.
   */
  getSnapshot(id: string): Promise<SessionSnapshot | null>;

  /**
   * v0.4.13: extract a profile-creation template from a session —
   * `model` (first assistant message) + sorted unique `tools` (from
   * toolCall blocks). Returns null if the session file is gone.
   *
   * Used by `/profiles/new?from=<id>` to pre-fill the form so users
   * don't retype what they already used.
   */
  getSessionTemplate(id: string): Promise<SessionTemplate | null>;

  // ─── Forge (v0.4.14+) ────────────────────────────────

  /** Search npm for forge-able packages. */
  forgeSearch(query: string): Promise<Pack[]>;

  /**
   * Inspect a package by name — returns pack summary + parsed
   * manifest. Null when the package isn't on npm.
   */
  forgeInspect(name: string): Promise<{
    pack: Pack;
    manifest: import("./pack-manifest.js").PackManifest;
  } | null>;

  /**
   * Absorb a package into a Capability (writes
   * `~/.pilot/capabilities/<id>/capability.json`). Returns the
   * created capability.
   *
   * @throws ForgeAbsorbError on failure (not-found / invalid-id /
   * schema-validation / io).
   */
  forgeAbsorb(name: string, asId?: string): Promise<Capability>;

  // ─── Avatars (v0.5+) ─────────────────────────────

  /**
   * List every Avatar in `~/.pilot/avatars/` — one per encoded cwd.
   * Sorted by encodedCwd for stable display.
   */
  listAvatars(): Promise<Avatar[]>;

  /** Read one Avatar by encodedCwd, or null if it doesn't exist. */
  readAvatar(encodedCwd: string): Promise<Avatar | null>;

  /**
   * Capture the *current* Pilot state (active profile, model, packs,
   * extensions) into an Avatar for the given encoded cwd.
   */
  captureAvatar(encodedCwd: string): Promise<Avatar>;

  /**
   * Delete an Avatar. Returns true when the file was removed.
   */
  deleteAvatar(encodedCwd: string): Promise<boolean>;

  /**
   * Read the current state — what an Avatar would diff against. The
   * same data `captureAvatar` would record; useful for the Web UI
   * to show "before vs after" without re-capturing.
   */
  readCurrentState(): Promise<AvatarCurrent>;

  /**
   * Compute the diff between an Avatar (expected) and the current
   * state (actual). Pure — does not touch fs beyond `readCurrentState`.
   */
  diffAvatar(encodedCwd: string): Promise<AvatarDiff | null>;

  /**
   * v0.5.1: compare two Capabilities by id. Returns null when
   * either id doesn't exist on disk. Pure — no side effects.
   */
  capabilityDiff(aId: string, bId: string): Promise<CapabilityDiff | null>;

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

  // ─── Active profile pointer (v0.4.12+) ───────────────
  /**
   * Mark a named profile as the user's current active profile.
   * Writes `~/.pilot/active.json`. Throws if the profile doesn't
   * exist (we never let users activate a profile that has no
   * definition — silently activating "ghost" profiles is how
   * drift bugs start).
   */
  activateProfile(name: string): Promise<ActiveProfileState>;

  /** Read the current active profile, or null if none is active. */
  getActiveProfile(): Promise<ActiveProfileState | null>;

  /** Clear the active profile pointer. */
  clearActiveProfile(): Promise<void>;

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

  // ─── Compose catalog (v0.4.4) ──────────────────────────

  /**
   * Enumerate every Pilot entity across stores for the Compose
   * sidebar. Each entry is `{kind, id, label, sublabel?, href?}`.
   * Sessions are capped at 50 most-recent.
   */
  listComposeEntities(): Promise<import("./compose-listing.js").ComposeCatalog>;

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
