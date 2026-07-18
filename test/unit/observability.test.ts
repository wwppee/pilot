/**
 * v0.7.3 (B2): unit tests for the observability recorder +
 * summarizer. Three tests, deliberately minimal — the
 * rest of the surface (the service methods, the routes,
 * the dashboard) is covered by server.test.ts and the
 * RTL tests in web/tests/.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectRecordedToolCalls,
  recordToolCall,
  summarizeRecordedToolCalls,
} from "../../src/core/observability.js";

let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(join(tmpdir(), "pilot-obs-test-"));
});

afterEach(async () => {
  await rm(fakeHome, { recursive: true, force: true });
});

describe("v0.7.3: observability recorder + summarizer", () => {
  it("returns an empty summary when no records exist", async () => {
    const s = await summarizeRecordedToolCalls(fakeHome);
    expect(s.total).toBe(0);
    expect(s.byTool).toEqual([]);
    expect(s.worstTool).toBeNull();
  });

  it("appends records and reads them back newest-first", async () => {
    await recordToolCall(
      {
        tool: "bash",
        outcome: "denied",
        reason: "denyCommands",
        errorSample: "rm -rf /",
        context: { timestamp: "2026-07-18T00:00:01Z" },
      },
      fakeHome,
    );
    await recordToolCall(
      {
        tool: "bash",
        outcome: "denied",
        reason: "denyPaths",
        errorSample: "/etc/passwd",
        context: { timestamp: "2026-07-18T00:00:02Z" },
      },
      fakeHome,
    );
    const all = await collectRecordedToolCalls(fakeHome);
    expect(all).toHaveLength(2);
    // Newest first.
    expect(all[0]?.tool).toBe("bash");
    expect(all[0]?.context.timestamp).toBe("2026-07-18T00:00:02Z");
  });

  it("summarizes by tool with counts and recentError", async () => {
    for (const ev of [
      {
        tool: "bash",
        outcome: "denied" as const,
        reason: "deny",
        errorSample: "rm -rf",
      },
      {
        tool: "bash",
        outcome: "denied" as const,
        reason: "deny",
        errorSample: "chmod 777",
      },
      {
        tool: "read",
        outcome: "denied" as const,
        reason: "denyPaths",
        errorSample: "/etc/shadow",
      },
    ]) {
      await recordToolCall(
        {
          ...ev,
          context: { timestamp: new Date().toISOString() },
        },
        fakeHome,
      );
    }
    const s = await summarizeRecordedToolCalls(fakeHome);
    expect(s.total).toBe(3);
    expect(s.denied).toBe(3);
    const bash = s.byTool.find((r) => r.tool === "bash")!;
    expect(bash.total).toBe(2);
    expect(bash.denied).toBe(2);
    expect(bash.recentError).toBeTruthy();
  });
});

// v0.8.7 (B2 闭环): per-outcome rate tests. The
// summary must now include `successRate` / `failRate`
// / `deniedRate` (each as a 0-1 fraction), AND it must
// return 0 for every rate when `total === 0` (a fresh
// install). The latter is the regression we explicitly
// guarded against: dividing by zero used to produce
// NaN, which the dashboard then rendered as "NaN%".
describe("v0.8.7: observability summary rates", () => {
  it("returns zero rates when total is 0 (no NaN)", async () => {
    const s = await summarizeRecordedToolCalls(fakeHome);
    expect(s.total).toBe(0);
    expect(s.successRate).toBe(0);
    expect(s.failRate).toBe(0);
    expect(s.deniedRate).toBe(0);
  });

  it("computes the rate per outcome as a 0-1 fraction", async () => {
    // 4 success / 3 fail / 3 denied = 10 total.
    // successRate = 0.4, failRate = 0.3, deniedRate = 0.3.
    const events: Array<{
      tool: string;
      outcome: "success" | "fail" | "denied";
    }> = [
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "success" },
      { tool: "read", outcome: "fail" },
      { tool: "read", outcome: "fail" },
      { tool: "read", outcome: "fail" },
      { tool: "write", outcome: "denied" },
      { tool: "write", outcome: "denied" },
      { tool: "write", outcome: "denied" },
    ];
    for (const ev of events) {
      await recordToolCall(
        {
          ...ev,
          reason: "",
          errorSample: "",
          context: { timestamp: new Date().toISOString() },
        },
        fakeHome,
      );
    }
    const s = await summarizeRecordedToolCalls(fakeHome);
    expect(s.total).toBe(10);
    expect(s.successRate).toBe(0.4);
    expect(s.failRate).toBe(0.3);
    expect(s.deniedRate).toBe(0.3);
  });

  it("rates sum to 1 (or 0 when total is 0)", async () => {
    const events: Array<{
      tool: string;
      outcome: "success" | "fail" | "denied";
    }> = [
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "fail" },
      { tool: "bash", outcome: "denied" },
    ];
    for (const ev of events) {
      await recordToolCall(
        {
          ...ev,
          reason: "",
          errorSample: "",
          context: { timestamp: new Date().toISOString() },
        },
        fakeHome,
      );
    }
    const s = await summarizeRecordedToolCalls(fakeHome);
    expect(s.successRate + s.failRate + s.deniedRate).toBeCloseTo(1, 6);
  });
});

// v0.9.2: per-tool rate fields. The summary
// must now include `successRate` / `failRate` /
// `deniedRate` on each `ToolCallSummary` row,
// mirroring the v0.8.7 aggregate-card rates.
// `total === 0` clamps to 0 (not NaN) — same
// contract as the top-level rates.
describe("v0.9.2: per-tool rate fields", () => {
  it("computes per-tool success / fail / denied rate", async () => {
    const events: Array<{
      tool: string;
      outcome: "success" | "fail" | "denied";
    }> = [
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "success" },
      { tool: "bash", outcome: "fail" },
      { tool: "bash", outcome: "denied" },
      { tool: "read", outcome: "success" },
      { tool: "read", outcome: "success" },
      { tool: "read", outcome: "success" },
    ];
    for (const ev of events) {
      await recordToolCall(
        {
          ...ev,
          reason: "",
          errorSample: "",
          context: { timestamp: new Date().toISOString() },
        },
        fakeHome,
      );
    }
    const s = await summarizeRecordedToolCalls(fakeHome);
    const bash = s.byTool.find((r) => r.tool === "bash")!;
    expect(bash.total).toBe(4);
    expect(bash.successRate).toBe(0.5); // 2 / 4
    expect(bash.failRate).toBe(0.25); // 1 / 4
    expect(bash.deniedRate).toBe(0.25); // 1 / 4
    const read = s.byTool.find((r) => r.tool === "read")!;
    expect(read.total).toBe(3);
    expect(read.successRate).toBe(1);
    expect(read.failRate).toBe(0);
    expect(read.deniedRate).toBe(0);
  });

  it("per-tool rates sum to 1 when total > 0", async () => {
    await recordToolCall(
      {
        tool: "write",
        outcome: "success",
        reason: "",
        errorSample: "",
        context: { timestamp: new Date().toISOString() },
      },
      fakeHome,
    );
    await recordToolCall(
      {
        tool: "write",
        outcome: "fail",
        reason: "",
        errorSample: "",
        context: { timestamp: new Date().toISOString() },
      },
      fakeHome,
    );
    const s = await summarizeRecordedToolCalls(fakeHome);
    const w = s.byTool.find((r) => r.tool === "write")!;
    expect(w.successRate + w.failRate + w.deniedRate).toBeCloseTo(1, 6);
  });
});
