/**
 * Shared types for Pilot.
 *
 * These are the cross-cutting types used across core modules and commands.
 * Command-specific types live next to their command file.
 */

// ─── Path constants ────────────────────────────────────────────────

/** Absolute path to `~/.pi/agent/` — Pilot treats this as the source of truth. */
export const PI_AGENT_DIR = `${process.env.HOME}/.pi/agent`;

/** Absolute path to the user's global settings.json. */
export const PI_SETTINGS_FILE = `${PI_AGENT_DIR}/settings.json`;

/** Absolute path to the user's global models.json. */
export const PI_MODELS_FILE = `${PI_AGENT_DIR}/models.json`;

/** Absolute path to the session storage directory. */
export const PI_SESSIONS_DIR = `${PI_AGENT_DIR}/sessions`;

// ─── Pilot-owned paths (v0.2+) ────────────────────────────────────
//
// These are Pilot's own directories — they live in `~/.pilot/`,
// completely separate from `~/.pi/agent/`. Pi never reads from these.
// Functions instead of constants so tests can pass a custom home dir.

/** Absolute path to `~/.pilot/` — Pilot's own config/data directory. */
export function pilotDir(home: string = process.env.HOME ?? ''): string {
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
 * Schema of `~/.pi/agent/settings.json`.
 * Kept loose intentionally — we only model the fields Pilot needs.
 */
export interface PiSettings {
  /** List of installed extension sources. */
  sources?: Array<{
    /** The source specifier (e.g. `npm:pi-subagents`, `git:github.com/...`). */
    source: string;
    /** Whether the source is currently enabled. */
    enabled?: boolean;
  }>;
  /** Other settings fields we don't model — kept as-is. */
  [key: string]: unknown;
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
export type PackKind = 'extension' | 'skill' | 'theme' | 'prompt' | 'unknown';

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

/** A single entry in a JSONL session file. */
export interface SessionEntry {
  id: string;
  parentId?: string;
  type: 'user' | 'assistant' | 'tool' | 'system';
  timestamp?: string;
  /** Entry-specific data. Shape varies by type. */
  data?: unknown;
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
}

// ─── Command runtime ────────────────────────────────────────────────

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