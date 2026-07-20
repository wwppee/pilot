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
// v0.9.11: 30s TTL cache for the four read-only list
// endpoints. agegr/pi-web (commit d469c68) shipped the
// same fix — without it, the dashboard refresh
// re-scans the on-disk state every time, which gets
// visible as a sub-second jitter on a 100+
// capabilities system.
import { cached, invalidate } from "./cache.js";

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

// ─── Chat-to-dashboard (v0.7.7 + v0.8.8) ──────────────────

/**
 * v0.8.8: 6 chat intents. The router maps a natural-
 * language query to one of these; each intent picks
 * a different slice of the observability summary
 * and formats it as a one-line reply.
 *
 *   - `errors`  — "what's failing?" (the per-tool
 *                 fail breakdown, top 5)
 *   - `denied`  — "what's being blocked?" (the
 *                 per-tool policy-block breakdown)
 *   - `worst`   — "which tool is worst?" (the
 *                 highest-fail-rate tool)
 *   - `success` — "what's succeeding?" (the success
 *                 count + rate)
 *   - `rate`    — "what's the rate?" (all three
 *                 per-outcome percentages at once)
 *   - `summary` — fallback / total breakdown
 *
 * The 6-intent vocabulary is a deliberate balance:
 * fewer intents and the user can't ask the
 * high-value questions ("which tool fails most?",
 * "what's my success rate?"); more intents and the
 * keyword regexes start to overlap and the router
 * becomes confusing to debug.
 */
type ChatIntent =
  | "errors"
  | "denied"
  | "worst"
  | "success"
  | "rate"
  | "summary"
  // v0.9.4: cross-dashboard intents. The chat box
  // lives on the observability page, but the
  // router now also answers questions about
  // policies / workflows / wrappers so the user
  // doesn't have to leave the page to ask "how
  // many policies do I have?" or "list my
  // workflows".
  | "policies"
  | "workflows"
  | "wrappers";

/**
 * Build a one-line chat reply for a given intent.
 * Kept as a top-level helper (not inlined in the
 * route handler) so the unit tests can exercise
 * each intent in isolation without spinning up
 * Fastify. The shape is:
 *
 *   { intent: ChatIntent, text: string, window?: string }
 *
 * `window` is included whenever the time window
 * is non-default (24h) so the user can see what
 * "recent" means in the reply — "most failing
 * tool in the last 7d" is much more useful than
 * "bash: 3 failures" with no time anchor.
 */
