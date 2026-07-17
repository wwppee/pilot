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
      { tool: "bash", outcome: "denied" as const, reason: "deny", errorSample: "rm -rf" },
      { tool: "bash", outcome: "denied" as const, reason: "deny", errorSample: "chmod 777" },
      { tool: "read", outcome: "denied" as const, reason: "denyPaths", errorSample: "/etc/shadow" },
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
