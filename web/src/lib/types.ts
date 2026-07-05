/**
 * Type stubs mirroring pilot's runtime types.
 *
 * Web is a peer of pilot (separate packages), so we hand-maintain a
 * minimal copy of the data shapes we render. Keep in sync with
 * pilot/src/core/types.ts and stats.ts.
 */

export type PackKind = "extension" | "skill" | "prompt" | "theme";

export interface Pack {
  /** npm package name. */
  name: string;
  /** Latest version string. */
  version: string;
  /** Description (if known). */
  description?: string;
  /** Registry URL. */
  homepage?: string;
  /** Display kind (extension / skill / theme / prompt). */
  kind?: PackKind;
  /** npm source spec (`npm:foo`, `git:…`). */
  source: string;
  /** Whether the source is currently enabled. */
  enabled: boolean;
}

export interface SessionInfo {
  id: string;
  path: string;
  cwd: string;
  entries: number;
  size: number;
  startedAt?: string;
  lastUsedAt?: string;
  model?: string;
}

export interface SessionTreeNode {
  id: string;
  type: "user" | "assistant" | "tool" | "system";
  timestamp?: string;
  preview: string;
  /** Tool name if type === 'tool'. */
  toolName?: string;
  /** Model id if type === 'assistant'. */
  model?: string;
  /** Recursive children. */
  children: SessionTreeNode[];
}

export interface SessionTree {
  id: string;
  root: SessionTreeNode;
  totalNodes: number;
  maxDepth: number;
  models: string[];
}

export interface Profile {
  name: string;
  model?: string;
  thinking?: string;
  packages?: string[];
  env?: Record<string, string>;
  capabilities?: string[];
  notes?: string;
}

/**
 * v0.4.12: active profile pointer (`~/.pilot/active.json`).
 * Mirrors `core/profile-state.ts:ActiveProfileState`.
 */
export interface ActiveProfile {
  name: string;
  activatedAt: string;
  source: "cli" | "web" | "auto";
}

export interface StatsBucket {
  /** First key. */
  [k: string]: string | number;
}

export interface StatsReport {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  byModel: Array<{ model: string; messages: number; toolCalls: number }>;
  byTool: Array<{ tool: string; count: number }>;
  byDay: Array<{ date: string; messages: number; toolCalls: number }>;
}

export type StatsRange =
  | { kind: "today" }
  | { kind: "lastDays"; days: number }
  | { kind: "all" };

// ─── Capability diff (v0.5.1+) ──────────────────────────────

/**
 * Per-field diff between two Capabilities. Mirrors the shape
 * returned by core/capability-diff.ts `diffCapability`. Web-side
 * types are intentionally slightly looser than core (e.g. eval
 * is treated as `unknown`) so the page renders whatever the
 * server sends without bespoke mapping.
 */
export interface CapabilityDiff {
  aId: string;
  bId: string;
  equal: boolean;
  title: { status: DiffStatus; a?: string; b?: string };
  type: { status: DiffStatus; a?: string; b?: string };
  description: { status: DiffStatus; a?: string; b?: string };
  sources: { status: DiffStatus; a: string[]; b: string[] };
  sourceDetails: Array<{
    ref: string;
    status: DiffStatus;
    a?: CapabilitySource;
    b?: CapabilitySource;
  }>;
  artifacts: {
    extensions: { status: DiffStatus; a: string[]; b: string[] };
    skills: { status: DiffStatus; a: string[]; b: string[] };
    prompts: { status: DiffStatus; a: string[]; b: string[] };
    themes: { status: DiffStatus; a: string[]; b: string[] };
  };
  eval:
    | { status: "match"; note: "both absent" }
    | { status: "match" | "drift"; a: unknown; b: unknown }
    | { status: "missing"; a: unknown }
    | { status: "extra"; b: unknown };
  compatibility: {
    conflicts: { status: DiffStatus; a: string[]; b: string[] };
    requires: { status: DiffStatus; a: string[]; b: string[] };
  };
  metadata: {
    inspiredBy: { status: DiffStatus; a: string[]; b: string[] };
    tags: { status: DiffStatus; a: string[]; b: string[] };
    createdAt: { status: DiffStatus; a?: string; b?: string };
    updatedAt: { status: DiffStatus; a?: string; b?: string };
  };
}

