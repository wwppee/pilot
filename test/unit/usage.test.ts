/**
 * Tests for `core/usage.ts` — token usage & cost aggregation.
 *
 * Uses hand-crafted pi v3 format JSONL fixtures to verify that
 * AssistantMessage.usage is correctly extracted and aggregated.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateUsage, type UsageRange } from "../../src/core/usage.js";
import { piSessionsDir } from "../../src/core/types.js";

/**
 * Build a single session JSONL with v3 header + a few messages.
 * Returns the path.
 */
function buildV3Session(
  dir: string,
  opts: {
    cwd: string;
    startedAt: string;
    models: Array<{ model: string; usage: object; atOffset?: number }>;
    toolResults?: Array<{ toolName: string; isError?: boolean; atOffset?: number }>;
  },
): string {
  mkdirSync(join(dir, opts.cwd), { recursive: true });
  const sessionId = `2026-07-01T10-00-00_${opts.cwd}`;
  const filePath = join(dir, opts.cwd, `${sessionId}.jsonl`);

  const lines: string[] = [];
  // Header
  lines.push(
    JSON.stringify({
      type: "session",
      version: 3,
      id: opts.cwd,
      timestamp: opts.startedAt,
      cwd: opts.cwd,
    }),
  );

  let entryId = 0;
  const nextId = () => `e${(entryId++).toString(16).padStart(4, "0")}`;
  const baseTime = new Date(opts.startedAt).getTime();
  let lastAssistantId = "";

  // Models in order
  for (let i = 0; i < opts.models.length; i++) {
    const m = opts.models[i]!;
    const atOffset = m.atOffset ?? i * 60_000;
    const ts = new Date(baseTime + atOffset).toISOString();
    const id = nextId();
    lastAssistantId = id;
    lines.push(
      JSON.stringify({
        type: "message",
        id,
        parentId: i === 0 ? null : `e${(i - 1).toString(16).padStart(4, "0")}`,
        timestamp: ts,
        message: {
          role: "assistant",
          content: [{ type: "text", text: `reply ${i}` }],
          api: "anthropic-messages",
          provider: "anthropic",
          model: m.model,
          usage: m.usage,
          stopReason: "stop",
          timestamp: new Date(ts).getTime(),
        },
      }),
    );

    // Optional tool result after this assistant
    const tr = opts.toolResults?.[i];
    if (tr) {
      const trOffset = tr.atOffset ?? atOffset + 1000;
      const trTs = new Date(baseTime + trOffset).toISOString();
      lines.push(
        JSON.stringify({
          type: "message",
          id: nextId(),
          parentId: id,
          timestamp: trTs,
          message: {
            role: "toolResult",
            toolCallId: `tc-${i}`,
            toolName: tr.toolName,
            content: [{ type: "text", text: "ok" }],
            isError: tr.isError ?? false,
            timestamp: new Date(trTs).getTime(),
          },
        }),
      );
    }
  }

  writeFileSync(filePath, lines.join("\n") + "\n");
  return filePath;
}

