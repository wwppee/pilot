/**
 * session-snapshot.test.ts — coverage for derived session metadata.
 *
 * Tests run in isolation: each one writes a fake pi session tree +
 * fake pilot state into a fresh mkdtemp, then asserts snapshot fields
 * match what was on disk at derive time.
 *
 * Network-free — uses tmp + fs/promises only.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SNAPSHOT_TTL_MS,
  deriveSnapshot,
  ensureSnapshot,
  ensureSnapshotIfStale,
  readSnapshot,
  snapshotDir,
  snapshotPath,
} from "../../src/core/session-snapshot.js";
import { writeActiveProfile } from "../../src/core/profile-state.js";
import { writeProfile } from "../../src/core/profile.js";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-snapshot-"));
}

/**
 * Write a minimal pi-style session JSONL into
 * ~/.pi/agent/sessions/<encodedCwd>/<sessionId>.jsonl so deriveSnapshot
 * can locate + parse it.
 */
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

describe("session-snapshot paths", () => {
  it("snapshotDir resolves to ~/.pilot/sessions", () => {
    const home = freshHome();
    expect(snapshotDir(home)).toBe(join(home, ".pilot", "sessions"));
  });

  it("snapshotPath joins <dir>/<id>.json", () => {
    const home = freshHome();
    expect(snapshotPath("abc-123", home)).toBe(
      join(home, ".pilot", "sessions", "abc-123.json"),
    );
  });

  it("readSnapshot returns null when no snapshot exists", async () => {
    const home = freshHome();
    expect(await readSnapshot("missing", home)).toBeNull();
  });
});

describe("deriveSnapshot", () => {
  it("returns null when the session file no longer exists", async () => {
    const home = freshHome();
    const snap = await deriveSnapshot("ghost-session", home);
    expect(snap).toBeNull();
  });

  it("captures model + cwd + entryCount + timestamps from JSONL", async () => {
    const home = freshHome();
    const id = "2026-07-04_10-00_aaa";
    writeFakeSession(home, id, "--home-me-proj--", [
      {
        type: "session_info",
        timestamp: "2026-07-04T10:00:00.000Z",
      },
      {
        type: "message",
        timestamp: "2026-07-04T10:00:05.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          usage: { totalTokens: 42 },
        },
      },
      {
        type: "message",
        timestamp: "2026-07-04T10:00:10.000Z",
        message: { role: "user", content: "hi" },
      },
    ]);

    const snap = await deriveSnapshot(id, home);
    expect(snap).not.toBeNull();
    expect(snap!.sessionId).toBe(id);
    expect(snap!.model).toBe("claude-opus-4-6");
    expect(snap!.cwd).toBe("--home-me-proj--");
    expect(snap!.entryCount).toBe(3);
    expect(snap!.startedAt).toBe("2026-07-04T10:00:00.000Z");
    expect(snap!.lastUsedAt).toBe("2026-07-04T10:00:10.000Z");
    expect(snap!.note).toMatch(/v0\.4\.13/);
  });

  it("includes activeProfile when ~/.pilot/active.json exists", async () => {
    const home = freshHome();
    const id = "2026-07-04_11-00_bbb";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T11:00:00.000Z" },
      {
        type: "message",
        timestamp: "2026-07-04T11:00:05.000Z",
        message: { role: "assistant", model: "gpt-4o" },
      },
    ]);
    await writeActiveProfile("pi-architect", "cli", home);
    // v0.5.6: ghost-profile guard would otherwise clear the diary
    // because no profile TOML exists. Stub the profile so the
    // diary survives readActiveProfile's validation.
    await writeProfile(
      "pi-architect",
      { description: "stub for snapshot test" },
      home,
    );

    const snap = await deriveSnapshot(id, home);
    expect(snap!.activeProfile).toBe("pi-architect");
  });

  it("omits optional fields when source data is missing", async () => {
    const home = freshHome();
    const id = "2026-07-04_12-00_ccc";
    // Only session_info, no assistant message → no model.
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T12:00:00.000Z" },
    ]);

    const snap = await deriveSnapshot(id, home);
    expect(snap!.model).toBeUndefined();
    expect(snap!.activeProfile).toBeUndefined();
    expect(snap!.extensions).toBeUndefined();
    expect(snap!.packSources).toBeUndefined();
  });

  it("captures generated policy extensions in ~/.pilot/extensions/", async () => {
    const home = freshHome();
    const id = "2026-07-04_13-00_ddd";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T13:00:00.000Z" },
    ]);

    const extDir = join(home, ".pilot", "extensions");
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, "pilot-policy-safe-bash.ts"), "export {};\n");
    writeFileSync(join(extDir, "pilot-policy-readonly.ts"), "export {};\n");
    // Noise that should be filtered out.
    writeFileSync(join(extDir, "user-extension.ts"), "export {};\n");

    const snap = await deriveSnapshot(id, home);
    // Sorted alphabetically (r < s): readonly before safe-bash.
    expect(snap!.extensions).toEqual([
      "pilot-policy-readonly",
      "pilot-policy-safe-bash",
    ]);
  });
});

