/**
 * v0.9.16: /observability routes extracted from server.ts.
 *
 *   - GET  /observability/summary         — totals + by-tool breakdown
 *   - GET  /observability/calls           — recent calls (filtered)
 *   - POST /observability/record          — write a success/fail/denied event
 *   - POST /observability/chat            — 6-intent rule-based chat router
 *
 * The chat handler uses three helpers from
 * ../chat.ts:
 *   - `matchCrossDashboardIntent` (v0.9.4) — short-circuits to
 *     policies / workflows / wrappers when the question isn't
 *     about observability.
 *   - `buildCrossDashboardReply` (v0.9.4) — formats the
 *     cross-dashboard reply.
 *   - `buildChatReply` (v0.8.8) — formats the
 *     observability summary as a one-line reply.
 *
 * No caching — observability is the dashboard's "live
 * signal" surface. A 30s TTL on summary would be
 * confusing when the user just recorded a new event and
 * doesn't see it (or, worse, sees it after a confusing
 * lag). The /calls endpoint can be expensive on a busy
 * system, so a future release may add a 5s TTL keyed
 * on (tool × outcome × since) if profiling shows
 * hot-spots.
 */
import type { FastifyInstance } from "fastify";
import type { PilotService } from "../../core/service.js";
import {
  buildChatReply,
  buildCrossDashboardReply,
  matchCrossDashboardIntent,
  type ChatIntent,
} from "../chat.js";

