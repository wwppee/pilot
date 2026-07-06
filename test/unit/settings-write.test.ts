/**
 * Tests for `core/settings-write.ts` — the safe-write path for
 * `~/.pi/agent/settings.json` (v0.5.5 NEW).
 *
 * Covers:
 *   1. writeSettings creates a fresh file when none exists
 *   2. writeSettings updates an existing file
 *   3. writeSettings preserves unknown fields across a write
 *   4. writeSettings backs up the previous file to <path>.bak
 *   5. writeSettings rolls back when the payload fails JSON
 *      validation (e.g. circular reference)
 *   6. writeSettings returns clear error when lock is held
 *      (we simulate this by acquiring the lock from another call)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { writeSettings } from "../../src/core/settings-write.js";
import type { PiSettings } from "../../src/core/types.js";

let fakeHome: string;
let originalEnv: NodeJS.ProcessEnv;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "pilot-settings-write-"));
  originalEnv = { ...process.env };
  process.env.HOME = fakeHome;
  cleanup = null;
});

afterEach(() => {
  process.env = originalEnv;
  if (cleanup) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
  }
  if (existsSync(fakeHome)) {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

function settingsFile(): string {
  return join(fakeHome, ".pi/agent/settings.json");
}

describe("writeSettings", () => {
  it("creates a fresh settings.json when none exists", async () => {
    const r = await writeSettings(
      { defaultModel: "claude-opus-4-6" },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.action).toBe("created");
    expect(existsSync(settingsFile())).toBe(true);
    const written = JSON.parse(readFileSync(settingsFile(), "utf-8"));
    expect(written.defaultModel).toBe("claude-opus-4-6");
  });

  it("updates an existing settings.json (action: 'updated')", async () => {
    mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      settingsFile(),
      JSON.stringify({ defaultModel: "claude-sonnet-4-5" }),
    );
    const r = await writeSettings(
      { defaultModel: "claude-opus-4-6" },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.action).toBe("updated");
    const written = JSON.parse(readFileSync(settingsFile(), "utf-8"));
    expect(written.defaultModel).toBe("claude-opus-4-6");
  });

  it("backs up the previous file to <path>.bak before overwriting", async () => {
    mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      settingsFile(),
      JSON.stringify({ defaultModel: "claude-sonnet-4-5" }, null, 2) + "\n",
    );
    await writeSettings({ defaultModel: "claude-opus-4-6" }, fakeHome);
    expect(existsSync(`${settingsFile()}.bak`)).toBe(true);
    const backup = JSON.parse(readFileSync(`${settingsFile()}.bak`, "utf-8"));
    expect(backup.defaultModel).toBe("claude-sonnet-4-5");
  });

  it("preserves unknown fields across a write (round-trip)", async () => {
    // Pilot models a few fields; pi's full schema has many more.
    // We MUST NOT silently drop user-tuned settings like theme,
    // compaction, transport, etc. — the [key: string]: unknown
    // index signature carries them through.
    mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        theme: "dark",
        compaction: { enabled: true, reserveTokens: 5000 },
        "user-custom-field": "preserve me",
      }),
    );
    // Now Pilot writes only the fields it manages. Caller is
    // responsible for spreading existing settings first — that's
    // the contract of apply-profile-to-pi.
    const existing = JSON.parse(readFileSync(settingsFile(), "utf-8"));
    const merged: PiSettings = {
      ...existing,
      defaultModel: "claude-opus-4-6",
    };
    await writeSettings(merged, fakeHome);

    const after = JSON.parse(readFileSync(settingsFile(), "utf-8"));
    expect(after.theme).toBe("dark");
    expect(after.compaction.enabled).toBe(true);
    expect(after.compaction.reserveTokens).toBe(5000);
    expect(after["user-custom-field"]).toBe("preserve me");
    expect(after.defaultModel).toBe("claude-opus-4-6");
  });

  it("rejects payloads that fail JSON round-trip (e.g. circular refs)", async () => {
    // Build a circular reference — JSON.stringify silently drops
    // it, leaving the post-write validation to catch it.
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const r = await writeSettings(circular as PiSettings, fakeHome);
    expect(r.ok).toBe(false);
    expect(r.action).toBe("rolled-back");
    expect(r.error).toBeDefined();
  });

  it("returns clear error when the lock is held by another process", async () => {
    mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify({ defaultModel: "x" }));

    // Hold the lock from "outside".
    const held = lockfile.lockSync(settingsFile(), { realpath: false });
    cleanup = () => held();

    const r = await writeSettings(
      { defaultModel: "claude-opus-4-6" },
      fakeHome,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Pi is currently running/i);
  });

  it("serializes with 2-space indent + trailing newline (matches pi's format)", async () => {
    await writeSettings({ defaultModel: "claude-opus-4-6" }, fakeHome);
    const raw = readFileSync(settingsFile(), "utf-8");
    // pi's SettingsManager writes with 2-space indent + trailing \n.
    expect(raw).toMatch(/^{\n  "defaultModel": "claude-opus-4-6"\n}\n$/);
  });
});
