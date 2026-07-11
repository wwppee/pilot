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
  /**
   * v0.5.9+: short preview of the first user message in this session
   * (≤120 chars). Drives the Topic column on /sessions so users can
   * scan their history without clicking into each one. Empty string
   * for sessions with no user-role entry.
   */
  firstUserPreview?: string;
}

/**
 * v0.5.8+: every display type the server's `readSessionTree` can emit.
 *
 * Mirrors the union produced by `core/jsonl-parser.ts displayTypeForEntry`:
 *   - legacy (pre-v0.4.2) entries: `"user" | "assistant" | "tool" | "system"`
 *   - pi v3 message roles:         `"user" | "assistant" | "toolResult" |
 *                                    "bashExecution" | "custom" | "branchSummary" |
 *                                    "compactionSummary"`
 *   - pi v3 entry meta:            `"model_change" | "thinking_level_change" |
 *                                    "compaction" | "branch_summary" | "custom" |
 *                                    "custom_message" | "label" | "session_info"`
 *   - empty root placeholder:      `"empty"`
 *
 * Keep in sync when core/jsonl-parser.ts adds a new entry type or role.
 */
export type SessionTreeNodeType =
  // legacy
  | "user"
  | "assistant"
  | "tool"
  | "system"
  // pi v3 message roles
  | "toolResult"
  | "bashExecution"
  | "custom"
  | "branchSummary"
  | "compactionSummary"
  // pi v3 entry meta
  | "model_change"
  | "thinking_level_change"
  | "compaction"
  | "branch_summary"
  | "custom_message"
  | "label"
  | "session_info"
  // empty root placeholder (zero-entry session)
  | "empty"
  // anything core emits we haven't enumerated yet — strings are
  // exhaustive by definition, so unknown types fall through here.
  | (string & {});

