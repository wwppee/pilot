/**
 * v0.9.16: /avatars routes extracted from server.ts.
 *
 *   - GET    /avatars                 — list avatars
 *   - GET    /avatars/current         — current pilot state
 *   - GET    /avatars/:cwd            — one avatar (404 on miss)
 *   - GET    /avatars/:cwd/diff       — diff against current state
 *   - POST   /avatars/:cwd/capture    — capture current state as avatar
 *   - POST   /avatars/:cwd/apply      — apply avatar (?dry=1 for preview)
 *   - DELETE /avatars/:cwd            — delete (404 on miss)
 *
 * No caching — each request is fast (< 50ms) and the
 * dashboard refreshes on user action rather than a
 * timer, so stale data is more confusing than a
 * direct disk read.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";

export function registerAvatarsRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
}
