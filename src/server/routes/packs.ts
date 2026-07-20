/**
 * v0.9.16: /packs and /forge routes extracted from
 * server.ts.
 *
 *   - GET  /packs                  — list installed packs (cached 30s)
 *   - GET  /packs/search?q=        — search npm registry
 *   - GET  /packs/info/:name       — fetch single pack (404 on miss)
 *
 *   - GET  /forge/search?q=        — search npm for absorption
 *   - GET  /forge/inspect/:name    — inspect a single package
 *   - POST /forge/absorb           — absorb a package as a capability
 *
 * Cache contract (v0.9.11):
 *   - /packs hits the 30s TTL cache keyed on
 *     "packs:list". The cache is invalidated by
 *     POST /packs/install and POST /packs/uninstall
 *     so the next list reflects the new state.
 *   - /packs/search and /packs/info bypass the
 *     cache (per-request queries, low hit rate
 *     anyway, and stale search results are
 *     confusing).
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached, invalidate } from "../cache.js";

export function registerPacksRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}

/**
 * Write routes for packs (install / uninstall). Kept
 * separate from the read routes above so the read
 * cache contract (v0.9.11) is colocated with the
 * reads and not split across two files.
 *
 * Both routes invalidate the `packs:list` cache so
 * the next GET /packs reflects the new state.
 */
export function registerPacksWriteRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}
