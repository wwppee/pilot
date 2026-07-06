/**
 * session-info.test.ts — coverage for core/session-info.ts.
 *
 * Each test writes a fake pi-style session JSONL into a fresh
 * tmpdir and asserts the derived summary.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSessionInfo } from "../../src/core/session-info.js";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-sessioninfo-"));
}

function writeFakeSession(
  home: string,
  sessionId: string,
  encodedCwd: string,
  entries: unknown[],
): void {
  const sessionsDir = join(home, ".pi", "agent", "sessions", encodedCwd);
  mkdirSync(sessionsDir, { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(sessionsDir, `${sessionId}.jsonl`), lines, "utf-8");
}

describe("deriveSessionInfo", () => {
  it("returns null when session file is missing", async () => {
    const home = freshHome();
    expect(await deriveSessionInfo("ghost", home)).toBeNull();
  });

  it("extracts model + cwd from a minimal session", async () => {
    const home = freshHome();
    const id = "2026-07-06_10-00_aaa";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "session_info",
        timestamp: "2026-07-06T10:00:00.000Z",
      },
      {
        type: "message",
        timestamp: "2026-07-06T10:00:05.000Z",
        message: {
          role: "user",
          content: "hi",
        },
      },
      {
        type: "message",
        timestamp: "2026-07-06T10:00:30.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "hello" }],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: { input: 0.001, output: 0.006, total: 0.007 },
          },
        },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info).not.toBeNull();
    expect(info!.model).toBe("claude-opus-4-6");
    expect(info!.cwd).toBe("--home-me-proj--");
    expect(info!.startedAt).toBe("2026-07-06T10:00:00.000Z");
    expect(info!.endedAt).toBe("2026-07-06T10:00:30.000Z");
    expect(info!.durationMs).toBe(30_000);
    expect(info!.totalMessages).toBe(3);
    expect(info!.assistantMessages).toBe(1);
    expect(info!.totalTokens).toBe(30);
    expect(info!.totalCost).toBeCloseTo(0.007, 6);
    expect(info!.toolsUsed).toEqual([]);
  });

  it("aggregates multiple assistant messages' usage + counts tool calls", async () => {
    const home = freshHome();
    const id = "2026-07-06_11-00_bbb";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-06T11:00:00.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            { type: "text", text: "I'll search" },
            { type: "toolCall", name: "web_search" },
          ],
          usage: {
            input: 100,
            output: 50,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 150,
            cost: { input: 0.01, output: 0.015, total: 0.025 },
          },
        },
      },
      {
        type: "message",
        timestamp: "2026-07-06T11:00:30.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            { type: "toolCall", name: "bash" },
            { type: "toolCall", name: "read" },
            { type: "toolCall", name: "read" }, // duplicated
          ],
          usage: {
            input: 80,
            output: 60,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 140,
            cost: { input: 0.008, output: 0.018, total: 0.026 },
          },
        },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info!.totalTokens).toBe(290);
    expect(info!.totalCost).toBeCloseTo(0.051, 6);
    expect(info!.assistantMessages).toBe(2);
    expect(info!.toolsUsed).toEqual([
      { toolName: "read", count: 2 },
      { toolName: "bash", count: 1 },
      { toolName: "web_search", count: 1 },
    ]);
  });

  it("first assistant message's model wins", async () => {
    const home = freshHome();
    const id = "2026-07-06_12-00_ccc";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-06T12:00:00.000Z",
        message: { role: "assistant", model: "claude-opus-4-6", content: [] },
      },
      {
        type: "message",
        timestamp: "2026-07-06T12:01:00.000Z",
        message: { role: "assistant", model: "gpt-4o", content: [] },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info!.model).toBe("claude-opus-4-6");
  });

  it("handles missing usage gracefully (totals stay 0)", async () => {
    const home = freshHome();
    const id = "2026-07-06_13-00_ddd";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-06T13:00:00.000Z",
        message: { role: "assistant", model: "claude-opus-4-6", content: [] },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info!.totalTokens).toBe(0);
    expect(info!.totalCost).toBe(0);
  });

  it("returns 0 duration when timestamps missing", async () => {
    const home = freshHome();
    const id = "2026-07-06_14-00_eee";
    // session_info with no timestamp + assistant with no timestamp.
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info" },
      {
        type: "message",
        message: { role: "assistant", model: "x", content: [] },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info!.durationMs).toBe(0);
    expect(info!.startedAt).toBeUndefined();
    expect(info!.endedAt).toBeUndefined();
  });

  it("uses canonical cost.total when present (no double-count with input+output)", async () => {
    // Pi's cost shape: { input, output, total } where total = input + output.
    // If a future pi version adds new sub-fields alongside `total`,
    // we trust the canonical total — never double-count by summing
    // both `total` and `input+output`.
    const home = freshHome();
    const id = "2026-07-06_15-00_fff";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-06T15:00:00.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: {
              input: 0.001,
              output: 0.006,
              total: 0.007,
              cacheReadCost: 0.001,
            },
          },
        },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    // `total` is authoritative — we don't also add `input + output + cacheReadCost`.
    expect(info!.totalCost).toBeCloseTo(0.007, 6);
  });

  it("falls back to summing cost fields when total is absent", async () => {
    // Future pi version drops `total` and adds sub-fields instead.
    // We sum them defensively.
    const home = freshHome();
    const id = "2026-07-06_15-30_ggg";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-06T15:30:00.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: {
              input: 0.001,
              output: 0.006,
              cacheReadCost: 0.001,
              // total intentionally missing — pi v4 hypothetical
            },
          },
        },
      },
    ]);

    const info = await deriveSessionInfo(id, home);
    expect(info!.totalCost).toBeCloseTo(0.001 + 0.006 + 0.001, 6);
  });
});
