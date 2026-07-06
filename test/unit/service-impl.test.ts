/**
 * Unit tests for createService() — the default PilotService implementation.
 *
 * These tests use the **real** service against an isolated HOME, with
 * the npm manifest reader **mocked** to return predictable fixtures.
 * This makes the tests offline-stable: no real npm calls, no timeouts.
 *
 * Tests that DO need the real npm registry (searchPacks / getPack
 * with a real package) live in `test/integration/pack-registry.test.ts`
 * and are excluded from the default `npm test` run.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Mock the npm manifest reader ──────────────────────────────
//
// We stub readPackManifestCached so listPacks classification is
// deterministic and offline. Each test sets `mockManifestImpl` to the
// function that returns the desired manifest.
function classifyByName(name: string): string {
  if (name.endsWith("-skill") || name.includes("superpowers")) return "skill";
  if (name.includes("hud") || name.endsWith("-theme")) return "theme";
  if (name.endsWith("-prompt")) return "prompt";
  return "extension";
}

let mockManifestImpl: (name: string) => Promise<unknown> = async () => null;
vi.mock("../../src/core/pack-manifest.js", () => ({
  readPackManifestCached: (name: string) => mockManifestImpl(name),
  clearManifestCache: () => {},
  classifyFromManifest: (manifest: any, fallbackName: string) => {
    if (manifest?.pi?.kind) return manifest.pi.kind;
    if (manifest?.pi) {
      if (manifest.pi.themes?.length) return "theme";
      if (manifest.pi.prompts?.length) return "prompt";
      if (manifest.pi.skills?.length) return "skill";
      if (manifest.pi.extension !== undefined) return "extension";
    }
    return classifyByName(fallbackName);
  },
  classifyByName,
}));

import { createService } from "../../src/core/service-impl.js";

describe("createService", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "pilot-svc-test-"));
    process.env.HOME = tempHome;
    mkdirSync(join(tempHome, ".pilot/capabilities/sample"), {
      recursive: true,
    });
    // Default: no manifest available → fall through to name heuristic.
    mockManifestImpl = async () => null;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("returns a service object with all expected methods", () => {
    const svc = createService();
    expect(typeof svc.listPacks).toBe("function");
    expect(typeof svc.searchPacks).toBe("function");
    expect(typeof svc.getPack).toBe("function");
    expect(typeof svc.installPack).toBe("function");
    expect(typeof svc.listSessions).toBe("function");
    expect(typeof svc.searchSessions).toBe("function");
    expect(typeof svc.runDoctor).toBe("function");
    expect(typeof svc.listCapabilities).toBe("function");
    expect(typeof svc.getCapability).toBe("function");
  });

  // ─── Packs ──────────────────────────────────────────

  describe("listPacks", () => {
    it("returns [] when settings.json is missing", async () => {
      const svc = createService();
      const packs = await svc.listPacks();
      expect(packs).toEqual([]);
    });

    it("parses installed sources from settings.json", async () => {
      mkdirSync(join(tempHome, ".pi/agent"), { recursive: true });
      writeFileSync(
        join(tempHome, ".pi/agent/settings.json"),
        JSON.stringify({
          // v0.5.5: pi's field is `packages` (string-form); no `enabled`
          // flag — every listed package is implicitly enabled.
          packages: ["npm:pi-subagents", "npm:pi-lens", "npm:disabled-pack"],
        }),
      );
      const svc = createService();
      const packs = await svc.listPacks();
      expect(packs).toHaveLength(3);
      expect(packs[0]?.source).toBe("npm:pi-subagents");
      expect(packs[0]?.enabled).toBe(true);
      // v0.5.5: there's no enabled:false in pi's schema anymore.
      expect(packs[2]?.enabled).toBe(true);
    });

    it("classifies packs via manifest (not name heuristic)", async () => {
      // Mocked manifest returns a "skill" kind for pi-lens (real npm now
      // publishes it as a skill, not an extension). The service should
      // honor that, not fall back to the name.
      mockManifestImpl = async (name: string) => {
        if (name === "pi-lens") {
          return {
            name: "pi-lens",
            version: "1.0.0",
            pi: { kind: "skill", skills: ["lens.md"] },
          };
        }
        if (name === "pi-hud-footer") {
          return {
            name: "pi-hud-footer",
            version: "1.0.0",
            pi: { kind: "theme", themes: ["hud.json"] },
          };
        }
        if (name === "pi-subagents") {
          return {
            name: "pi-subagents",
            version: "1.0.0",
            pi: { kind: "extension" },
          };
        }
        return null;
      };

      mkdirSync(join(tempHome, ".pi/agent"), { recursive: true });
      writeFileSync(
        join(tempHome, ".pi/agent/settings.json"),
        JSON.stringify({
          packages: [
            "npm:pi-lens", // manifest says skill
            "npm:pi-hud-footer", // manifest says theme
            "npm:pi-subagents", // manifest says extension
          ],
        }),
      );
      const svc = createService();
      const packs = await svc.listPacks();
      const byName = new Map(packs.map((p) => [p.name, p.kind]));
      expect(byName.get("pi-lens")).toBe("skill"); // from manifest
      expect(byName.get("pi-hud-footer")).toBe("theme"); // from manifest
      expect(byName.get("pi-subagents")).toBe("extension");
    });

    it("falls back to name heuristic when manifest is missing", async () => {
      // No mockManifestImpl override → all returns null
      mockManifestImpl = async () => null;

      mkdirSync(join(tempHome, ".pi/agent"), { recursive: true });
      writeFileSync(
        join(tempHome, ".pi/agent/settings.json"),
        JSON.stringify({
          packages: [
            "npm:pi-foo-skill", // name → skill
            "npm:pi-foo-theme", // name → theme
            "npm:pi-foo-prompt", // name → prompt
            "npm:superpowers-zh", // name → skill (contains 'superpowers')
            "npm:pi-lens", // name → extension (default)
          ],
        }),
      );
      const svc = createService();
      const packs = await svc.listPacks();
      const byName = new Map(packs.map((p) => [p.name, p.kind]));
      expect(byName.get("pi-foo-skill")).toBe("skill");
      expect(byName.get("pi-foo-theme")).toBe("theme");
      expect(byName.get("pi-foo-prompt")).toBe("prompt");
      expect(byName.get("superpowers-zh")).toBe("skill");
      expect(byName.get("pi-lens")).toBe("extension");
    });
  });

  // ─── Sessions ───────────────────────────────────────

  describe("listSessions", () => {
    it("returns [] when sessions dir does not exist", async () => {
      const svc = createService();
      const sessions = await svc.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe("searchSessions", () => {
    it("returns [] when sessions dir does not exist", async () => {
      const svc = createService();
      const hits = await svc.searchSessions("anything");
      expect(hits).toEqual([]);
    });
  });

  // ─── Doctor ─────────────────────────────────────────

  describe("runDoctor", () => {
    it("returns a structured report", async () => {
      const svc = createService();
      const report = await svc.runDoctor();
      expect(typeof report.ok).toBe("boolean");
      expect(typeof report.failed).toBe("number");
      expect(Array.isArray(report.checks)).toBe(true);
      // Should have at least: node + pi + fd + ~/.pi/agent
      expect(report.checks.length).toBeGreaterThanOrEqual(4);
    });

    it("every check has ok/message", async () => {
      const svc = createService();
      const report = await svc.runDoctor();
      for (const c of report.checks) {
        expect(typeof c.ok).toBe("boolean");
        expect(typeof c.message).toBe("string");
      }
    });
  });

  // ─── Capabilities ────────────────────────────────────

  describe("listCapabilities", () => {
    it("returns [] when store is empty", async () => {
      // Just-created tempHome has empty ~/.pilot/capabilities/sample (no capability.json)
      const svc = createService();
      const caps = await svc.listCapabilities();
      expect(caps).toEqual([]);
    });

    it("returns installed capabilities", async () => {
      writeFileSync(
        join(tempHome, ".pilot/capabilities/sample/capability.json"),
        JSON.stringify({
          id: "sample",
          title: "Sample",
          type: "workflow",
          description: "Test",
          sources: [{ type: "npm", ref: "npm:foo", mode: "L2-wrapped" }],
          artifacts: {},
          compatibility: { conflicts: [], requires: [] },
          metadata: {
            createdAt: "2026-07-01T00:00:00Z",
            updatedAt: "2026-07-01T00:00:00Z",
          },
        }),
      );
      const svc = createService();
      const caps = await svc.listCapabilities();
      expect(caps).toHaveLength(1);
      expect(caps[0]?.id).toBe("sample");
    });
  });

  describe("getCapability", () => {
    it("returns null for missing capability", async () => {
      const svc = createService();
      expect(await svc.getCapability("does-not-exist")).toBeNull();
    });

    it("returns the capability when present", async () => {
      writeFileSync(
        join(tempHome, ".pilot/capabilities/sample/capability.json"),
        JSON.stringify({
          id: "sample",
          title: "Sample",
          type: "workflow",
          description: "Test",
          sources: [{ type: "npm", ref: "npm:foo", mode: "L2-wrapped" }],
          artifacts: {},
          compatibility: { conflicts: [], requires: [] },
          metadata: {
            createdAt: "2026-07-01T00:00:00Z",
            updatedAt: "2026-07-01T00:00:00Z",
          },
        }),
      );
      const svc = createService();
      const cap = await svc.getCapability("sample");
      expect(cap?.id).toBe("sample");
      expect(cap?.type).toBe("workflow");
    });
  });

  describe("readSessionTree", () => {
    it("throws when session not found", async () => {
      const svc = createService({ home: tempHome });
      await expect(svc.readSessionTree("does-not-exist")).rejects.toThrow(
        /session not found/,
      );
    });

    it("returns tree for a real session", async () => {
      // Create a fake session file in pi's sessions dir
      const encoded = Buffer.from("/tmp/fake-cwd").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const sessionId = "2026-07-01_10-00_abc";
      const sessionPath = join(sessionsDir, `${sessionId}.jsonl`);
      writeFileSync(
        sessionPath,
        [
          JSON.stringify({
            id: "a",
            type: "user",
            timestamp: "2026-07-01T10:00:00Z",
            data: { text: "q" },
          }),
          JSON.stringify({
            id: "b",
            parentId: "a",
            type: "assistant",
            timestamp: "2026-07-01T10:00:05Z",
            data: { model: "claude-opus-4.6", text: "a" },
          }),
        ].join("\n"),
      );
      const svc = createService({ home: tempHome });
      const tree = await svc.readSessionTree(sessionId);
      expect(tree.id).toBe(sessionId);
      expect(tree.totalNodes).toBe(2);
      expect(tree.models).toEqual(["claude-opus-4.6"]);
    });
  });
});
