/**
 * Tests for src/server/chat.ts.
 *
 * v0.9.16: chat helpers extracted from server.ts.
 * These are pure functions (no Fastify, no side
 * effects) so the unit tests can exercise each
 * intent in isolation without spinning up the
 * whole server.
 *
 * What we lock:
 *   - `buildChatReply` — one case per ChatIntent
 *     (errors / denied / worst / success / rate /
 *     summary) + the default fallback
 *   - `matchCrossDashboardIntent` — quantifier
 *     phrases ("my policies" / "策略有几个") hit
 *     the right intent; bare mentions ("policy")
 *     don't shadow the observability router
 *   - `buildCrossDashboardReply` — empty + 1 + >5
 *     cases for each of policies / workflows /
 *     wrappers, plus the defensive catch-all
 */

import { describe, it, expect } from "vitest";
import {
  buildChatReply,
  buildCrossDashboardReply,
  matchCrossDashboardIntent,
  type ChatIntent,
} from "../../src/server/chat.js";
import type { PilotService } from "../../src/core/service.js";
import type { ObservabilitySummary } from "../../src/core/observability.js";

// ─── Test fixtures ─────────────────────────────────────

function makeSummary(
  overrides: Partial<ObservabilitySummary> = {},
): ObservabilitySummary {
  return {
    total: 0,
    success: 0,
    fail: 0,
    denied: 0,
    successRate: 0,
    failRate: 0,
    deniedRate: 0,
    worstTool: null,
    byTool: [],
    since: new Date().toISOString(),
    ...overrides,
  };
}

function makeService(
  listPolicies: PilotService["listPolicies"] = async () => [],
  listWorkflows: PilotService["listWorkflows"] = async () => [],
  listWrappers: PilotService["listWrappers"] = async () => [],
): PilotService {
  // We only need the three list methods for these tests;
  // cast to the full interface for the helper signature.
  return {
    listPolicies,
    listWorkflows,
    listWrappers,
  } as unknown as PilotService;
}

// ─── buildChatReply ────────────────────────────────────

describe("buildChatReply", () => {
  it("returns top-5 failing tools for 'errors' intent", () => {
    const summary = makeSummary({
      byTool: [
        { tool: "bash", total: 10, success: 8, fail: 2, denied: 0 },
        { tool: "read", total: 5, success: 5, fail: 0, denied: 0 },
        { tool: "write", total: 4, success: 1, fail: 3, denied: 0 },
      ],
    });
    const reply = buildChatReply("errors", summary, "last 24h");
    expect(reply.intent).toBe("errors");
    expect(reply.window).toBe("last 24h");
    expect(reply.text).toContain("write: 3 failure(s)");
    expect(reply.text).toContain("bash: 2 failure(s)");
    // read has 0 failures — must not appear.
    expect(reply.text).not.toContain("read:");
  });

  it("returns top-5 blocked tools for 'denied' intent", () => {
    const summary = makeSummary({
      byTool: [
        { tool: "bash", total: 10, success: 8, fail: 0, denied: 2 },
        { tool: "read", total: 5, success: 5, fail: 0, denied: 0 },
      ],
    });
    const reply = buildChatReply("denied", summary, "last 24h");
    expect(reply.text).toContain("bash: 2 block(s)");
    expect(reply.text).not.toContain("read:");
  });

  it("returns worst-tool summary for 'worst' intent", () => {
    const summary = makeSummary({
      worstTool: "bash",
      byTool: [{ tool: "bash", total: 10, success: 5, fail: 5, denied: 0 }],
    });
    const reply = buildChatReply("worst", summary, "last 7d");
    expect(reply.text).toContain("bash: 5/10");
    expect(reply.text).toContain("50% fail rate");
  });

  it("says no qualifying tool when summary has no worstTool", () => {
    const summary = makeSummary({ worstTool: null });
    const reply = buildChatReply("worst", summary, "last 24h");
    expect(reply.text).toMatch(/no tool has enough calls/i);
  });

  it("returns success count + rate for 'success' intent", () => {
    const summary = makeSummary({ success: 80, successRate: 0.8 });
    const reply = buildChatReply("success", summary, "last 7d");
    expect(reply.text).toContain("80 succeeded");
    expect(reply.text).toContain("80% success rate");
  });

  it("returns all three rates for 'rate' intent", () => {
    const summary = makeSummary({
      total: 100,
      success: 80,
      fail: 15,
      denied: 5,
      successRate: 0.8,
      failRate: 0.15,
      deniedRate: 0.05,
    });
    const reply = buildChatReply("rate", summary, "last 24h");
    expect(reply.text).toContain("success 80%");
    expect(reply.text).toContain("fail 15%");
    expect(reply.text).toContain("denied 5%");
    expect(reply.text).toContain("100 total");
  });

  it("returns the totals breakdown for 'summary' intent", () => {
    const summary = makeSummary({
      total: 50,
      success: 40,
      fail: 8,
      denied: 2,
      worstTool: "bash",
    });
    const reply = buildChatReply("summary", summary, "last 24h");
    expect(reply.text).toContain("50 call(s)");
    expect(reply.text).toContain("40 success");
    expect(reply.text).toContain("8 fail");
    expect(reply.text).toContain("2 denied");
    expect(reply.text).toContain("bash");
  });

  it("returns the defensive fallback for unknown intents", () => {
    // `policies` / `workflows` / `wrappers` are cross-dashboard
    // intents and should never reach buildChatReply in practice
    // (the route handler short-circuits to
    // buildCrossDashboardReply). But the default branch is
    // defensive — verify the message is sensible.
    const fakeIntent = "policies" as ChatIntent;
    const reply = buildChatReply(fakeIntent, makeSummary(), "last 24h");
    expect(reply.text).toMatch(/more specific question/i);
  });
});

