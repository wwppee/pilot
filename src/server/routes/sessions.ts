/**
 * v0.9.16: /sessions routes extracted from server.ts.
 *
 *   - GET /sessions?model=&cwd=&sinceDays=  — list (cached 30s when no filter)
 *   - GET /sessions/search?q=&case=1        — full-text search
 *   - GET /sessions/:id/tree                — session message tree
 *   - GET /sessions/:id/snapshot            — fresh snapshot (404 on miss)
 *   - GET /sessions/:id/template            — profile-creation template
 *   - GET /sessions/:id/info                — per-session summary card
 *
 * Cache contract (v0.9.11):
 *   - GET /sessions with NO query params hits
 *     the 30s TTL cache keyed on "sessions:list".
 *     Any filter (?model=, ?cwd=, ?sinceDays=)
 *     bypasses the cache — see server.ts:365
 *     comment for the key-explosion rationale.
 *   - /sessions/:id/* routes bypass the cache;
 *     they're per-id and don't benefit.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached } from "../cache.js";

export function registerSessionsRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}
