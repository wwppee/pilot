/**
 * Tests for `core/project-context.ts` — mirrors pi's actual discovery algorithm.
 */

import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjectContext } from "../../src/core/project-context.js";
import { piAgentDir } from "../../src/core/types.js";

describe("project-context (v0.4.2)", () => {
  it("finds AGENTS.md in cwd", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project agents\nUse TypeScript.\n",
      );
      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      const agents = refs.find((r) => r.filename === "AGENTS.md");
      expect(agents).toBeDefined();
      expect(agents?.loaded).toBe(true);
      expect(agents?.bytes).toBeGreaterThan(0);
      expect(agents?.preview).toContain("TypeScript");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("finds CLAUDE.md in cwd when no AGENTS.md", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      writeFileSync(join(cwd, "CLAUDE.md"), "Use rust.");
      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      const claude = refs.find((r) => r.filename === "CLAUDE.md");
      expect(claude).toBeDefined();
      expect(claude?.loaded).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prefers AGENTS.md over CLAUDE.md in the same dir (pi's priority)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      writeFileSync(join(cwd, "AGENTS.md"), "from agents");
      writeFileSync(join(cwd, "CLAUDE.md"), "from claude");
      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      const agents = refs.filter((r) => r.loaded);
      // Only one of them per dir, due to pi's dedup logic (first match wins)
      expect(agents).toHaveLength(1);
      expect(agents[0]?.filename).toBe("AGENTS.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("walks up parent dirs to find context", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      // Create: /tmp/pc-test/parent/AGENTS.md and /tmp/pc-test/parent/child/
      const parent = join(tmp, "parent");
      const child = join(parent, "child");
      mkdirSync(child, { recursive: true });
      writeFileSync(join(parent, "AGENTS.md"), "parent rules");

      const refs = await discoverProjectContext(child, "/nonexistent-home");
      const agents = refs.find((r) => r.filename === "AGENTS.md");
      expect(agents).toBeDefined();
      // Location should be in the parent, not the cwd
      expect(agents?.path).toContain("/parent/AGENTS.md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dedupes if both cwd and parent have the same context", async () => {
    // Note: pi's dedup is by absolute path, so same-file in different
    // lookup positions counts once. Realistic case: cwd has no AGENTS.md
    // but a symlink at cwd/AGENTS.md → /some/AGENTS.md. Pi won't dedup
    // the symlink vs. the realpath, but it does dedup exact path matches.
    // This test verifies the simple case.
    const tmp = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      writeFileSync(join(tmp, "AGENTS.md"), "shared");
      // Try discovery from tmp itself (single dir, no parent walk needed)
      const refs = await discoverProjectContext(tmp, "/nonexistent-home");
      const agents = refs.filter((r) => r.filename === "AGENTS.md");
      expect(agents).toHaveLength(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes informational files (README, .cursor/rules) marked loaded=false", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      writeFileSync(join(cwd, "README.md"), "# My Project\nHello world.");
      mkdirSync(join(cwd, ".cursor"), { recursive: true });
      writeFileSync(join(cwd, ".cursor", "rules"), "rule 1");

      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      const readme = refs.find((r) => r.filename === "README.md");
      const cursor = refs.find((r) => r.filename === ".cursor/rules");
      expect(readme).toBeDefined();
      expect(readme?.loaded).toBe(false);
      expect(cursor).toBeDefined();
      expect(cursor?.loaded).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns empty array for empty dir", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      expect(refs).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("global context from agentDir comes first in result", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-pc-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-cwd-"));
    try {
      const agent = piAgentDir(home);
      mkdirSync(agent, { recursive: true });
      writeFileSync(join(agent, "AGENTS.md"), "global agents");
      writeFileSync(join(cwd, "AGENTS.md"), "cwd agents");

      const refs = await discoverProjectContext(cwd, home);
      // The first loaded AGENTS.md should be from agentDir
      const agents = refs.find((r) => r.filename === "AGENTS.md" && r.loaded);
      expect(agents).toBeDefined();
      expect(agents?.path).toContain("/.pi/agent/AGENTS.md");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preview truncates long content to ~200 chars", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pilot-pc-"));
    try {
      const long = "x".repeat(500);
      writeFileSync(join(cwd, "AGENTS.md"), long);
      const refs = await discoverProjectContext(cwd, "/nonexistent-home");
      const agents = refs.find((r) => r.filename === "AGENTS.md");
      expect(agents?.preview.length).toBeLessThanOrEqual(200);
      expect(agents?.preview.endsWith("...")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
