/**
 * Tests for `commands/init.ts` — `pilot init`.
 *
 * Run against a real home dir (process.env.HOME override) so we
 * exercise the actual file-creation logic. We don't test the
 * `--start` branch (it spawns detached processes — that's an
 * integration test, not unit).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as initCmd from "../../src/commands/init.js";
import { createService } from "../../src/core/service-impl.js";
import type { PilotContext } from "../../src/core/types.js";

function makeCtx(home: string): PilotContext {
  return {
    home,
    piAgentDir: join(home, ".pi/agent"),
    settings: null,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      success: () => undefined,
      dim: () => undefined,
    },
    isInteractive: false,
    service: createService({ home }),
  };
}

describe("pilot init", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "pilot-init-"));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("creates ~/.pilot/ and required subdirs on first run", async () => {
    const code = await initCmd.run(["--json"], makeCtx(tempHome));
    expect(code === 0 || code === 1).toBe(true); // may fail if pi missing

    expect(existsSync(join(tempHome, ".pilot"))).toBe(true);
    for (const sub of ["extensions", "policy", "profiles", "capabilities"]) {
      expect(existsSync(join(tempHome, ".pilot", sub))).toBe(true);
    }
  });

  it("is idempotent — second run doesn't fail", async () => {
    await initCmd.run(["--json"], makeCtx(tempHome));
    const code = await initCmd.run(["--json"], makeCtx(tempHome));
    expect(code === 0 || code === 1).toBe(true);
    expect(existsSync(join(tempHome, ".pilot", "extensions"))).toBe(true);
  });

  it("returns JSON when --json is passed", async () => {
    await initCmd.run(["--json"], makeCtx(tempHome));
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      await initCmd.run(["--json"], makeCtx(tempHome));
    } finally {
      console.log = origLog;
    }
    // kleur colorizes; strip ANSI before parsing
    const raw = captured.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    // Find the JSON block (start { to matching close })
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const parsed = JSON.parse(raw.slice(start, end + 1));
    expect(parsed.homeDir).toBe(join(tempHome, ".pilot"));
    expect(parsed.homeCreated).toBe(false); // second run
    expect(typeof parsed.node).toBe("string");
    expect(typeof parsed.piInstalled).toBe("boolean");
    expect(Array.isArray(parsed.steps)).toBe(true);
  });

  it("first run marks homeCreated=true", async () => {
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      await initCmd.run(["--json"], makeCtx(tempHome));
    } finally {
      console.log = origLog;
    }
    const raw = captured.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1));
    expect(parsed.homeCreated).toBe(true);
  });

  it("prints banner output without --json", async () => {
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      await initCmd.run([], makeCtx(tempHome));
    } finally {
      console.log = origLog;
    }
    const out = captured.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(out).toMatch(/Pilot Setup/);
    expect(out).toMatch(/Next steps/);
    expect(out).toMatch(/Node/);
    // "Home exists:" or "Created home:" both contain "home"
    expect(out).toMatch(/home/i);
  });

  it("doesn't crash when home already has extra files (idempotency beyond empty dir)", async () => {
    // Pre-create some files in the home dir
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(tempHome, ".pilot"), { recursive: true });
    writeFileSync(
      join(tempHome, ".pilot", "server.token"),
      "existing-token-123",
      "utf-8",
    );
    const code = await initCmd.run(["--json"], makeCtx(tempHome));
    expect(code === 0 || code === 1).toBe(true);
    // Existing file should be untouched
    expect(
      require("node:fs").readFileSync(
        join(tempHome, ".pilot", "server.token"),
        "utf-8",
      ),
    ).toBe("existing-token-123");
  });
});
