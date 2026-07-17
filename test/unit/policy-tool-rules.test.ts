/**
 * v0.8.0 (B1): per-tool rule schema. The ToolPolicy
 * schema gains a `toolRules` field that lets the user
 * override the global allow/deny/requireApproval for
 * individual tool names. This test pins the schema
 * shape so a future refactor can't silently break
 * backwards compatibility with already-saved
 * policies.
 */

import { describe, it, expect } from "vitest";
import { ToolPolicySchema, type ToolPolicy } from "../../src/core/policy.js";

function basePolicy(overrides: Partial<ToolPolicy> = {}): ToolPolicy {
  return {
    name: "safe-bash",
    description: "test",
    allow: [],
    deny: [],
    denyPaths: [],
    denyCommands: [],
    sensitivePatterns: [],
    requireApproval: [],
    toolRules: {},
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
    ...overrides,
  };
}

describe("v0.8.0: ToolPolicy.toolRules (per-tool overrides)", () => {
  it("defaults toolRules to {} when not provided", () => {
    const { toolRules, ...rest } = basePolicy();
    const parsed = ToolPolicySchema.parse(rest);
    expect(parsed.toolRules).toEqual({});
  });

  it("accepts a per-tool entry with the four override fields", () => {
    const policy = basePolicy({
      toolRules: {
        bash: {
          deny: ["curl"],
          requireApproval: [],
          denyPaths: [],
          denyCommands: ["^rm\\s+-rf\\s+/"],
        },
      },
    });
    const parsed = ToolPolicySchema.parse(policy);
    expect(parsed.toolRules.bash?.deny).toEqual(["curl"]);
    expect(parsed.toolRules.bash?.denyCommands).toEqual(["^rm\\s+-rf\\s+/"]);
  });

  it("fills per-tool fields with empty arrays when omitted", () => {
    const policy = basePolicy({
      toolRules: { write: {} as { deny: string[]; requireApproval: string[]; denyPaths: string[]; denyCommands: string[] } },
    });
    const parsed = ToolPolicySchema.parse(policy);
    expect(parsed.toolRules.write).toEqual({
      deny: [],
      requireApproval: [],
      denyPaths: [],
      denyCommands: [],
    });
  });

  it("round-trips through JSON without losing toolRules", () => {
    const policy = basePolicy({
      toolRules: {
        bash: {
          deny: ["wget"],
          requireApproval: ["bash"],
          denyPaths: [],
          denyCommands: [],
        },
        write: {
          deny: [],
          requireApproval: ["write"],
          denyPaths: ["**/.env"],
          denyCommands: [],
        },
      },
    });
    const json = JSON.parse(JSON.stringify(policy));
    const parsed = ToolPolicySchema.parse(json);
    expect(parsed.toolRules).toEqual(policy.toolRules);
  });
});
