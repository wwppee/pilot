/**
 * Server-side helpers for talking to the pilot server.
 *
 * These run inside Next.js route handlers / Server Components.
 * The pilot token is injected here (read from env or the token file)
 * so it never reaches the browser.
 *
 * All public helpers throw a typed `PilotApiError` on non-2xx,
 * so React server components and route handlers can `.catch()` cleanly.
 *
 * Browser-safe variant: `browserApi` in `./pilot-browser.ts` uses the
 * Next.js /api/pilot/* rewrite proxy so the token stays server-side.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PILOT_BASE = process.env["PILOT_SERVER_URL"] ?? "http://127.0.0.1:17361";

export class PilotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PilotApiError";
  }
}

/**
 * Resolve the pilot token file path. Reads HOME at call time so tests
 * can override `process.env.HOME` between assertions.
 */
function tokenFilePath(): string {
  // Prefer HOME env (tests use it); fall back to Node's homedir().
  const home = process.env["HOME"] ?? homedir();
  return join(home, ".pilot", "server.token");
}

/** Read the pilot token from env or fall back to the on-disk token file. */
async function getToken(): Promise<string | null> {
  const env = process.env["PILOT_TOKEN"];
  if (env) return env;
  try {
    const buf = await readFile(tokenFilePath(), "utf-8");
    return buf.trim();
  } catch {
    return null;
  }
}

/** Fetch a pilot endpoint, injecting the token. */
export async function pilot<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const url = `${PILOT_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("x-pilot-token", token);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new PilotApiError(text || res.statusText, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Fetch a pilot endpoint with full access to the response (so callers
 * can read Set-Cookie + CSRF headers for write operations).
 *
 * Same as `pilot()` but returns the raw Response.
 */
export async function pilotRaw(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  const url = `${PILOT_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("x-pilot-token", token);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...init, headers, cache: "no-store" });
}

/**
 * Fetch with CSRF — does a cheap GET first to capture the CSRF
 * cookie + token, then issues the actual mutating request with both
 * forwarded. Used by Server Actions for install / profile-write.
 *
 * The CSRF token is stable for the lifetime of the pilot server, but
 * we re-fetch on every call to be robust to server restarts.
 */
export async function pilotWithCsrf(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // Step 1: GET to capture the CSRF cookie + token. Use the same
  // path if it's a GET, or hit /health for the bare minimum.
  const csrfGet = await pilotRaw("/health");
  // Drain the body so the socket can be reused.
  await csrfGet.text();

  const cookieHeader = csrfGet.headers.get("set-cookie");
  const csrfToken = csrfGet.headers.get("x-pilot-csrf");
  if (!csrfToken) {
    throw new PilotApiError("pilot server did not return a CSRF token", 0);
  }

  // Step 2: actual mutating request with cookie + header forwarded.
  const headers = new Headers(init.headers);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  headers.set("x-pilot-csrf", csrfToken);
  return pilotRaw(path, { ...init, headers });
}

// ─── Typed accessors —───────────────────────────────────────────────

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
  Profile,
  ActiveProfile,
  Capability,
  CapabilityDiff,
  Avatar,
  AvatarCurrent,
  AvatarDiff,
  ForgeInspectResult,
  ToolInventoryItem,
  ProjectContextRef,
  ToolPolicy,
  ToolPolicyInput,
  PolicyDecision,
  ComposeCatalog,
} from "./types.js";

