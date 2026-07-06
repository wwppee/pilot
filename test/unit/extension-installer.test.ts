/**
 * Tests for `core/extension-installer.ts` — the v0.5.4 Co-pilot bridge.
 *
 * Verifies:
 *   1. `findPilotToolsSource` finds the canonical source file
 *   2. `installPilotTools` creates a fresh symlink
 *   3. Re-running is idempotent (reports "already-linked")
 *   4. A stale symlink pointing elsewhere gets replaced
 *   5. A regular file at the target is NOT clobbered
 *   6. `getExtensionTargetPath` respects $PI_AGENT_DIR
 *
 * All tests use a fake install dir (so we control the "source")
 * and a fake HOME / PI_AGENT_DIR (so we control the "target").
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  readlinkSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findPilotToolsSource,
  installPilotTools,
  getExtensionTargetPath,
} from "../../src/core/extension-installer.js";

const PILOT_TOOLS_SOURCE = `// stub
export default function (pi) {
  pi.registerTool({ name: "stub", description: "stub" });
}
`;

let fakeHome: string;
let fakePiAgentDir: string;
let fakeInstallDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "pilot-ext-installer-"));
  fakeHome = join(root, "home");
  fakePiAgentDir = join(root, "pi-agent");
  // Place a fake pilot-tools.ts inside the install dir under
  // extensions/, mimicking the real layout (dist/extensions/pilot-tools.ts).
  fakeInstallDir = join(root, "install");
  const extDir = join(fakeInstallDir, "extensions");
  mkdirSync(extDir, { recursive: true });
  writeFileSync(join(extDir, "pilot-tools.ts"), PILOT_TOOLS_SOURCE, "utf-8");

  originalEnv = { ...process.env };
  process.env.HOME = fakeHome;
  // Override the target dir so we don't touch the real ~/.pi/agent.
  process.env.PI_AGENT_DIR = fakePiAgentDir;
});

afterEach(() => {
  process.env = originalEnv;
  // mkdtempSync root was the parent of fakeHome — clean both.
  const root = fakeHome.replace(/\/home$/, "");
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
});

describe("findPilotToolsSource", () => {
  it("returns the canonical extensions/pilot-tools.ts", () => {
    const found = findPilotToolsSource(fakeInstallDir);
    expect(found).toBe(join(fakeInstallDir, "extensions", "pilot-tools.ts"));
  });

  it("falls back to ../src/extensions/pilot-tools.ts (dev layout)", () => {
    // Remove the prod-style file, create the dev-style file.
    rmSync(join(fakeInstallDir, "extensions", "pilot-tools.ts"));
    const srcExtDir = join(fakeInstallDir, "..", "src", "extensions");
    mkdirSync(srcExtDir, { recursive: true });
    writeFileSync(
      join(srcExtDir, "pilot-tools.ts"),
      PILOT_TOOLS_SOURCE,
      "utf-8",
    );
    const found = findPilotToolsSource(fakeInstallDir);
    expect(found).toBe(join(srcExtDir, "pilot-tools.ts"));
  });

  it("returns null when no source file is found", () => {
    rmSync(join(fakeInstallDir, "extensions", "pilot-tools.ts"));
    expect(findPilotToolsSource(fakeInstallDir)).toBeNull();
  });
});

describe("getExtensionTargetPath", () => {
  it("returns $PI_AGENT_DIR/extensions/pilot-tools.ts when set", () => {
    process.env.PI_AGENT_DIR = "/tmp/somewhere";
    expect(getExtensionTargetPath()).toBe(
      "/tmp/somewhere/extensions/pilot-tools.ts",
    );
  });

  it("falls back to ~/.pi/agent/extensions/pilot-tools.ts", () => {
    delete process.env.PI_AGENT_DIR;
    process.env.HOME = "/Users/fake";
    expect(getExtensionTargetPath()).toBe(
      "/Users/fake/.pi/agent/extensions/pilot-tools.ts",
    );
  });
});

describe("installPilotTools", () => {
  it("creates a symlink on first install", async () => {
    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(true);
    expect(r.action).toBe("created");
    expect(r.target).toBe(getExtensionTargetPath());

    // Verify the symlink exists and points to our source.
    const target = getExtensionTargetPath();
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(readlinkSync(target)).toBe(
      join(fakeInstallDir, "extensions", "pilot-tools.ts"),
    );
  });

  it("is idempotent (already-linked)", async () => {
    await installPilotTools(fakeInstallDir);
    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(true);
    expect(r.action).toBe("already-linked");
  });

  it("replaces a stale symlink pointing elsewhere", async () => {
    const target = getExtensionTargetPath();
    mkdirSync(join(fakePiAgentDir, "extensions"), { recursive: true });
    // Stale link → wrong source.
    const staleSource = join(
      fakeInstallDir,
      "extensions",
      "OLD-pilot-tools.ts",
    );
    writeFileSync(staleSource, "// stale", "utf-8");
    symlinkSync(staleSource, target);

    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(true);
    expect(r.action).toBe("replaced");
    // Now points to the right source.
    expect(readlinkSync(target)).toBe(
      join(fakeInstallDir, "extensions", "pilot-tools.ts"),
    );
  });

  it("refuses to clobber a regular file at the target", async () => {
    const target = getExtensionTargetPath();
    mkdirSync(join(fakePiAgentDir, "extensions"), { recursive: true });
    writeFileSync(target, "// user-written extension", "utf-8");

    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(false);
    expect(r.action).toBe("skipped-conflict");
    // File untouched.
    expect(existsSync(target)).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
  });

  it("returns ok=false when source file is missing", async () => {
    rmSync(join(fakeInstallDir, "extensions", "pilot-tools.ts"));
    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(false);
    expect(r.action).toBe("skipped-conflict");
  });

  it("creates the ~/.pi/agent/extensions/ directory if missing", async () => {
    // fakePiAgentDir does NOT exist yet — install should create it.
    expect(existsSync(fakePiAgentDir)).toBe(false);
    const r = await installPilotTools(fakeInstallDir);
    expect(r.ok).toBe(true);
    expect(existsSync(join(fakePiAgentDir, "extensions"))).toBe(true);
  });
});
