/**
 * Tests for `core/tool-trace.ts` — tool call event extraction from pi v3 sessions.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traceToolCalls, collectToolCalls } from "../../src/core/tool-trace.js";

function buildV3Session(
  dir: string,
  opts: {
    cwd: string;
    calls: Array<{
      toolName: string;
      args: Record<string, unknown>;
      result: { text: string; isError: boolean };
      /** ms between assistant toolCall and toolResult. */
      latencyMs?: number;
    }>;
  },
): string {
  mkdirSync(join(dir, opts.cwd), { recursive: true });
  const filePath = join(dir, opts.cwd, "session.jsonl");
  const baseTs = Date.parse("2026-07-01T10:00:00Z");

  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      type: "session",
      version: 3,
      id: opts.cwd,
      timestamp: new Date(baseTs).toISOString(),
      cwd: opts.cwd,
    }),
  );
  lines.push(
    JSON.stringify({
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: new Date(baseTs).toISOString(),
      message: { role: "user", content: "do work", timestamp: baseTs },
    }),
  );

  let lastId = "u1";
  for (let i = 0; i < opts.calls.length; i++) {
    const c = opts.calls[i]!;
    const aId = `a${i}`;
    const tId = `t${i}`;
    const aTs = baseTs + i * 1000;
    const tTs = aTs + (c.latencyMs ?? 100);
    // assistant message with tool call
    lines.push(
      JSON.stringify({
        type: "message",
        id: aId,
        parentId: lastId,
        timestamp: new Date(aTs).toISOString(),
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `tc-${i}`,
              name: c.toolName,
              arguments: c.args,
            },
          ],
          api: "anthropic-messages",
          provider: "anthropic",
          model: "m1",
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "toolUse",
          timestamp: aTs,
        },
      }),
    );
    // tool result
    lines.push(
      JSON.stringify({
        type: "message",
        id: tId,
        parentId: aId,
        timestamp: new Date(tTs).toISOString(),
        message: {
          role: "toolResult",
          toolCallId: `tc-${i}`,
          toolName: c.toolName,
          content: [{ type: "text", text: c.result.text }],
          isError: c.result.isError,
          timestamp: tTs,
        },
      }),
    );
    lastId = tId;
  }

  writeFileSync(filePath, lines.join("\n") + "\n");
  return filePath;
}

describe("tool-trace (v0.4.2)", () => {
  it("extracts tool call events with arguments and isError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const path = buildV3Session(dir, {
        cwd: "--test--proj",
        calls: [
          {
            toolName: "read",
            args: { path: "/Users/x/foo.ts" },
            result: { text: "file contents here", isError: false },
            latencyMs: 250,
          },
          {
            toolName: "bash",
            args: { command: "ls -la" },
            result: { text: "drwxr-xr-x", isError: false },
            latencyMs: 80,
          },
        ],
      });

      const events = await collectToolCalls(path);
      expect(events).toHaveLength(2);

      expect(events[0]?.toolName).toBe("read");
      expect(events[0]?.isError).toBe(false);
      expect(events[0]?.arguments).toEqual({ path: "/Users/x/foo.ts" });
      expect(events[0]?.contentPreview).toBe("file contents here");
      expect(events[0]?.latencyMs).toBe(250);

      expect(events[1]?.toolName).toBe("bash");
      expect(events[1]?.arguments).toEqual({ command: "ls -la" });
      expect(events[1]?.latencyMs).toBe(80);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("captures isError: true from failing tool calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const path = buildV3Session(dir, {
        cwd: "--test--fail",
        calls: [
          {
            toolName: "bash",
            args: { command: "rm -rf /" },
            result: { text: "permission denied", isError: true },
            latencyMs: 50,
          },
        ],
      });

      const events = await collectToolCalls(path);
      expect(events).toHaveLength(1);
      expect(events[0]?.isError).toBe(true);
      expect(events[0]?.toolName).toBe("bash");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters by toolName", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const path = buildV3Session(dir, {
        cwd: "--test--filter",
        calls: [
          {
            toolName: "read",
            args: { path: "a" },
            result: { text: "x", isError: false },
          },
          {
            toolName: "bash",
            args: { command: "ls" },
            result: { text: "y", isError: false },
          },
          {
            toolName: "read",
            args: { path: "b" },
            result: { text: "z", isError: false },
          },
        ],
      });

      const onlyReads = await collectToolCalls(path, { toolName: "read" });
      expect(onlyReads).toHaveLength(2);
      expect(onlyReads.every((e) => e.toolName === "read")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters by onlyErrors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const path = buildV3Session(dir, {
        cwd: "--test--errs",
        calls: [
          {
            toolName: "read",
            args: {},
            result: { text: "ok", isError: false },
          },
          {
            toolName: "bash",
            args: {},
            result: { text: "fail", isError: true },
          },
          {
            toolName: "write",
            args: {},
            result: { text: "ok2", isError: false },
          },
        ],
      });

      const onlyErrors = await collectToolCalls(path, { onlyErrors: true });
      expect(onlyErrors).toHaveLength(1);
      expect(onlyErrors[0]?.toolName).toBe("bash");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("respects limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const path = buildV3Session(dir, {
        cwd: "--test--limit",
        calls: Array.from({ length: 5 }, (_, i) => ({
          toolName: "read",
          args: { i },
          result: { text: String(i), isError: false },
        })),
      });

      const events = await collectToolCalls(path, { limit: 3 });
      expect(events).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty array for session with no tool calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      mkdirSync(join(dir, "--test--empty"), { recursive: true });
      const filePath = join(dir, "--test--empty", "session.jsonl");
      writeFileSync(
        filePath,
        [
          JSON.stringify({
            type: "session",
            version: 3,
            id: "x",
            timestamp: "2026-07-01T10:00:00Z",
            cwd: "/x",
          }),
          JSON.stringify({
            type: "message",
            id: "u1",
            parentId: null,
            timestamp: "2026-07-01T10:00:00Z",
            message: { role: "user", content: "hi", timestamp: 0 },
          }),
        ].join("\n") + "\n",
      );

      const events = await collectToolCalls(filePath);
      expect(events).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("truncates long content previews to 120 chars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-trace-"));
    try {
      const long = "x".repeat(500);
      const path = buildV3Session(dir, {
        cwd: "--test--long",
        calls: [
          {
            toolName: "read",
            args: {},
            result: { text: long, isError: false },
          },
        ],
      });

      const events = await collectToolCalls(path);
      expect(events[0]?.contentPreview.length).toBeLessThanOrEqual(120);
      expect(events[0]?.contentPreview.endsWith("...")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