export function registerObservabilityRoutes(
  app: FastifyInstance,
  service: PilotService,
): void {
  app.get("/observability/summary", async () =>
    service.getObservabilitySummary(),
  );

  app.get<{
    Querystring: {
      tool?: string;
      outcome?: "success" | "fail" | "denied";
      since?: string;
      limit?: string;
    };
  }>("/observability/calls", async (req) => {
    const q = req.query;
    const filter: {
      toolName?: string;
      outcome?: "success" | "fail" | "denied";
      since?: string;
      limit?: number;
    } = {};
    if (q.tool) filter.toolName = q.tool;
    if (q.outcome) filter.outcome = q.outcome;
    if (q.since) filter.since = q.since;
    if (q.limit) filter.limit = Number(q.limit);
    return service.getToolCalls(filter);
  });

  // v0.8.7 (B2 闭环): write side of the observability
  // surface. v0.7.3 only ever wrote `denied` (from the
  // policy hook in `service.checkPolicyCall`). v0.8.7
  // opens a POST endpoint so any caller — the workflow
  // Run handler above, the future pi ToolResultMessage
  // stream hook, or a third-party integration — can
  // record a `success` / `fail` / `denied` event.
  //
  // The body shape mirrors `RecordedToolCall` 1:1
  // (intentionally — the dashboard's ToolCallCard reads
  // the same fields, so a record written here and a
  // record written by the policy hook are
  // indistinguishable in the UI). We validate the
  // `outcome` field here so a typo (e.g. "succcess")
  // doesn't poison the log with unparseable records;
  // the other fields are the same strings the recorder
  // already writes today.
  app.post<{ Body: import("../../core/observability.js").RecordedToolCall }>(
    "/observability/record",
    async (req, reply) => {
      const body = req.body as
        | Partial<import("../../core/observability.js").RecordedToolCall>
        | undefined;
      if (
        !body ||
        typeof body.tool !== "string" ||
        typeof body.outcome !== "string" ||
        !["success", "fail", "denied"].includes(body.outcome)
      ) {
        await reply.code(400).send({
          error:
            "invalid body: expected { tool: string, outcome: 'success'|'fail'|'denied', reason?: string, errorSample?: string, context?: { ... } }",
        });
        return;
      }
      await service.recordToolCall({
        tool: body.tool,
        outcome: body.outcome as "success" | "fail" | "denied",
        reason: body.reason ?? "",
        errorSample: body.errorSample ?? "",
        // exactOptionalPropertyTypes is on, so we
        // conditionally spread the optional context
        // fields rather than passing `string |
        // undefined` (which would widen the type and
        // fail the assignment).
        context: {
          ...(body.context?.sessionId
            ? { sessionId: body.context.sessionId }
            : {}),
          ...(body.context?.workflowId
            ? { workflowId: body.context.workflowId }
            : {}),
          timestamp: body.context?.timestamp ?? new Date().toISOString(),
        },
      });
      return { ok: true };
    },
  );

  // v0.7.7 + v0.8.8: chat-to-dashboard. v0.7.7 was
  // a 3-intent regex matcher (errors / denied /
  // summary). v0.8.8 keeps the same contract but
  // grows the intent vocabulary to 6 — `errors` /
  // `denied` / `summary` / `worst` (which tool
  // failed most) / `success` (how many succeeded) /
  // `rate` (per-outcome percentages) — and makes
  // the matching bilingual (en + zh) so the
  // dashboard's chat box works for both locales
  // without a per-locale keyword list.
  //
  // The LLM dispatcher still lives behind a future
  // v0.9.x hook (would need an API key + a runtime
  // path). v0.8.8 is the rule-based router that
  // gets the user 80% of the way there with
  // zero infrastructure: a regex match on the
  // message maps to an intent, each intent picks
  // one slice of the observability summary and
  // formats it. The user can ask "最常 fail 的
  // 工具是哪个" and get a real answer.
  app.post<{ Body: { message?: string } }>(
    "/observability/chat",
    async (req, reply) => {
      const message = (req.body?.message ?? "").trim();
      if (!message) {
        await reply.code(400).send({ error: "empty message" });
        return;
      }
      const lower = message.toLowerCase();
      // v0.8.2: time-window keywords. Threaded
      // through to all v0.8.8 intents so the user
      // can ask "上周最常 fail 的工具" and get a
      // 7-day answer without leaving the chat box.
      const sinceMs = /(7\s*d|七\s*天|7\s*day|7d)/i.test(lower)
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : /(24\s*h|今天|today|recent|最近|24h)/i.test(lower)
          ? Date.now() - 24 * 60 * 60 * 1000
          : /(all|全部|ever)/i.test(lower)
            ? 0
            : Date.now() - 24 * 60 * 60 * 1000;
      const since = sinceMs > 0 ? new Date(sinceMs).toISOString() : undefined;
      // v0.9.4: cross-dashboard intents are
      // detected first. If the message is about
      // policies / workflows / wrappers, we
      // short-circuit before computing the
      // observability summary (which would be
      // wasted work for a non-observability
      // question). Order: cross-dashboard
      // > specific observability > general
      // observability > fallback.
      const crossDashboardIntent = matchCrossDashboardIntent(lower);
      if (crossDashboardIntent) {
        return buildCrossDashboardReply(crossDashboardIntent, service);
      }
      const summary = await service.getObservabilitySummary(since);
      // v0.8.8: 6-intent router. Each intent's
      // keyword group is bilingual (en + zh) — the
      // regexes are checked in order, so the FIRST
      // match wins. Order matters and is enforced
      // by the regression test ("成功率" must hit
      // `rate`, not `success`; "最常 fail" must hit
      // `worst`, not `errors`).
      //
      // Specific intents first, general last:
      //   1. rate   — has "%" / "率" markers
      //   2. worst  — "worst" / "最常 fail" / etc.
      //   3. denied — "拦截" / "policy" / "deni"
      //   4. errors — generic "fail" / "error" / "错误"
      //   5. success — generic "success" / "成功"
      //   6. summary — fallback
      const intent: ChatIntent =
        /(fail\s*rate|失败率|错误率|拦截率|成功率|率|rate|percent|%)/.test(
          lower,
        )
          ? "rate"
          : /(worst|最差|最糟|最常\s*fail|最高失败|highest\s*fail|失败最多|报错最多)/.test(
                lower,
              )
            ? "worst"
            : /(deni|拦截|policy|策略|block|被拦|拒绝)/.test(lower)
              ? "denied"
              : /(fail|error|错误|失败|报错|broken|failed)/.test(lower)
                ? "errors"
                : /(success|succeeded|成功|顺利|passed|throughput|通量|调用量)/.test(
                      lower,
                    )
                  ? "success"
                  : "summary";
      const windowLabel =
        sinceMs === 0
          ? "all time"
          : sinceMs > Date.now() - 25 * 60 * 60 * 1000
            ? "last 24h"
            : "last 7d";
      return buildChatReply(intent, summary, windowLabel);
    },
  );
}
