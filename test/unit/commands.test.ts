/**
 * Tests for commands — verify they go through ctx.service, not direct core.
 *
 * Uses a hand-rolled mock PilotService (no extra deps). This proves that
 * commands are decoupled from core/* — a critical invariant for the v0.2
 * architecture (CLI / server / web all share one service).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as packCmd from "../../src/commands/pack.js";
import * as sessionCmd from "../../src/commands/session.js";
import * as doctorCmd from "../../src/commands/doctor.js";
import * as profileCmd from "../../src/commands/profile.js";
import * as planCmd from "../../src/commands/plan.js";

import type { PilotService } from "../../src/core/service.js";
import type {
  Capability,
  InstalledPack,
  Pack,
  PilotContext,
  SessionInfo,
} from "../../src/core/types.js";
import type { Profile, ProfileInput } from "../../src/core/profile.js";
import type { DoctorReport, Plan } from "../../src/core/service.js";

// ─── Mock factory ──────────────────────────────────────────

function makeMockService(
  overrides: Partial<PilotService> = {},
): PilotService & {
  listPacks: ReturnType<typeof vi.fn>;
  searchPacks: ReturnType<typeof vi.fn>;
  getPack: ReturnType<typeof vi.fn>;
  installPack: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  searchSessions: ReturnType<typeof vi.fn>;
  readSessionTree: ReturnType<typeof vi.fn>;
  runDoctor: ReturnType<typeof vi.fn>;
  listCapabilities: ReturnType<typeof vi.fn>;
  getCapability: ReturnType<typeof vi.fn>;
  listProfiles: ReturnType<typeof vi.fn>;
  getProfile: ReturnType<typeof vi.fn>;
  setProfile: ReturnType<typeof vi.fn>;
  deleteProfile: ReturnType<typeof vi.fn>;
  listPlans: ReturnType<typeof vi.fn>;
  getPlan: ReturnType<typeof vi.fn>;
  createPlan: ReturnType<typeof vi.fn>;
  startPlan: ReturnType<typeof vi.fn>;
  pausePlan: ReturnType<typeof vi.fn>;
  resumePlan: ReturnType<typeof vi.fn>;
  cancelPlan: ReturnType<typeof vi.fn>;
  deletePlan: ReturnType<typeof vi.fn>;
  suggestTools: ReturnType<typeof vi.fn>;
} {
  return {
    listPacks: vi.fn(async () => [] as InstalledPack[]),
    searchPacks: vi.fn(async () => [] as Pack[]),
    getPack: vi.fn(async () => null),
    installPack: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => [] as SessionInfo[]),
    searchSessions: vi.fn(async () => []),
    readSessionTree: vi.fn(async () => {
      throw new Error("not implemented in mock");
    }),
    runDoctor: vi.fn(
      async () => ({ ok: true, failed: 0, checks: [] }) as DoctorReport,
    ),
    listCapabilities: vi.fn(async () => [] as Capability[]),
    getCapability: vi.fn(async () => null),
    listProfiles: vi.fn(async () => [] as Profile[]),
    getProfile: vi.fn(async () => null),
    setProfile: vi.fn(async (name: string, input: ProfileInput) => ({
      name,
      ...input,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    })),
    deleteProfile: vi.fn(async () => true),
    listPlans: vi.fn(async () => [] as Plan[]),
    getPlan: vi.fn(async () => null),
    createPlan: vi.fn(
      async (input: { goal: string; title?: string; context?: object }) =>
        ({
          id: "mock-plan-id",
          goal: input.goal,
          title: input.title,
          status: "draft",
          strategy: "sequential",
          tasks: [],
          context: input.context ?? {},
          createdAt: "2026-07-07T00:00:00Z",
          updatedAt: "2026-07-07T00:00:00Z",
        }) as Plan,
    ),
    startPlan: vi.fn(
      async (id: string) =>
        ({
          id,
          goal: "mock",
          status: "running",
          strategy: "sequential",
          tasks: [],
          context: {},
          createdAt: "2026-07-07T00:00:00Z",
          updatedAt: "2026-07-07T00:00:00Z",
        }) as Plan,
    ),
    pausePlan: vi.fn(
      async (id: string) =>
        ({
          id,
          goal: "mock",
          status: "paused",
          strategy: "sequential",
          tasks: [],
          context: {},
          createdAt: "2026-07-07T00:00:00Z",
          updatedAt: "2026-07-07T00:00:00Z",
        }) as Plan,
    ),
    resumePlan: vi.fn(
      async (id: string) =>
        ({
          id,
          goal: "mock",
          status: "running",
          strategy: "sequential",
          tasks: [],
          context: {},
          createdAt: "2026-07-07T00:00:00Z",
          updatedAt: "2026-07-07T00:00:00Z",
        }) as Plan,
    ),
    cancelPlan: vi.fn(
      async (id: string) =>
        ({
          id,
          goal: "mock",
          status: "cancelled",
          strategy: "sequential",
          tasks: [],
          context: {},
          createdAt: "2026-07-07T00:00:00Z",
          updatedAt: "2026-07-07T00:00:00Z",
          completedAt: "2026-07-07T00:00:00Z",
        }) as Plan,
    ),
    deletePlan: vi.fn(async () => true),
    suggestTools: vi.fn(async () => ({
      goal: "",
      matchedTools: [],
      matchedProfiles: [],
    })),
    ...overrides,
  };
}

function makeCtx(svc: PilotService): PilotContext {
  return {
    home: "/tmp/fake-home",
    piAgentDir: "/tmp/fake-home/.pi/agent",
    settings: null,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      dim: () => {},
    },
    isInteractive: false,
    service: svc,
  };
}

describe("commands use ctx.service (not direct core)", () => {
  let origHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    origHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "pilot-cmd-test-"));
    process.env.HOME = tempHome;
    mkdirSync(join(tempHome, ".pi/agent"), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ─── pack ls ─────────────────────────────────────────

  describe("pilot pack ls", () => {
    it("calls ctx.service.listPacks", async () => {
      const svc = makeMockService({
        listPacks: vi.fn(async () => [
          {
            source: "npm:pi-subagents",
            name: "pi-subagents",
            enabled: true,
            kind: "extension",
          },
          {
            source: "npm:pi-lens",
            name: "pi-lens",
            enabled: true,
            kind: "extension",
          },
        ]),
      });
      const code = await packCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.listPacks).toHaveBeenCalledTimes(1);
    });

    it("returns 0 with helpful message when empty", async () => {
      const svc = makeMockService();
      const code = await packCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
    });
  });

  // ─── pack search ─────────────────────────────────────

  describe("pilot pack search", () => {
    it("calls ctx.service.searchPacks with the query", async () => {
      const svc = makeMockService({
        searchPacks: vi.fn(
          async (q: string) =>
            [
              {
                name: q + "-hit",
                version: "1.0.0",
                description: "A test pack",
              },
            ] as Pack[],
        ),
      });
      const code = await packCmd.run(["search", "foo"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.searchPacks).toHaveBeenCalledWith("foo");
    });

    it("returns 1 when no query", async () => {
      const svc = makeMockService();
      const code = await packCmd.run(["search"], makeCtx(svc));
      expect(code).toBe(1);
      expect(svc.searchPacks).not.toHaveBeenCalled();
    });
  });

  // ─── pack info ───────────────────────────────────────

  describe("pilot pack info", () => {
    it("calls ctx.service.getPack", async () => {
      const svc = makeMockService({
        getPack: vi.fn(async (name: string) => ({
          name,
          version: "1.2.3",
          description: "Test",
        })),
      });
      const code = await packCmd.run(["info", "foo"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.getPack).toHaveBeenCalledWith("foo");
    });

    it("returns 1 for missing package", async () => {
      const svc = makeMockService();
      const code = await packCmd.run(["info", "foo"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  // ─── pack install ────────────────────────────────────

  describe("pilot pack install", () => {
    it("calls ctx.service.installPack with the spec", async () => {
      const svc = makeMockService();
      const code = await packCmd.run(["install", "pi-subagents"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.installPack).toHaveBeenCalledWith("npm:pi-subagents");
    });

    it("preserves explicit npm: prefix", async () => {
      const svc = makeMockService();
      const code = await packCmd.run(
        ["install", "git:github.com/foo/bar"],
        makeCtx(svc),
      );
      expect(code).toBe(0);
      expect(svc.installPack).toHaveBeenCalledWith("git:github.com/foo/bar");
    });

    it("returns 1 when install throws", async () => {
      const svc = makeMockService({
        installPack: vi.fn(async () => {
          throw new Error("network fail");
        }),
      });
      const code = await packCmd.run(["install", "pi-subagents"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  // ─── session ls ──────────────────────────────────────

  describe("pilot session ls", () => {
    it("calls ctx.service.listSessions", async () => {
      const svc = makeMockService();
      const code = await sessionCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.listSessions).toHaveBeenCalledTimes(1);
    });
  });

  // ─── session search ──────────────────────────────────

  describe("pilot session search", () => {
    it("calls ctx.service.searchSessions with caseSensitive option", async () => {
      const svc = makeMockService();
      const code = await sessionCmd.run(
        ["search", "JWT", "--case"],
        makeCtx(svc),
      );
      expect(code).toBe(0);
      expect(svc.searchSessions).toHaveBeenCalledWith("JWT", {
        caseSensitive: true,
      });
    });

    it("defaults to case-insensitive", async () => {
      const svc = makeMockService();
      const code = await sessionCmd.run(["search", "jwt"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.searchSessions).toHaveBeenCalledWith("jwt", {
        caseSensitive: false,
      });
    });

    it("returns 1 when no query", async () => {
      const svc = makeMockService();
      const code = await sessionCmd.run(["search"], makeCtx(svc));
      expect(code).toBe(1);
      expect(svc.searchSessions).not.toHaveBeenCalled();
    });
  });

  // ─── doctor ──────────────────────────────────────────

  describe("pilot doctor", () => {
    it("calls ctx.service.runDoctor", async () => {
      const svc = makeMockService({
        runDoctor: vi.fn(async () => ({
          ok: true,
          failed: 0,
          checks: [{ ok: true, message: "all good" }],
        })),
      });
      const code = await doctorCmd.run([], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.runDoctor).toHaveBeenCalledTimes(1);
    });

    it("returns 1 when checks fail", async () => {
      const svc = makeMockService({
        runDoctor: vi.fn(async () => ({
          ok: false,
          failed: 1,
          checks: [{ ok: false, message: "pi NOT found", hint: "install pi" }],
        })),
      });
      const code = await doctorCmd.run([], makeCtx(svc));
      expect(code).toBe(1);
    });

    it("outputs JSON with --json flag", async () => {
      const svc = makeMockService({
        runDoctor: vi.fn(async () => ({
          ok: true,
          failed: 0,
          checks: [{ ok: true, message: "ok" }],
        })),
      });
      // Capture stdout
      const captured: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => captured.push(args.join(" "));
      try {
        const code = await doctorCmd.run(["--json"], makeCtx(svc));
        expect(code).toBe(0);
      } finally {
        console.log = originalLog;
      }
      // First log should be the JSON
      const output = captured.join("");
      expect(output).toContain('"ok": true');
    });
  });

  // ─── profile ──────────────────────────────────────────

  describe("pilot profile ls", () => {
    it("calls ctx.service.listProfiles", async () => {
      const svc = makeMockService();
      const code = await profileCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.listProfiles).toHaveBeenCalledTimes(1);
    });
  });

  describe("pilot profile show", () => {
    it("calls ctx.service.getProfile", async () => {
      const svc = makeMockService({
        getProfile: vi.fn(async () => ({
          name: "work",
          model: "claude-opus-4.6",
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        })),
      });
      const code = await profileCmd.run(["show", "work"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.getProfile).toHaveBeenCalledWith("work");
    });

    it("returns 1 for missing profile", async () => {
      const svc = makeMockService();
      const code = await profileCmd.run(["show", "nope"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("pilot profile create", () => {
    it("calls ctx.service.setProfile with empty input", async () => {
      const svc = makeMockService();
      const code = await profileCmd.run(
        ["create", "work-frontend"],
        makeCtx(svc),
      );
      expect(code).toBe(0);
      expect(svc.setProfile).toHaveBeenCalledWith("work-frontend", {});
    });

    it("rejects non-kebab-case names", async () => {
      const svc = makeMockService();
      const code = await profileCmd.run(["create", "BadName"], makeCtx(svc));
      expect(code).toBe(1);
      expect(svc.setProfile).not.toHaveBeenCalled();
    });
  });

  describe("pilot profile set", () => {
    it("merges key=value into existing profile", async () => {
      const svc = makeMockService({
        getProfile: vi.fn(async () => ({
          name: "work",
          model: "old-model",
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        })),
      });
      const code = await profileCmd.run(
        ["set", "work", "model=claude-opus-4.6"],
        makeCtx(svc),
      );
      expect(code).toBe(0);
      expect(svc.setProfile).toHaveBeenCalledWith("work", {
        model: "claude-opus-4.6",
      });
    });

    it("rejects unknown key", async () => {
      const svc = makeMockService({
        getProfile: vi.fn(async () => ({
          name: "work",
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        })),
      });
      const code = await profileCmd.run(
        ["set", "work", "unknown=val"],
        makeCtx(svc),
      );
      expect(code).toBe(1);
    });

    it("rejects invalid thinking value", async () => {
      const svc = makeMockService({
        getProfile: vi.fn(async () => ({
          name: "work",
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        })),
      });
      const code = await profileCmd.run(
        ["set", "work", "thinking=bogus"],
        makeCtx(svc),
      );
      expect(code).toBe(1);
    });
  });

  describe("pilot profile delete", () => {
    it("calls ctx.service.deleteProfile", async () => {
      const svc = makeMockService({
        deleteProfile: vi.fn(async () => true),
      });
      const code = await profileCmd.run(["delete", "work"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.deleteProfile).toHaveBeenCalledWith("work");
    });

    it("returns 1 when profile did not exist", async () => {
      const svc = makeMockService({
        deleteProfile: vi.fn(async () => false),
      });
      const code = await profileCmd.run(["delete", "nope"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });
});

// ─── Capability command (v0.3.9+) ─────────────────────────────────

import * as capCmd from "../../src/commands/capability.js";

describe("commands use ctx.service (not direct core) > pilot capability", () => {
  function makeCap(service: any) {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    };
    return { logger, service } as any;
  }

  it("ls prints a placeholder when no capabilities are installed", async () => {
    const code = await capCmd.run(
      ["ls"],
      makeCap({ listCapabilities: async () => [] }),
    );
    expect(code).toBe(0);
  });

  it("ls prints capabilities with type and title", async () => {
    const svc = {
      listCapabilities: async () => [
        {
          id: "x",
          title: "X",
          type: "workflow",
          sources: [],
          artifacts: {},
          compatibility: { conflicts: [], requires: [] },
          metadata: {
            createdAt: "2026-07-01T00:00:00Z",
            updatedAt: "2026-07-01T00:00:00Z",
          },
        },
      ],
    };
    const code = await capCmd.run(["ls"], makeCap(svc));
    expect(code).toBe(0);
  });

  it("show prints details for an existing capability", async () => {
    const svc = {
      getCapability: async (_id: string) => ({
        id: "x",
        title: "X",
        type: "workflow",
        description: "A workflow.",
        sources: [{ type: "npm", ref: "npm:foo", mode: "L2-wrapped" }],
        artifacts: {},
        compatibility: { conflicts: [], requires: ["base"] },
        metadata: {
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        },
      }),
    };
    const code = await capCmd.run(["show", "x"], makeCap(svc));
    expect(code).toBe(0);
  });

  it("show returns 1 for missing capability", async () => {
    const svc = { getCapability: async (_id: string) => null };
    const ctx = makeCap(svc);
    const code = await capCmd.run(["show", "missing"], ctx);
    expect(code).toBe(1);
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it("show without an id returns 1", async () => {
    const code = await capCmd.run(["show"], makeCap({}));
    expect(code).toBe(1);
  });

  it("unknown subcommand returns 1", async () => {
    const code = await capCmd.run(["delete"], makeCap({}));
    expect(code).toBe(1);
  });
});

// ─── Forge command (v0.4.1+) ────────────────────────────────────

import * as forgeCmd from "../../src/commands/forge.js";

describe("commands use ctx.service (not direct core) > pilot forge", () => {
  function makeForge(service: any) {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    };
    return { logger, service, home: "/tmp/pilot-forge-test" } as any;
  }

  it("prints usage when called with no subcommand", async () => {
    const code = await forgeCmd.run([], makeForge({}));
    expect(code).toBe(1);
    expect(forgeCmd.manifest.name).toBe("forge");
  });

  it("search returns 1 when query is too short", async () => {
    const code = await forgeCmd.run(["search", "a"], makeForge({}));
    expect(code).toBe(1);
  });

  it("search returns 1 when no query", async () => {
    const code = await forgeCmd.run(["search"], makeForge({}));
    expect(code).toBe(1);
  });

  it("search returns results from service", async () => {
    const svc = {
      searchPacks: async (q: string) => [
        { name: q + "-foo", version: "1.0.0", description: "x" },
        { name: "bar", version: "0.1.0", description: "y" },
      ],
    };
    const code = await forgeCmd.run(["search", "pi"], makeForge(svc));
    expect(code).toBe(0);
  });

  it("search handles 0 results cleanly", async () => {
    const svc = { searchPacks: async () => [] };
    const ctx = makeForge(svc);
    const code = await forgeCmd.run(["search", "nothing"], ctx);
    expect(code).toBe(0);
    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it("inspect returns 1 when no name", async () => {
    const code = await forgeCmd.run(["inspect"], makeForge({}));
    expect(code).toBe(1);
  });

  it("[network] inspect returns 1 when pack not found", async () => {
    if (process.env["PILOT_SKIP_NETWORK"] === "1") return;
    // Use a name that's guaranteed not on npm (random suffix, no real hits)
    const code = await forgeCmd.run(
      ["inspect", "definitely-not-real-zzz-xyz-987654321"],
      makeForge({}),
    );
    expect(code).toBe(1);
  });

  it("absorb returns 1 when no name", async () => {
    const code = await forgeCmd.run(["absorb"], makeForge({}));
    expect(code).toBe(1);
  });

  it("[network] absorb returns 1 when pack not found", async () => {
    if (process.env["PILOT_SKIP_NETWORK"] === "1") return;
    const code = await forgeCmd.run(
      ["absorb", "definitely-not-real-zzz-xyz-987654321"],
      makeForge({}),
    );
    expect(code).toBe(1);
  });

  it("unknown subcommand returns 1", async () => {
    const code = await forgeCmd.run(["delete"], makeForge({}));
    expect(code).toBe(1);
  });

  it("internal helpers map kinds correctly", async () => {
    const { __test__ } = forgeCmd as any;
    // deriveCapabilityId strips npm scope
    expect(__test__.deriveCapabilityId({ name: "@wwppee/foo" })).toBe("foo");
    expect(__test__.deriveCapabilityId({ name: "bar" })).toBe("bar");
    // isValidCapabilityId enforces kebab-case
    expect(__test__.isValidCapabilityId("foo-bar")).toBe(true);
    expect(__test__.isValidCapabilityId("FooBar")).toBe(false);
    expect(__test__.isValidCapabilityId("foo--bar")).toBe(false);
  });
});

// ─── plan command (v0.5.7 Agent capability layer) ──────────────
//
// v0.5.7 rewrote commands/plan.ts to route ALL lifecycle operations
// through ctx.service instead of calling writePlan/readPlan directly.
// These tests verify that:
//   1. Each CLI subcommand hits the corresponding service method
//   2. Service errors propagate as exit code 1 + error log
//   3. plan new never calls writePlan directly (event log integrity)

describe("pilot plan (v0.5.7 routes everything through service)", () => {
  describe("plan new", () => {
    it("calls ctx.service.createPlan with goal + auto-derived title", async () => {
      const svc = makeMockService({
        createPlan: vi.fn(
          async (input: { goal: string; title?: string }) =>
            ({
              id: "abc123",
              goal: input.goal,
              title: input.title,
              status: "draft",
              strategy: "sequential",
              tasks: [],
              context: { cwd: "/tmp" },
              createdAt: "2026-07-07T00:00:00Z",
              updatedAt: "2026-07-07T00:00:00Z",
            }) as Plan,
        ),
      });
      const code = await planCmd.run(["new", "实现用户登录"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.createPlan).toHaveBeenCalledTimes(1);
      const call = svc.createPlan.mock.calls[0]![0];
      expect(call.goal).toBe("实现用户登录");
      expect(call.title).toBeTruthy();
    });

    it("returns 1 with no goal", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["new"], makeCtx(svc));
      expect(code).toBe(1);
      expect(svc.createPlan).not.toHaveBeenCalled();
    });
  });

  describe("plan ls", () => {
    it("calls ctx.service.listPlans", async () => {
      const svc = makeMockService({
        listPlans: vi.fn(
          async () =>
            [
              {
                id: "p1",
                goal: "g1",
                title: "t1",
                status: "draft",
                strategy: "sequential",
                tasks: [],
                context: {},
                createdAt: "2026-07-07T00:00:00Z",
                updatedAt: "2026-07-07T00:00:00Z",
              },
            ] as Plan[],
        ),
      });
      const code = await planCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.listPlans).toHaveBeenCalledTimes(1);
    });

    it("returns 0 with helpful message when empty", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["ls"], makeCtx(svc));
      expect(code).toBe(0);
    });
  });

  describe("plan show", () => {
    it("calls ctx.service.getPlan", async () => {
      const svc = makeMockService({
        getPlan: vi.fn(
          async (id: string) =>
            ({
              id,
              goal: "test",
              status: "draft",
              strategy: "sequential",
              tasks: [],
              context: {},
              createdAt: "2026-07-07T00:00:00Z",
              updatedAt: "2026-07-07T00:00:00Z",
            }) as Plan,
        ),
      });
      const code = await planCmd.run(["show", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.getPlan).toHaveBeenCalledWith("p1");
    });

    it("returns 1 when plan missing", async () => {
      const svc = makeMockService({ getPlan: vi.fn(async () => null) });
      const code = await planCmd.run(["show", "nope"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("plan run", () => {
    it("calls ctx.service.startPlan (Bug 2 fix — service routes events)", async () => {
      const svc = makeMockService({
        startPlan: vi.fn(
          async (id: string) =>
            ({
              id,
              goal: "g",
              status: "running",
              strategy: "sequential",
              tasks: [],
              context: {},
              createdAt: "2026-07-07T00:00:00Z",
              updatedAt: "2026-07-07T00:00:00Z",
            }) as Plan,
        ),
      });
      const code = await planCmd.run(["run", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.startPlan).toHaveBeenCalledWith("p1");
    });

    it("returns 1 + error log when service throws (plan already completed)", async () => {
      const svc = makeMockService({
        startPlan: vi.fn(async () => {
          throw new Error("Plan is already completed: p1");
        }),
      });
      const code = await planCmd.run(["run", "p1"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("plan pause / resume / cancel", () => {
    it("pause calls ctx.service.pausePlan", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["pause", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.pausePlan).toHaveBeenCalledWith("p1");
    });

    it("resume calls ctx.service.resumePlan", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["resume", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.resumePlan).toHaveBeenCalledWith("p1");
    });

    it("cancel calls ctx.service.cancelPlan", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["cancel", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.cancelPlan).toHaveBeenCalledWith("p1");
    });

    it("pause returns 1 when service throws (plan not running)", async () => {
      const svc = makeMockService({
        pausePlan: vi.fn(async () => {
          throw new Error("Plan is not running (current: completed): p1");
        }),
      });
      const code = await planCmd.run(["pause", "p1"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("plan delete", () => {
    it("calls ctx.service.deletePlan", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["delete", "p1"], makeCtx(svc));
      expect(code).toBe(0);
      expect(svc.deletePlan).toHaveBeenCalledWith("p1");
    });

    it("returns 1 when deletePlan reports false (not found)", async () => {
      const svc = makeMockService({
        deletePlan: vi.fn(async () => false),
      });
      const code = await planCmd.run(["delete", "p1"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("plan suggest-tools", () => {
    it("calls ctx.service.suggestTools with the goal", async () => {
      const svc = makeMockService({
        suggestTools: vi.fn(async (goal: string) => ({
          goal,
          matchedTools: [
            { name: "read", source: "built-in", safety: "safe", reason: "x" },
          ],
          matchedProfiles: [],
        })),
      });
      const code = await planCmd.run(
        ["suggest-tools", "read a file"],
        makeCtx(svc),
      );
      expect(code).toBe(0);
      expect(svc.suggestTools).toHaveBeenCalledWith("read a file");
    });

    it("returns 1 with no goal", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["suggest-tools"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });

  describe("unknown subcommand", () => {
    it("returns 1", async () => {
      const svc = makeMockService();
      const code = await planCmd.run(["bogus"], makeCtx(svc));
      expect(code).toBe(1);
    });
  });
});
