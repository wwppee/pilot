/**
 * v0.9.16: /compose routes extracted from server.ts.
 *
 *   - GET    /compose/catalog                       — list entities
 *   - GET    /compose/catalog/:kind/:id             — one entity (404 on miss)
 *   - GET    /compose/boards                        — list boards
 *   - GET    /compose/boards/:id                    — one board (404 on miss)
 *   - PUT    /compose/boards/:id                    — create or replace
 *   - POST   /compose/boards                        — create (201)
 *   - DELETE /compose/boards/:id                    — delete (204 / 404)
 *   - PATCH  /compose/boards/:id                    — rename
 *
 * `assertBoardId` lives here too because it gates
 * every boards/* route. It mirrors
 * `isValidBoardId` in core/compose-boards.ts (kept
 * in sync by the workflow-layout test and a unit
 * test on each side).
 *
 * No caching — boards are user-mutated, the user
 * expects to see their own writes immediately, and
 * the boards dir is small (< 100 boards typical).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PilotService } from "../../core/service.js";

export function registerComposeRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
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
    Body: import("../../core/compose-boards.js").BoardInput;
  }>("/compose/boards/:id", async (req, reply) => {
    if (!(await assertBoardId(req.params.id, reply))) return;
    // The path id wins over the body id — the URL is the file
    // identity, body id is just a hint for "create with this id".
    const input = { ...req.body, id: req.params.id };
    const board = await service.saveComposeBoard(input);
    return board;
  });

  app.post<{ Body: import("../../core/compose-boards.js").BoardInput }>(
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
}
