/**
 * Tests for `core/compose-listing.ts` — cross-entity enumeration.
 */

import { describe, it, expect } from "vitest";
import { listComposeEntities } from "../../src/core/compose-listing.js";
import type {
  SessionInfo,
  InstalledPack,
  Profile,
  ToolPolicy,
  Capability,
} from "../../src/core/types.js";
import type { Capability as CapabilityType } from "../../src/core/capability.js";

function makeSession(id: string, model?: string): SessionInfo {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd: "/Users/test/project",
    startedAt: "2026-07-03T00:00:00.000Z",
    lastActivityAt: "2026-07-03T00:00:00.000Z",
    messageCount: 10,
    model,
  };
}

function makePack(
  name: string,
  kind: "extension" | "skill" | "prompt" | "theme" = "extension",
): InstalledPack {
  return { source: `npm:${name}`, name, enabled: true, kind };
}

function makeProfile(name: string, model = "claude-sonnet"): Profile {
  return {
    name,
    description: "test profile",
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    model,
  };
}

function makePolicy(name: string): ToolPolicy {
  return {
    name,
    description: "test policy",
    allow: ["read"],
    deny: ["bash"],
    denyPaths: ["**/.env"],
    denyCommands: ["^rm"],
    sensitivePatterns: [],
    requireApproval: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}

function makeCapability(
  id: string,
  type: "workflow" | "tool" | "integration" | "safety" = "tool",
): CapabilityType {
  return {
    type,
    id,
    title: id,
    description: "test",
    sources: [],
    artifacts: {
      tool: null,
      skill: null,
      prompt: null,
      theme: null,
      subagent: null,
    },
    compatibility: {
      minPilotVersion: "0.4.0",
      piApiSurface: ["tool_call"],
      supportsHITL: false,
      supportsReplay: false,
    },
    metadata: {
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
      tags: [],
    },
  };
}

describe("listComposeEntities", () => {
  it("returns a catalog with all 5 kinds", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [
        makeSession("--Users-test-proj--", "claude-sonnet"),
      ],
      listPacks: async () => [makePack("pi-subagents")],
      listProfiles: async () => [makeProfile("default")],
      listPolicies: async () => [makePolicy("safe-bash")],
      listCapabilities: async () => [makeCapability("cap-1")],
    });
    expect(catalog.sessions).toHaveLength(1);
    expect(catalog.packs).toHaveLength(1);
    expect(catalog.profiles).toHaveLength(1);
    expect(catalog.policies).toHaveLength(1);
    expect(catalog.capabilities).toHaveLength(1);
    expect(catalog.totalCount).toBe(5);
  });

  it("caps sessions at 50", async () => {
    const sessions = Array.from({ length: 100 }, (_, i) =>
      makeSession(`--Users-test-proj-${i}--`),
    );
    const catalog = await listComposeEntities({
      listSessions: async () => sessions,
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    expect(catalog.sessions).toHaveLength(50);
  });

  it("returns empty arrays when stores are empty", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [],
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    expect(catalog.totalCount).toBe(0);
    expect(catalog.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("decodes session id into readable title", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [makeSession("--Users-feng--code--pilot--")],
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    // pi's encoding: `/` → `--`. The first segment keeps its
    // internal hyphens (file-name separators), so "Users-feng" stays.
    expect(catalog.sessions[0]?.label).toBe("Users-feng/code/pilot");
    expect(catalog.sessions[0]?.href).toMatch(/^\/sessions\//);
  });

  it("includes model in session sublabel", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [makeSession("--x--", "claude-opus-4")],
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    expect(catalog.sessions[0]?.sublabel).toBe("claude-opus-4");
  });

  it("packs show kind and enabled state", async () => {
    const onPack = makePack("on", "skill");
    onPack.enabled = true;
    const offPack = makePack("off", "extension");
    offPack.enabled = false;
    const catalog = await listComposeEntities({
      listSessions: async () => [],
      listPacks: async () => [onPack, offPack],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    expect(catalog.packs[0]?.sublabel).toBe("skill");
    expect(catalog.packs[1]?.sublabel).toContain("off");
  });

  it("policy sublabel counts rules", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [],
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [
        makePolicy("a"),
        {
          ...makePolicy("b"),
          allow: ["read"],
          deny: ["bash", "write"],
        },
      ],
      listCapabilities: async () => [],
    });
    expect(catalog.policies[0]?.sublabel).toBe("4 rules"); // 1+1+1+1+0+0
    expect(catalog.policies[1]?.sublabel).toBe("5 rules");
  });

  it("each entity has a unique id within its kind", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [makeSession("a"), makeSession("b")],
      listPacks: async () => [makePack("p1"), makePack("p2")],
      listProfiles: async () => [makeProfile("prof1")],
      listPolicies: async () => [makePolicy("pol1")],
      listCapabilities: async () => [makeCapability("cap1")],
    });
    const sessionIds = catalog.sessions.map((e) => e.id);
    expect(new Set(sessionIds).size).toBe(sessionIds.length);
    const packIds = catalog.packs.map((e) => e.id);
    expect(new Set(packIds).size).toBe(packIds.length);
  });

  it("handles session id with no separators gracefully", async () => {
    const catalog = await listComposeEntities({
      listSessions: async () => [makeSession("single")],
      listPacks: async () => [],
      listProfiles: async () => [],
      listPolicies: async () => [],
      listCapabilities: async () => [],
    });
    expect(catalog.sessions[0]?.label).toBe("single");
  });
});
