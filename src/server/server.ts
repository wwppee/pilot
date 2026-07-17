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

import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyWebsocket from "@fastify/websocket";
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

  // v0.5.2: apply an Avatar — install missing packs, activate profile.
  // Returns the structured report so the UI can show "installed X / skipped Y".
  //
  // v0.5.3: `?dry=1` runs a dry-run (preview) — same report shape, but
  // no side-effects (no `pi install`, no profile activation). Steps
  // are flagged `dry: true` and the report root carries `dry: true`.
  app.post<{
    Params: { cwd: string };
    Querystring: { dry?: string };
  }>("/avatars/:cwd/apply", async (req, reply) => {
    const dry = req.query.dry === "1" || req.query.dry === "true";
    const report = await service.applyAvatar(req.params.cwd, { dry });
    if (!report) {
      return reply.code(404).send({ error: "avatar not found" });
    }
    return report;
  });

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

  // v0.5.3: per-session summary card (model + duration + tokens +
  // cost + tool usage). Used by `/sessions/[id]` info banner.
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/info",
    async (req, reply) => {
      const info = await service.getSessionInfo(req.params.id);
      if (!info) {
        return reply.code(404).send({ error: "session not found" });
      }
      return info;
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

  // v0.6.5: per-entity full detail for the inspector. Returns
  // 404 when the entity is not found.
  app.get<{ Params: { kind: string; id: string } }>(
    "/compose/catalog/:kind/:id",
    async (req, reply) => {
      const { kind, id } = req.params;
      const allowedKinds = [
        "session",
        "pack",
        "profile",
        "policy",
        "capability",
      ] as const;
      if (!allowedKinds.includes(kind as (typeof allowedKinds)[number])) {
        await reply.code(400).send({ error: `unknown kind: ${kind}` });
        return;
      }
      const detail = await service.getComposeEntityDetail(
        kind as (typeof allowedKinds)[number],
        decodeURIComponent(id),
      );
      if (!detail) {
        await reply.code(404).send({ error: "not found" });
        return;
      }
      return detail;
    },
  );

  // ─── Compose boards (v0.6.10) ─────────────────────────
  //
  // Persistence for /compose layouts. The web client treats these
  // as a "Save to server" / "Load from server" affordance on top
  // of its localStorage canonical editor. v0.6.12 added the
  // dedicated /compose/boards list page, which drives the
  // PATCH (rename) + DELETE (single + bulk) routes below.

  app.get("/compose/boards", async () => service.listComposeBoards());

  // v0.6.11: validate the path id at the route boundary so an
  // unsafe id (path traversal, oversized, garbage) returns 400
  // instead of silently dropping to 404 inside the service.
  // Mirrors `isValidBoardId` in core/compose-boards.ts.
  const assertBoardId = async (id: string, reply: FastifyReply) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      await reply.code(400).send({ error: `invalid board id: ${id}` });
      return false;
    }
    return true;
  };

  // v0.7.0: same boundary check for workflow ids, but the
  // regex is stricter (kebab-case only, no underscores / uppercase)
  // because the workflow id is also a command-line identifier
  // (`pilot workflow show <id>` is planned for v0.7.3+).
  // Mirrors `isValidWorkflowId` in core/workflow.ts.
  const isValidWorkflowId = (id: string): boolean => {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 64;
  };

  app.get<{ Params: { id: string } }>(
    "/compose/boards/:id",
    async (req, reply) => {
      if (!(await assertBoardId(req.params.id, reply))) return;
      const board = await service.getComposeBoard(req.params.id);
      if (!board) {
        await reply.code(404).send({ error: "board not found" });
        return;
      }
      return board;
    },
  );

  app.put<{
    Params: { id: string };
    Body: import("../core/compose-boards.js").BoardInput;
  }>("/compose/boards/:id", async (req, reply) => {
    if (!(await assertBoardId(req.params.id, reply))) return;
    // The path id wins over the body id — the URL is the file
    // identity, body id is just a hint for "create with this id".
    const input = { ...req.body, id: req.params.id };
    const board = await service.saveComposeBoard(input);
    return board;
  });

  app.post<{ Body: import("../core/compose-boards.js").BoardInput }>(
    "/compose/boards",
    async (req, reply) => {
      // POST creates with an auto-generated id when the body
      // doesn't supply one. The returned snapshot carries the id.
      // If the body DOES supply a malformed id, surface that as 400
      // so the client doesn't get a silent auto-generated id.
      if (req.body.id !== undefined) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(req.body.id)) {
          await reply
            .code(400)
            .send({ error: `invalid board id: ${req.body.id}` });
          return;
        }
      }
      const board = await service.saveComposeBoard(req.body);
      await reply.code(201).send(board);
      return;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/compose/boards/:id",
    async (req, reply) => {
      if (!(await assertBoardId(req.params.id, reply))) return;
      const ok = await service.deleteComposeBoard(req.params.id);
      if (!ok) {
        await reply.code(404).send({ error: "board not found" });
        return;
      }
      await reply.code(204).send();
    },
  );

  // v0.6.12: dedicated /compose/boards list page needs a
  // dedicated rename endpoint. We validate the body shape at
  // the boundary (so a 0-length or 1MB+ name is rejected
  // before reaching the service) and map the three failure
  // modes to 400 / 404 / 500 the same way the other board
  // routes do.
  app.patch<{
    Params: { id: string };
    Body: { name?: unknown };
  }>("/compose/boards/:id", async (req, reply) => {
    if (!(await assertBoardId(req.params.id, reply))) return;
    const raw = req.body.name;
    if (typeof raw !== "string") {
      await reply.code(400).send({ error: "name must be a string" });
      return;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      await reply.code(400).send({ error: "name must not be empty" });
      return;
    }
    if (trimmed.length > 200) {
      await reply
        .code(400)
        .send({ error: "name must be at most 200 characters" });
      return;
    }
    const updated = await service.renameComposeBoard(req.params.id, trimmed);
    if (!updated) {
      await reply.code(404).send({ error: "board not found" });
      return;
    }
    return updated;
  });

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

  // ─── Workflows (v0.7.0) ──────────────────────────────
  //
  // v0.7.0 only ships the persistence + CRUD endpoints. The
  // runtime ("Run workflow") lands in a later release; for
  // now the editor can save / load / delete / list. The web
  // client does "duplicate" by load + modify-id + save, so
  // there's no /duplicate endpoint here.

  app.get("/workflows", async () => service.listWorkflows());

  app.get<{ Params: { id: string } }>("/workflows/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    const wf = await service.getWorkflow(req.params.id);
    if (!wf) {
      await reply.code(404).send({ error: "workflow not found" });
      return;
    }
    return wf;
  });

  app.put<{
    Params: { id: string };
    Body: import("../core/workflow.js").WorkflowInput;
  }>("/workflows/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    // Path id wins over body id — it's the canonical file
    // location; the body's id is ignored so the URL is
    // always the source of truth.
    try {
      const saved = await service.saveWorkflow({
        ...req.body,
        id: req.params.id,
      });
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      await reply.code(400).send({ error: msg });
      return;
    }
  });

  // v0.7.1 (audit fix): distinguish "deleted" from "didn't
  // exist". Previously we always returned 200, which made
  // the UI's "row is gone, the list reloaded" path run
  // even on a stale id (e.g. user opens the list in two
  // tabs, deletes in one, refreshes in the other). Now
  // we check first and 404 if the workflow doesn't exist
  // — the same semantic as `/compose/boards/:id` DELETE
  // and the rest of the v0.7.x API surface.
  app.delete<{ Params: { id: string } }>(
    "/workflows/:id",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const existing = await service.getWorkflow(req.params.id);
      if (!existing) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      const removed = await service.deleteWorkflow(req.params.id);
      return { removed };
    },
  );

  // v0.7.5: Run workflow — minimum-viable endpoint that
  // validates the workflow exists and returns a stub
  // response. The real runtime (driving a pi session
  // through the node sequence with onFailure fallback)
  // lives behind this same contract in v0.7.6+; the
  // editor's Run button just calls this and renders
  // whatever comes back. Keeping the contract stable
  // now means we can ship the UI without waiting for
  // the runtime to be ready.
  app.post<{ Params: { id: string } }>(
    "/workflows/:id/run",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const wf = await service.getWorkflow(req.params.id);
      if (!wf) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      // The v0.7.0 MVP allows zero-node workflows ("the
      // editor's no-nodes empty state is nicer to start
      // from than a stub node" — see WorkflowListView
      // comment), so we don't reject those. A workflow
      // with nodes but no edges is also valid (a single
      // step that runs and produces output).
      return {
        status: "queued" as const,
        workflowId: wf.id,
        // Stub: the real runtime will start a pi session,
        // follow the edges in topological order, and
        // apply each node's onFailure strategy. For now
        // we just acknowledge the request and return.
        // The editor's Run button transitions to a
        // "queued" state and shows a hint that runtime
        // is coming.
        message: "Run is queued. Runtime lands in v0.7.6+.",
      };
    },
  );

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

  // v0.7.3 (B2): observability surface. The web dashboard
  // calls these; the service reads from the JSONL log we
  // append to in `service.checkPolicyCall`. The web layer
  // never sees the storage path — that's a service-internal
  // detail (storage-as-blind-box, per user memory).
  app.get("/observability/summary", async () =>
    service.getObservabilitySummary(),
  );
  app.get<{
    Querystring: {
      tool?: string;
      outcome?: "success" | "fail" | "denied";
      since?: string;
      limit?: string;
    };
  }>("/observability/calls", async (req) => {
    const q = req.query;
    const filter: {
      toolName?: string;
      outcome?: "success" | "fail" | "denied";
      since?: string;
      limit?: number;
    } = {};
    if (q.tool) filter.toolName = q.tool;
    if (q.outcome) filter.outcome = q.outcome;
    if (q.since) filter.since = q.since;
    if (q.limit) filter.limit = Number(q.limit);
    return service.getToolCalls(filter);
  });

  // v0.7.7: chat-to-dashboard stub. Accepts a natural-
  // language query and returns the relevant data slice
  // from the observability layer. The real LLM-driven
  // dispatcher lands in v0.8+; v0.7.7 is a keyword
  // matcher that turns "最近错误" / "recent errors" /
  // "policy 拦截" into a structured response the
  // dashboard can render. The point of v0.7.7 is the
  // API surface + the UI affordance, not the intelligence.
  app.post<{ Body: { message?: string } }>(
    "/observability/chat",
    async (req, reply) => {
      const message = (req.body?.message ?? "").trim();
      if (!message) {
        await reply.code(400).send({ error: "empty message" });
        return;
      }
      const lower = message.toLowerCase();
      // v0.8.2: time-window keywords. The v0.7.7
      // matcher had no concept of "when" — a user
      // asking "recent errors" got the same answer
      // as "all-time errors". The dashboard's time
      // range filter (v0.8.1) operates on the same
      // `since` field, so we thread it through here.
      // Default: 24h. The keywords "today" / "今天"
      // also map to 24h.
      const sinceMs =
        /(7\s*d|七\s*天|7\s*day|7d)/i.test(lower)
          ? Date.now() - 7 * 24 * 60 * 60 * 1000
          : /(24\s*h|今天|today|recent|最近|24h)/i.test(lower)
            ? Date.now() - 24 * 60 * 60 * 1000
            : /(all|全部|ever)/i.test(lower)
              ? 0
              : Date.now() - 24 * 60 * 60 * 1000;
      const since = sinceMs > 0 ? new Date(sinceMs).toISOString() : undefined;
      const summary = await service.getObservabilitySummary(since);
      // Three intents today: "errors/fail" — the
      // by-tool table sorted by fail-rate; "denied/
      // policy" — the denied breakdown; "summary" —
      // the top aggregate. Anything else returns the
      // summary + a hint about what the user can ask.
      const intent: "errors" | "denied" | "summary" =
        /fail|error|错误|失败/.test(lower)
          ? "errors"
          : /deni|拦截|policy|策略|block/.test(lower)
            ? "denied"
            : "summary";
      const windowLabel = sinceMs === 0
        ? "all time"
        : sinceMs > Date.now() - 25 * 60 * 60 * 1000
          ? "last 24h"
          : "last 7d";
      const reply2 =
        intent === "errors"
          ? {
              intent,
              window: windowLabel,
              text: summary.byTool
                .filter((r) => r.fail > 0)
                .slice(0, 5)
                .map((r) => `${r.tool}: ${r.fail} failure(s)`)
                .join("; ") || `No failures in ${windowLabel}.`,
            }
          : intent === "denied"
            ? {
                intent,
                window: windowLabel,
                text: summary.byTool
                  .filter((r) => r.denied > 0)
                  .slice(0, 5)
                  .map((r) => `${r.tool}: ${r.denied} block(s)`)
                  .join("; ") || `No policy blocks in ${windowLabel}.`,
              }
            : {
                intent,
                text: `${summary.total} call(s); ${summary.success} success, ${summary.fail} fail, ${summary.denied} denied. Worst tool: ${summary.worstTool ?? "none"}.`,
              };
      return reply2;
    },
  );

  // ─── Plans (v0.6.0 — Agent capability layer) ────

  app.get("/plans", async () => service.listPlans());

  // v0.5.7 review P0#2: tighten the create body — only `goal` is
  // required, and `title` / `context` are the only other accepted
  // fields. Everything else (status, strategy, tasks, result,
  // timestamps) is server-controlled and silently stripped so a
  // client can't inject e.g. {status: "completed"}.
  app.post<{
    Body: {
      goal?: unknown;
      title?: unknown;
      context?: unknown;
      strategy?: unknown;
      tasks?: unknown;
    };
  }>("/plans", async (req) => {
    const body = req.body ?? {};
    const { goal, title, context, strategy, tasks } = body as {
      goal?: unknown;
      title?: unknown;
      context?: unknown;
      strategy?: unknown;
      tasks?: unknown;
    };
    if (typeof goal !== "string" || goal.trim().length === 0) {
      throw Object.assign(new Error("goal is required (non-empty string)"), {
        statusCode: 400,
      });
    }
    // v0.6.1: accept tasks[] so the web /plans/new editor can
    // create a fully-populated plan in one POST (instead of
    // creating an empty plan + N PUT updates). Each task
    // shape is validated against the zod Task schema in
    // service.createPlan; bad input → 400 from there.
    const input: {
      goal: string;
      title?: string;
      strategy?: import("../core/plan.js").PlanStrategy;
      tasks?: import("../core/plan.js").Task[];
      context?: Record<string, string>;
    } = {
      goal: goal.trim(),
    };
    if (typeof title === "string" && title.length > 0) {
      input.title = title;
    }
    if (
      strategy === "sequential" ||
      strategy === "parallel" ||
      strategy === "adaptive"
    ) {
      input.strategy = strategy;
    }
    if (Array.isArray(tasks)) {
      // The zod Task schema in service.createPlan validates each
      // element; we just forward the JSON payload. The cast is
      // safe because writePlan uses PlanInputSchema.parse which
      // throws 400 on any shape mismatch.
      input.tasks = tasks as unknown as import("../core/plan.js").Task[];
    }
    if (context && typeof context === "object") {
      // The server fills `cwd`; only forward a narrow allow-list.
      const ctx: Record<string, string> = {};
      const c = context as Record<string, unknown>;
      if (typeof c["activeProfile"] === "string") {
        ctx["activeProfile"] = c["activeProfile"];
      }
      if (typeof c["gitBranch"] === "string") {
        ctx["gitBranch"] = c["gitBranch"];
      }
      if (Object.keys(ctx).length > 0) {
        input.context = ctx;
      }
    }
    return service.createPlan(input);
  });

  // P1#9 (v0.5.7 review): define static /plans/suggest-tools BEFORE
  // any /plans/:id wildcard. Fastify's find-my-way does prefer static
  // over dynamic, so this is defensive — but if someone adds a route
  // like /plans/:id/something later, the order stops being load-bearing.
  app.post<{ Body: { goal: string } }>("/plans/suggest-tools", async (req) => {
    const { goal } = req.body;
    if (!goal || typeof goal !== "string") {
      throw Object.assign(new Error("goal is required"), {
        statusCode: 400,
      });
    }
    return service.suggestTools(goal);
  });

  app.get<{ Params: { id: string } }>("/plans/:id", async (req) => {
    const plan = await service.getPlan(req.params.id);
    if (!plan) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return plan;
  });

  // v0.5.13+: plan execution history. Static path registered BEFORE
  // the wildcards further down. Returns [] if the plan has no events
  // yet (never started) and 404 if the plan doesn't exist.
  app.get<{ Params: { id: string } }>("/plans/:id/events", async (req) => {
    const events = await service.getPlanEvents(req.params.id);
    if (events === null) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return events;
  });

  app.put<{
    Params: { id: string };
    Body: Partial<import("../core/plan.js").Plan>;
  }>("/plans/:id", async (req) => {
    return service.updatePlan(req.params.id, req.body);
  });

  app.delete<{ Params: { id: string } }>("/plans/:id", async (req) => {
    const deleted = await service.deletePlan(req.params.id);
    if (!deleted) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return { ok: true };
  });

  // Plan execution control
  app.post<{ Params: { id: string } }>("/plans/:id/start", async (req) =>
    service.startPlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/pause", async (req) =>
    service.pausePlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/resume", async (req) =>
    service.resumePlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/cancel", async (req) =>
    service.cancelPlan(req.params.id),
  );

  // Task / Step updates (manual intervention)
  app.put<{
    Params: { id: string; taskId: string };
    Body: Partial<import("../core/plan.js").Task>;
  }>("/plans/:id/tasks/:taskId", async (req) =>
    service.updateTask(req.params.id, req.params.taskId, req.body),
  );

  app.put<{
    Params: { id: string; taskId: string; stepId: string };
    Body: Partial<import("../core/plan.js").Step>;
  }>("/plans/:id/tasks/:taskId/steps/:stepId", async (req) =>
    service.updateStep(
      req.params.id,
      req.params.taskId,
      req.params.stepId,
      req.body,
    ),
  );

  // v0.6.0: retry / skip endpoints for failed / blocked tasks.
  app.post<{ Params: { id: string; taskId: string } }>(
    "/plans/:id/tasks/:taskId/retry",
    async (req) => service.retryTask(req.params.id, req.params.taskId),
  );
  app.post<{ Params: { id: string; taskId: string } }>(
    "/plans/:id/tasks/:taskId/skip",
    async (req) => service.skipTask(req.params.id, req.params.taskId),
  );

  // Tool / Profile suggestion — moved above /plans/:id (P1#9).
  // See the comment near the top of the Plan routes block.

  // ─── WebSocket: pi RPC bridge (v0.5.14+) ────────────
  //
  // Browser → WebSocket → Pilot server → RpcClient → `pi --mode rpc`.
  // The browser speaks pi's JSON-lines RPC protocol directly via
  // `usePiSession()` (see web/src/lib/usePiSession.ts). One bridge
  // instance per connection; pi is spawned fresh per connection.
  //
  // Auth: client must include `pilot-token` as a subprotocol, e.g.
  //   new WebSocket(url, ["pilot-token-<TOKEN>"])
  // The `socket.protocol` after handshake reads back as the joined
  // subprotocols string; we parse out the token and verify.
  //
  // P1#4: every live bridge is tracked so `app.close()` (server
  // shutdown / test teardown) can stop the spawned pi subprocesses
  // explicitly. Without this, pi children outlive the server and
  // leak as orphans.
  const liveBridges = new Set<PiRpcBridge>();

  app.get("/api/pi/ws", { websocket: true }, (socket /* _req */) => {
    // @fastify/websocket passes the WebSocket directly. After
    // the handshake `socket.protocol` is the single subprotocol
    // name the server negotiated — we expect a token-as-name
    // pattern: client passes `["pilot-token-<TOKEN>"]` and we
    // strip the prefix to verify. Browsers can't add custom
    // headers to WebSocket, so subprotocol is the only way to
    // authenticate without a query string (which would leak
    // into logs).
    const proto = String(socket.protocol ?? "");
    const prefix = "pilot-token-";
    const presentedToken = proto.startsWith(prefix)
      ? proto.slice(prefix.length)
      : "";
    if (!presentedToken || !verifyToken(presentedToken, token)) {
      socket.close(1008, "unauthorized");
      return;
    }

    const bridge = new PiRpcBridge(socket);
    liveBridges.add(bridge);
    // Use `.on()` rather than `.once()` for portability — the
    // `ws.WebSocket` type from `@types/ws@8` doesn't always declare
    // `.once()`, and `socket.on("close", cb)` is functionally
    // equivalent here (the socket is already closed by the time the
    // callback runs, so it won't fire again).
    socket.on("close", () => {
      liveBridges.delete(bridge);
    });

    const cwd = process.env.HOME ?? process.cwd();
    void bridge.start(cwd).catch((e: Error) => {
      app.log.error(e, "pi rpc bridge failed to start");
    });
  });

  // Stop every live pi subprocess on server shutdown. Without this
  // hook, app.close() tears down the HTTP socket but the RpcClient-
  // spawned pi processes keep running with no parent coordination.
  app.addHook("onClose", async () => {
    await Promise.all(
      Array.from(liveBridges).map((b) =>
        b.close().catch(() => {
          // Best-effort — log and move on.
        }),
      ),
    );
    liveBridges.clear();
  });

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
