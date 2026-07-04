/**
 * profile-state.test.ts — coverage for ~/.pilot/active.json pointer.
 *
 * Tests run in isolation: each one writes into a fresh mkdtemp to
 * avoid contaminating the real ~/.pilot/. Network-free (uses tmp +
 * fs/promises only).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeProfilePath,
  clearActiveProfile,
  readActiveProfile,
  writeActiveProfile,
} from "../../src/core/profile-state.js";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-profile-state-"));
}

describe("profile-state", () => {
  it("activeProfilePath resolves to ~/.pilot/active.json", () => {
    const home = freshHome();
    expect(activeProfilePath(home)).toBe(join(home, ".pilot", "active.json"));
  });

  it("readActiveProfile returns null when no file exists", async () => {
    const home = freshHome();
    expect(await readActiveProfile(home)).toBeNull();
  });

  it("writeActiveProfile + readActiveProfile round-trips", async () => {
    const home = freshHome();
    const state = await writeActiveProfile("pi-architect", "cli", home);
    expect(state.name).toBe("pi-architect");
    expect(state.activatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(state.source).toBe("cli");

    const back = await readActiveProfile(home);
    expect(back).toEqual(state);
  });

  it("writeActiveProfile overwrites previous state", async () => {
    const home = freshHome();
    await writeActiveProfile("first", "cli", home);
    const second = await writeActiveProfile("second", "web", home);
    expect(second.name).toBe("second");
    expect(second.source).toBe("web");
    const back = await readActiveProfile(home);
    expect(back?.name).toBe("second");
  });

  it("clearActiveProfile removes the file", async () => {
    const home = freshHome();
    await writeActiveProfile("temp", "cli", home);
    const path = activeProfilePath(home);
    expect(existsSync(path)).toBe(true);
    await clearActiveProfile(home);
    expect(existsSync(path)).toBe(false);
  });

  it("clearActiveProfile is a no-op when no file exists", async () => {
    const home = freshHome();
    // Should not throw
    await expect(clearActiveProfile(home)).resolves.toBeUndefined();
  });

  it("readActiveProfile returns null when file is corrupt JSON", async () => {
    const home = freshHome();
    const dir = join(home, ".pilot");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "active.json"), "{ this is not valid json", "utf8");
    expect(await readActiveProfile(home)).toBeNull();
  });

  it("readActiveProfile returns null when shape is wrong", async () => {
    const home = freshHome();
    const dir = join(home, ".pilot");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    // Missing required fields
    writeFileSync(
      join(dir, "active.json"),
      JSON.stringify({ name: "x" }),
      "utf8",
    );
    expect(await readActiveProfile(home)).toBeNull();
  });

  it("source defaults to 'cli' when not specified", async () => {
    const home = freshHome();
    const state = await writeActiveProfile("default-source", undefined, home);
    expect(state.source).toBe("cli");
  });

  it("accepts 'web' source", async () => {
    const home = freshHome();
    const state = await writeActiveProfile("from-web", "web", home);
    expect(state.source).toBe("web");
  });

  it("accepts 'auto' source (for future Avatars / snapshots)", async () => {
    const home = freshHome();
    const state = await writeActiveProfile("from-auto", "auto", home);
    expect(state.source).toBe("auto");
  });
});