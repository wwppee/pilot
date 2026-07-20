/**
 * Shared types for Pilot.
 *
 * These are the cross-cutting types used across core modules and commands.
 * Command-specific types live next to their command file.
 */

import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";

/**
 * Resolve the user's home directory, preferring $HOME (so tests can override)
 * and falling back to os.homedir().
 */
export function userHome(): string {
  return process.env.HOME ?? homedir();
}

/**
 * v0.6.15: ensure `~/.pilot/capabilities/` exists.
 *
 * Previously this directory was only created by `pilot init` (the
 * first-run welcome). Users who skipped init and jumped straight to
 * `pilot forge absorb` would hit EPERM/EACCES at the first
 * `mkdir(..., { recursive: true })` because the recursive create
 * tried to materialise the missing parent chain.
 *
 * Now any code path that writes to `~/.pilot/capabilities/`
 * (currently: `forgeAbsorb`) calls this helper first. It is
 * idempotent — `mkdir recursive: true` is a no-op when the
 * directory already exists.
 *
 * Why a helper and not inline `mkdir`: keeping the
 * "create the directory my data lives in" call in one place makes
 * it trivial to add a future `~/.pilot/capabilities/.gitignore` or
 * to log a single breadcrumb when the directory is freshly
 * created (useful for the dogfooding logs).
 *
 * The test override hook (TEST_OVERRIDE_KEY) lets unit tests
 * force this helper to fail with a synthetic EPERM without
 * having to mock the read-only ESM `node:fs/promises` module.
 * In production nothing touches the override — it's only
 * read by this function, and only when a test has set it.
 */
const TEST_OVERRIDE_KEY = Symbol.for("pilot.test.ensureCapabilities");
type WithOverride = typeof globalThis & {
  [TEST_OVERRIDE_KEY]?: (home?: string) => Promise<void>;
};

export async function ensurePilotCapabilitiesDir(home?: string): Promise<void> {
  const override = (globalThis as WithOverride)[TEST_OVERRIDE_KEY];
  if (override) {
    return override(home);
  }
  await mkdir(pilotCapabilitiesDir(home), { recursive: true });
}

// ─── Pi-owned paths (Pi 拥有，Pilot 主要读) ────────────────────
//
// These paths are FUNCTIONS (not const) so tests can inject a custom home dir.
// Production callers just call `piAgentDir()` — no args needed.

/** Absolute path to `~/.pi/agent/` — Pilot treats this as the source of truth. */
export function piAgentDir(home: string = userHome()): string {
  return `${home}/.pi/agent`;
}

/** Absolute path to the user's global settings.json. */
export function piSettingsFile(home?: string): string {
  return `${piAgentDir(home)}/settings.json`;
}

/** Absolute path to the user's global models.json. */
export function piModelsFile(home?: string): string {
  return `${piAgentDir(home)}/models.json`;
}

/** Absolute path to the session storage directory. */
export function piSessionsDir(home?: string): string {
  return `${piAgentDir(home)}/sessions`;
}

// ─── Pilot-owned paths (v0.2+) ────────────────────────────────────
//
// These are Pilot's own directories — they live in `~/.pilot/`,
// completely separate from `~/.pi/agent/`. Pi never reads from these.

/** Absolute path to `~/.pilot/` — Pilot's own config/data directory. */
export function pilotDir(home: string = userHome()): string {
  return `${home}/.pilot`;
}

/** Absolute path to `~/.pilot/capabilities/` — capability store (v0.4+). */
export function pilotCapabilitiesDir(home?: string): string {
  return `${pilotDir(home)}/capabilities`;
}

/** Absolute path to `~/.pilot/profiles/` — named profiles (v0.3+). */
export function pilotProfilesDir(home?: string): string {
  return `${pilotDir(home)}/profiles`;
}

/** Absolute path to `~/.pilot/teams/` — meta-pack TOML files (v0.2+). */
export function pilotTeamsDir(home?: string): string {
  return `${pilotDir(home)}/teams`;
}

