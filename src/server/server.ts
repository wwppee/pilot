/**
 * pilot server — local HTTP API for the Web UI (and any other clients).
 *
 * Listens on 127.0.0.1:17361 (override via PILOT_PORT / --port).
 * Authenticates every request via X-Pilot-Token (see ../server/auth.ts).
 * Mutating endpoints additionally require CSRF (see ../server/csrf.ts).
 *
 * Routes (see docs/architecture.md §5 for the contract):
 *
 *   GET    /health                   — no auth, returns version + uptime
 *   GET    /packs                    — list installed packs
 *   GET    /packs/search?q=          — search npm
 *   GET    /packs/info/:name         — fetch single pack
 *   POST   /packs/install            — install (CSRF required)
 *   GET    /sessions                 — list sessions
 *   GET    /sessions/search?q=       — full-text search
 *   GET    /doctor                   — run health check
 *   GET    /capabilities             — list installed capabilities
 *   GET    /capabilities/:id         — get one capability
 */

import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { randomUUID } from "node:crypto";

import {
  createService,
  type CreateServiceOptions,
} from "../core/service-impl.js";
import type { PilotService } from "../core/service.js";
import type { StatsRange } from "../core/stats.js";
import { VERSION } from "../core/version.js";

import { readOrCreateToken, TOKEN_HEADER, verifyToken } from "./auth.js";
import { CSRF_COOKIE, CSRF_HEADER, CsrfState } from "./csrf.js";

// ─── Server options ────────────────────────────────────────

export interface StartServerOptions {
  port?: number;
  host?: string;
  home?: string;
  /** When true, skip listening (useful for tests using fastify.inject). */
  noListen?: boolean;
  /** Override the logger. Default: silent in tests, info in CLI. */
  logger?: boolean | object;
}

export interface ServerHandle {
  port: number;
  host: string;
  url: string;
  token: string;
  csrf: CsrfState;
  service: PilotService;
  app: FastifyInstance;
  close: () => Promise<void>;
}

// ─── Factory ───────────────────────────────────────────────

const DEFAULT_PORT = 17361;
const DEFAULT_HOST = "127.0.0.1";

/**
 * Build the set of allowed Origin values for the bound host+port.
 *
 * Localhost has two reasonable spellings; both 127.0.0.1 and localhost must
 * be accepted because browsers and OSes don't always agree on which to send.
 */
function allowedOriginsFor(host: string, port: number): Set<string> {
  const origins = new Set<string>();
  const variants =
    host === "127.0.0.1" || host === "0.0.0.0" ? [host, "localhost"] : [host];
  for (const h of variants) {
    origins.add(`http://${h}:${port}`);
  }
  return origins;
}

/** Parse a `?range=` query value into a StatsRange. */
function parseRange(which: string, days?: number): StatsRange {
  switch (which) {
    case "today":
      return { kind: "today" };
    case "lastDays":
      return { kind: "lastDays", days: days && days > 0 ? days : 7 };
    case "all":
      return { kind: "all" };
    default:
      return { kind: "lastDays", days: 7 };
  }
}