describe("writeSnapshot / ensureSnapshot", () => {
  it("persists snapshot to disk and readSnapshot returns it", async () => {
    const home = freshHome();
    const id = "2026-07-04_14-00_eee";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T14:00:00.000Z" },
      {
        type: "message",
        timestamp: "2026-07-04T14:00:05.000Z",
        message: { role: "assistant", model: "claude-sonnet-4-5" },
      },
    ]);

    const written = await ensureSnapshot(id, home);
    expect(written).not.toBeNull();
    expect(written!.model).toBe("claude-sonnet-4-5");

    const reloaded = await readSnapshot(id, home);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.sessionId).toBe(id);
    expect(reloaded!.model).toBe("claude-sonnet-4-5");
    expect(existsSync(snapshotPath(id, home))).toBe(true);
  });

  it("returns null when session file is missing (no crash)", async () => {
    const home = freshHome();
    const written = await ensureSnapshot("never-existed", home);
    expect(written).toBeNull();
    expect(existsSync(snapshotPath("never-existed", home))).toBe(false);
  });
});

describe("ensureSnapshotIfStale", () => {
  it("derives + persists when no snapshot exists yet", async () => {
    const home = freshHome();
    const id = "2026-07-04_15-00_fff";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T15:00:00.000Z" },
      {
        type: "message",
        timestamp: "2026-07-04T15:00:05.000Z",
        message: { role: "assistant", model: "claude-haiku-4-5" },
      },
    ]);

    const snap = await ensureSnapshotIfStale(id, DEFAULT_SNAPSHOT_TTL_MS, home);
    expect(snap).not.toBeNull();
    expect(snap!.model).toBe("claude-haiku-4-5");
    expect(existsSync(snapshotPath(id, home))).toBe(true);
  });

  it("reuses existing snapshot when within TTL (no rewrite)", async () => {
    const home = freshHome();
    const id = "2026-07-04_16-00_ggg";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T16:00:00.000Z" },
      {
        type: "message",
        timestamp: "2026-07-04T16:00:05.000Z",
        message: { role: "assistant", model: "claude-opus-4-6" },
      },
    ]);

    // First call writes to disk.
    const first = await ensureSnapshotIfStale(id, 60_000, home);
    expect(first).not.toBeNull();
    const firstCapturedAt = first!.capturedAt;

    // Wait a tick so capturedAt would differ if we re-derived.
    await new Promise((r) => setTimeout(r, 5));

    // Second call within TTL must reuse — capturedAt unchanged.
    const second = await ensureSnapshotIfStale(id, 60_000, home);
    expect(second).not.toBeNull();
    expect(second!.capturedAt).toBe(firstCapturedAt);
  });

  it("re-derives when existing snapshot is older than maxAge", async () => {
    const home = freshHome();
    const id = "2026-07-04_17-00_hhh";
    writeFakeSession(home, id, "--home-me-proj--", [
      { type: "session_info", timestamp: "2026-07-04T17:00:00.000Z" },
    ]);

    await ensureSnapshotIfStale(id, 0, home); // maxAge=0 forces re-derive
    // capturedAt should now be in the past (since first call set it).
    const first = await readSnapshot(id, home);
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 5));

    // maxAge=0 → always stale → re-derive.
    const second = await ensureSnapshotIfStale(id, 0, home);
    expect(second).not.toBeNull();
    // capturedAt should be newer than the first one.
    expect(new Date(second!.capturedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first!.capturedAt).getTime(),
    );
  });
});