/** Absolute path to `~/.pilot/avatars/` — avatar configs (v0.5+). */
export function pilotAvatarsDir(home?: string): string {
  return `${pilotDir(home)}/avatars`;
}

/** Absolute path to `~/.pilot/runtime/` — avatar runtime overlays (v0.5+). */
export function pilotRuntimeDir(home?: string): string {
  return `${pilotDir(home)}/runtime`;
}

// ─── Settings types ────────────────────────────────────────────────

/**
 * Pi's package source shape (matches `PackageSource` in
 * `@earendil-works/pi-coding-agent`'s `dist/core/settings-manager.d.ts`):
 *
 *   - String form: load all resources from the package (most common).
 *   - Object form: filter which resources to load
 *     (extensions / skills / prompts / themes by source path).
 */
export type PiPackageSource =
  | string
  | {
      source: string;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
      themes?: string[];
    };

/**
 * Pi's thinking level enum (matches `defaultThinkingLevel` in pi's
 * `Settings`). Pilot's own `Profile.thinking` is a subset
 * (`off` / `low` / `medium` / `high` / `xhigh`) and maps cleanly.
 */
export type PiThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/**
 * Schema of `~/.pi/agent/settings.json` (v0.5.5+).
 *
 * v0.5.5 fix: previously Pilot only modeled `sources?: Array<{source,
 * enabled}>`. That was wrong on three counts:
 *   1. The real field is **`packages`** (pi's `PackageSource`), not
 *      `sources`.
 *   2. Each entry is `string | {source, extensions?, skills?, prompts?,
 *      themes?}`, not `{source, enabled?}` — there's no `enabled` flag.
 *   3. Many other fields exist (`defaultProvider`, `defaultModel`,
 *      `defaultThinkingLevel`, `theme`, `defaultProjectTrust`, etc.)
 *      that Pilot deliberately doesn't manage but MUST preserve across
 *      a write — otherwise Pilot would silently drop user-tuned
 *      settings. The `[key: string]: unknown` index signature handles
 *      this.
 *
 * Source of truth for the full schema: `Settings` in
 * `@earendil-works/pi-coding-agent`'s `dist/core/settings-manager.d.ts`.
 * We only model the fields Pilot actively writes; everything else
 * round-trips untouched.
 *
 * v0.5.5 also flips the historical "Pilot never writes to
 * settings.json" stance — Pilot now writes (via `core/settings-write.ts`
 * with proper-lockfile + backup) so profile activation actually takes
 * effect on the next pi launch, instead of writing to an orphaned
 * `~/.pilot/active.json` diary.
 */
export interface PiSettings {
  /** e.g. "anthropic" / "openai" / "google". */
  defaultProvider?: string;
  /** e.g. "claude-opus-4-6". */
  defaultModel?: string;
  defaultThinkingLevel?: PiThinkingLevel;
  /** Theme name (loaded from pi's themes/ dir). */
  theme?: string;
  /** Installed packages — the new name for the old `sources` field. */
  packages?: PiPackageSource[];
  /** Preserve any other fields across read-modify-write. */
  [key: string]: unknown;
}

/**
 * Extract the canonical source specifier string from a
 * `PiPackageSource` (handles both string and object forms).
 */
export function packageSourceOf(p: PiPackageSource): string {
  return typeof p === "string" ? p : p.source;
}

// ─── Pack types ─────────────────────────────────────────────────────

/** A pi extension / skill / theme / prompt — anything installable via `pi install`. */
export interface Pack {
  /** npm package name (e.g. `@earendil-works/pi-coding-agent`). */
  name: string;
  /** Latest version string. */
  version: string;
  /** Short description from npm. */
  description: string;
  /** Author name. */
  author?: string;
  /** Monthly download count (popularity signal). */
  downloads?: number;
  /** Last published date (ISO 8601). */
  lastPublished?: string;
  /** npm keywords. */
  keywords?: string[];
  /** Repository URL. */
  repository?: string;
}

