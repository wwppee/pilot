/**
 * v0.9.16: /capabilities and /doctor routes extracted
 * from server.ts.
 *
 *   - GET /capabilities                   — list (cached 30s)
 *   - GET /capabilities/:id               — one (404 on miss)
 *   - GET /capabilities/:aId/diff/:bId    — diff two
 *   - GET /doctor                         — health report
 *
 * Cache contract (v0.9.11):
 *   - GET /capabilities hits the 30s TTL
 *     cache keyed on "capabilities:list".
 *   - /doctor bypasses the cache — the user
 *     runs it on demand and expects fresh data.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached } from "../cache.js";

export function registerCapabilitiesRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}
