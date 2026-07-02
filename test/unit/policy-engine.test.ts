/**
 * Tests for `core/policy-engine.ts` — pure checkPolicy / redactContent.
 *
 * No I/O, no fixtures. Just verify decision trees.
 */

import { describe, it, expect } from "vitest";
import {
  checkPolicy,
  redactContent,
  matchPath,
  type ToolCallInfo,
} from "../../src/core/policy-engine.js";
import type { ToolPolicy } from "../../src/core/policy.js";

function makePolicy(overrides: Partial<ToolPolicy> = {}): ToolPolicy {
  return {
    name: "test",
    description: "test",
    allow: [],
    deny: [],
    denyPaths: [],
    denyCommands: [],
    sensitivePatterns: [],
    requireApproval: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("matchPath", () => {
  it("matches simple patterns", () => {
    expect(matchPath("*.ts", "foo.ts")).toBe(true);
    expect(matchPath("*.ts", "src/foo.ts")).toBe(false);
    expect(matchPath("**/.env", "foo/.env")).toBe(true);
    expect(matchPath("**/.env", "/abs/foo/.env")).toBe(true);
  });
  it("handles double-star globs", () => {
    expect(matchPath("**/.git", "a/b/c/.git")).toBe(true);
    expect(matchPath("**/secrets.json", "deep/secrets.json")).toBe(true);
  });
  it("handles directory globs", () => {
    expect(matchPath("/etc/**", "/etc/passwd")).toBe(true);
    expect(matchPath("/etc/**", "/var/log")).toBe(false);
  });
});

describe("checkPolicy — deny list", () => {
  it("blocks tools in deny list", () => {
    const policy = makePolicy({ deny: ["bash"] });
    const decision = checkPolicy({ name: "bash", args: {} }, policy);
    expect(decision.block).toBe(true);
    expect(decision.rule).toBe("deny");
  });
  it("allows tools not in deny list", () => {
    const policy = makePolicy({ deny: ["bash"] });
    const decision = checkPolicy({ name: "read", args: {} }, policy);
    expect(decision.block).toBe(false);
  });
});

describe("checkPolicy — allow list", () => {
  it("blocks tools not in allow list", () => {
    const policy = makePolicy({ allow: ["read", "ls"] });
    const decision = checkPolicy({ name: "bash", args: {} }, policy);
    expect(decision.block).toBe(true);
    expect(decision.rule).toBe("allow");
  });
  it("allows tools in allow list", () => {
    const policy = makePolicy({ allow: ["read", "ls"] });
    const decision = checkPolicy({ name: "read", args: {} }, policy);
    expect(decision.block).toBe(false);
  });
  it("deny wins over allow", () => {
    const policy = makePolicy({ allow: ["read"], deny: ["read"] });
    const decision = checkPolicy({ name: "read", args: {} }, policy);
    expect(decision.block).toBe(true);
  });
});

describe("checkPolicy — requireApproval (HITL)", () => {
  it("flags tools in requireApproval list", () => {
    const policy = makePolicy({ requireApproval: ["bash"] });
    const decision = checkPolicy({ name: "bash", args: {} }, policy);
    expect(decision.block).toBe(false);
    expect(decision.requireApproval).toBe(true);
  });
  it("passes through other tools normally", () => {
    const policy = makePolicy({ requireApproval: ["bash"] });
    const decision = checkPolicy({ name: "read", args: {} }, policy);
    expect(decision.block).toBe(false);
    expect(decision.requireApproval).toBeUndefined();
  });
});

describe("checkPolicy — path denylist", () => {
  const policy = makePolicy({
    denyPaths: ["**/.env", "/etc/**", "**/secrets.json"],
  });
  it("blocks .env reads", () => {
    const decision = checkPolicy(
      { name: "read", args: { path: "/home/user/.env" } },
      policy,
    );
    expect(decision.block).toBe(true);
    expect(decision.rule).toBe("denyPaths");
  });
  it("blocks /etc reads", () => {
    const decision = checkPolicy(
      { name: "read", args: { path: "/etc/hosts" } },
      policy,
    );
    expect(decision.block).toBe(true);
  });
  it("blocks deep secrets.json", () => {
    const decision = checkPolicy(
      { name: "read", args: { path: "a/b/c/secrets.json" } },
      policy,
    );
    expect(decision.block).toBe(true);
  });
  it("allows benign paths", () => {
    const decision = checkPolicy(
      { name: "read", args: { path: "/home/user/code/index.ts" } },
      policy,
    );
    expect(decision.block).toBe(false);
  });
  it("also applies to edit and write", () => {
    for (const tool of ["edit", "write"]) {
      const decision = checkPolicy(
        { name: tool, args: { path: "/foo/.env" } },
        policy,
      );
      expect(decision.block).toBe(true);
    }
  });
  it("uses file_path as alternative arg key", () => {
    const decision = checkPolicy(
      { name: "write", args: { file_path: "/foo/.env" } },
      policy,
    );
    expect(decision.block).toBe(true);
  });
});

describe("checkPolicy — command denylist", () => {
  it("blocks rm -rf /", () => {
    const policy = makePolicy({ denyCommands: ["^rm\\s+-rf\\s+/"] });
    const decision = checkPolicy(
      { name: "bash", args: { command: "rm -rf /" } },
      policy,
    );
    expect(decision.block).toBe(true);
  });
  it("does not match unrelated commands", () => {
    const policy = makePolicy({ denyCommands: ["^rm\\s+-rf\\s+/"] });
    const decision = checkPolicy(
      { name: "bash", args: { command: "ls -la" } },
      policy,
    );
    expect(decision.block).toBe(false);
  });
  it("skips invalid regex gracefully", () => {
    const policy = makePolicy({ denyCommands: ["[invalid"] });
    const decision = checkPolicy(
      { name: "bash", args: { command: "ls" } },
      policy,
    );
    expect(decision.block).toBe(false);
  });
  it("matches case-sensitively by default", () => {
    const policy = makePolicy({ denyCommands: ["rm"] });
    const decision = checkPolicy(
      { name: "bash", args: { command: "RM -rf /" } },
      policy,
    );
    expect(decision.block).toBe(false);
  });
});

describe("checkPolicy — precedence", () => {
  it("deny beats path checks", () => {
    const policy = makePolicy({
      deny: ["read"],
      denyPaths: ["X/.env"],
    });
    const decision = checkPolicy(
      { name: "read", args: { path: "/foo.ts" } },
      policy,
    );
    expect(decision.block).toBe(true);
    expect(decision.rule).toBe("deny");
  });
});

describe("redactContent", () => {
  it("redacts API keys", () => {
    const policy = makePolicy({
      sensitivePatterns: ["sk-[A-Za-z0-9]{20,}"],
    });
    const redacted = redactContent("key is sk-abcdefghij1234567890xyz", policy);
    expect(redacted).toBe("key is [REDACTED]");
  });
  it("redacts multiple patterns", () => {
    const policy = makePolicy({
      sensitivePatterns: ["sk-[A-Za-z0-9]{20,}", "ghp_[A-Za-z0-9]{20,}"],
    });
    const redacted = redactContent(
      "sk-abcdefghij1234567890 and ghp_abcdEFGH1234ijkl5678",
      policy,
    );
    expect(redacted).toBe("[REDACTED] and [REDACTED]");
  });
  it("falls back to substring for invalid regex", () => {
    const policy = makePolicy({ sensitivePatterns: ["[broken"] });
    const redacted = redactContent("hello [broken world", policy);
    expect(redacted).toBe("hello [REDACTED] world");
  });
  it("returns content unchanged when patterns empty", () => {
    const policy = makePolicy();
    const input = "no patterns";
    expect(redactContent(input, policy)).toBe(input);
  });
  it("returns non-string content unchanged", () => {
    const policy = makePolicy({ sensitivePatterns: ["x"] });
    expect(redactContent(123 as unknown as string, policy)).toBe(123);
  });
});
