/**
 * Tests for `core/policy.ts` — TOML read/write roundtrip and validation.
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
import {
  ToolPolicySchema,
  listPolicies,
  readPolicy,
  tryReadPolicy,
  writePolicy,
  deletePolicy,
  policyPath,
  pilotPoliciesDir,
  policyExtensionPath,
} from "../../src/core/policy.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pilot-policy-test-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function writeRaw(name: string, content: string): void {
  const dir = pilotPoliciesDir(home);
  mkdirSync(dir, { recursive: true });
  // Bypass policyPath() because tests deliberately write bad names
  // to verify validation behavior. Join directly.
  writeFileSync(join(dir, `${name}.toml`), content, "utf-8");
}

describe("ToolPolicySchema", () => {
  it("accepts a minimal policy", () => {
    const p = ToolPolicySchema.parse({
      name: "test",
      allow: [],
      deny: ["bash"],
      denyPaths: [],
      denyCommands: [],
      sensitivePatterns: [],
      requireApproval: [],
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
    });
    expect(p.name).toBe("test");
    expect(p.deny).toEqual(["bash"]);
  });

  it("rejects non-kebab-case names", () => {
    expect(() =>
      ToolPolicySchema.parse({
        name: "NotKebab",
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("defaults missing arrays to empty", () => {
    const p = ToolPolicySchema.parse({
      name: "minimal",
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
    });
    expect(p.allow).toEqual([]);
    expect(p.deny).toEqual([]);
    expect(p.denyPaths).toEqual([]);
    expect(p.denyCommands).toEqual([]);
    expect(p.sensitivePatterns).toEqual([]);
    expect(p.requireApproval).toEqual([]);
  });
});

describe("writePolicy + readPolicy roundtrip", () => {
  it("persists all fields", async () => {
    const p = await writePolicy(
      "roundtrip",
      {
        description: "my first policy",
        allow: ["read"],
        deny: ["bash", "write"],
        denyPaths: ["**/.env", "/etc/**"],
        denyCommands: ["^rm"],
        sensitivePatterns: ["sk-[A-Z0-9]+"],
        requireApproval: ["write"],
      },
      home,
    );
    expect(p.name).toBe("roundtrip");
    expect(p.description).toBe("my first policy");
    expect(p.createdAt).toBeTruthy();

    const re = await readPolicy("roundtrip", home);
    expect(re.name).toBe("roundtrip");
    expect(re.deny).toEqual(["bash", "write"]);
    expect(re.denyPaths).toEqual(["**/.env", "/etc/**"]);
    expect(re.denyCommands).toEqual(["^rm"]);
    expect(re.sensitivePatterns).toEqual(["sk-[A-Z0-9]+"]);
    expect(re.requireApproval).toEqual(["write"]);
  });

  it("preserves createdAt on update", async () => {
    const first = await writePolicy(
      "preserve",
      {
        description: "v1",
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    // Wait a tick so updatedAt would differ
    await new Promise((r) => setTimeout(r, 10));
    const second = await writePolicy(
      "preserve",
      {
        description: "v2",
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    expect(second.description).toBe("v2");
  });

  it("writes a TOML file with a .toml extension", async () => {
    await writePolicy(
      "toml-check",
      {
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    const path = policyPath("toml-check", home);
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    // TOML should contain allow and deny as array keys
    expect(content).toMatch(/allow/);
  });
});

describe("tryReadPolicy", () => {
  it("returns null for missing policy", async () => {
    const p = await tryReadPolicy("nope", home);
    expect(p).toBeNull();
  });
  it("returns null for malformed TOML", async () => {
    writeRaw("bad", "this is not valid { toml");
    const p = await tryReadPolicy("bad", home);
    expect(p).toBeNull();
  });
  it("returns null for invalid name pattern", async () => {
    writeRaw("BadName", '[tool]\nfoo = "bar"');
    const p = await tryReadPolicy("BadName", home);
    expect(p).toBeNull();
  });
});

describe("listPolicies", () => {
  it("returns [] for empty dir", async () => {
    const ps = await listPolicies(home);
    expect(ps).toEqual([]);
  });
  it("returns all valid policies, skipping bad ones", async () => {
    await writePolicy(
      "a",
      {
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    await writePolicy(
      "b",
      {
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    writeRaw("c-bad", "garbage content");
    const ps = await listPolicies(home);
    expect(ps.map((p) => p.name).sort()).toEqual(["a", "b"]);
  });
});

describe("deletePolicy", () => {
  it("returns true when deleted, false when missing", async () => {
    const r1 = await deletePolicy("nope", home);
    expect(r1).toBe(false);
    await writePolicy(
      "gone",
      {
        allow: [],
        deny: [],
        denyPaths: [],
        denyCommands: [],
        sensitivePatterns: [],
        requireApproval: [],
      },
      home,
    );
    const r2 = await deletePolicy("gone", home);
    expect(r2).toBe(true);
    expect(existsSync(policyPath("gone", home))).toBe(false);
  });
});

describe("policyExtensionPath", () => {
  it("returns ~/.pilot/extensions/pilot-policy-<name>.ts", () => {
    expect(policyExtensionPath("safe-bash", home)).toBe(
      join(home, ".pilot", "extensions", "pilot-policy-safe-bash.ts"),
    );
  });
  it("rejects invalid names", () => {
    expect(() => policyExtensionPath("Invalid", home)).toThrow();
  });
});
