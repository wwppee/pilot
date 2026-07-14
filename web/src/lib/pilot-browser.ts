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
  SessionInfoSummary,
  SessionTree,
  Avatar,
  AvatarCurrent,
  AvatarDiff,
  ForgeInspectResult,
  Profile,
  Capability,
  CapabilityDiff,
  AvatarApplyReport,
  ToolInventoryItem,
  ProjectContextRef,
  ToolPolicy,
  ToolPolicyInput,
  PolicyDecision,
  ComposeCatalog,
  ComposeEntityDetail,
  ComposeEntityKind,
  ComposeState,
  BoardInput,
  BoardSummary,
  Plan,
  PlanToolSuggestion,
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

  // v0.5.3: per-session summary card.
  sessionInfo: async (id: string): Promise<SessionInfoSummary | null> => {
    try {
      return await browserFetch<SessionInfoSummary>(
        `/sessions/${encodeName(id)}/info`,
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

  // v0.5.1: Capability diff — browser-safe variant.
  capabilityDiff: async (
    aId: string,
    bId: string,
  ): Promise<CapabilityDiff | null> => {
    try {
      return await browserFetch<CapabilityDiff>(
        `/capabilities/${encodeName(aId)}/diff/${encodeName(bId)}`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.5.2: apply an Avatar — browser-safe variant.
  applyAvatar: async (
    encodedCwd: string,
    opts?: { dry?: boolean },
  ): Promise<AvatarApplyReport | null> => {
    try {
      const qs = opts?.dry ? "?dry=1" : "";
      return await browserFetch<AvatarApplyReport>(
        `/avatars/${encodeName(encodedCwd)}/apply${qs}`,
        { method: "POST" },
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
  // v0.6.5: per-entity full detail for the inspector. Returns
  // `null` (not throws) on 404 so the UI can render "stale" without
  // try/catch noise around every render.
  composeEntityDetail: async (
    kind: ComposeEntityKind,
    id: string,
  ): Promise<ComposeEntityDetail | null> => {
    try {
      return await browserFetch<ComposeEntityDetail>(
        `/compose/catalog/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // ─── Compose boards (v0.6.10) ─────────────────────────
  // Server-persisted /compose layouts. The localStorage
  // canonical editor calls these for "Save to server" /
  // "Load from server" — the dedicated /compose/boards
  // list page (with multi-board delete + rename) lands in v0.6.12.
  composeBoards: () => browserFetch<BoardSummary[]>("/compose/boards"),
  composeBoard: async (id: string): Promise<ComposeState | null> => {
    try {
      return await browserFetch<ComposeState>(`/compose/boards/${id}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  // v0.6.11: signature now takes a `BoardInput` (the actual
  // server contract) instead of the full `ComposeState`. The
  // old signature shipped `updatedAt` (which the server always
  // overwrites) and would have shipped any future state fields
  // — making the wire contract wider than the schema intends.
  saveComposeBoard: (id: string, input: BoardInput) =>
    // Server returns a `BoardSummary` (id + name + updatedAt +
    // createdAt). We only need `id` on the client — the input
    // is already in our React tree, so we don't ask the server
    // to echo it back.
    browserFetch<BoardSummary>(`/compose/boards/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  // v0.6.12: dedicated rename endpoint. Server validates the
  // name shape (string, non-empty after trim, ≤200 chars) and
  // returns 400 / 404 / 200 the same way as the other routes.
  // We forward the error through `browserFetch` so the caller
  // can distinguish "bad input" from "missing board".
  renameComposeBoard: async (
    id: string,
    name: string,
  ): Promise<BoardSummary> => {
    return await browserFetch<BoardSummary>(`/compose/boards/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },
  deleteComposeBoard: async (id: string): Promise<boolean> => {
    try {
      await browserFetch<void>(`/compose/boards/${id}`, { method: "DELETE" });
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return false;
      throw e;
    }
  },

  // ─── Plans (v0.5.7+) ──────────────────────────────────
  plans: () => browserFetch<Plan[]>("/plans"),
  plan: async (id: string): Promise<Plan | null> => {
    try {
      return await browserFetch<Plan>(`/plans/${encodeName(id)}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  suggestTools: (goal: string) =>
    browserFetch<PlanToolSuggestion>("/plans/suggest-tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal }),
    }),
};

/** Convenience alias: most client code can do `import { api as ... }`. */
export const api = browserApi;

/** Re-export for callers that want to be explicit about which error. */
export { PilotBrowserError as PilotApiError };