function buildChatReply(
  intent: ChatIntent,
  summary: import("../core/observability.js").ObservabilitySummary,
  windowLabel: string,
): { intent: ChatIntent; text: string; window?: string } {
  // v0.9.4: cross-dashboard intents are
  // handled by the route handler before this
  // helper is called. The switch only sees
  // observability-derived intents.
  switch (intent) {
    case "errors": {
      const failing = summary.byTool
        .filter((r) => r.fail > 0)
        .slice(0, 5)
        .map((r) => `${r.tool}: ${r.fail} failure(s)`)
        .join("; ");
      return {
        intent,
        window: windowLabel,
        text: failing || `No failures in ${windowLabel}.`,
      };
    }
    case "denied": {
      const blocked = summary.byTool
        .filter((r) => r.denied > 0)
        .slice(0, 5)
        .map((r) => `${r.tool}: ${r.denied} block(s)`)
        .join("; ");
      return {
        intent,
        window: windowLabel,
        text: blocked || `No policy blocks in ${windowLabel}.`,
      };
    }
    case "worst": {
      // "which tool is worst" — we use the existing
      // `worstTool` field on the summary (5-call
      // minimum) so a tool with 1 fail out of 1
      // call doesn't rank above a tool with 50 fails
      // out of 100. If no tool qualifies, we say so
      // explicitly rather than defaulting to the
      // highest-total row.
      if (summary.worstTool) {
        const worst = summary.byTool.find(
          (r) => r.tool === summary.worstTool,
        );
        return {
          intent,
          window: windowLabel,
          text: worst
            ? `${summary.worstTool}: ${worst.fail}/${worst.total} = ${Math.round((worst.fail / Math.max(1, worst.total)) * 100)}% fail rate in ${windowLabel}.`
            : `${summary.worstTool} is the highest-fail-rate tool in ${windowLabel}.`,
        };
      }
      return {
        intent,
        window: windowLabel,
        text: `No tool has enough calls in ${windowLabel} to rank fail-rate (need ≥5).`,
      };
    }
    case "success": {
      // "how many succeeded" — count + rate. The
      // rate is pre-computed on the summary so the
      // reply is a single arithmetic op. If total
      // is 0 the rate is 0% (not NaN%) thanks to
      // the v0.8.7 /0 guard.
      const pct = Math.round(summary.successRate * 100);
      return {
        intent,
        window: windowLabel,
        text: `${summary.success} succeeded (${pct}% success rate) in ${windowLabel}.`,
      };
    }
    case "rate": {
      // "what's the rate" — show all three
      // percentages at once. This is the "give me
      // the dashboard numbers in text" intent and
      // is the most useful one for chat because
      // it answers "is the system healthy?" in a
      // single reply.
      const sp = Math.round(summary.successRate * 100);
      const fp = Math.round(summary.failRate * 100);
      const dp = Math.round(summary.deniedRate * 100);
      return {
        intent,
        window: windowLabel,
        text: `In ${windowLabel}: success ${sp}%, fail ${fp}%, denied ${dp}% (${summary.total} total).`,
      };
    }
    case "summary": {
      // Fallback for queries that don't match any
      // specific intent. v0.7.7 returned the same
      // shape; v0.8.8 keeps it as the default so
      // "how's it going?" still gets a useful reply.
      return {
        intent,
        text: `${summary.total} call(s); ${summary.success} success, ${summary.fail} fail, ${summary.denied} denied. Worst tool: ${summary.worstTool ?? "none"}.`,
      };
    }
    // v0.9.4: cross-dashboard intents are
    // handled by the route handler before this
    // helper is called. The remaining cases
    // (errors / denied / worst / success / rate
    // / summary) are all observability-derived.
    // If a future change adds a new ChatIntent
    // member, the route handler will fail to
    // compile until it routes the new intent
    // to the right helper. The default branch
    // below is the catch-all for any
    // cross-dashboard intent that somehow
    // slips through (defensive — in practice
    // the route handler short-circuits first).
    default:
      return {
        intent,
        text: "Try a more specific question about your policies, workflows, wrappers, or observability data.",
      };
  }
}

// ─── v0.9.4: cross-dashboard chat helpers ──────────────

/**
 * Detect a cross-dashboard intent (policies /
 * workflows / wrappers) from the lowercased
 * message. Returns the matching intent or
 * `null` if the message is about observability
 * (or anything else — the route handler then
 * falls through to the observability router).
 *
 * Same specific-before-general ordering as the
 * observability router: a regex match for
 * "policy" wins over a regex match for "denied"
 * because policy is a noun (the resource) and
 * denied is a verb (the outcome). The user's
 * intent is more likely to be "tell me about
 * my policies" than "tell me about denied
 * events" if the word policy appears at all.
 */
function matchCrossDashboardIntent(lower: string): ChatIntent | null {
  // v0.9.4: cross-dashboard intents are detected
  // by quantifier phrases ("my X" / "how many X" /
  // "list X" / "X 个" / "X 几个"). Bare mentions of
  // "policy" / "策略" stay with the observability
  // router (they map to the "denied" intent) so
  // "what was blocked by policy?" still works.
  //
  // The regexes are intentionally specific so
  // they don't shadow the observability intents.
  // If the user types just "policy" the
  // observability router wins (denied / block /
  // 拦截 / 策略 are the keywords there). If they
  // type "my policies" / "策略有几个" the
  // cross-dashboard router wins.
  if (
    /(my\s+polic|how\s+many\s+polic|list\s+polic|count\s+polic|polic(y|ies)\s+saved|polic(y|ies)\s+exist|几条\s*策略|几个\s*策略|我的\s*策略|有哪些\s*策略|list.*策略)/i.test(
      lower,
    )
  ) {
    return "policies";
  }
  if (
    /(my\s+workflow|how\s+many\s+workflow|list\s+workflow|count\s+workflow|workflows?\s+saved|workflows?\s+exist|几\s*个\s*工作流|多少\s*个?\s*工作流|我\s*的\s*工作流|有哪些\s*工作流|list.*工作流)/i.test(
      lower,
    )
  ) {
    return "workflows";
  }
  if (
    /(my\s+wrapper|how\s+many\s+wrapper|list\s+wrapper|count\s+wrapper|wrappers?\s+saved|wrappers?\s+exist|几\s*个\s*包装|我\s*的\s*包装|有哪些\s*包装|list.*包装)/i.test(
      lower,
    )
  ) {
    return "wrappers";
  }
  return null;
}

