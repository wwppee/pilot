/**
 * Cross-entity listing for the Compose sidebar.
 *
 * v0.4.4: enumerates every Pilot entity so the Compose sidebar can
 * show "drag from here to canvas". Returns a unified shape:
 *
 *   {
 *     kind: "session" | "pack" | "profile" | "policy" | "capability",
 *     id: string,         // stable identifier within kind
 *     label: string,      // human-readable name
 *     sublabel?: string,  // secondary info (model, version, etc.)
 *     href?: string,      // link to the dedicated page
 *   }
 *
 * This is a *read-only* enumeration. Compose itself stores block
 * positions on the client (localStorage + JSON export/import).
 *
 * v0.4.4: implemented as a thin wrapper over `PilotService` so we
 * never duplicate logic (session headers, profile TOML parsing,
 * policy validation, capability loading). Service is the single API
 * surface.
 */

import type { InstalledPack, SessionInfo } from "./types.js";
import type { Profile } from "./profile.js";
import type { ToolPolicy } from "./policy.js";
import type { Capability } from "./capability.js";

/**
 * Minimal data-source surface for compose-listing. Avoids the
 * circular `PilotService` import (compose-listing → service → …).
 * Pass only the methods we need; everything else stays out.
 */
export interface ComposeDataSource {
  listSessions(): Promise<SessionInfo[]>;
  listPacks(): Promise<InstalledPack[]>;
  listProfiles(): Promise<Profile[]>;
  listPolicies(): Promise<ToolPolicy[]>;
  listCapabilities(): Promise<Capability[]>;
}

export type ComposeEntityKind =
  | "session"
  | "pack"
  | "profile"
  | "policy"
  | "capability";

export interface ComposeEntity {
  kind: ComposeEntityKind;
  /** Stable ID (within kind). For sessions, the encoded cwd; for
   *  packs, the npm package name; etc. */
  id: string;
  /** Display label. */
  label: string;
  /** One-line secondary info (model, version, status). */
  sublabel?: string;
  /** Optional link to the dedicated detail page. */
  href?: string;
}

/** All compose-eligible entities, across every Pilot data store. */
export interface ComposeCatalog {
  sessions: ComposeEntity[];
  packs: ComposeEntity[];
  profiles: ComposeEntity[];
  policies: ComposeEntity[];
  capabilities: ComposeEntity[];
  totalCount: number;
  /** ISO timestamp of when this was generated. */
  generatedAt: string;
}

/**
 * Enumerate every Pilot entity, going through PilotService so we
 * share the same code paths as the rest of the app.
 *
 * For v0.4.4 we cap sessions at 50 (most-recent) to keep the
 * sidebar responsive. The full list is still discoverable via the
 * dedicated /sessions page.
 */
