/**
 * v0.9.16: chat helpers extracted from server.ts.
 *
 * Two pairs of helpers used by the chat endpoint:
 *
 *   - `matchCrossDashboardIntent` + `buildCrossDashboardReply`
 *     (v0.9.4) — answer questions about policies /
 *     workflows / wrappers from the chat box, so the
 *     user doesn't have to leave the page.
 *
 *   - `buildChatReply` (v0.8.8) — format the
 *     observability summary as a one-line reply for
 *     each of the 6 intents (errors / denied / worst /
 *     success / rate / summary).
 *
 * Extracted from server.ts so the file doesn't have to
 * hold both 60+ route handlers AND 200+ lines of
 * intent routing logic in one place. Pure functions
 * (no Fastify / no side effects) so unit tests can
 * exercise each intent in isolation.
 */

import type { PilotService } from "../core/service.js";

/**
 * v0.8.8: 6 chat intents. The router maps a natural-
 * language query to one of these; each intent picks
 * a different slice of the observability summary
 * and formats it as a one-line reply.
 *
 *   - `errors`  — "what's failing?" (the per-tool
 *                 fail breakdown, top 5)
 *   - `denied`  — "what's being blocked?" (the
 *                 per-tool policy-block breakdown)
 *   - `worst`   — "which tool is worst?" (the
 *                 highest-fail-rate tool)
 *   - `success` — "what's succeeding?" (the success
 *                 count + rate)
 *   - `rate`    — "what's the rate?" (all three
 *                 per-outcome percentages at once)
 *   - `summary` — fallback / total breakdown
 *
 * The 6-intent vocabulary is a deliberate balance:
 * fewer intents and the user can't ask the
 * high-value questions ("which tool fails most?",
 * "what's my success rate?"); more intents and the
 * keyword regexes start to overlap and the router
 * becomes confusing to debug.
 */
export type ChatIntent =
  | "errors"
  | "denied"
  | "worst"
  | "success"
  | "rate"
  | "summary"
  // v0.9.4: cross-dashboard intents. The chat box
  // lives on the observability page, but the
  // router now also answers questions about
  // policies / workflows / wrappers so the user
  // doesn't have to leave the page to ask "how
  // many policies do I have?" or "list my
  // workflows".
  | "policies"
  | "workflows"
  | "wrappers";

/**
 * Build a one-line chat reply for a given intent.
 * Kept as a top-level helper (not inlined in the
 * route handler) so the unit tests can exercise
 * each intent in isolation without spinning up
 * Fastify. The shape is:
 *
 *   { intent: ChatIntent, text: string, window?: string }
 *
 * `window` is included whenever the time window
 * is non-default (24h) so the user can see what
 * "recent" means in the reply — "most failing
 * tool in the last 7d" is much more useful than
 * "bash: 3 failures" with no time anchor.
 */
export function buildChatReply(
  intent: ChatIntent,
  summary: import("../core/observability.js").ObservabilitySummary,
  windowLabel: string,
): { intent: ChatIntent; text: string; window?: string } {
  // v0.9.4: cross-dashboard intents are
  // handled by the route handler before this
  // helper is called. The switch only sees
  // observability-derived intents.
  switch (intent) {
    case "errors": {
      const failing = summary.byTool
        .filter((r) => r.fail > 0)
        .slice(0, 5)
        .map((r) => `${r.tool}: ${r.fail} failure(s)`)
        .join("; ");
      return {
        intent,
        window: windowLabel,
        text: failing || `No failures in ${windowLabel}.`,
      };
    }
    case "denied": {
      const blocked = summary.byTool
        .filter((r) => r.denied > 0)
        .slice(0, 5)
        .map((r) => `${r.tool}: ${r.denied} block(s)`)
        .join("; ");
      return {
        intent,
        window: windowLabel,
        text: blocked || `No policy blocks in ${windowLabel}.`,
      };
    }
    case "worst": {
      // "which tool is worst" — we use the existing
      // `worstTool` field on the summary (5-call
      // minimum) so a tool with 1 fail out of 1
      // call doesn't rank above a tool with 50 fails
      // out of 100. If no tool qualifies, we say so
      // explicitly rather than defaulting to the
      // highest-total row.
      if (summary.worstTool) {
        const worst = summary.byTool.find((r) => r.tool === summary.worstTool);
        return {
          intent,
          window: windowLabel,
          text: worst
            ? `${summary.worstTool}: ${worst.fail}/${worst.total} = ${Math.round((worst.fail / Math.max(1, worst.total)) * 100)}% fail rate in ${windowLabel}.`
            : `${summary.worstTool} is the highest-fail-rate tool in ${windowLabel}.`,
        };
      }
      return {
        intent,
        window: windowLabel,
        text: `No tool has enough calls in ${windowLabel} to rank fail-rate (need ≥5).`,
      };
    }
    case "success": {
      // "how many succeeded" — count + rate. The
      // rate is pre-computed on the summary so the
      // reply is a single arithmetic op. If total
      // is 0 the rate is 0% (not NaN%) thanks to
      // the v0.8.7 /0 guard.
      const pct = Math.round(summary.successRate * 100);
      return {
        intent,
        window: windowLabel,
        text: `${summary.success} succeeded (${pct}% success rate) in ${windowLabel}.`,
      };
    }
    case "rate": {
      // "what's the rate" — show all three
      // percentages at once. This is the "give me
      // the dashboard numbers in text" intent and
      // is the most useful one for chat because
      // it answers "is the system healthy?" in a
      // single reply.
      const sp = Math.round(summary.successRate * 100);
      const fp = Math.round(summary.failRate * 100);
      const dp = Math.round(summary.deniedRate * 100);
      return {
        intent,
        window: windowLabel,
        text: `In ${windowLabel}: success ${sp}%, fail ${fp}%, denied ${dp}% (${summary.total} total).`,
      };
    }
    case "summary": {
      // Fallback for queries that don't match any
      // specific intent. v0.7.7 returned the same
      // shape; v0.8.8 keeps it as the default so
      // "how's it going?" still gets a useful reply.
      return {
        intent,
        text: `${summary.total} call(s); ${summary.success} success, ${summary.fail} fail, ${summary.denied} denied. Worst tool: ${summary.worstTool ?? "none"}.`,
      };
    }
    // v0.9.4: cross-dashboard intents are
    // handled by the route handler before this
    // helper is called. The remaining cases
    // (errors / denied / worst / success / rate
    // / summary) are all observability-derived.
    // If a future change adds a new ChatIntent
    // member, the route handler will fail to
    // compile until it routes the new intent
    // to the right helper. The default branch
    // below is the catch-all for any
    // cross-dashboard intent that somehow
    // slips through (defensive — in practice
    // the route handler short-circuits first).
    default:
      return {
        intent,
        text: "Try a more specific question about your policies, workflows, wrappers, or observability data.",
      };
  }
}

