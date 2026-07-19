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
import { mkdtemp, rm, stat, writeFile, readFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteFile, safeIsDirectory } from "../../src/core/fs-utils.js";

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

// v0.9.9: cross-platform dirent-is-directory check.
// Pre-v0.9.9 the O(n) `readdir(dir) + per-entry stat()`
// pattern was the only one available; now that
// `withFileTypes` is the default, callers still need a
// safe way to handle the Windows symlink/junction
// case where `Dirent.isDirectory()` lies.
describe("safeIsDirectory (v0.9.9)", () => {
  it("returns true for a real directory dirent", async () => {
    const sub = join(dir, "real-dir");
    await mkdir(sub);
    const entries = (await import("node:fs/promises")).readdir(dir, {
      withFileTypes: true,
    });
    const found = (await entries).find((e) => e.name === "real-dir");
    expect(found).toBeTruthy();
    expect(await safeIsDirectory(found!, dir)).toBe(true);
  });

  it("returns false for a regular file dirent", async () => {
    const file = join(dir, "a-file.txt");
    await writeFile(file, "x");
    const entries = await (
      await import("node:fs/promises")
    ).readdir(dir, { withFileTypes: true });
    const found = entries.find((e) => e.name === "a-file.txt");
    expect(found).toBeTruthy();
    expect(await safeIsDirectory(found!, dir)).toBe(false);
  });

  it("falls back to stat when a symlink points at a directory", async () => {
    // POSIX-only: Windows symlinks need elevated
    // privileges. Skip on non-POSIX hosts — the test
    // still locks the "fallback path" semantics
    // elsewhere.
    if (process.platform === "win32") {
      return;
    }
    const target = join(dir, "real-target");
    await mkdir(target);
    const link = join(dir, "alias-link");
    await symlink(target, link, "dir");
    const entries = await (
      await import("node:fs/promises")
    ).readdir(dir, { withFileTypes: true });
    const found = entries.find((e) => e.name === "alias-link");
    expect(found).toBeTruthy();
    // On POSIX, Dirent.isDirectory() returns false for
    // symlinks (even those pointing at dirs). The
    // helper must fall back to stat and answer true.
    expect(await safeIsDirectory(found!, dir)).toBe(true);
  });

  it("returns false when stat also fails (entry gone)", async () => {
    // A string entry with no parent → no stat possible.
    expect(await safeIsDirectory("just-a-name")).toBe(false);
  });

  it("returns false for a string entry pointing at a missing path", async () => {
    // v0.9.9: a bare string entry + parent — if the
    // path is gone, we treat it as "not a directory"
    // rather than throw. The caller (the original
    // `for (const entry of entries) { if (!s.isDirectory()) continue }`
    // pattern) wants to skip it.
    expect(
      await safeIsDirectory("does-not-exist.txt", dir),
    ).toBe(false);
  });
});