/** Classification of a pack by what it adds. Used for grouping in `pack ls`. */
export type PackKind = "extension" | "skill" | "theme" | "prompt" | "unknown";

/** A pack installed locally, derived from `settings.json`. */
export interface InstalledPack {
  /** The source specifier (e.g. `npm:pi-subagents`). */
  source: string;
  /** Parsed npm package name. */
  name: string;
  /** Whether it's currently enabled in settings. */
  enabled: boolean;
  /** Best-effort classification based on description/keywords. */
  kind: PackKind;
}

/** A meta-pack (team) — a TOML file bundling multiple packs. */
export interface PackTeam {
  name: string;
  description?: string;
  /** List of source specifiers (e.g. `npm:pi-subagents`). */
  packs: string[];
  /** Optional profile overrides applied when this team is active. */
  profiles?: Record<string, string>;
}

// ─── Session types ──────────────────────────────────────────────────

/**
 * A single entry in a JSONL session file (pi v3 format).
 *
 * v3 is the current format produced by `@earendil-works/pi-coding-agent`:
 * the session file starts with a `{type: "session", version: 3, ...}` header,
 * followed by entries with `type: "message" | "model_change" | "thinking_level_change" |
 * "compaction" | "branch_summary" | "custom" | "custom_message" | "label" | "session_info"`.
 *
 * For backward compat with the original (pre-v0.4.2) pilot code which
 * assumed a flat `{type: "user" | "assistant" | ...}` shape, we accept
 * those types as well. The shape is "wide" — fields are at the top level
 * for legacy types, or nested under `message` for v3.
 *
 * See: `node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`
 */
export interface SessionEntry {
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  /**
   * Entry type.
   * - v3 format: "session" | "message" | "model_change" | "thinking_level_change" |
   *   "compaction" | "branch_summary" | "custom" | "custom_message" | "label" | "session_info"
   * - legacy (pre-v0.4.2): "user" | "assistant" | "tool" | "system"
   */
  type: string;
  /** v3 message payload (only for `type: "message"`). */
  message?: AgentMessage;
  /** Legacy payload (pre-v0.4.2). */
  data?: unknown;
  /** v3 model_change payload. */
  model?: string;
  /** v3 thinking_level_change payload. */
  level?: string;
  /** v3 session header (only for first line). */
  version?: number;
  cwd?: string;
}

/**
 * v3 message payload (the `message` field of a `{type: "message"}` entry).
 *
 * Discriminated by `role`. We model the variants Pilot actually reads:
 * - user: text prompt
 * - assistant: model response with usage/cost
 * - toolResult: tool execution result with isError
 * - bashExecution, custom, branchSummary, compactionSummary: passed through
 *   as opaque JSON for v0.4.2 — Pilot surfaces them later if needed.
 */
export type AgentMessage =
  | { role: "user"; content: string | unknown[]; timestamp?: number }
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomAgentMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage
  | { role: string; [key: string]: unknown };

