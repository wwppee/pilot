/**
 * v0.9.16: /stats, /usage, /tools, /context routes
 * extracted from server.ts.
 *
 *   - GET /stats?range=&days=    — aggregates
 *   - GET /usage?range=&days=    — token / cost usage
 *   - GET /tools                 — registered tools
 *   - GET /context?cwd=          — project context
 *
 * No caching: these are aggregate views the user
 * reads manually, and stale aggregates (with a 30s
 * window) would be confusing. /stats and /usage
 * are also expensive to compute and a cache miss
 * storm is possible on dashboard refresh — v0.9.16
 * keeps them direct. (A future release can add a
 * shorter TTL like 5s if the cost shows up in
 * profiling.)
 *
 * `?range=` is parsed via the shared helper in
 * ../range.js so the two endpoints always agree
 * on what "today" / "lastDays" means.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { parseRange } from "../range.js";

export function registerStatsRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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

  // v1.0.4: per-tool enable/disable. POST /tools/:name/toggle
  // with body `{ enabled: boolean }` writes the override to
  // ~/.pilot/tools-state.json. 404 if the name isn't a known
  // tool (rejects typo'd names that would otherwise silently
  // get persisted to the state file).
  app.post<{
    Params: { name: string };
    Body: { enabled?: unknown };
  }>("/tools/:name/toggle", async (req, reply) => {
    const name = req.params.name;
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    const tools = await service.listTools();
    if (!tools.some((t) => t.name === name)) {
      return reply.code(404).send({ error: "unknown tool" });
    }
    return service.setToolEnabled(name, enabled);
  });

  // ─── Project context (v0.4.2) ────────────────────────

  app.get<{ Querystring: { cwd?: string } }>("/context", async (req) => {
    const cwd = req.query.cwd ?? process.cwd();
    return service.discoverProjectContext(cwd);
  });

  // v1.0.3: read a discovered context file. Path must
  // belong to the discovery whitelist (enforced inside
  // service.readContextFile). Returns 404 if the path
  // isn't part of the discovered set, 400 if the body
  // is malformed.
  app.get<{ Querystring: { cwd?: string; path?: string } }>(
    "/context/file",
    async (req, reply) => {
      const cwd = req.query.cwd ?? process.cwd();
      const path = req.query.path;
      if (!path) return reply.code(400).send({ error: "path is required" });
      const result = await service.readContextFile(cwd, path);
      if (!result) return reply.code(404).send({ error: "not found" });
      return result;
    },
  );

  // v1.0.3: write a discovered, *loaded* context file.
  // Informational files (README.md etc.) are read-only
  // through this endpoint. Whitelist is re-checked on
  // every call. Returns 404 if the path isn't writable
  // (not discovered, or informational-only).
  app.post<{
    Body: { cwd?: string; path?: string; content?: unknown };
  }>("/context/file", async (req, reply) => {
    const cwd = req.body?.cwd ?? process.cwd();
    const path = req.body?.path;
    const content = req.body?.content;
    if (!path || typeof content !== "string") {
      return reply.code(400).send({ error: "path and content are required" });
    }
    const result = await service.writeContextFile(cwd, path, content);
    if (!result) return reply.code(404).send({ error: "not writable" });
    return result;
  });
}