// ─── Capability types (v0.3.9+) ─────────────────────────────────────

export type CapabilityType = "workflow" | "lens" | "reviewer" | string;

export interface CapabilitySource {
  type: "npm" | "git" | "local" | string;
  ref: string;
  mode?: "L1-referenced" | "L2-wrapped";
}

export interface CapabilityCompatibility {
  conflicts: string[];
  requires: string[];
}

export interface CapabilityMetadata {
  createdAt: string;
  updatedAt: string;
}

export interface Capability {
  id: string;
  title: string;
  description?: string;
  type?: CapabilityType;
  sources: CapabilitySource[];
  artifacts: Record<string, unknown>;
  compatibility: CapabilityCompatibility;
  metadata: CapabilityMetadata;
}

// ─── Forge (v0.4.14+) ──────────────────────────────────────────

/**
 * Server response for `GET /forge/inspect/:name` — pack summary
 * plus parsed manifest from npm registry. Mirrors the shape returned
 * by core/forge.ts `forgeInspect`.
 */
export interface ForgeInspectResult {
  pack: Pack;
  manifest: {
    name: string;
    version: string;
    description?: string;
    pi?: {
      kind?: PackKind;
      extension?: string;
      skills?: string[];
      themes?: string[];
      prompts?: string[];
      commands?: string[];
      keybindings?: string[];
    };
  };
}

// ─── Avatars (v0.5+) ──────────────────────────────────────────

/**
 * Persisted "expected config" for a project cwd. See core/avatar.ts.
 * Fields are all optional except `encodedCwd` + `capturedAt` — a fresh
 * capture can omit profile/model if the user hasn't set them up yet.
 */
export interface Avatar {
  encodedCwd: string;
  capturedAt: string;
  profile?: string;
  model?: string;
  packSources: string[];
  extensions: string[];
}

/** What an Avatar would diff against. */
export interface AvatarCurrent {
  activeProfile?: string;
  model?: string;
  packSources: string[];
  extensions: string[];
}

export type DiffStatus = "match" | "drift" | "missing" | "extra";

export interface AvatarDiffField<T> {
  status: DiffStatus;
  expected: T;
  actual: T;
}

export interface AvatarDiff {
  encodedCwd: string;
  capturedAt: string;
  profile: AvatarDiffField<string | undefined>;
  model: AvatarDiffField<string | undefined>;
  packSources: AvatarDiffField<string[]>;
  extensions: AvatarDiffField<string[]>;
  /** True when nothing needs fixing (matches + extras only). */
  clean: boolean;
}

/**
 * v0.5.2: result of `applyAvatar` — bring current state into alignment
 * with the Avatar's expectations. Mirrors core/avatar.ts
 * `AvatarApplyReport`.
 */
export interface AvatarApplyStep {
  action: "install-pack" | "activate-profile" | "none";
  target: string;
  status: "ok" | "skipped" | "failed";
  message?: string;
}

export interface AvatarApplyReport {
  encodedCwd: string;
  steps: AvatarApplyStep[];
  installed: string[];
  activated?: string;
  skipped: string[];
  failed: string[];
}

// ─── Usage (v0.4.2+) ──────────────────────────────────────────

export type UsageRange =
  | { kind: "today" }
  | { kind: "lastDays"; days: number }
  | { kind: "all" };

