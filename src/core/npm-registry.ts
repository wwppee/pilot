/**
 * npm registry client.
 *
 * We use the npm registry API directly (no npm CLI dependency):
 *   - GET https://registry.npmjs.org/-/v1/search?text=...&size=20  (search)
 *   - GET https://registry.npmjs.org/{pkg}                          (details)
 *
 * No auth — the public registry is read-only for our needs.
 */

import type { Pack } from "./types.js";

const REGISTRY = "https://registry.npmjs.org";
const SEARCH = `${REGISTRY}/-/v1/search`;

export interface SearchOptions {
  /** Search query (e.g. "subagent"). */
  query: string;
  /** Max results to return. Default 20. */
  size?: number;
  /** From offset (for pagination). Default 0. */
  from?: number;
}

interface NpmSearchResponse {
  total: number;
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      date?: string;
      links?: { npm?: string };
      publisher?: { username?: string };
    };
    score?: { final?: number };
  }>;
}

interface NpmPackageResponse {
  name: string;
  "dist-tags": { latest: string };
  description?: string;
  keywords?: string[];
  time?: Record<string, string>;
  maintainers?: Array<{ name: string }>;
  repository?: { url?: string } | string;
}

/**
 * Search the npm registry.
 *
 * @returns Up to `size` matching packs, sorted by npm's relevance score.
 */
export async function searchPacks(opts: SearchOptions): Promise<Pack[]> {
  const size = opts.size ?? 20;
  const from = opts.from ?? 0;
  const url = `${SEARCH}?text=${encodeURIComponent(opts.query)}&size=${size}&from=${from}`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`npm search failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as NpmSearchResponse;

  return json.objects.map((o) => ({
    name: o.package.name,
    version: o.package.version,
    description: o.package.description ?? "",
    ...(o.package.publisher?.username !== undefined
      ? { author: o.package.publisher.username }
      : {}),
    ...(o.package.date !== undefined ? { lastPublished: o.package.date } : {}),
    ...(o.package.keywords !== undefined
      ? { keywords: o.package.keywords }
      : {}),
    ...(o.package.links?.npm !== undefined
      ? { repository: o.package.links.npm }
      : {}),
  }));
}

/**
 * Fetch full metadata for a single npm package.
 *
 * Returns null if the package doesn't exist (404).
 */
export async function getPack(name: string): Promise<Pack | null> {
  const url = `${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`npm get failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as NpmPackageResponse;
  const repoUrl =
    typeof json.repository === "string"
      ? json.repository
      : json.repository?.url;

  return {
    name: json.name,
    version: json["dist-tags"].latest,
    description: json.description ?? "",
    ...(json.maintainers?.[0]?.name !== undefined
      ? { author: json.maintainers[0].name }
      : {}),
    ...(json.keywords !== undefined ? { keywords: json.keywords } : {}),
    ...(json.time?.["1.0.0"] !== undefined
      ? {
          lastPublished:
            json.time[json["dist-tags"].latest] ?? json.time["1.0.0"],
        }
      : {}),
    ...(repoUrl !== undefined ? { repository: repoUrl } : {}),
  };
}