export async function listComposeEntities(
  source: ComposeDataSource,
): Promise<ComposeCatalog> {
  const [sessions, packs, profiles, policies, capabilities] = await Promise.all(
    [
      source.listSessions().then((all) => all.slice(0, 50)),
      source.listPacks(),
      source.listProfiles(),
      source.listPolicies(),
      source.listCapabilities(),
    ],
  );

  return {
    sessions: sessions.map(toSessionEntity),
    packs: packs.map(toPackEntity),
    profiles: profiles.map(toProfileEntity),
    policies: policies.map(toPolicyEntity),
    capabilities: capabilities.map(toCapabilityEntity),
    totalCount:
      sessions.length +
      packs.length +
      profiles.length +
      policies.length +
      capabilities.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * v0.6.5: per-entity full-detail view. The catalog is a thin index
 * (id/label/sublabel/href) for the sidebar; this returns the
 * real fields so the inspector can render the entity the way
 * the dedicated detail page does — without forcing a navigation.
 *
 * Returned shape is a discriminated union by `kind` so the UI
 * can switch on `detail.kind` and read the right field set
 * without a runtime guard.
 *
 * Returns `null` when the entity is not found, or when the kind
 * is unknown. The HTTP layer maps `null` → 404.
 */
export type ComposeEntityDetail =
  | {
      kind: "session";
      /** Pretty cwd (decoded from the id-encoded form). */
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
      version?: string;
      description?: string;
      homepage?: string;
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

/**
 * Read the full detail of a single compose entity. Reuses the
 * same data sources as `listComposeEntities` so the per-entity
 * shape stays consistent with the catalog index.
 *
 * `listSessions` is the only list-and-filter path because there
 * is no per-id SessionInfo getter in PilotService today (sessions
 * live in JSONL files keyed by encoded cwd).
 */
export async function getComposeEntityDetail(
  source: ComposeDataSource,
  kind: ComposeEntityKind,
  id: string,
): Promise<ComposeEntityDetail | null> {
  switch (kind) {
    case "session": {
      const all = await source.listSessions();
      const s = all.find((x) => x.id === id);
      if (!s) return null;
      return {
        kind: "session",
        ...(s.cwd ? { cwd: s.cwd } : {}),
        ...(s.model ? { model: s.model } : {}),
        entries: s.entries,
        sizeBytes: s.sizeBytes,
        ...(s.lastUsedAt ? { lastUsedAt: s.lastUsedAt } : {}),
        ...(s.startedAt ? { startedAt: s.startedAt } : {}),
        ...(s.firstUserPreview ? { firstUserPreview: s.firstUserPreview } : {}),
      };
    }
    case "pack": {
      const all = await source.listPacks();
      const p = all.find((x) => x.name === id);
      if (!p) return null;
      return {
        kind: "pack",
        name: p.name,
        source: p.source,
        enabled: p.enabled,
        packKind: p.kind,
      };
    }
    case "profile": {
      const all = await source.listProfiles();
      const p = all.find((x) => x.name === id);
      if (!p) return null;
      return {
        kind: "profile",
        name: p.name,
        ...(p.model ? { model: p.model } : {}),
        ...(p.provider ? { provider: p.provider } : {}),
        ...(p.thinking ? { thinking: p.thinking } : {}),
        packages: p.packages ?? [],
        ...(p.description ? { description: p.description } : {}),
        ...(p.notes ? { notes: p.notes } : {}),
        ...(p.team ? { team: p.team } : {}),
      };
    }
    case "policy": {
      const all = await source.listPolicies();
      const p = all.find((x) => x.name === id);
      if (!p) return null;
      return {
        kind: "policy",
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        allow: p.allow,
        deny: p.deny,
        denyPaths: p.denyPaths,
        denyCommands: p.denyCommands,
        sensitivePatterns: p.sensitivePatterns,
        requireApproval: p.requireApproval,
      };
    }
    case "capability": {
      const all = await source.listCapabilities();
      const c = all.find((x) => x.id === id);
      if (!c) return null;
      return {
        kind: "capability",
        id: c.id,
        ...(c.title ? { title: c.title } : {}),
        ...(c.type ? { type: c.type } : {}),
        ...(c.description ? { description: c.description } : {}),
        sources: c.sources.map((s) => ({ type: s.type, ref: s.ref })),
        conflicts: c.compatibility?.conflicts ?? [],
        requires: c.compatibility?.requires ?? [],
      };
    }
  }
}

// ─── Conversions ──────────────────────────────────────────────

function toSessionEntity(s: SessionInfo): ComposeEntity {
  return {
    kind: "session",
    id: s.id,
    label: titleFromId(s.id),
    ...(s.model ? { sublabel: s.model } : {}),
    href: `/sessions/${encode(s.id)}`,
  };
}

function toPackEntity(p: InstalledPack): ComposeEntity {
  const sub = p.enabled ? (p.kind ?? "pack") : `${p.kind ?? "pack"} (off)`;
  return {
    kind: "pack",
    id: p.name,
    label: p.name,
    sublabel: sub,
    href: `/packages/${encode(p.name)}`,
  };
}

function toProfileEntity(p: Profile): ComposeEntity {
  const modelCount = p.model ? 1 : 0;
  return {
    kind: "profile",
    id: p.name,
    label: p.name,
    sublabel: modelCount > 0 ? (p.model ?? "1 model") : "no model",
    href: `/profiles/${encode(p.name)}`,
  };
}

function toPolicyEntity(p: ToolPolicy): ComposeEntity {
  return {
    kind: "policy",
    id: p.name,
    label: p.name,
    sublabel: countRules(p),
    href: `/policy`,
  };
}

function toCapabilityEntity(c: Capability): ComposeEntity {
  return {
    kind: "capability",
    id: c.id,
    label: c.title ?? c.id,
    sublabel: c.type,
    href: `/capabilities/${encode(c.id)}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Convert a session id like `--Users-feng-code-pilot--` into a
 * readable title like `code/pilot`.
 */
function titleFromId(id: string): string {
  const stripped = id.replace(/^-+/, "").replace(/-+$/, "");
  const parts = stripped
    .split("--")
    .filter(Boolean)
    .map((seg) => seg.replace(/^-+/, "").replace(/-+$/, ""));
  return parts.join("/") || id;
}

/**
 * Count total rules in a policy for the sublabel.
 */
function countRules(p: {
  allow: string[];
  deny: string[];
  denyPaths: string[];
  denyCommands: string[];
  sensitivePatterns: string[];
  requireApproval: string[];
}): string {
  const n =
    p.allow.length +
    p.deny.length +
    p.denyPaths.length +
    p.denyCommands.length +
    p.sensitivePatterns.length +
    p.requireApproval.length;
  return `${n} rule${n === 1 ? "" : "s"}`;
}

/** URL-encode, preserving `/` so paths read naturally. */
function encode(s: string): string {
  return encodeURIComponent(s).replace(/%2F/g, "/");
}