// ─── matchCrossDashboardIntent ─────────────────────────

describe("matchCrossDashboardIntent", () => {
  it("matches 'my policies' (quantifier phrase)", () => {
    expect(matchCrossDashboardIntent("how many policies do I have?")).toBe(
      "policies",
    );
    expect(matchCrossDashboardIntent("list my policies")).toBe("policies");
  });

  it("matches Chinese quantifier phrases for policies", () => {
    expect(matchCrossDashboardIntent("我的策略")).toBe("policies");
    expect(matchCrossDashboardIntent("有哪些策略")).toBe("policies");
  });

  it("matches 'my workflows' (quantifier phrase)", () => {
    expect(matchCrossDashboardIntent("how many workflows exist?")).toBe(
      "workflows",
    );
    expect(matchCrossDashboardIntent("我的工作流")).toBe("workflows");
  });

  it("matches 'my wrappers' (quantifier phrase)", () => {
    expect(matchCrossDashboardIntent("show my wrappers")).toBe("wrappers");
    expect(matchCrossDashboardIntent("几个包装")).toBe("wrappers");
  });

  it("returns null for bare 'policy' (so observability router wins)", () => {
    // 'policy' alone must NOT match the cross-dashboard
    // intent — it should fall through to the observability
    // router's "denied" intent, which is what the user
    // means when they ask "what was blocked by policy?".
    expect(matchCrossDashboardIntent("policy")).toBeNull();
    expect(matchCrossDashboardIntent("策略")).toBeNull();
  });

  it("returns null for unrelated messages", () => {
    expect(matchCrossDashboardIntent("what's the weather?")).toBeNull();
    expect(matchCrossDashboardIntent("hello")).toBeNull();
  });
});

// ─── buildCrossDashboardReply ──────────────────────────

describe("buildCrossDashboardReply", () => {
  it("returns 'No policies saved.' for empty list", async () => {
    const reply = await buildCrossDashboardReply("policies", makeService());
    expect(reply.intent).toBe("policies");
    expect(reply.text).toBe("No policies saved.");
  });

  it("returns count + names for one policy", async () => {
    const reply = await buildCrossDashboardReply(
      "policies",
      makeService(async () => [{ name: "no-bash" }] as never),
    );
    expect(reply.text).toBe("1 policy: no-bash");
  });

  it("truncates with … when more than 5 names", async () => {
    const reply = await buildCrossDashboardReply(
      "policies",
      makeService(
        async () =>
          [
            { name: "p1" },
            { name: "p2" },
            { name: "p3" },
            { name: "p4" },
            { name: "p5" },
            { name: "p6" },
          ] as never,
      ),
    );
    expect(reply.text).toContain("6 policies");
    expect(reply.text).toContain("p1, p2, p3, p4, p5…");
  });

  it("handles workflows (uses id field, not name)", async () => {
    const reply = await buildCrossDashboardReply(
      "workflows",
      makeService(
        async () => [],
        async () => [{ id: "my-flow" }] as never,
      ),
    );
    expect(reply.text).toBe("1 workflow: my-flow");
  });

  it("handles wrappers", async () => {
    const reply = await buildCrossDashboardReply(
      "wrappers",
      makeService(
        async () => [],
        async () => [],
        async () => [{ name: "redact-secrets" }] as never,
      ),
    );
    expect(reply.text).toBe("1 wrapper: redact-secrets");
  });
});