/** Routes that require CSRF + Origin check (mutating operations). */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Start the server and return a handle. Resolves once listening. */
export async function startServer(
  opts: StartServerOptions = {},
): Promise<ServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;
  const home = opts.home;

  const serviceOptions: CreateServiceOptions =
    home !== undefined ? { home } : {};
  const service = createService(serviceOptions);
  const token = await readOrCreateToken(home);
  const csrf = new CsrfState();
  const allowedOrigins = allowedOriginsFor(host, port);

  const app = Fastify({
    logger: opts.logger ?? false,
    genReqId: () => randomUUID(),
  });

  await app.register(fastifyCookie);

  // ─── Hooks: token + origin + CSRF ─────────────────────

  app.addHook("onRequest", async (req, reply) => {
    // Health check is unauthenticated (for "is server up?" checks).
    if (req.url === "/health" && req.method === "GET") return;

    // Token check
    const provided = req.headers[TOKEN_HEADER];
    if (
      !verifyToken(typeof provided === "string" ? provided : undefined, token)
    ) {
      reply.code(401).send({ error: "unauthorized" });
      return reply;
    }

    // Origin + CSRF check for write methods
    if (WRITE_METHODS.has(req.method)) {
      const origin = req.headers["origin"];
      if (origin && !allowedOrigins.has(origin)) {
        reply.code(403).send({ error: "forbidden: bad origin" });
        return reply;
      }
      // For browser requests (Origin set), require CSRF.
      // For curl/scripts (no Origin), allow (they proved token possession).
      if (origin) {
        const cookieToken = req.cookies[CSRF_COOKIE];
        const headerToken = req.headers[CSRF_HEADER];
        const headerStr =
          typeof headerToken === "string" ? headerToken : undefined;
        if (!csrf.verify(cookieToken, headerStr)) {
          reply.code(403).send({ error: "forbidden: bad csrf" });
          return reply;
        }
      }
    }
  });

  // After every response, set the CSRF token so subsequent POSTs have a valid cookie.
  app.addHook("onSend", async (req, reply) => {
    if (req.method === "GET") {
      void reply.setCookie(CSRF_COOKIE, csrf.getToken(), {
        path: "/",
        httpOnly: false, // Web UI needs to read it
        sameSite: "strict",
      });
      reply.header(CSRF_HEADER, csrf.getToken());
    }
  });

  // ─── Routes ─────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
    pid: process.pid,
  }));

  app.get("/packs", async () => service.listPacks());

  app.get<{ Querystring: { q?: string } }>("/packs/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return [];
    return service.searchPacks(q);
  });

  app.get<{ Params: { name: string } }>("/packs/info/:name", async (req) => {
    const pack = await service.getPack(req.params.name);
    if (!pack) {
      throw Object.assign(new Error("pack not found"), { statusCode: 404 });
    }
    return pack;
  });

  // ─── Forge (v0.4.14+) — web entrypoint for capability absorption

  app.get<{ Querystring: { q?: string } }>("/forge/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    if (!q || q.length < 2) return [];
    return service.forgeSearch(q);
  });

  app.get<{ Params: { name: string } }>(
    "/forge/inspect/:name",
    async (req, reply) => {
      const result = await service.forgeInspect(req.params.name);
      if (!result) {
        return reply.code(404).send({ error: "package not found" });
      }
      return result;
    },
  );

  app.post<{ Body: { name?: string; asId?: string } }>(
    "/forge/absorb",
    async (req, reply) => {
      const { name, asId } = req.body ?? {};
      if (!name) {
        return reply.code(400).send({ error: "missing name" });
      }
      try {
        const cap = await service.forgeAbsorb(name, asId);
        return cap;
      } catch (e) {
        const err = e as { code?: string; message?: string };
        const status =
          err.code === "not-found"
            ? 404
            : err.code === "invalid-id"
              ? 400
              : err.code === "schema-validation"
                ? 422
                : 500;
        return reply.code(status).send({
          error: err.message ?? "absorb failed",
          code: err.code,
        });
      }
    },
  );

  // ─── Avatars (v0.5+) — project-level expected config ──────

  app.get("/avatars", async () => service.listAvatars());

  app.get("/avatars/current", async () => service.readCurrentState());

  app.get<{ Params: { cwd: string } }>("/avatars/:cwd", async (req, reply) => {
    const avatar = await service.readAvatar(req.params.cwd);
    if (!avatar) {
      return reply.code(404).send({ error: "avatar not found" });
    }
    return avatar;
  });

  app.get<{ Params: { cwd: string } }>(
    "/avatars/:cwd/diff",
    async (req, reply) => {
      const diff = await service.diffAvatar(req.params.cwd);
      if (!diff) {
        return reply.code(404).send({ error: "avatar not found" });
      }
      return diff;
    },
  );

  app.post<{ Params: { cwd: string } }>("/avatars/:cwd/capture", async (req) =>
    service.captureAvatar(req.params.cwd),
  );

  app.delete<{ Params: { cwd: string } }>(
    "/avatars/:cwd",
    async (req, reply) => {
      const removed = await service.deleteAvatar(req.params.cwd);
      if (!removed) {
        return reply.code(404).send({ error: "avatar not found" });
      }
      return { ok: true };
    },
  );

  app.post<{ Body: { source?: string } }>("/packs/install", async (req) => {
    const source = req.body?.source;
    if (!source) {
      throw Object.assign(new Error("missing source"), { statusCode: 400 });
    }
    await service.installPack(source);
    return { ok: true };
  });

  // v0.4.12: uninstall completes the CRUD loop. Body shape mirrors
  // install — `{ name: "pi-subagents" }` or `{ source: "npm:pi-subagents" }`.
  app.post<{ Body: { name?: string; source?: string } }>(
    "/packs/uninstall",
    async (req) => {
      const name = req.body?.name ?? req.body?.source;
      if (!name) {
        throw Object.assign(new Error("missing name"), { statusCode: 400 });
      }
      await service.uninstallPack(name);
      return { ok: true };
    },
  );

  app.get<{
    Querystring: { model?: string; cwd?: string; sinceDays?: string };
  }>("/sessions", async (req) => {
    const filter: { model?: string; cwd?: string; sinceDays?: number } = {};
    if (req.query.model) filter.model = req.query.model;
    if (req.query.cwd) filter.cwd = req.query.cwd;
    if (req.query.sinceDays) {
      const n = Number(req.query.sinceDays);
      if (Number.isFinite(n) && n > 0) filter.sinceDays = n;
    }
    return service.listSessions(filter);
  });

  app.get<{ Querystring: { q?: string; case?: string } }>(
    "/sessions/search",
    async (req) => {
      const q = (req.query.q ?? "").trim();
      if (!q) return [];
      return service.searchSessions(q, {
        caseSensitive: req.query.case === "1",
      });
    },
  );

  app.get<{ Params: { id: string } }>("/sessions/:id/tree", async (req) => {
    const tree = await service.readSessionTree(req.params.id);
    return tree;
  });

  // v0.4.13: derive a fresh snapshot for a session. Returns null
  // when the session file is gone (user pruned ~/.pi/agent/sessions/
  // outside Pilot) — server returns 200 with `null` body so the Web
  // UI can render a "session no longer exists" state without an
  // error toast.
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/snapshot",
    async (req, reply) => {
      const snap = await service.getSnapshot(req.params.id);
      if (!snap) {
        return reply.code(404).send({ error: "session not found" });
      }
      return snap;
    },
  );

  // v0.4.13: extract a profile-creation template (model + tools) from
  // a session. Used by `/profiles/new?from=<id>` to pre-fill the form.
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/template",
    async (req, reply) => {
      const tmpl = await service.getSessionTemplate(req.params.id);
      if (!tmpl) {
        return reply.code(404).send({ error: "session not found" });
      }
      return tmpl;
    },
  );

  // v0.5.1: diff two Capabilities by id. URL form is
  // /capabilities/:aId/diff/:bId. 404 when either side is missing.
  app.get<{ Params: { aId: string; bId: string } }>(
    "/capabilities/:aId/diff/:bId",
    async (req, reply) => {
      const diff = await service.capabilityDiff(req.params.aId, req.params.bId);
      if (!diff) {
        return reply.code(404).send({
          error: "one or both capabilities not found",
        });
      }
      return diff;
    },
  );

  app.get("/doctor", async () => service.runDoctor());

  app.get("/capabilities", async () => service.listCapabilities());

  app.get<{ Params: { id: string } }>("/capabilities/:id", async (req) => {
    const cap = await service.getCapability(req.params.id);
    if (!cap) {
      throw Object.assign(new Error("capability not found"), {
        statusCode: 404,
      });
    }
    return cap;
  });

  // ─── Profiles (v0.3.0-b) ─────────────────────────────

  app.get("/profiles", async () => service.listProfiles());

  app.get<{ Params: { name: string } }>("/profiles/:name", async (req) => {
    const profile = await service.getProfile(req.params.name);
    if (!profile) {
      throw Object.assign(new Error("profile not found"), { statusCode: 404 });
    }
    return profile;
  });

  app.post<{ Params: { name: string }; Body: Record<string, unknown> }>(
    "/profiles/:name",
    async (req) => {
      // The route is the source of name truth; we don't read name from body.
      const { name: _ignore, ...input } = req.body ?? {};
      const profile = await service.setProfile(req.params.name, input);
      return profile;
    },
  );

  app.delete<{ Params: { name: string } }>("/profiles/:name", async (req) => {
    const deleted = await service.deleteProfile(req.params.name);
    if (!deleted) {
      throw Object.assign(new Error("profile not found"), { statusCode: 404 });
    }
    return { ok: true };
  });

  // Active profile pointer (v0.4.12+) — "管了就能用" path closer.
  // Three routes: GET to read, POST to set, DELETE to clear.
  app.get("/profiles/active", async () => service.getActiveProfile());

  app.post<{ Params: { name: string } }>(
    "/profiles/:name/activate",
    async (req) => {
      // service.activateProfile throws if the named profile doesn't
      // exist; that's the right behavior (we never silently activate
      // a ghost profile).
      return service.activateProfile(req.params.name);
    },
  );

  app.delete("/profiles/active", async () => {
    await service.clearActiveProfile();
    return { ok: true };
  });

  // ─── Stats (v0.3.0-c) ──────────────────────────────

  app.get<{
    Querystring: { range?: string; days?: string };
  }>("/stats", async (req) => {
    const which = req.query.range ?? "week";
    const daysRaw = req.query.days;
    const days = daysRaw ? Number(daysRaw) : undefined;

    return service.getStats(parseRange(which, days));
  });

  // ─── Usage (v0.4.2) ─────────────────────────────────

  app.get<{
    Querystring: { range?: string; days?: string };
  }>("/usage", async (req) => {
    const which = req.query.range ?? "week";
    const daysRaw = req.query.days;
    const days = daysRaw ? Number(daysRaw) : undefined;

    return service.getUsage(parseRange(which, days));
  });

  // ─── Tools (v0.4.2) ─────────────────────────────────

  app.get("/tools", async () => service.listTools());

  // ─── Project context (v0.4.2) ────────────────────────

  app.get<{ Querystring: { cwd?: string } }>("/context", async (req) => {
    const cwd = req.query.cwd ?? process.cwd();
    return service.discoverProjectContext(cwd);
  });

  // ─── Tool policies (v0.4.3) ─────────────────────────

  app.get("/compose/catalog", async () => service.listComposeEntities());

  app.get("/policies", async () => service.listPolicies());

  app.get<{ Params: { name: string } }>("/policies/:name", async (req) => {
    const policy = await service.getPolicy(req.params.name);
    if (!policy) {
      throw Object.assign(new Error("policy not found"), { statusCode: 404 });
    }
    return policy;
  });

  app.put<{ Params: { name: string }; Body: Record<string, unknown> }>(
    "/policies/:name",
    async (req) => {
      const { name: _name, ...input } = req.body;
      return service.setPolicy(req.params.name, input as never);
    },
  );

  app.delete<{ Params: { name: string } }>("/policies/:name", async (req) => {
    const removed = await service.deletePolicy(req.params.name);
    return { removed };
  });

  app.post<{ Params: { name: string } }>("/policies/:name/apply", async (req) =>
    service.applyPolicy(req.params.name),
  );

  app.post<{ Params: { name: string } }>(
    "/policies/:name/unapply",
    async (req) => service.unapplyPolicy(req.params.name),
  );

  app.post<{
    Params: { name: string };
    Body: { tool: string; args?: Record<string, unknown> };
  }>("/policies/:name/check", async (req) => {
    const { tool, args = {} } = req.body;
    return service.checkPolicyCall(req.params.name, { name: tool, args });
  });

  // ─── Centralized error handler ──────────────────────

  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    reply.code(status).send({ error: e.message ?? "internal error" });
  });

  // ─── Listen ─────────────────────────────────────────

  if (!opts.noListen) {
    await app.listen({ port, host });
  }

  const url = `http://${host}:${port}`;
  return {
    port,
    host,
    url,
    token,
    csrf,
    service,
    app,
    close: async () => {
      await app.close();
    },
  };
}
