/**
 * v0.9.16: /workflows routes extracted from server.ts.
 *
 *   - GET  /workflows                       — list (cached 30s)
 *   - GET  /workflows/:id                   — one (404 on miss)
 *   - PUT  /workflows/:id                   — create or replace
 *   - GET  /workflows/:id/export            — JSON for marketplace
 *   - POST /workflows/import/:id            — import JSON payload
 *   - GET  /workflows/:id/validate          — structural validation
 *   - DELETE /workflows/:id                 — delete (404 on miss)
 *   - POST /workflows/:id/run               — queue a run (stub)
 *
 * `isValidWorkflowId` lives here because it gates
 * every workflows/* route. It mirrors
 * `isValidWorkflowId` in core/workflow.ts and is
 * kept in sync by the workflow-layout test.
 *
 * Cache contract (v0.9.13):
 *   - GET /workflows hits the 30s TTL cache
 *     keyed on "workflows:list".
 *   - PUT / import / DELETE invalidate
 *     "workflows:list" (they mutate
 *     `~/.pilot/workflows/<id>/`).
 *   - 409-on-existing in the import route doesn't
 *     touch disk and doesn't need to invalidate.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import { cached, invalidate } from "../cache.js";

export function registerWorkflowsRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
  // v0.7.0: same boundary check for workflow ids, but the
  // regex is stricter (kebab-case only, no underscores / uppercase)
  // because the workflow id is also a command-line identifier
  // (`pilot workflow show <id>` is planned for v0.7.3+).
  // Mirrors `isValidWorkflowId` in core/workflow.ts.
  const isValidWorkflowId = (id: string): boolean => {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 64;
  };

  app.get("/workflows", async () =>
    cached("workflows:list", () => service.listWorkflows()),
  );

  app.get<{ Params: { id: string } }>("/workflows/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    const wf = await service.getWorkflow(req.params.id);
    if (!wf) {
      await reply.code(404).send({ error: "workflow not found" });
      return;
    }
    return wf;
  });

  app.put<{
    Params: { id: string };
    Body: import("../../core/workflow.js").WorkflowInput;
  }>("/workflows/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    // Path id wins over body id — it's the canonical file
    // location; the body's id is ignored so the URL is
    // always the source of truth.
    try {
      const saved = await service.saveWorkflow({
        ...req.body,
        id: req.params.id,
      });
      // v0.9.13: saveWorkflow mutates
      // `~/.pilot/workflows/<id>/`, so the bare-list
      // cache is stale until invalidated.
      invalidate("workflows:list");
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      await reply.code(400).send({ error: msg });
      return;
    }
  });

  // v0.9.1 (template marketplace): export a workflow
  // as a JSON payload the user can save, share,
  // version-control, or feed back to /workflows/import.
  // We strip the metadata (createdAt / updatedAt are
  // server-managed) so the exported shape is
  // round-trip-clean: importing it produces a
  // workflow with a fresh metadata stamp.
  app.get<{ Params: { id: string } }>(
    "/workflows/:id/export",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const wf = await service.getWorkflow(req.params.id);
      if (!wf) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      return {
        name: wf.name,
        description: wf.description,
        version: wf.version,
        nodes: wf.nodes,
        edges: wf.edges,
        // v0.9.1: a magic string the importer
        // checks. Future versions can branch on
        // this for migration paths.
        format: "pilot-workflow@1" as const,
        exportedAt: new Date().toISOString(),
      };
    },
  );

  // v0.9.1: import a workflow from an exported JSON
  // payload. The body must include the new id (URL
  // path) plus the rest of the WorkflowInput fields.
  // We reject if the id already exists (409) so the
  // user explicitly chooses to overwrite via PUT.
  app.post<{
    Params: { id: string };
    Body: import("../../core/workflow.js").WorkflowInput;
  }>("/workflows/import/:id", async (req, reply) => {
    if (!isValidWorkflowId(req.params.id)) {
      await reply.code(400).send({ error: "invalid workflow id" });
      return;
    }
    const existing = await service.getWorkflow(req.params.id);
    if (existing) {
      await reply.code(409).send({
        error: "workflow id already exists; pick a new id or PUT to overwrite",
        existingId: req.params.id,
      });
      return;
    }
    try {
      const saved = await service.saveWorkflow({
        ...req.body,
        id: req.params.id,
      });
      // v0.9.13: import persists a new workflow
      // (or overwrites one), so the list cache is
      // stale. The "exists? 409" branch above
      // doesn't touch disk and doesn't need to
      // invalidate.
      invalidate("workflows:list");
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "import failed";
      await reply.code(400).send({ error: msg });
      return;
    }
  });

  // v0.8.10: structural validation endpoint. Lets the
  // editor's "Validate" button ask the server "is this
  // workflow runnable?" without queuing a real run. We
  // do the validation in core/workflow.ts (pure
  // function) and surface the same `WorkflowValidationResult`
  // shape here.
  //
  // The HTTP status is 200 for both "ok" and "has
  // warnings" (the call succeeded; the user can read
  // the issues). 400 only for a malformed request
  // (bad id). We deliberately don't 400 on validation
  // errors themselves — that would conflate "the call
  // worked and the workflow is broken" with "the call
  // was malformed", which makes the editor's UX
  // worse (it'd render an error toast instead of a
  // structured issues list).
  app.get<{ Params: { id: string } }>(
    "/workflows/:id/validate",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const wf = await service.getWorkflow(req.params.id);
      if (!wf) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      const { validateWorkflow } = await import("../../core/workflow.js");
      return validateWorkflow(wf);
    },
  );

  // v0.7.1 (audit fix): distinguish "deleted" from "didn't
  // exist". Previously we always returned 200, which made
  // the UI's "row is gone, the list reloaded" path run
  // even on a stale id (e.g. user opens the list in two
  // tabs, deletes in one, refreshes in the other). Now
  // we check first and 404 if the workflow doesn't exist
  // — the same semantic as `/compose/boards/:id` DELETE
  // and the rest of the v0.7.x API surface.
  app.delete<{ Params: { id: string } }>(
    "/workflows/:id",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const existing = await service.getWorkflow(req.params.id);
      if (!existing) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      const removed = await service.deleteWorkflow(req.params.id);
      // v0.9.13: deleteWorkflow mutates
      // `~/.pilot/workflows/<id>/`. The "404 if missing"
      // branch above doesn't touch disk.
      invalidate("workflows:list");
      return { removed };
    },
  );

  // v0.7.5: Run workflow — minimum-viable endpoint that
  // validates the workflow exists and returns a stub
  // response. The real runtime (driving a pi session
  // through the node sequence with onFailure fallback)
  // lives behind this same contract in v0.7.6+; the
  // editor's Run button just calls this and renders
  // whatever comes back. Keeping the contract stable
  // now means we can ship the UI without waiting for
  // the runtime to be ready.
  app.post<{ Params: { id: string } }>(
    "/workflows/:id/run",
    async (req, reply) => {
      if (!isValidWorkflowId(req.params.id)) {
        await reply.code(400).send({ error: "invalid workflow id" });
        return;
      }
      const wf = await service.getWorkflow(req.params.id);
      if (!wf) {
        await reply.code(404).send({ error: "workflow not found" });
        return;
      }
      // v0.8.10: refuse to queue a run if the
      // workflow has a structural error (cycle,
      // dangling edge, self-edge). Warnings
      // (orphan, dangling-reference) still let
      // the user proceed because the v0.9.x
      // runtime can recover at execution time;
      // errors are hard stops.
      const { validateWorkflow } = await import("../../core/workflow.js");
      const validation = validateWorkflow(wf);
      const hasError = validation.issues.some((i) => i.severity === "error");
      if (hasError) {
        await reply.code(400).send({
          error: "workflow has structural errors",
          issues: validation.issues,
        });
        return;
      }
      // v0.8.7 (B2 闭环): the workflow "Run" stub
      // now actually exercises the observability layer.
      // v0.7.5 returned `{status: "queued"}` and that
      // was the whole story — the dashboard's success /
      // fail counts were always zero because nothing
      // ever wrote a `success` record. v0.8.7 keeps the
      // "queued" surface (the real runtime is still
      // future work — pi ToolResultMessage wiring
      // lands in v0.9.x) but now, for every node in
      // the workflow, we record a `success` outcome so
      // the dashboard immediately reflects "this
      // workflow ran" once the user clicks Run. The
      // recorded event carries `workflowId` in its
      // context so the dashboard can correlate "the
      // success spike 5 seconds ago" with "I just
      // clicked Run on workflow X".
      //
      // We record every node as a `success` here
      // because the mock runtime can't actually fail.
      // When the real runtime lands, the per-node
      // record will carry `fail` instead when the
      // tool errored, and `denied` when policy
      // intercepted. The contract is the same.
      const recordedAt = new Date().toISOString();
      for (const node of wf.nodes) {
        // Each LLM config records under the tool name
        // `node.model.provider` (or just the node id if
        // no provider is set) — we don't have a real
        // "tool" here, but the dashboard keys by tool
        // name and "anthropic" / "openai" are useful
        // buckets for the "which provider is most
        // exercised?" question the user will want to
        // ask in chat.
        const tool = node.model?.provider ?? `node:${node.id}`;
        await service.recordToolCall({
          tool,
          outcome: "success",
          reason: "workflow run",
          errorSample: "",
          context: {
            workflowId: wf.id,
            timestamp: recordedAt,
          },
        });
      }
      return {
        status: "queued" as const,
        workflowId: wf.id,
        // v0.8.7: keep the same surface but acknowledge
        // the per-node observability writes explicitly.
        // The message no longer says "Runtime lands in
        // v0.7.6+" — that was wrong (we are now at
        // v0.8.7) and the new text reflects the real
        // state of affairs: the runtime is still future
        // work, but observability is already wired.
        message:
          "Run is queued. Per-node tool calls are recorded to the observability log; full pi runtime lands in v0.9.x.",
        recordedNodes: wf.nodes.length,
      };
    },
  );
}