export const api = {
  health: () =>
    pilot<{ ok: true; version: string; uptimeSec: number }>("/health"),

  packs: () => pilot<Pack[]>("/packs"),
  packInfo: (name: string) => pilot<Pack>(`/packs/info/${encodeName(name)}`),
  packSearch: (q: string) =>
    pilot<Pack[]>(`/packs/search?q=${encodeURIComponent(q)}`),
  packInstall: (name: string) =>
    pilot<unknown>(`/packs/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: `npm:${name}` }),
    }),
  packUninstall: (name: string) =>
    pilot<unknown>(`/packs/uninstall`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  sessions: () => pilot<SessionInfo[]>("/sessions"),
  sessionTree: (id: string) =>
    pilot<SessionTree>(`/sessions/${encodeName(id)}/tree`),
  // v0.4.13: server returns 404 if session file is gone; surface as
  // null so the Web UI can render an empty-state instead of an error.
  sessionSnapshot: async (id: string): Promise<SessionSnapshot | null> => {
    try {
      return await pilot<SessionSnapshot>(
        `/sessions/${encodeName(id)}/snapshot`,
      );
    } catch (e) {
      // 404 → null. Anything else → rethrow so the page surfaces the error.
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  sessionTemplate: async (id: string): Promise<SessionTemplate | null> => {
    try {
      return await pilot<SessionTemplate>(
        `/sessions/${encodeName(id)}/template`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.4.14: Web forge entrypoint.
  forgeSearch: (query: string) =>
    pilot<Pack[]>(`/forge/search?q=${encodeURIComponent(query)}`),
  forgeInspect: async (name: string): Promise<ForgeInspectResult | null> => {
    try {
      return await pilot<ForgeInspectResult>(
        `/forge/inspect/${encodeName(name)}`,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.5.0: Avatar CRUD — project-level expected config.
  avatars: () => pilot<Avatar[]>("/avatars"),
  avatarCurrent: () => pilot<AvatarCurrent>("/avatars/current"),
  avatar: async (encodedCwd: string): Promise<Avatar | null> => {
    try {
      return await pilot<Avatar>(`/avatars/${encodeName(encodedCwd)}`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },
  avatarDiff: async (encodedCwd: string): Promise<AvatarDiff | null> => {
    try {
      return await pilot<AvatarDiff>(`/avatars/${encodeName(encodedCwd)}/diff`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      throw e;
    }
  },

  // v0.5.1: Capability diff — compare two absorbed capabilities by id.
  capabilityDiff: async (
    aId: string,
    bId: string,
  ): Promise<CapabilityDiff | null> => {
    try {
      return await pilot<CapabilityDiff>(
        `/capabilities/${encodeName(aId)}/diff/${encodeName(bId)}`,
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
    return pilot<StatsReport>(`/stats?${params}`);
  },

  // ─── Usage (v0.4.2+) ─────────────────────────────────────
  usage: (range: UsageRange, days?: number) => {
    const params = new URLSearchParams({ range: range.kind });
    if (days) params.set("days", String(days));
    return pilot<UsageReport>(`/usage?${params}`);
  },

  // ─── Tools (v0.4.2+) ─────────────────────────────────────
  tools: () => pilot<ToolInventoryItem[]>("/tools"),

  // ─── Project context (v0.4.2+) ───────────────────────────
  context: (cwd?: string) => {
    const params = new URLSearchParams();
    if (cwd) params.set("cwd", cwd);
    return pilot<ProjectContextRef[]>(`/context?${params}`);
  },

  profiles: () => pilot<Profile[]>("/profiles"),
  profile: (name: string) => pilot<Profile>(`/profiles/${encodeName(name)}`),
  // v0.4.12: active profile pointer — "管了就能用" path closer
  activeProfile: () => pilot<ActiveProfile | null>("/profiles/active"),
  activateProfile: (name: string) =>
    pilot<ActiveProfile>(`/profiles/${encodeName(name)}/activate`, {
      method: "POST",
    }),
  clearActiveProfile: () =>
    pilot<{ ok: true }>("/profiles/active", { method: "DELETE" }),

  // ─── Capabilities (v0.3.9+) ───────────────────────────────
  listCapabilities: () => pilot<Capability[]>("/capabilities"),
  getCapability: (id: string) =>
    pilot<Capability>(`/capabilities/${encodeName(id)}`),

  // ─── Policies (v0.4.3+) ────────────────────────────────────
  policies: () => pilot<ToolPolicy[]>("/policies"),
  policy: (name: string) => pilot<ToolPolicy>(`/policies/${encodeName(name)}`),
  setPolicy: (name: string, input: ToolPolicyInput) =>
    pilot<ToolPolicy>(`/policies/${encodeName(name)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deletePolicy: (name: string) =>
    pilot<{ removed: boolean }>(`/policies/${encodeName(name)}`, {
      method: "DELETE",
    }),
  applyPolicy: (name: string) =>
    pilot<{ path: string }>(`/policies/${encodeName(name)}/apply`, {
      method: "POST",
    }),
  unapplyPolicy: (name: string) =>
    pilot<{ removed: boolean }>(`/policies/${encodeName(name)}/unapply`, {
      method: "POST",
    }),
  checkPolicy: (
    name: string,
    tool: string,
    args: Record<string, unknown> = {},
  ) =>
    pilot<{ policy: ToolPolicy; decision: PolicyDecision }>(
      `/policies/${encodeName(name)}/check`,
      {
        method: "POST",
        body: JSON.stringify({ tool, args }),
      },
    ),

  // ─── Compose catalog (v0.4.4+) ────────────────────────────
  composeCatalog: () => pilot<ComposeCatalog>("/compose/catalog"),
};

function encodeName(name: string): string {
  return encodeURIComponent(name).replace(/%40/g, "@");
}