// ─── v0.9.4: cross-dashboard chat helpers ──────────────

/**
 * Detect a cross-dashboard intent (policies /
 * workflows / wrappers) from the lowercased
 * message. Returns the matching intent or
 * `null` if the message is about observability
 * (or anything else — the route handler then
 * falls through to the observability router).
 *
 * Same specific-before-general ordering as the
 * observability router: a regex match for
 * "policy" wins over a regex match for "denied"
 * because policy is a noun (the resource) and
 * denied is a verb (the outcome). The user's
 * intent is more likely to be "tell me about
 * my policies" than "tell me about denied
 * events" if the word policy appears at all.
 */
export function matchCrossDashboardIntent(lower: string): ChatIntent | null {
  // v0.9.4: cross-dashboard intents are detected
  // by quantifier phrases ("my X" / "how many X" /
  // "list X" / "X 个" / "X 几个"). Bare mentions of
  // "policy" / "策略" stay with the observability
  // router (they map to the "denied" intent) so
  // "what was blocked by policy?" still works.
  //
  // The regexes are intentionally specific so
  // they don't shadow the observability intents.
  // If the user types just "policy" the
  // observability router wins (denied / block /
  // 拦截 / 策略 are the keywords there). If they
  // type "my policies" / "策略有几个" the
  // cross-dashboard router wins.
  if (
    /(my\s+polic|how\s+many\s+polic|list\s+polic|count\s+polic|polic(y|ies)\s+saved|polic(y|ies)\s+exist|几条\s*策略|几个\s*策略|我的\s*策略|有哪些\s*策略|list.*策略)/i.test(
      lower,
    )
  ) {
    return "policies";
  }
  if (
    /(my\s+workflow|how\s+many\s+workflow|list\s+workflow|count\s+workflow|workflows?\s+saved|workflows?\s+exist|几\s*个\s*工作流|多少\s*个?\s*工作流|我\s*的\s*工作流|有哪些\s*工作流|list.*工作流)/i.test(
      lower,
    )
  ) {
    return "workflows";
  }
  if (
    /(my\s+wrapper|how\s+many\s+wrapper|list\s+wrapper|count\s+wrapper|wrappers?\s+saved|wrappers?\s+exist|几\s*个\s*包装|我\s*的\s*包装|有哪些\s*包装|list.*包装)/i.test(
      lower,
    )
  ) {
    return "wrappers";
  }
  return null;
}

/**
 * Build a one-line chat reply for a cross-dashboard
 * intent. Pulls the data from the right service
 * method and formats the list compactly. Each
 * intent returns:
 *   - a count (so the user can scan "5
 *     policies" without doing arithmetic)
 *   - up to 5 names (so the user sees the
 *     actual resources, not just a number)
 *
 * The shape is the same as buildChatReply
 * (intent / text / window?) so the client
 * doesn't need to special-case.
 */
export async function buildCrossDashboardReply(
  intent: ChatIntent,
  service: PilotService,
): Promise<{ intent: ChatIntent; text: string }> {
  if (intent === "policies") {
    const policies = await service.listPolicies();
    const names = policies
      .slice(0, 5)
      .map((p) => p.name)
      .join(", ");
    return {
      intent,
      text:
        policies.length === 0
          ? "No policies saved."
          : `${policies.length} polic${policies.length === 1 ? "y" : "ies"}: ${names}${policies.length > 5 ? "…" : ""}`,
    };
  }
  if (intent === "workflows") {
    const workflows = await service.listWorkflows();
    const names = workflows
      .slice(0, 5)
      .map((w) => w.id)
      .join(", ");
    return {
      intent,
      text:
        workflows.length === 0
          ? "No workflows saved."
          : `${workflows.length} workflow${workflows.length === 1 ? "" : "s"}: ${names}${workflows.length > 5 ? "…" : ""}`,
    };
  }
  if (intent === "wrappers") {
    const wrappers = await service.listWrappers();
    const names = wrappers
      .slice(0, 5)
      .map((w) => w.name)
      .join(", ");
    return {
      intent,
      text:
        wrappers.length === 0
          ? "No wrappers saved."
          : `${wrappers.length} wrapper${wrappers.length === 1 ? "" : "s"}: ${names}${wrappers.length > 5 ? "…" : ""}`,
    };
  }
  // v0.9.4: any future ChatIntent addition
  // that's not handled above will fail the
  // exhaustive type check. We fall through to
  // a generic reply rather than throwing so the
  // chat endpoint stays useful even for a brand
  // new intent that hasn't been wired up yet.
  return {
    intent,
    text: "I can answer questions about your policies, workflows, wrappers, and observability data. Try a more specific question.",
  };
}