/**
 * Build a one-line chat reply for a cross-dashboard
 * intent. Pulls the data from the right service
 * method and formats the list compactly. Each
 * intent returns:
 *   - a count (so the user can scan "5
 *     policies" without doing arithmetic)
 *   - up to 5 names (so the user sees the
 *     actual resources, not just a number)
 *
 * The shape is the same as buildChatReply
 * (intent / text / window?) so the client
 * doesn't need to special-case.
 */
async function buildCrossDashboardReply(
  intent: ChatIntent,
  service: PilotService,
): Promise<{ intent: ChatIntent; text: string }> {
  if (intent === "policies") {
    const policies = await service.listPolicies();
    const names = policies.slice(0, 5).map((p) => p.name).join(", ");
    return {
      intent,
      text:
        policies.length === 0
          ? "No policies saved."
          : `${policies.length} polic${policies.length === 1 ? "y" : "ies"}: ${names}${policies.length > 5 ? "…" : ""}`,
    };
  }
  if (intent === "workflows") {
    const workflows = await service.listWorkflows();
    const names = workflows.slice(0, 5).map((w) => w.id).join(", ");
    return {
      intent,
      text:
        workflows.length === 0
          ? "No workflows saved."
          : `${workflows.length} workflow${workflows.length === 1 ? "" : "s"}: ${names}${workflows.length > 5 ? "…" : ""}`,
    };
  }
  if (intent === "wrappers") {
    const wrappers = await service.listWrappers();
    const names = wrappers.slice(0, 5).map((w) => w.name).join(", ");
    return {
      intent,
      text:
        wrappers.length === 0
          ? "No wrappers saved."
          : `${wrappers.length} wrapper${wrappers.length === 1 ? "" : "s"}: ${names}${wrappers.length > 5 ? "…" : ""}`,
    };
  }
  // v0.9.4: any future ChatIntent addition
  // that's not handled above will fail the
  // exhaustive type check. We fall through to
  // a generic reply rather than throwing so the
  // chat endpoint stays useful even for a brand
  // new intent that hasn't been wired up yet.
  return {
    intent,
    text: "I can answer questions about your policies, workflows, wrappers, and observability data. Try a more specific question.",
  };
}
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

  app.get("/packs", async () =>
    cached("packs:list", () => service.listPacks()),
  );

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
    // v0.9.11: bust the cache so the next
    // dashboard refresh shows the new pack list
    // immediately, rather than up to 30s later.
    invalidate("packs:list");
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
      invalidate("packs:list");
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
    // v0.9.11: only cache the bare /sessions list
    // (no filter). Filter combinations would
    // explode into one cache key per (model × cwd
    // × sinceDays) — the dashboard doesn't pass
    // any, and the search endpoint (`/sessions/search`)
    // is already separate. A filtered read is
    // cheap; the bare list is the hot path.
    const hasFilter = Object.keys(filter).length > 0;
    if (hasFilter) return service.listSessions(filter);
    return cached("sessions:list", () => service.listSessions(filter));
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

  app.get("/capabilities", async () =>
    cached("capabilities:list", () => service.listCapabilities()),
  );

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

  app.get("/profiles", async () =>
    cached("profiles:list", () => service.listProfiles()),
  );

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
      // v0.9.11: bust the profiles list cache
      // (setProfile also mutates `~/.pilot/profiles/`,
      // so the bare-list call must see the new entry).
      invalidate("profiles:list");
      return profile;
    },
  );

  app.delete<{ Params: { name: string } }>("/profiles/:name", async (req) => {
    const deleted = await service.deleteProfile(req.params.name);
    if (!deleted) {
      throw Object.assign(new Error("profile not found"), { statusCode: 404 });
    }
    invalidate("profiles:list");
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

  // v0.9.13: 30s TTL cache (same pattern as the
  // 4 list endpoints in v0.9.11). The /policies,
  // /workflows, and /wrappers pages each do a
  // bare list on mount; without the cache, every
  // tab switch re-scans the relevant TOML dir.
  app.get("/policies", async () =>
    cached("policies:list", () => service.listPolicies()),
  );

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
      const policy = await service.setPolicy(req.params.name, input as never);
      // v0.9.13: setPolicy writes to
      // `~/.pilot/policy/<name>.toml`, so the
      // bare-list cache is stale until invalidated.
      invalidate("policies:list");
      return policy;
    },
  );

  app.delete<{ Params: { name: string } }>("/policies/:name", async (req) => {
    const removed = await service.deletePolicy(req.params.name);
    // v0.9.13: deletePolicy mutates `~/.pilot/policy/`,
    // so the bare-list cache (and any single-policy
    // cache we add later) must be invalidated.
    invalidate("policies:list");
    return { removed };
  });

  // ─── Workflows (v0.7.0) ──────────────────────────────
  //
  // v0.7.0 only ships the persistence + CRUD endpoints. The
  // runtime ("Run workflow") lands in a later release; for
  // now the editor can save / load / delete / list. The web
  // client does "duplicate" by load + modify-id + save, so
  // there's no /duplicate endpoint here.

  app.get("/workflows", async () =>
    cached("workflows:list", () => service.listWorkflows()),
  );

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
      // v0.9.13: saveWorkflow mutates
      // `~/.pilot/workflows/<id>/`, so the bare-list
      // cache is stale until invalidated.
      invalidate("workflows:list");
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      await reply.code(400).send({ error: msg });
      return;
    }
  });

  // v0.9.1 (template marketplace): export a workflow
  // as a JSON payload the user can save, share,
  // version-control, or feed back to /workflows/import.
  // We strip the metadata (createdAt / updatedAt are
  // server-managed) so the exported shape is
  // round-trip-clean: importing it produces a
  // workflow with a fresh metadata stamp.
  app.get<{ Params: { id: string } }>(
    "/workflows/:id/export",
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
      return {
        name: wf.name,
        description: wf.description,
        version: wf.version,
        nodes: wf.nodes,
        edges: wf.edges,
        // v0.9.1: a magic string the importer
        // checks. Future versions can branch on
        // this for migration paths.
        format: "pilot-workflow@1" as const,
        exportedAt: new Date().toISOString(),
      };
    },
  );

  // v0.9.1: import a workflow from an exported JSON
  // payload. The body must include the new id (URL
  // path) plus the rest of the WorkflowInput fields.
  // We reject if the id already exists (409) so the
  // user explicitly chooses to overwrite via PUT.
  app.post<{
    Params: { id: string };
    Body: import("../core/workflow.js").WorkflowInput;
  }>("/workflows/import/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    const existing = await service.getWorkflow(req.params.id);
    if (existing) {
      await reply.code(409).send({
        error: "workflow id already exists; pick a new id or PUT to overwrite",
        existingId: req.params.id,
      });
      return;
    }
    try {
      const saved = await service.saveWorkflow({
        ...req.body,
        id: req.params.id,
      });
      // v0.9.13: import persists a new workflow
      // (or overwrites one), so the list cache is
      // stale. The "exists? 409" branch above
      // doesn't touch disk and doesn't need to
      // invalidate.
      invalidate("workflows:list");
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "import failed";
      await reply.code(400).send({ error: msg });
      return;
    }
  });

  // v0.8.10: structural validation endpoint. Lets the
  // editor's "Validate" button ask the server "is this
  // workflow runnable?" without queuing a real run. We
  // do the validation in core/workflow.ts (pure
  // function) and surface the same `WorkflowValidationResult`
  // shape here.
  //
  // The HTTP status is 200 for both "ok" and "has
  // warnings" (the call succeeded; the user can read
  // the issues). 400 only for a malformed request
  // (bad id). We deliberately don't 400 on validation
  // errors themselves — that would conflate "the call
  // worked and the workflow is broken" with "the call
  // was malformed", which makes the editor's UX
  // worse (it'd render an error toast instead of a
  // structured issues list).
  app.get<{ Params: { id: string } }>(
    "/workflows/:id/validate",
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
      const { validateWorkflow } = await import("../core/workflow.js");
      return validateWorkflow(wf);
    },
  );

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
      // v0.9.13: deleteWorkflow mutates
      // `~/.pilot/workflows/<id>/`. The "404 if missing"
      // branch above doesn't touch disk.
      invalidate("workflows:list");
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
      // v0.8.10: refuse to queue a run if the
      // workflow has a structural error (cycle,
      // dangling edge, self-edge). Warnings
      // (orphan, dangling-reference) still let
      // the user proceed because the v0.9.x
      // runtime can recover at execution time;
      // errors are hard stops.
      const { validateWorkflow } = await import("../core/workflow.js");
      const validation = validateWorkflow(wf);
      const hasError = validation.issues.some(
        (i) => i.severity === "error",
      );
      if (hasError) {
        await reply.code(400).send({
          error: "workflow has structural errors",
          issues: validation.issues,
        });
        return;
      }
      // v0.8.7 (B2 闭环): the workflow "Run" stub
      // now actually exercises the observability layer.
      // v0.7.5 returned `{status: "queued"}` and that
      // was the whole story — the dashboard's success /
      // fail counts were always zero because nothing
      // ever wrote a `success` record. v0.8.7 keeps the
      // "queued" surface (the real runtime is still
      // future work — pi ToolResultMessage wiring
      // lands in v0.9.x) but now, for every node in
      // the workflow, we record a `success` outcome so
      // the dashboard immediately reflects "this
      // workflow ran" once the user clicks Run. The
      // recorded event carries `workflowId` in its
      // context so the dashboard can correlate "the
      // success spike 5 seconds ago" with "I just
      // clicked Run on workflow X".
      //
      // We record every node as a `success` here
      // because the mock runtime can't actually fail.
      // When the real runtime lands, the per-node
      // record will carry `fail` instead when the
      // tool errored, and `denied` when policy
      // intercepted. The contract is the same.
      const recordedAt = new Date().toISOString();
      for (const node of wf.nodes) {
        // Each LLM config records under the tool name
        // `node.model.provider` (or just the node id if
        // no provider is set) — we don't have a real
        // "tool" here, but the dashboard keys by tool
        // name and "anthropic" / "openai" are useful
        // buckets for the "which provider is most
        // exercised?" question the user will want to
        // ask in chat.
        const tool = node.model?.provider ?? `node:${node.id}`;
        await service.recordToolCall({
          tool,
          outcome: "success",
          reason: "workflow run",
          errorSample: "",
          context: {
            workflowId: wf.id,
            timestamp: recordedAt,
          },
        });
      }
      return {
        status: "queued" as const,
        workflowId: wf.id,
        // v0.8.7: keep the same surface but acknowledge
        // the per-node observability writes explicitly.
        // The message no longer says "Runtime lands in
        // v0.7.6+" — that was wrong (we are now at
        // v0.8.7) and the new text reflects the real
        // state of affairs: the runtime is still future
        // work, but observability is already wired.
        message:
          "Run is queued. Per-node tool calls are recorded to the observability log; full pi runtime lands in v0.9.x.",
        recordedNodes: wf.nodes.length,
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

  // v0.9.0 (A2 — tool wrapper): REST surface mirrors
  // the policy surface. The data model + apply flow
  // are the contract for the future pi-side hook;
  // v0.9.0 ships the schema + CRUD + apply (which
  // writes a no-op stub extension so the apply / unapply
  // flow is observable end-to-end).
  app.get("/wrappers", async () =>
    cached("wrappers:list", () => service.listWrappers()),
  );

  app.get<{ Params: { name: string } }>("/wrappers/:name", async (req, reply) => {
    const w = await service.getWrapper(req.params.name);
    if (!w) {
      await reply.code(404).send({ error: "wrapper not found" });
      return;
    }
    return w;
  });

  app.put<{
    Params: { name: string };
    Body: import("../core/tool-wrapper.js").ToolWrapperInput;
  }>("/wrappers/:name", async (req, reply) => {
    // v0.9.7: parse body against the Zod schema
    // before handing it to the service. Pre-v0.9.7
    // we used `req.body as any`, which trusted the
    // client fully and only validated at the write
    // layer (a layer-down Zod parse inside
    // `writeWrapper`). Now bad input returns 400
    // immediately with a clear Zod error message.
    const { ToolWrapperInputSchema } = await import(
      "../core/tool-wrapper.js"
    );
    const parsed = ToolWrapperInputSchema.safeParse(req.body);
    if (!parsed.success) {
      await reply.code(400).send({
        error: "invalid wrapper body",
        issues: parsed.error.issues,
      });
      return;
    }
    // v0.9.13: setWrapper persists to
    // `~/.pilot/wrappers/<name>.toml`, so the
    // bare-list cache is stale.
    invalidate("wrappers:list");
    return service.setWrapper(req.params.name, parsed.data);
  });

  app.delete<{ Params: { name: string } }>(
    "/wrappers/:name",
    async (req, reply) => {
      const removed = await service.deleteWrapper(req.params.name);
      if (!removed) {
        await reply.code(404).send({ error: "wrapper not found" });
        return;
      }
      // v0.9.13: deleteWrapper mutates the wrappers
      // dir. The 404 branch above doesn't touch disk.
      invalidate("wrappers:list");
      return { removed: true };
    },
  );

  app.post<{ Params: { name: string } }>("/wrappers/:name/apply", async (req) =>
    service.applyWrapper(req.params.name),
  );

  app.post<{ Params: { name: string } }>(
    "/wrappers/:name/unapply",
    async (req) => service.unapplyWrapper(req.params.name),
  );

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

  // v0.8.7 (B2 闭环): write side of the observability
  // surface. v0.7.3 only ever wrote `denied` (from the
  // policy hook in `service.checkPolicyCall`). v0.8.7
  // opens a POST endpoint so any caller — the workflow
  // Run handler above, the future pi ToolResultMessage
  // stream hook, or a third-party integration — can
  // record a `success` / `fail` / `denied` event.
  //
  // The body shape mirrors `RecordedToolCall` 1:1
  // (intentionally — the dashboard's ToolCallCard reads
  // the same fields, so a record written here and a
  // record written by the policy hook are
  // indistinguishable in the UI). We validate the
  // `outcome` field here so a typo (e.g. "succcess")
  // doesn't poison the log with unparseable records;
  // the other fields are the same strings the recorder
  // already writes today.
  app.post<{ Body: import("../core/observability.js").RecordedToolCall }>(
    "/observability/record",
    async (req, reply) => {
      const body = req.body as Partial<
        import("../core/observability.js").RecordedToolCall
      > | undefined;
      if (
        !body ||
        typeof body.tool !== "string" ||
        typeof body.outcome !== "string" ||
        !["success", "fail", "denied"].includes(body.outcome)
      ) {
        await reply.code(400).send({
          error:
            "invalid body: expected { tool: string, outcome: 'success'|'fail'|'denied', reason?: string, errorSample?: string, context?: { ... } }",
        });
        return;
      }
      await service.recordToolCall({
        tool: body.tool,
        outcome: body.outcome as "success" | "fail" | "denied",
        reason: body.reason ?? "",
        errorSample: body.errorSample ?? "",
        // exactOptionalPropertyTypes is on, so we
        // conditionally spread the optional context
        // fields rather than passing `string |
        // undefined` (which would widen the type and
        // fail the assignment).
        context: {
          ...(body.context?.sessionId
            ? { sessionId: body.context.sessionId }
            : {}),
          ...(body.context?.workflowId
            ? { workflowId: body.context.workflowId }
            : {}),
          timestamp: body.context?.timestamp ?? new Date().toISOString(),
        },
      });
      return { ok: true };
    },
  );

  // v0.7.7 + v0.8.8: chat-to-dashboard. v0.7.7 was
  // a 3-intent regex matcher (errors / denied /
  // summary). v0.8.8 keeps the same contract but
  // grows the intent vocabulary to 6 — `errors` /
  // `denied` / `summary` / `worst` (which tool
  // failed most) / `success` (how many succeeded) /
  // `rate` (per-outcome percentages) — and makes
  // the matching bilingual (en + zh) so the
  // dashboard's chat box works for both locales
  // without a per-locale keyword list.
  //
  // The LLM dispatcher still lives behind a future
  // v0.9.x hook (would need an API key + a runtime
  // path). v0.8.8 is the rule-based router that
  // gets the user 80% of the way there with
  // zero infrastructure: a regex match on the
  // message maps to an intent, each intent picks
  // one slice of the observability summary and
  // formats it. The user can ask "最常 fail 的
  // 工具是哪个" and get a real answer.
  app.post<{ Body: { message?: string } }>(
    "/observability/chat",
    async (req, reply) => {
      const message = (req.body?.message ?? "").trim();
      if (!message) {
        await reply.code(400).send({ error: "empty message" });
        return;
      }
      const lower = message.toLowerCase();
      // v0.8.2: time-window keywords. Threaded
      // through to all v0.8.8 intents so the user
      // can ask "上周最常 fail 的工具" and get a
      // 7-day answer without leaving the chat box.
      const sinceMs =
        /(7\s*d|七\s*天|7\s*day|7d)/i.test(lower)
          ? Date.now() - 7 * 24 * 60 * 60 * 1000
          : /(24\s*h|今天|today|recent|最近|24h)/i.test(lower)
            ? Date.now() - 24 * 60 * 60 * 1000
            : /(all|全部|ever)/i.test(lower)
              ? 0
              : Date.now() - 24 * 60 * 60 * 1000;
      const since = sinceMs > 0 ? new Date(sinceMs).toISOString() : undefined;
      // v0.9.4: cross-dashboard intents are
      // detected first. If the message is about
      // policies / workflows / wrappers, we
      // short-circuit before computing the
      // observability summary (which would be
      // wasted work for a non-observability
      // question). Order: cross-dashboard
      // > specific observability > general
      // observability > fallback.
      const crossDashboardIntent = matchCrossDashboardIntent(lower);
      if (crossDashboardIntent) {
        return buildCrossDashboardReply(
          crossDashboardIntent,
          service,
        );
      }
      const summary = await service.getObservabilitySummary(since);
      // v0.8.8: 6-intent router. Each intent's
      // keyword group is bilingual (en + zh) — the
      // regexes are checked in order, so the FIRST
      // match wins. Order matters and is enforced
      // by the regression test ("成功率" must hit
      // `rate`, not `success`; "最常 fail" must hit
      // `worst`, not `errors`).
      //
      // Specific intents first, general last:
      //   1. rate   — has "%" / "率" markers
      //   2. worst  — "worst" / "最常 fail" / etc.
      //   3. denied — "拦截" / "policy" / "deni"
      //   4. errors — generic "fail" / "error" / "错误"
      //   5. success — generic "success" / "成功"
      //   6. summary — fallback
      const intent: ChatIntent =
        /(fail\s*rate|失败率|错误率|拦截率|成功率|率|rate|percent|%)/.test(lower)
          ? "rate"
          : /(worst|最差|最糟|最常\s*fail|最高失败|highest\s*fail|失败最多|报错最多)/.test(lower)
            ? "worst"
            : /(deni|拦截|policy|策略|block|被拦|拒绝)/.test(lower)
              ? "denied"
              : /(fail|error|错误|失败|报错|broken|failed)/.test(lower)
                ? "errors"
                : /(success|succeeded|成功|顺利|passed|throughput|通量|调用量)/.test(lower)
                  ? "success"
                  : "summary";
      const windowLabel = sinceMs === 0
        ? "all time"
        : sinceMs > Date.now() - 25 * 60 * 60 * 1000
          ? "last 24h"
          : "last 7d";
      return buildChatReply(intent, summary, windowLabel);
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