describe("usage (v0.4.2)", () => {
  it("aggregates tokens and cost across multiple sessions", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-usage-"));
    try {
      // Override HOME so piSessionsDir picks up our temp
      const oldHome = process.env.HOME;
      process.env.HOME = home;
      try {
        // Session 1: opus, 1000 in / 500 out / $0.05
        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--proj1",
          startedAt: "2026-07-01T10:00:00Z",
          models: [
            {
              model: "claude-opus-4-6",
              usage: {
                input: 1000,
                output: 500,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 1500,
                cost: { input: 0.04, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.05 },
              },
            },
            {
              model: "claude-opus-4-6",
              usage: {
                input: 2000,
                output: 800,
                cacheRead: 100,
                cacheWrite: 50,
                totalTokens: 2950,
                cost: { input: 0.08, output: 0.016, cacheRead: 0.001, cacheWrite: 0.0005, total: 0.0975 },
              },
            },
          ],
        });

        // Session 2: sonnet, $0.003
        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--proj2",
          startedAt: "2026-07-01T11:00:00Z",
          models: [
            {
              model: "claude-sonnet-4-5",
              usage: {
                input: 500,
                output: 200,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 700,
                cost: { input: 0.002, output: 0.001, cacheRead: 0, cacheWrite: 0, total: 0.003 },
              },
            },
          ],
        });

        const report = await aggregateUsage({ kind: "all" });

        expect(report.totalSessions).toBe(2);
        expect(report.totalAssistantMessages).toBe(3);
        expect(report.totalTokens).toBe(1500 + 2950 + 700);
        expect(report.totalCost).toBeCloseTo(0.05 + 0.0975 + 0.003, 6);

        // by-model
        const opus = report.byModel.find((b) => b.model === "claude-opus-4-6");
        expect(opus).toBeDefined();
        expect(opus?.messages).toBe(2);
        expect(opus?.input).toBe(3000);
        expect(opus?.output).toBe(1300);
        expect(opus?.cacheRead).toBe(100);
        expect(opus?.cacheWrite).toBe(50);
        expect(opus?.cost).toBeCloseTo(0.1475, 6);

        const sonnet = report.byModel.find((b) => b.model === "claude-sonnet-4-5");
        expect(sonnet).toBeDefined();
        expect(sonnet?.messages).toBe(1);
        expect(sonnet?.cost).toBeCloseTo(0.003, 6);
      } finally {
        process.env.HOME = oldHome;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("buckets by day using local timezone", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-usage-"));
    try {
      const oldHome = process.env.HOME;
      process.env.HOME = home;
      try {
        // Two sessions on the same day, one on a different day
        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--projA",
          startedAt: "2026-07-01T10:00:00Z",
          models: [
            {
              model: "m1",
              usage: {
                input: 100,
                output: 50,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 150,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
          ],
        });
        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--projB",
          startedAt: "2026-07-01T15:00:00Z",
          models: [
            {
              model: "m1",
              usage: {
                input: 200,
                output: 100,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 300,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
          ],
        });
        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--projC",
          startedAt: "2026-07-02T05:00:00Z",
          models: [
            {
              model: "m1",
              usage: {
                input: 50,
                output: 25,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 75,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
          ],
        });

        const report = await aggregateUsage({ kind: "all" });
        expect(report.byDay.length).toBe(2);

        const day1 = report.byDay.find((d) => d.date === "2026-07-01")!;
        expect(day1).toBeDefined();
        expect(day1.input).toBe(300);
        expect(day1.output).toBe(150);
        expect(day1.totalTokens).toBe(450);
        expect(day1.sessions).toBe(2);

        const day2 = report.byDay.find((d) => d.date === "2026-07-02")!;
        expect(day2).toBeDefined();
        expect(day2.totalTokens).toBe(75);
        expect(day2.sessions).toBe(1);
      } finally {
        process.env.HOME = oldHome;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("filters by today range", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-usage-"));
    try {
      const oldHome = process.env.HOME;
      process.env.HOME = home;
      try {
        // Old session (yesterday in user's local tz)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(10, 0, 0, 0);

        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--old",
          startedAt: yesterday.toISOString(),
          models: [
            {
              model: "m1",
              usage: {
                input: 100,
                output: 50,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 150,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
          ],
        });

        // Today's session
        const today = new Date();
        today.setHours(0, 5, 0, 0);

        buildV3Session(piSessionsDir(), {
          cwd: "--Users-feng--today",
          startedAt: today.toISOString(),
          models: [
            {
              model: "m1",
              usage: {
                input: 200,
                output: 100,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 300,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
          ],
        });

        const range: UsageRange = { kind: "today" };
        const report = await aggregateUsage(range);
        expect(report.range).toEqual(range);
        // Should include only today's session
        expect(report.totalSessions).toBe(1);
        expect(report.totalTokens).toBe(300);
      } finally {
        process.env.HOME = oldHome;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns empty report when no sessions exist", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-usage-"));
    try {
      const oldHome = process.env.HOME;
      process.env.HOME = home;
      try {
        const report = await aggregateUsage({ kind: "all" });
        expect(report.totalSessions).toBe(0);
        expect(report.totalAssistantMessages).toBe(0);
        expect(report.totalTokens).toBe(0);
        expect(report.totalCost).toBe(0);
        expect(report.byModel).toEqual([]);
        expect(report.byDay).toEqual([]);
      } finally {
        process.env.HOME = oldHome;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("skips entries without usage (e.g. user/toolResult/compaction)", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-usage-"));
    try {
      const oldHome = process.env.HOME;
      process.env.HOME = home;
      try {
        const dir = piSessionsDir();
        mkdirSync(join(dir, "--Users-feng--mixed"), { recursive: true });
        const file = join(
          dir,
          "--Users-feng--mixed",
          "2026-07-01T10-00-00_mixed.jsonl",
        );
        const lines = [
          JSON.stringify({
            type: "session",
            version: 3,
            id: "mixed",
            timestamp: "2026-07-01T10:00:00Z",
            cwd: "--Users-feng--mixed",
          }),
          JSON.stringify({
            type: "message",
            id: "u1",
            parentId: null,
            timestamp: "2026-07-01T10:00:00Z",
            message: {
              role: "user",
              content: "hi",
              timestamp: Date.parse("2026-07-01T10:00:00Z"),
            },
          }),
          JSON.stringify({
            type: "message",
            id: "a1",
            parentId: "u1",
            timestamp: "2026-07-01T10:00:01Z",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "ok" }],
              api: "anthropic-messages",
              provider: "anthropic",
              model: "m1",
              usage: {
                input: 100,
                output: 50,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 150,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              stopReason: "stop",
              timestamp: Date.parse("2026-07-01T10:00:01Z"),
            },
          }),
          JSON.stringify({
            type: "message",
            id: "t1",
            parentId: "a1",
            timestamp: "2026-07-01T10:00:02Z",
            message: {
              role: "toolResult",
              toolCallId: "tc1",
              toolName: "read",
              content: [{ type: "text", text: "file content" }],
              isError: false,
              timestamp: Date.parse("2026-07-01T10:00:02Z"),
            },
          }),
          JSON.stringify({
            type: "compaction",
            id: "c1",
            parentId: "t1",
            timestamp: "2026-07-01T10:05:00Z",
            summary: "compacted",
            tokensBefore: 1000,
          }),
        ];
        writeFileSync(file, lines.join("\n") + "\n");

        const report = await aggregateUsage({ kind: "all" });
        expect(report.totalAssistantMessages).toBe(1);
        expect(report.totalTokens).toBe(150);
      } finally {
        process.env.HOME = oldHome;
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
