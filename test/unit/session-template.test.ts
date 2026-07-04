/**
 * session-template.test.ts — coverage for /sessions/:id/template.
 *
 * Each test writes a fake pi-style session JSONL into a tempdir and
 * asserts the derived template matches what's on disk.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTemplate } from "../../src/core/session-template.js";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-template-"));
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
  writeFileSync(join(sessionsDir, `${sessionId}.jsonl`), lines, "utf8");
}

describe("deriveTemplate", () => {
  it("returns null when session file is missing", async () => {
    const home = freshHome();
    expect(await deriveTemplate("ghost", home)).toBeNull();
  });

  it("extracts model from first assistant message", async () => {
    const home = freshHome();
    const id = "2026-07-04_18-00_aaa";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-04T18:00:00Z",
        message: { role: "user", content: "hi" },
      },
      {
        type: "message",
        timestamp: "2026-07-04T18:00:05Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "hello" }],
        },
      },
    ]);

    const tmpl = await deriveTemplate(id, home);
    expect(tmpl).not.toBeNull();
    expect(tmpl!.model).toBe("claude-opus-4-6");
    expect(tmpl!.tools).toEqual([]);
  });

  it("collects + dedupes + sorts tool names from toolCall blocks", async () => {
    const home = freshHome();
    const id = "2026-07-04_18-30_bbb";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "message",
        timestamp: "2026-07-04T18:30:00Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            { type: "text", text: "let me search" },
            { type: "toolCall", name: "web_search" },
            { type: "toolCall", name: "read" },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-07-04T18:30:10Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            // Duplicate tool call — should be deduped.
            { type: "toolCall", name: "read" },
            { type: "toolCall", name: "bash" },
          ],
        },
      },
    ]);

    const tmpl = await deriveTemplate(id, home);
    expect(tmpl!.tools).toEqual(["bash", "read", "web_search"]);
  });

  it("captures encoded cwd from the file path", async () => {
    const home = freshHome();
    const id = "2026-07-04_19-00_ccc";
    const encoded = "--home-me-proj--";
    writeFakeSession(home, id, encoded, [
      {
        type: "session_info",
        timestamp: "2026-07-04T19:00:00Z",
      },
    ]);

    const tmpl = await deriveTemplate(id, home);
    expect(tmpl!.cwd).toBe(encoded);
  });

  it("omits model when no assistant message exists", async () => {
    const home = freshHome();
    const id = "2026-07-04_19-30_ddd";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "session_info",
        timestamp: "2026-07-04T19:30:00Z",
      },
    ]);

    const tmpl = await deriveTemplate(id, home);
    expect(tmpl!.model).toBeUndefined();
    expect(tmpl!.tools).toEqual([]);
  });

  it("handles model_change entries as a fallback source", async () => {
    const home = freshHome();
    const id = "2026-07-04_20-00_eee";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "model_change",
        timestamp: "2026-07-04T20:00:00Z",
        model: "gpt-4o",
      },
      {
        type: "message",
        timestamp: "2026-07-04T20:00:05Z",
        // assistant message without `model` field (model_change handled it)
        message: { role: "assistant", content: [] },
      },
    ]);

    const tmpl = await deriveTemplate(id, home);
    expect(tmpl!.model).toBe("gpt-4o");
  });
});