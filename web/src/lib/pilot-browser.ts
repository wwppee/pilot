/**
 * Browser-safe API client for the pilot server.
 *
 * v0.4.7: extracted from `pilot.ts` so client components can import
 * the typed API without dragging in `node:fs/promises` (which
 * Turbopack rejects in client bundles).
 *
 * Routes requests through the Next.js `/api/pilot/*` rewrite, so:
 *   1. Same-origin (no CORS)
 *   2. The pilot token is added server-side by the Next.js fetch
 *      handler — the browser never sees it
 *
 * Why a separate file?
 *   - `pilot.ts` uses `node:fs/promises` to read `~/.pilot/server.token`
 *   - Server Components and route handlers can use it
 *   - Client Components cannot (Turbopack build error)
 *
 * Usage:
 *   - Server components / route handlers: `import { api } from '@/lib/pilot'`
 *   - Client components ("use client"): `import { browserApi as api } from '@/lib/pilot-browser'`
 */

import type {
  StatsReport,
  StatsRange,
  UsageRange,
  UsageReport,
  Pack,
  SessionInfo,
  SessionSnapshot,
  SessionTemplate,
  SessionTree,
  Avatar,
  AvatarCurrent,
  AvatarDiff,
  ForgeInspectResult,
  Profile,
  Capability,
  ToolInventoryItem,
  ProjectContextRef,
  ToolPolicy,
  ToolPolicyInput,
  PolicyDecision,
  ComposeCatalog,
} from "./types.js";

/** All browser requests go through this Next.js rewrite. */
const PROXY_BASE = "/api/pilot";

export class PilotBrowserError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PilotBrowserError";
  }
}

async function browserFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${PROXY_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new PilotBrowserError(text || res.statusText, res.status);
  }
  return (await res.json()) as T;
}

function encodeName(name: string): string {
  // Browser paths go through a same-origin proxy, so we can leave
  // @ unescaped (it's a valid path character in URL). This keeps the
  // URL readable in dev tools.
  return encodeURIComponent(name);
}

/**
 * Browser-safe subset of the pilot API. Same shape as the server-side
 * `api` in `pilot.ts`, but routes through the Next.js rewrite proxy.
 */
export const browserApi = {
  health: () =>
    browserFetch<{ ok: true; version: string; uptimeSec: number }>("/health"),

  packs: () => browserFetch<Pack[]>("/packs"),
  packInfo: (name: string) =>
    browserFetch<Pack>(`/packs/info/${encodeName(name)}`),
  packUninstall: (name: string) =>
    browserFetch<unknown>(`/packs/uninstall`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  sessions: () => browserFetch<SessionInfo[]>("/sessions"),
  sessionTree: (id: string) =>
    browserFetch<SessionTree>(`/sessions/${encodeName(id)}/tree`),
  // v0.4.13: same shape as server-side helper; 404 maps to null.
  sessionSnapshot: async (id: string): Promise<SessionSnapshot | null> => {
    try {
      return await browserFetch<SessionSnapshot>(
        `/sessions/${encodeName(id)}/snapshot`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  sessionTemplate: async (id: string): Promise<SessionTemplate | null> => {
    try {
      return await browserFetch<SessionTemplate>(
        `/sessions/${encodeName(id)}/template`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.4.14: Web forge entrypoint (browser-safe variant).
  forgeSearch: (query: string) =>
    browserFetch<Pack[]>(`/forge/search?q=${encodeURIComponent(query)}`),
  forgeInspect: async (name: string): Promise<ForgeInspectResult | null> => {
    try {
      return await browserFetch<ForgeInspectResult>(
        `/forge/inspect/${encodeName(name)}`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.5.0: Avatar CRUD — browser-safe variant.
  avatars: () => browserFetch<Avatar[]>("/avatars"),
  avatarCurrent: () => browserFetch<AvatarCurrent>("/avatars/current"),
  avatar: async (encodedCwd: string): Promise<Avatar | null> => {
    try {
      return await browserFetch<Avatar>(`/avatars/${encodeName(encodedCwd)}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  avatarDiff: async (encodedCwd: string): Promise<AvatarDiff | null> => {
    try {
      return await browserFetch<AvatarDiff>(
        `/avatars/${encodeName(encodedCwd)}/diff`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  stats: (range: StatsRange, days?: number) => {
    const params = new URLSearchParams({ range: range.kind });
    if (days) params.set("days", String(days));
    return browserFetch<StatsReport>(`/stats?${params}`);
  },

  usage: (range: UsageRange, days?: number) => {
    const params = new URLSearchParams({ range: range.kind });
    if (days) params.set("days", String(days));
    return browserFetch<UsageReport>(`/usage?${params}`);
  },

  tools: () => browserFetch<ToolInventoryItem[]>("/tools"),

  context: (cwd?: string) => {
    const params = new URLSearchParams();
    if (cwd) params.set("cwd", cwd);
    return browserFetch<ProjectContextRef[]>(`/context?${params}`);
  },

  profiles: () => browserFetch<Profile[]>("/profiles"),
  profile: (name: string) =>
    browserFetch<Profile>(`/profiles/${encodeName(name)}`),
  // v0.4.12: active profile pointer — "管了就能用" path closer
  activeProfile: () =>
    browserFetch<{ name: string; activatedAt: string; source: string } | null>(
      "/profiles/active",
    ),
  activateProfile: (name: string) =>
    browserFetch<{ name: string; activatedAt: string; source: string }>(
      `/profiles/${encodeName(name)}/activate`,
      { method: "POST" },
    ),
  clearActiveProfile: () =>
    browserFetch<{ ok: true }>("/profiles/active", { method: "DELETE" }),

  listCapabilities: () => browserFetch<Capability[]>("/capabilities"),
  getCapability: (id: string) =>
    browserFetch<Capability>(`/capabilities/${encodeName(id)}`),

  // ─── Policies (v0.4.3+) ────────────────────────────────────
  policies: () => browserFetch<ToolPolicy[]>("/policies"),
  policy: (name: string) =>
    browserFetch<ToolPolicy>(`/policies/${encodeName(name)}`),
  setPolicy: (name: string, input: ToolPolicyInput) =>
    browserFetch<ToolPolicy>(`/policies/${encodeName(name)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deletePolicy: (name: string) =>
    browserFetch<{ removed: boolean }>(`/policies/${encodeName(name)}`, {
      method: "DELETE",
    }),
  applyPolicy: (name: string) =>
    browserFetch<{ path: string }>(`/policies/${encodeName(name)}/apply`, {
      method: "POST",
    }),
  unapplyPolicy: (name: string) =>
    browserFetch<{ removed: boolean }>(
      `/policies/${encodeName(name)}/unapply`,
      { method: "POST" },
    ),
  checkPolicy: (
    name: string,
    tool: string,
    args: Record<string, unknown> = {},
  ) =>
    browserFetch<{ policy: ToolPolicy; decision: PolicyDecision }>(
      `/policies/${encodeName(name)}/check`,
      {
        method: "POST",
        body: JSON.stringify({ tool, args }),
      },
    ),

  composeCatalog: () => browserFetch<ComposeCatalog>("/compose/catalog"),
};

/** Convenience alias: most client code can do `import { api as ... }`. */
export const api = browserApi;

/** Re-export for callers that want to be explicit about which error. */
export { PilotBrowserError as PilotApiError };
