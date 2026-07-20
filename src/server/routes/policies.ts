/**
 * v0.9.16: /policies routes extracted from server.ts.
 *
 *   - GET  /policies                  — list (cached 30s)
 *   - GET  /policies/:name            — one (404 on miss)
 *   - PUT  /policies/:name            — create or replace
 *   - DELETE /policies/:name          — delete
 *   - POST /policies/:name/apply      — install into pi extensions/
 *   - POST /policies/:name/unapply    — remove from pi extensions/
 *   - POST /policies/:name/check      — dry-run an action through the policy
 *
 * Cache contract (v0.9.13):
 *   - GET /policies hits the 30s TTL cache keyed
 *     on "policies:list".
 *   - PUT /policies/:name and DELETE
 *     /policies/:name invalidate "policies:list"
 *     so the next list reflects the new state.
 *   - apply / unapply do NOT invalidate — they
 *     only mutate `~/.pilot/extensions/`, not the
 *     policy TOML itself.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached, invalidate } from "../cache.js";

export function registerPoliciesRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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

  // Apply / unapply don't touch the policy TOML, so
  // they deliberately don't invalidate the cache.

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
}