/** Pi v3 AssistantMessage — carries token usage and cost. */
export interface AssistantMessage {
  role: "assistant";
  /** Inline content blocks (text / thinking / tool calls). */
  content: unknown[];
  /** Provider API identifier (e.g. "anthropic-messages"). */
  api: string;
  /** Provider name (e.g. "anthropic"). */
  provider: string;
  /** Model name (e.g. "claude-opus-4-6"). */
  model: string;
  /** Token usage and cost — pilot's `usage.ts` reads this. */
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

/** Pi v3 ToolResultMessage — tool call outcome. */
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: unknown[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

/** Pi v3 BashExecutionMessage — user-triggered `!` commands. */
export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp: number;
}

/** Pi v3 CustomMessage — extension-injected message. */
export interface CustomAgentMessage {
  role: "custom";
  customType: string;
  content: string | unknown[];
  display: boolean;
  details?: unknown;
  timestamp: number;
}

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

/**
 * Pi v3 token usage and cost.
 * `cost` is in USD; `cacheRead`/`cacheWrite` are 5-min cache unless `cacheWrite1h`
 * is set (Anthropic-only), in which case it tracks 1-hour cache write separately.
 */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/** Metadata about a session file (no full content). */
export interface SessionInfo {
  /** Absolute path to the .jsonl file. */
  path: string;
  /** Filename without extension (e.g. `2026-06-30_22-41_abc123`). */
  id: string;
  /** First-line timestamp (ISO 8601). */
  startedAt?: string;
  /** Last-line timestamp. */
  lastUsedAt?: string;
  /** Total entry count. */
  entries: number;
  /** Best-effort model name from the first assistant message. */
  model?: string;
  /** Encoded working directory this session belongs to. */
  cwd?: string;
  /** File size in bytes. */
  sizeBytes: number;
  /**
   * v0.5.9+: short preview of the first user message in this session,
   * truncated to ~120 chars. Used by the Web sessions list to give
   * each row a "what was I working on?" hint. Empty if the session
   * has no user-role entry or it fails to parse.
   */
  firstUserPreview?: string;
}

// ─── Command runtime ────────────────────────────────────────────────

import type { PilotService } from "./service.js";

// ─── Session tree (v0.3.0+) ──────────────────────────────────────

/**
 * A single node in a session's DAG tree.
 *
 * Pi sessions are stored as JSONL where each entry has an `id` and optional
 * `parentId`. Multiple entries with the same parent form branches (e.g. when
 * the user rewinds to fork the conversation). The root has no parent.
 */
export interface SessionTreeNode {
  id: string;
  type: string;
  timestamp?: string;
  /** Short text preview for display (truncated to ~100 chars). */
  preview?: string;
  // v0.9.17: per-node affordance fields. Previously these were
  // computed but only stored at the tree level (e.g. `models: Set`
  // on SessionTree) — the dashboard had to bucket by hand. Storing
  // them per node makes the tree row "self-describing": a `tool`
  // row carries its tool name, an `assistant` row carries its model,
  // a `toolResult` row carries its isError state. The downside is
  // slightly larger payloads (~10 bytes/node), but session trees
  // are bounded (~hundreds of nodes typical) so it's free.
  /** Tool name when the node is a tool call or tool result (e.g. "bash", "read"). */
  toolName?: string;
  /** Model id when the node is an assistant message or a model_change entry. */
  model?: string;
  /** True when the entry is a tool result with `isError: true`. v0.9.17+ dashboards
   * use this to render a red "✗" badge next to the row so the user can scan
   * for failures without opening the message detail. */
  isError?: boolean;
  children: SessionTreeNode[];
}

/**
 * A session viewed as a tree. Built from the JSONL DAG.
 */
export interface SessionTree {
  id: string;
  /** Root node. If multiple roots exist (rare), this is the first. */
  root: SessionTreeNode;
  /** Total entries in the session. */
  totalNodes: number;
  /** Max depth of the tree (root = 0). */
  maxDepth: number;
  /** Unique model names used in the session. */
  models: string[];
  /** IDs of nodes with >1 child — i.e. branch points. */
  branchPoints: string[];
}

/** Context passed to every command's `run` function. */
export interface PilotContext {
  /** The user's home directory. */
  home: string;
  /** Absolute path to `~/.pi/agent`. */
  piAgentDir: string;
  /** Parsed global settings (or null if missing/invalid). */
  settings: PiSettings | null;
  /** Logger interface. */
  logger: Logger;
  /** Whether stdout is a TTY (controls color/animations). */
  isInteractive: boolean;
  /**
   * PilotService — the single API surface.
   * Every command goes through this; never call core modules directly.
   * Imported as `import type` to avoid circular runtime dependency.
   */
  service: PilotService;
}

/** Minimal logger interface — concrete impl lives in utils/logger.ts. */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  dim(msg: string): void;
}

/** Manifest of a top-level command — registered in cli.ts. */
export interface Command {
  name: string;
  description: string;
  /** Subcommands — used for help text. Optional. */
  subcommands?: string[];
}

/** Return value of a command's run function. Exit code 0 = success. */
export type CommandResult = Promise<number>;
