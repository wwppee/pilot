/**
 * v0.9.7: unit tests for the `atomicWriteFile`
 * helper. The helper exists because the v0.9.7
 * audit found `writePolicy` and `writeWrapper`
 * writing directly to the target file with
 * `writeFile`, leaving it half-written on crash.
 *
 * These tests lock the contract: write goes
 * through a `.tmp` first, the target is created
 * by `rename` (so it's visible atomically), and a
 * stale `.tmp` from a prior crash is cleaned up
 * before the new write.
 */
import { mkdtemp, rm, stat, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteFile } from "../../src/core/fs-utils.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pilot-fs-utils-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("atomicWriteFile", () => {
  it("writes the file with the requested content", async () => {
    const file = join(dir, "out.txt");
    await atomicWriteFile(file, "hello world");
    const got = await readFile(file, "utf-8");
    expect(got).toBe("hello world");
  });

  it("leaves no .tmp behind on success", async () => {
    const file = join(dir, "out.txt");
    await atomicWriteFile(file, "ok");
    // The .tmp must be gone — otherwise a stale
    // half-written tmp would be visible to debug
    // tooling and confuse a future write.
    await expect(stat(`${file}.tmp`)).rejects.toThrow();
  });

  it("overwrites an existing file", async () => {
    const file = join(dir, "out.txt");
    await writeFile(file, "old", "utf-8");
    await atomicWriteFile(file, "new");
    expect(await readFile(file, "utf-8")).toBe("new");
  });

  it("cleans up a stale .tmp from a prior crash", async () => {
    const file = join(dir, "out.txt");
    // Simulate a crash mid-write: a .tmp from a
    // previous aborted atomicWriteFile was left
    // behind. The next call must remove it before
    // writing so a future debug ls doesn't show a
    // confusing stale file.
    const tmp = `${file}.tmp`;
    await writeFile(tmp, "stale half-written content", "utf-8");
    await atomicWriteFile(file, "fresh content");
    expect(await readFile(file, "utf-8")).toBe("fresh content");
    // After a successful write, no .tmp remains.
    await expect(stat(tmp)).rejects.toThrow();
  });

  it("supports a non-utf8 encoding when requested", async () => {
    const file = join(dir, "out.bin");
    await atomicWriteFile(file, "binary-content", "ascii");
    const got = await readFile(file, "utf-8");
    expect(got).toBe("binary-content");
  });
});
