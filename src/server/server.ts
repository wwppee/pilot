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
import fastifyWebsocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";

import {
  createService,
  type CreateServiceOptions,
} from "../core/service-impl.js";
import type { PilotService } from "../core/service.js";

import { readOrCreateToken, TOKEN_HEADER, verifyToken } from "./auth.js";
// v0.9.16: routes split into ./routes/<resource>.ts
// (one file per resource family). server.ts keeps
// startup / shutdown / auth hooks / WebSocket
// bootstrap, and calls each routes file's
// `registerXxxRoutes(app, service)` to attach its
// handlers. See ./routes/health.ts for the smallest
// example.
import { registerAvatarsRoutes } from "./routes/avatars.js";
import { registerCapabilitiesRoutes } from "./routes/capabilities.js";
import { registerComposeRoutes } from "./routes/compose.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerObservabilityRoutes } from "./routes/observability.js";
import {
  registerPacksRoutes,
  registerPacksWriteRoutes,
} from "./routes/packs.js";
import { registerPiRoutes } from "./routes/pi.js";
import { registerPlansRoutes } from "./routes/plans.js";
import { registerPoliciesRoutes } from "./routes/policies.js";
import { registerProfilesRoutes } from "./routes/profiles.js";
import { registerSessionsRoutes } from "./routes/sessions.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerWrappersRoutes } from "./routes/wrappers.js";
import { registerWorkflowsRoutes } from "./routes/workflows.js";
// v0.9.16: CORS origin allowlist helper moved to
// ./cors.ts.
import { allowedOriginsFor } from "./cors.js";
import { CSRF_COOKIE, CSRF_HEADER, CsrfState } from "./csrf.js";
import { PiRpcBridge } from "./pi-rpc-bridge.js";

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

  // v0.5.23: recover any plans that were left in `running` state
  // by a crashed executor (process died mid-step, no graceful
  // shutdown). The runtime snapshot is the single source of
  // truth for resume; we scan `runtime/plans/*.json` and
  // re-start an executor for each one. Failures are logged but
  // don't block server boot.
  if (home !== undefined) {
    const { recoverRunningPlans: recover } =
      await import("../core/plan-executor.js");
    const { buildExecutorServiceForHome } =
      await import("../core/service-impl.js");
    try {
      const recovered = await recover(buildExecutorServiceForHome(home), home);
      if (recovered.length > 0) {
        app.log.info(
          { planIds: recovered },
          "recovered running plans after restart",
        );
      }
    } catch (e) {
      app.log.error(
        { err: (e as Error).message },
        "failed to recover running plans (continuing boot)",
      );
    }
  }

  await app.register(fastifyCookie);
  // v0.5.14+: WebSocket transport for pi RPC. We don't pass `options`
  // here because the global onRequest hook already gates by token;
  // the WS route below re-validates the subprotocol and rejects.
  await app.register(fastifyWebsocket);

  // ─── Hooks: token + origin + CSRF ─────────────────────

  app.addHook("onRequest", async (req, reply) => {
    // Health check is unauthenticated (for "is server up?" checks).
    if (req.url === "/health" && req.method === "GET") return;

    // The WebSocket route handles its own auth via the
    // `pilot-token` subprotocol. We still want the upgrade to
    // come through without the global hook forcing a header
    // check (browsers can't add custom headers to WebSocket).
    if (
      req.headers.upgrade &&
      String(req.headers.upgrade).toLowerCase() === "websocket"
    ) {
      return;
    }

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

  // ─── Routes (v0.9.16 split) ─────────────────────────
  //
  // Each routes file owns one resource family. The
  // split keeps server.ts focused on startup /
  // shutdown / auth hooks and lets each file own its
  // own validation helpers (isValidWorkflowId lives in
  // routes/workflows.ts) and cache contracts
  // (e.g. "policies:list" is invalidated by
  // routes/policies.ts on PUT/DELETE).
  registerHealthRoutes(app);
  registerPacksRoutes(app, service);
  registerPacksWriteRoutes(app, service);
  registerAvatarsRoutes(app, service);
  registerSessionsRoutes(app, service);
  registerCapabilitiesRoutes(app, service);
  registerProfilesRoutes(app, service);
  registerStatsRoutes(app, service);
  registerComposeRoutes(app, service);
  registerPoliciesRoutes(app, service);
  registerWorkflowsRoutes(app, service);
  registerWrappersRoutes(app, service);
  registerObservabilityRoutes(app, service);
  registerPlansRoutes(app, service);

  // ─── WebSocket: pi RPC bridge (v0.5.14+) ────────────
  //
  // P1#4: every live bridge is tracked so `app.close()`
  // can stop the spawned pi subprocesses explicitly.
  // The route handler + onClose drain live in
  // routes/pi.ts; server.ts only owns the Set and
  // hands it to the route module.
  const liveBridges = new Set<PiRpcBridge>();
  registerPiRoutes(app, { token, liveBridges });
  // ─── Centralized error handler ──────────────────────

  app.setErrorHandler((err: unknown, _req, reply) => {
    // P1#10: service-layer errors carry their own statusCode via
    // PlanError (404 not found, 409 invalid state transition).
    // Fastify defaults to 500 unless we set reply.code().
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
