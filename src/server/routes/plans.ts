/**
 * v0.9.16: /plans routes extracted from server.ts.
 *
 *   - GET  /plans                            — list
 *   - POST /plans                            — create (goal required)
 *   - POST /plans/suggest-tools             — tool suggestions
 *   - GET  /plans/:id                        — one (404 on miss)
 *   - GET  /plans/:id/events                 — execution history
 *   - PUT  /plans/:id                        — partial update
 *   - DELETE /plans/:id                      — delete (404 on miss)
 *   - POST /plans/:id/start                  — start execution
 *   - POST /plans/:id/pause                  — pause
 *   - POST /plans/:id/resume                 — resume
 *   - POST /plans/:id/cancel                 — cancel
 *   - PUT  /plans/:id/tasks/:taskId          — update task
 *   - PUT  /plans/:id/tasks/:taskId/steps/:stepId
 *                                            — update step
 *   - POST /plans/:id/tasks/:taskId/retry    — retry failed task
 *   - POST /plans/:id/tasks/:taskId/skip     — skip blocked task
 *
 * No caching — plans mutate constantly during
 * execution (status, events, task updates). A
 * cache would go stale every 100ms on a running
 * plan, and stale plan data in the UI is
 * actively dangerous (the user might think
 * "retry worked" when it didn't).
 *
 * The runtime writes through service.*Plan()
 * methods, so invalidation would have to be wired
 * into every plan mutation — that's the wrong
 * cost/risk ratio. Direct reads it is.
 *
 * Static routes (`/plans/suggest-tools`) are
 * registered BEFORE the `/plans/:id` wildcards so
 * find-my-way's static-preference order is
 * preserved (P1#9 from v0.5.7 review).
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";

export function registerPlansRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
  app.get("/plans", async () => service.listPlans());

  // v0.5.7 review P0#2: tighten the create body — only `goal` is
  // required, and `title` / `context` are the only other accepted
  // fields. Everything else (status, strategy, tasks, result,
  // timestamps) is server-controlled and silently stripped so a
  // client can't inject e.g. {status: "completed"}.
  app.post<{
    Body: {
      goal?: unknown;
      title?: unknown;
      context?: unknown;
      strategy?: unknown;
      tasks?: unknown;
    };
  }>("/plans", async (req) => {
    const body = req.body ?? {};
    const { goal, title, context, strategy, tasks } = body as {
      goal?: unknown;
      title?: unknown;
      context?: unknown;
      strategy?: unknown;
      tasks?: unknown;
    };
    if (typeof goal !== "string" || goal.trim().length === 0) {
      throw Object.assign(new Error("goal is required (non-empty string)"), {
        statusCode: 400,
      });
    }
    // v0.6.1: accept tasks[] so the web /plans/new editor can
    // create a fully-populated plan in one POST (instead of
    // creating an empty plan + N PUT updates). Each task
    // shape is validated against the zod Task schema in
    // service.createPlan; bad input → 400 from there.
    const input: {
      goal: string;
      title?: string;
      strategy?: import("../../core/plan.js").PlanStrategy;
      tasks?: import("../../core/plan.js").Task[];
      context?: Record<string, string>;
    } = {
      goal: goal.trim(),
    };
    if (typeof title === "string" && title.length > 0) {
      input.title = title;
    }
    if (
      strategy === "sequential" ||
      strategy === "parallel" ||
      strategy === "adaptive"
    ) {
      input.strategy = strategy;
    }
    if (Array.isArray(tasks)) {
      // The zod Task schema in service.createPlan validates each
      // element; we just forward the JSON payload. The cast is
      // safe because writePlan uses PlanInputSchema.parse which
      // throws 400 on any shape mismatch.
      input.tasks = tasks as unknown as import("../../core/plan.js").Task[];
    }
    if (context && typeof context === "object") {
      // The server fills `cwd`; only forward a narrow allow-list.
      const ctx: Record<string, string> = {};
      const c = context as Record<string, unknown>;
      if (typeof c["activeProfile"] === "string") {
        ctx["activeProfile"] = c["activeProfile"];
      }
      if (typeof c["gitBranch"] === "string") {
        ctx["gitBranch"] = c["gitBranch"];
      }
      if (Object.keys(ctx).length > 0) {
        input.context = ctx;
      }
    }
    return service.createPlan(input);
  });

  // P1#9 (v0.5.7 review): define static /plans/suggest-tools BEFORE
  // any /plans/:id wildcard. Fastify's find-my-way does prefer static
  // over dynamic, so this is defensive — but if someone adds a route
  // like /plans/:id/something later, the order stops being load-bearing.
  app.post<{ Body: { goal: string } }>("/plans/suggest-tools", async (req) => {
    const { goal } = req.body;
    if (!goal || typeof goal !== "string") {
      throw Object.assign(new Error("goal is required"), {
        statusCode: 400,
      });
    }
    return service.suggestTools(goal);
  });

  app.get<{ Params: { id: string } }>("/plans/:id", async (req) => {
    const plan = await service.getPlan(req.params.id);
    if (!plan) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return plan;
  });

  // v0.5.13+: plan execution history. Static path registered BEFORE
  // the wildcards further down. Returns [] if the plan has no events
  // yet (never started) and 404 if the plan doesn't exist.
  app.get<{ Params: { id: string } }>("/plans/:id/events", async (req) => {
    const events = await service.getPlanEvents(req.params.id);
    if (events === null) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return events;
  });

  app.put<{
    Params: { id: string };
    Body: Partial<import("../../core/plan.js").Plan>;
  }>("/plans/:id", async (req) => {
    return service.updatePlan(req.params.id, req.body);
  });

  app.delete<{ Params: { id: string } }>("/plans/:id", async (req) => {
    const deleted = await service.deletePlan(req.params.id);
    if (!deleted) {
      throw Object.assign(new Error("plan not found"), { statusCode: 404 });
    }
    return { ok: true };
  });

  // Plan execution control
  app.post<{ Params: { id: string } }>("/plans/:id/start", async (req) =>
    service.startPlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/pause", async (req) =>
    service.pausePlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/resume", async (req) =>
    service.resumePlan(req.params.id),
  );

  app.post<{ Params: { id: string } }>("/plans/:id/cancel", async (req) =>
    service.cancelPlan(req.params.id),
  );

  // Task / Step updates (manual intervention)
  app.put<{
    Params: { id: string; taskId: string };
    Body: Partial<import("../../core/plan.js").Task>;
  }>("/plans/:id/tasks/:taskId", async (req) =>
    service.updateTask(req.params.id, req.params.taskId, req.body),
  );

  app.put<{
    Params: { id: string; taskId: string; stepId: string };
    Body: Partial<import("../../core/plan.js").Step>;
  }>("/plans/:id/tasks/:taskId/steps/:stepId", async (req) =>
    service.updateStep(
      req.params.id,
      req.params.taskId,
      req.params.stepId,
      req.body,
    ),
  );

  // v0.6.0: retry / skip endpoints for failed / blocked tasks.
  app.post<{ Params: { id: string; taskId: string } }>(
    "/plans/:id/tasks/:taskId/retry",
    async (req) => service.retryTask(req.params.id, req.params.taskId),
  );
  app.post<{ Params: { id: string; taskId: string } }>(
    "/plans/:id/tasks/:taskId/skip",
    async (req) => service.skipTask(req.params.id, req.params.taskId),
  );
}
