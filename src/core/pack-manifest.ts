/**
 * Pack manifest — read the `pi` field from a package's package.json.
 *
 * Pi packages declare what they provide via a `pi` field in package.json.
 * Reading that field is the only way to know for sure what a pack is — name
 * heuristics (e.g. "ends with -skill") misclassify too often.
 *
 * Example manifest:
 *   {
 *     "name": "pi-subagents",
 *     "version": "0.31.0",
 *     "pi": {
 *       "kind": "extension",
 *       "extension": "dist/index.js",
 *       "commands": ["delegate", "subagent-list"]
 *     }
 *   }
 *
 * v0.3.0-d: replaces the keyword-based classifyKind() in service-impl.
 *
 * See: docs/forge-and-avatars.md §2 (capability model context).
 */

import { z } from "zod";

const REGISTRY = "https://registry.npmjs.org";

// ─── Zod schemas ──────────────────────────────────────────────

export const PackKindInManifest = z.enum([
  "extension",
  "skill",
  "theme",
  "prompt",
]);
export type PackKindInManifest = z.infer<typeof PackKindInManifest>;

/** The `pi` sub-object inside a package's package.json. */
export const PackManifestPiSchema = z
  .object({
    /** Primary classification. When present, this is the source of truth. */
    kind: PackKindInManifest.optional(),
    /** Path(s) to the extension entry point(s). */
    extension: z.union([z.string(), z.array(z.string())]).optional(),
    skills: z.array(z.string()).optional(),
    prompts: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    keybindings: z.array(z.string()).optional(),
  })
  .optional();

export const PackManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  pi: PackManifestPiSchema,
});

export type PackManifest = z.infer<typeof PackManifestSchema>;
export type PackManifestPi = z.infer<typeof PackManifestPiSchema>;

// ─── Read ──────────────────────────────────────────────────

interface NpmVersionEntry {
  name?: string;
  version?: string;
  description?: string;
  pi?: unknown;
}
interface NpmPackageResponse {
  name: string;
  "dist-tags": { latest: string };
  description?: string;
  versions: Record<string, NpmVersionEntry>;
  /** Some legacy packages flatten `pi` to the top level. Tolerated. */
  pi?: unknown;
}

/**
 * Read a package's manifest from the npm registry.
 * Returns null if the package doesn't exist (404).
 *
 * The real package.json fields (including custom fields like `pi`) live
 * under `versions[latest]`, not at the response top level. The top-level
 * `pi` is included as a fallback for any package that published with it
 * at the root, but `versions[latest].pi` wins when present.
 */
export async function readPackManifest(
  name: string,
): Promise<PackManifest | null> {
  const url = `${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`registry request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as NpmPackageResponse;

  const latest = json["dist-tags"].latest;
  const v = json.versions[latest];
  if (!v) {
    throw new Error(`registry returned no version ${latest} for ${name}`);
  }

  // versions[latest] is canonical; fall back to top-level for legacy
  // packages that published `pi` flat.
  const pi = v.pi ?? json.pi;
  const description = v.description ?? json.description;

  return PackManifestSchema.parse({
    name: v.name ?? json.name,
    version: latest,
    description,
    pi,
  });
}

// ─── In-memory cache ──────────────────────────────────────

/**
 * Per-process cache. Avoids re-fetching the same manifest when listPacks
 * is called repeatedly. Reset on process restart.
 */
const cache = new Map<string, PackManifest | null>();

/** Read a manifest, caching the result. Cache hits are sync after the first call. */
export async function readPackManifestCached(
  name: string,
): Promise<PackManifest | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  const m = await readPackManifest(name);
  cache.set(name, m);
  return m;
}

/** Clear the in-memory cache. Useful in tests. */
export function clearManifestCache(): void {
  cache.clear();
}

// ─── Classification ────────────────────────────────────────

import type { PackKind } from "./types.js";

/**
 * Classify a pack using its manifest, with a graceful fallback.
 *
 * Priority:
 *   1. manifest.pi.kind (authoritative)
 *   2. manifest artifacts (themes → theme, prompts → prompt, etc.)
 *   3. name heuristic (last resort)
 */
export function classifyFromManifest(
  manifest: PackManifest | null,
  fallbackName: string,
): PackKind {
  if (manifest?.pi?.kind) return manifest.pi.kind;

  if (manifest?.pi) {
    if (manifest.pi.themes && manifest.pi.themes.length > 0) return "theme";
    if (manifest.pi.prompts && manifest.pi.prompts.length > 0) return "prompt";
    if (manifest.pi.skills && manifest.pi.skills.length > 0) return "skill";
    if (manifest.pi.extension !== undefined) return "extension";
  }

  return classifyByName(fallbackName);
}

/**
 * Last-resort classification by package name. Used only when the
 * manifest has no `pi` field (legacy packages).
 */
export function classifyByName(name: string): PackKind {
  const lower = name.toLowerCase();
  if (
    lower.includes("-skill") ||
    lower.includes("skill-") ||
    lower.includes("superpowers") ||
    lower.includes("memory")
  )
    return "skill";
  if (
    lower.includes("-theme") ||
    lower.includes("theme-") ||
    lower.includes("footer") ||
    lower.includes("hud")
  )
    return "theme";
  if (lower.includes("-prompt") || lower.includes("prompt-")) return "prompt";
  if (lower.endsWith("-prompt") || lower.endsWith("-theme")) return "prompt";
  return "extension";
}
