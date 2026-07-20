/**
 * v0.9.16: /wrappers routes extracted from server.ts.
 *
 *   - GET  /wrappers                  — list (cached 30s)
 *   - GET  /wrappers/:name            — one (404 on miss)
 *   - PUT  /wrappers/:name            — create or replace
 *   - DELETE /wrappers/:name          — delete (404 on miss)
 *   - POST /wrappers/:name/apply      — install into pi extensions/
 *   - POST /wrappers/:name/unapply    — remove from pi extensions/
 *
 * Cache contract (v0.9.13):
 *   - GET /wrappers hits the 30s TTL cache keyed
 *     on "wrappers:list".
 *   - PUT and DELETE invalidate "wrappers:list".
 *   - apply / unapply do NOT invalidate (they
 *     only mutate `~/.pilot/extensions/`, not the
 *     wrapper TOML).
 *
 * v0.9.7 contract:
 *   - PUT parses the body against
 *     `ToolWrapperInputSchema` (Zod) at the route
 *     boundary. Bad input returns 400 with the
 *     Zod error issues instead of trusting
 *     `req.body as any`.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached, invalidate } from "../cache.js";

export function registerWrappersRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
  // v0.9.0 (A2 — tool wrapper): REST surface mirrors
  // the policy surface. The data model + apply flow
  // are the contract for the future pi-side hook;
  // v0.9.0 ships the schema + CRUD + apply (which
  // writes a no-op stub extension so the apply / unapply
  // flow is observable end-to-end).
  app.get("/wrappers", async () =>
    cached("wrappers:list", () => service.listWrappers()),
  );

  app.get<{ Params: { name: string } }>(
    "/wrappers/:name",
    async (req, reply) => {
      const w = await service.getWrapper(req.params.name);
      if (!w) {
        await reply.code(404).send({ error: "wrapper not found" });
        return;
      }
      return w;
    },
  );

  app.put<{
    Params: { name: string };
    Body: import("../../core/tool-wrapper.js").ToolWrapperInput;
  }>("/wrappers/:name", async (req, reply) => {
    // v0.9.7: parse body against the Zod schema
    // before handing it to the service. Pre-v0.9.7
    // we used `req.body as any`, which trusted the
    // client fully and only validated at the write
    // layer (a layer-down Zod parse inside
    // `writeWrapper`). Now bad input returns 400
    // immediately with a clear Zod error message.
    const { ToolWrapperInputSchema } =
      await import("../../core/tool-wrapper.js");
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
}
