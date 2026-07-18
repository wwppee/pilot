
/**
 * v0.9.0: unit tests for the tool-wrapper data
 * layer. Round-trip a wrapper through write → read
 * to lock the TOML serialization (exactOptional
 * types, the discriminated union on `kind`, the
 * datetime stamps). Three small tests — the
 * schema is the contract; the surface is
 * exercised end-to-end via the server tests in
 * server.test.ts.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listWrappers,
  readWrapper,
  tryReadWrapper,
  writeWrapper,
  deleteWrapper,
  applyWrapper,
  unapplyWrapper,
} from "../../src/core/tool-wrapper.js";

let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(join(tmpdir(), "pilot-wrapper-test-"));
});

afterEach(async () => {
  await rm(fakeHome, { recursive: true, force: true });
});

describe("v0.9.0: tool-wrapper persistence", () => {
  it("round-trips a retry wrapper", async () => {
    const w = await writeWrapper(
      "bash-retry",
      {
        description: "retry bash on failure",
        tools: ["bash"],
        rule: { kind: "retry", maxRetries: 3, initialBackoffMs: 1000 },
      },
      fakeHome,
    );
    expect(w.name).toBe("bash-retry");
    expect(w.tools).toEqual(["bash"]);
    if (w.rule.kind !== "retry") {
      throw new Error("expected retry rule");
    }
    expect(w.rule.maxRetries).toBe(3);

    const read = await readWrapper("bash-retry", fakeHome);
    expect(read.tools).toEqual(["bash"]);
    if (read.rule.kind !== "retry") {
      throw new Error("expected retry rule after read");
    }
    expect(read.rule.maxRetries).toBe(3);
    expect(read.rule.initialBackoffMs).toBe(1000);
  });

  it("round-trips a log wrapper", async () => {
    await writeWrapper(
      "audit-log",
      {
        tools: ["bash", "write"],
        rule: {
          kind: "log",
          logPath: "observability/tool-calls-wrapper.jsonl",
        },
      },
      fakeHome,
    );
    const w = await readWrapper("audit-log", fakeHome);
    expect(w.tools).toEqual(["bash", "write"]);
    if (w.rule.kind !== "log") {
      throw new Error("expected log rule");
    }
    expect(w.rule.logPath).toBe("observability/tool-calls-wrapper.jsonl");
  });

  it("round-trips a transform wrapper", async () => {
    await writeWrapper(
      "redact-env",
      {
        tools: ["read", "write"],
        rule: {
          kind: "transform",
          transform: "rewrite-path-redact",
          patterns: ["**/.env"],
        },
      },
      fakeHome,
    );
    const w = await readWrapper("redact-env", fakeHome);
    if (w.rule.kind !== "transform") {
      throw new Error("expected transform rule");
    }
    expect(w.rule.transform).toBe("rewrite-path-redact");
    expect(w.rule.patterns).toEqual(["**/.env"]);
  });

  it("listWrappers returns all written wrappers", async () => {
    await writeWrapper(
      "a",
      { tools: ["bash"], rule: { kind: "log", logPath: "x" } },
      fakeHome,
    );
    await writeWrapper(
      "b",
      {
        tools: ["write"],
        rule: { kind: "retry", maxRetries: 5, initialBackoffMs: 500 },
      },
      fakeHome,
    );
    const all = await listWrappers(fakeHome);
    const names = all.map((w) => w.name).sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("tryReadWrapper returns null for a non-existent wrapper", async () => {
    const w = await tryReadWrapper("nope", fakeHome);
    expect(w).toBeNull();
  });

  it("tryReadWrapper returns null for an invalid kebab-case name", async () => {
    const w = await tryReadWrapper("NotKebab!", fakeHome);
    expect(w).toBeNull();
  });

  it("deleteWrapper removes a wrapper", async () => {
    await writeWrapper(
      "tmp",
      { tools: ["bash"], rule: { kind: "log", logPath: "x" } },
      fakeHome,
    );
    expect(await deleteWrapper("tmp", fakeHome)).toBe(true);
    expect(await tryReadWrapper("tmp", fakeHome)).toBeNull();
    // Idempotent — second delete is a no-op that
    // returns false (file doesn't exist).
    expect(await deleteWrapper("tmp", fakeHome)).toBe(false);
  });

  it("apply writes a no-op stub extension and unapply removes it", async () => {
    await writeWrapper(
      "applied",
      { tools: ["bash"], rule: { kind: "log", logPath: "x" } },
      fakeHome,
    );
    const { path, bytes } = await applyWrapper("applied", fakeHome);
    expect(path).toMatch(/pilot-wrapper-applied\.ts$/);
    expect(bytes).toBeGreaterThan(0);
    // Idempotent apply is fine.
    const again = await applyWrapper("applied", fakeHome);
    expect(again.path).toBe(path);
    // Unapply removes it.
    const { removed } = await unapplyWrapper("applied", fakeHome);
    expect(removed).toBe(true);
    const { removed: removed2 } = await unapplyWrapper("applied", fakeHome);
    expect(removed2).toBe(false);
  });
});

describe("v0.9.7: writeWrapper / applyWrapper atomic write", () => {
  it("leaves no .tmp behind after a successful wrapper write", async () => {
    await writeWrapper(
      "atomic-wrapper",
      { tools: ["bash"], rule: { kind: "log", logPath: "x" } },
      fakeHome,
    );
    const { wrapperPath } = await import("../../src/core/tool-wrapper.js");
    const path = wrapperPath("atomic-wrapper", fakeHome);
    const { stat } = await import("node:fs/promises");
    await expect(stat(`${path}.tmp`)).rejects.toThrow();
  });

  it("leaves no .tmp behind after apply", async () => {
    await writeWrapper(
      "atomic-apply",
      { tools: ["bash"], rule: { kind: "log", logPath: "x" } },
      fakeHome,
    );
    const { path } = await applyWrapper("atomic-apply", fakeHome);
    // The atomic helper writes to <path>.tmp then
    // renames — no leftover .tmp on success.
    const { stat } = await import("node:fs/promises");
    await expect(stat(`${path}.tmp`)).rejects.toThrow();
  });
});
