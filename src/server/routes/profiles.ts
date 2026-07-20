/**
 * v0.9.16: /profiles routes extracted from server.ts.
 *
 *   - GET    /profiles                  — list (cached 30s)
 *   - GET    /profiles/:name            — one (404 on miss)
 *   - POST   /profiles/:name            — create / update
 *   - DELETE /profiles/:name            — delete (404 on miss)
 *   - GET    /profiles/active           — current active profile
 *   - POST   /profiles/:name/activate   — set active
 *   - DELETE /profiles/active           — clear active
 *
 * Cache contract (v0.9.11):
 *   - GET /profiles hits the 30s TTL cache keyed
 *     on "profiles:list".
 *   - POST /profiles/:name and DELETE
 *     /profiles/:name both invalidate
 *     "profiles:list" so the next list reflects
 *     the new state.
 *   - Active profile routes bypass the cache
 *     (single-keyed, no benefit).
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached, invalidate } from "../cache.js";

export function registerProfilesRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}