export interface SessionTreeNode {
  id: string;
  type: SessionTreeNodeType;
  timestamp?: string;
  preview: string;
  /** Tool name if type === 'tool' or 'toolResult'. */
  toolName?: string;
  /** Model id if type === 'assistant' or 'model_change'. */
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
  /** v0.5.6+: provider ID — e.g. "anthropic" / "openai" / "google". */
  provider?: string;
  model?: string;
  thinking?: string;
  packages?: string[];
  /** v0.5.6+: short tagline — shown in profile list cards. */
  description?: string;
  /** v0.5.6+: free-form long-form notes — the "why" of the profile. */
  notes?: string;
  env?: Record<string, string>;
  capabilities?: string[];
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

/**
 * v0.5.3: per-session summary card — derived from the same JSONL
 * trace that v0.4.2 usage stats pull from, but sliced per-session
 * instead of aggregated across all sessions.
 */
export interface SessionToolUsage {
  toolName: string;
  count: number;
}

export interface SessionInfoSummary {
  sessionId: string;
  cwd?: string;
  /** First assistant message's model. */
  model?: string;
  startedAt?: string;
  endedAt?: string;
  /** Wall-clock span (first → last entry timestamp). */
  durationMs: number;
  totalMessages: number;
  assistantMessages: number;
  totalTokens: number;
  /** Sum of usage.cost.total across assistant messages (USD). */
  totalCost: number;
  toolsUsed: SessionToolUsage[];
}

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
 *
 * v0.5.3: dry-run adds `dry?: boolean` to both the per-step and the
 * report root. UI uses this to swap the banner framing — when
 * `report.dry === true`, no side-effects actually happened.
 */
export interface AvatarApplyStep {
  action: "install-pack" | "activate-profile" | "none";
  target: string;
  status: "ok" | "skipped" | "failed";
  message?: string;
  dry?: boolean;
}

export interface AvatarApplyReport {
  encodedCwd: string;
  steps: AvatarApplyStep[];
  installed: string[];
  activated?: string;
  skipped: string[];
  failed: string[];
  dry?: boolean;
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

/**
 * v0.6.5: per-entity full-detail view returned by
 * `GET /compose/catalog/:kind/:id`. Discriminated union by `kind`
 * so the inspector can switch on `detail.kind` and read the
 * right field set without runtime guards.
 *
 * Mirrors `core/compose-listing.ts#ComposeEntityDetail` — keep
 * in sync when adding fields.
 */
export type ComposeEntityDetail =
  | {
      kind: "session";
      cwd?: string;
      model?: string;
      entries: number;
      sizeBytes: number;
      lastUsedAt?: string;
      startedAt?: string;
      firstUserPreview?: string;
    }
  | {
      kind: "pack";
      name: string;
      source: string;
      enabled: boolean;
      packKind: string;
    }
  | {
      kind: "profile";
      name: string;
      model?: string;
      provider?: string;
      thinking?: string;
      packages: string[];
      description?: string;
      notes?: string;
      team?: string;
    }
  | {
      kind: "policy";
      name: string;
      description?: string;
      allow: string[];
      deny: string[];
      denyPaths: string[];
      denyCommands: string[];
      sensitivePatterns: string[];
      requireApproval: string[];
    }
  | {
      kind: "capability";
      id: string;
      title?: string;
      type?: string;
      description?: string;
      sources: Array<{ type: string; ref: string }>;
      conflicts: string[];
      requires: string[];
    };

// ─── Plans (v0.5.7+ — Agent capability layer) ──────────────────
//
// Mirrors `core/plan.ts` (PlanSchema / TaskSchema / StepSchema).
// Web is a separate package so we hand-maintain a minimal copy.
// Keep in sync when the core schema changes.

export type PlanStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type PlanStrategy = "sequential" | "parallel" | "adaptive";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

/**
 * StepAction — discriminated union of the 8 action types a Step can run.
 * `then`/`else` (for `condition`) and `condition` (for `wait`) carry
 * raw JSON to avoid a Zod-style circular type. The Web renders them
 * verbatim — they aren't executed here.
 */
export type StepAction =
  | { type: "pilot_command"; command: string; args?: string[] }
  | { type: "pi_session"; prompt: string; profile?: string; cwd?: string }
  | { type: "profile_switch"; profile: string }
  | { type: "pack_install"; source: string }
  | { type: "policy_apply"; policy: string }
  | {
      type: "condition";
      check: string;
      then: Array<Record<string, unknown>>;
      else: Array<Record<string, unknown>>;
    }
  | { type: "wait"; condition: string; timeoutMs?: number }
  | { type: "manual"; prompt: string };

export interface StepOutput {
  success: boolean;
  summary?: string;
  data?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  tokensUsed?: number;
}

export interface PlanStep {
  id: string;
  description: string;
  action: StepAction;
  status: StepStatus;
  input: Record<string, unknown>;
  output?: StepOutput;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskResult {
  success: boolean;
  summary?: string;
  totalTokens?: number;
  totalCost?: number;
  durationMs?: number;
}

export interface PlanTask {
  id: string;
  description: string;
  status: TaskStatus;
  steps: PlanStep[];
  dependsOn: string[];
  profile?: string;
  requiredTools: string[];
  estimatedTokens?: number;
  result?: TaskResult;
  startedAt?: string;
  completedAt?: string;
}

export interface PlanContext {
  cwd?: string;
  activeProfile?: string;
  avatar?: string;
  env?: Record<string, string>;
  gitBranch?: string;
}

export interface PlanResult {
  success: boolean;
  summary?: string;
  totalTokens: number;
  totalCost: number;
  durationMs: number;
  tasksCompleted: number;
  tasksTotal: number;
}

/**
 * v0.5.13+: Plan execution event. Mirrors `core/plan.ts` `PlanEvent`.
 *
 * Lives in `~/.pilot/plans-history/<plan-id>_<timestamp>.jsonl`.
 * Each lifecycle transition (created / started / paused / ...) and
 * each task/step transition appends one event.
 */
export type PlanEventType =
  | "plan_created"
  | "plan_started"
  | "plan_paused"
  | "plan_resumed"
  | "plan_completed"
  | "plan_failed"
  | "plan_cancelled"
  | "plan_deleted"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "task_skipped"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "waiting_human";

export interface PlanEvent {
  timestamp: string;
  planId: string;
  type: PlanEventType;
  data: Record<string, unknown>;
}

export interface Plan {
  id: string;
  goal: string;
  title?: string;
  status: PlanStatus;
  strategy: PlanStrategy;
  tasks: PlanTask[];
  context: PlanContext;
  result?: PlanResult;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Tool / profile suggestion returned by `POST /plans/suggest-tools`.
 * Mirrors core/plan.ts `ToolSuggestion`.
 */
export interface PlanToolSuggestion {
  goal: string;
  matchedTools: Array<{
    name: string;
    source: string;
    safety: string;
    reason: string;
  }>;
  matchedProfiles: Array<{
    name: string;
    model?: string;
    packages?: string[];
    reason: string;
  }>;
}
