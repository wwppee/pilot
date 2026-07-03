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
