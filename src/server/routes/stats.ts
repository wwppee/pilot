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

  // ─── Project context (v0.4.2) ────────────────────────

  app.get<{ Querystring: { cwd?: string } }>("/context", async (req) => {
    const cwd = req.query.cwd ?? process.cwd();
    return service.discoverProjectContext(cwd);
  });
}