export interface UsageModelBucket {
  model: string;
  messages: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export interface UsageDayBucket {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  sessions: number;
}

export interface UsageReport {
  totalSessions: number;
  totalAssistantMessages: number;
  totalTokens: number;
  totalCost: number;
  byModel: UsageModelBucket[];
  byDay: UsageDayBucket[];
  range: UsageRange;
}

// ─── Tool inventory (v0.4.2+) ──────────────────────────────────

export type ToolSource = "built-in" | "extension" | "npm";
export type ToolSafety = "read" | "write" | "exec" | "network" | "secret";

export interface ToolInventoryItem {
  name: string;
  source: ToolSource;
  safety: ToolSafety;
  description: string;
  packageName?: string;
  enabled: boolean;
  installed: boolean;
}

// ─── Project context (v0.4.2+) ─────────────────────────────────

export interface ProjectContextRef {
  path: string;
  filename: string;
  location: string;
  loaded: boolean;
  bytes: number;
  mtime: string;
  preview: string;
}

// ─── Tool policies (v0.4.3+) ───────────────────────────────────

/**
 * A `ToolPolicy` is a named bundle of allow/deny/path/command rules
 * for pi. Stored in `~/.pilot/policy/<name>.toml`. Mirrors
 * `core/policy.ts`.
 */
export interface ToolPolicy {
  name: string;
  description?: string;
  allow: string[];
  deny: string[];
  denyPaths: string[];
  denyCommands: string[];
  sensitivePatterns: string[];
  requireApproval: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input shape for `setPolicy` — timestamps are server-managed. */
export type ToolPolicyInput = Omit<
  ToolPolicy,
  "name" | "createdAt" | "updatedAt" | "description"
> & {
  /**
   * Mirrors core policy zod schema (`z.string().optional()`).
   * Explicit `string | undefined` for compatibility with
   * `exactOptionalPropertyTypes: true` — callers may pass `undefined`.
   */
  description?: string | undefined;
};

/** Decision returned by `pilot policy check`. */
export interface PolicyDecision {
  block: boolean;
  reason?: string;
  rule?: string;
  requireApproval?: boolean;
  approvalPrompt?: string;
}

// ─── Session template (v0.4.13+) ──────────────────────────────

/**
 * Profile-creation defaults extracted from a session — model from
 * first assistant message, tools from toolCall blocks. See
 * core/session-template.ts.
 */
export interface SessionTemplate {
  sessionId: string;
  model?: string;
  tools: string[];
  cwd?: string;
}

// ─── Session snapshot (v0.4.13+) ──────────────────────────────

/**
 * Derived per-session metadata. See core/session-snapshot.ts.
 * Best-knowledge view: model/cwd from JSONL, profile/extensions from
 * current Pilot state at capture time. Real per-session history
 * lands in v0.5.0.
 */
export interface SessionSnapshot {
  sessionId: string;
  capturedAt: string;
  model?: string;
  cwd?: string;
  startedAt?: string;
  lastUsedAt?: string;
  entryCount?: number;
  note: string;
  activeProfile?: string;
  packSources?: string[];
  extensions?: string[];
}

// ─── Compose catalog (v0.4.4+) ─────────────────────────────────

export type ComposeEntityKind =
  | "session"
  | "pack"
  | "profile"
  | "policy"
  | "capability";

export interface ComposeEntity {
  kind: ComposeEntityKind;
  id: string;
  label: string;
  sublabel?: string;
  href?: string;
}

export interface ComposeCatalog {
  sessions: ComposeEntity[];
  packs: ComposeEntity[];
  profiles: ComposeEntity[];
  policies: ComposeEntity[];
  capabilities: ComposeEntity[];
  totalCount: number;
  generatedAt: string;
}

/**
 * A block placed on the Compose canvas. Persists across reloads
 * via localStorage; can be exported/imported as JSON.
 */
export interface ComposeBlock {
  /** Stable block ID (uuid generated client-side). */
  id: string;
  /** What kind of entity this represents. */
  kind: ComposeEntityKind;
  /** Reference into the catalog (catalog.{kind}.id). */
  refId: string;
  /** Pixel position on the canvas. */
  x: number;
  y: number;
  /** Display label (cached from catalog so deleted entities still render). */
  label: string;
  /** Cached sublabel (model, version, rules count). */
  sublabel?: string;
  /** Cached href to the dedicated page. */
  href?: string;
}

export interface ComposeState {
  blocks: ComposeBlock[];
  /** Schema version — bump when changing ComposeBlock shape. */
  version: 1;
  /** ISO timestamp of last save. */
  updatedAt: string;
  /** Optional human-readable name for this layout. */
  name?: string;
}
