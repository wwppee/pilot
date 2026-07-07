/**
 * Tests for `core/plan.ts` — the Plan data model (v0.5.7 Agent capability layer).
 *
 * Covers:
 *   1. readPlan round-trip with id injection (Bug 1 regression test)
 *   2. writePlan preserves createdAt across updates
 *   3. writePlan auto-fills updatedAt + status defaults for new plans
 *   4. listPlans returns [] when directory missing
 *   5. listPlans sorts by updatedAt desc
 *   6. deletePlan returns false when file missing, true when present
 *   7. generatePlanId format (timestamp_random)
 *   8. deriveTitle strips common Chinese prefixes and truncates to 60
 *   9. suggestTools keyword matching is case-insensitive
 *   10. appendPlanEvent writes JSONL with the expected filename shape
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import {
  generatePlanId,
  deriveTitle,
  ensurePlanDirs,
  listPlans,
  readPlan,
  writePlan,
  deletePlan,
  suggestTools,
  appendPlanEvent,
  planPath,
  plansDir,
  plansHistoryDir,
} from "../../src/core/plan.js";

let fakeHome: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "pilot-plan-test-"));
  originalEnv = { ...process.env };
  process.env.HOME = fakeHome;
  await ensurePlanDirs(fakeHome);
});

afterEach(() => {
  process.env = originalEnv;
  if (existsSync(fakeHome)) {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

// ─── Bug 1 regression: readPlan round-trip with id injection ─────

describe("readPlan (Bug 1 regression: id is re-injected before schema parse)", () => {
  it("returns null when file does not exist", async () => {
    const plan = await readPlan("does-not-exist", fakeHome);
    expect(plan).toBeNull();
  });

  it("reads back a plan we just wrote — TOML strips id, but parse re-injects it", async () => {
    const id = generatePlanId();
    await writePlan(id, { goal: "test goal" }, fakeHome);

    const back = await readPlan(id, fakeHome);
    expect(back).not.toBeNull();
    expect(back?.id).toBe(id);
    expect(back?.goal).toBe("test goal");
    expect(back?.status).toBe("draft");
    expect(back?.strategy).toBe("sequential");
  });

  it("survives a plan file that exists but has missing required fields (returns null)", async () => {
    // Write a partial TOML that lacks `goal` — PlanSchema requires it.
    const id = generatePlanId();
    const file = planPath(id, fakeHome);
    const fs = await import("node:fs/promises");
    await fs.writeFile(file, 'status = "draft"\n', "utf-8");

    const back = await readPlan(id, fakeHome);
    expect(back).toBeNull();
  });
});

// ─── writePlan ──────────────────────────────────────────────

describe("writePlan", () => {
  it("preserves createdAt across updates", async () => {
    const id = generatePlanId();
    const first = await writePlan(id, { goal: "first" }, fakeHome);
    // Sleep 5ms so updatedAt can be measurably different.
    await new Promise((r) => setTimeout(r, 5));
    const second = await writePlan(
      id,
      { goal: "first", status: "running" },
      fakeHome,
    );

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    expect(second.status).toBe("running");
  });

  it("auto-generates timestamps + defaults for new plans", async () => {
    const id = generatePlanId();
    const plan = await writePlan(id, { goal: "test" }, fakeHome);
    expect(plan.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(plan.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(plan.status).toBe("draft");
    expect(plan.strategy).toBe("sequential");
    expect(plan.tasks).toEqual([]);
    expect(plan.context).toEqual({});
  });

  it("throws when creating a new plan without goal", async () => {
    const id = generatePlanId();
    await expect(writePlan(id, {}, fakeHome)).rejects.toThrow(
      /goal is required/,
    );
  });

  it("writes a TOML file at plansDir/<id>.toml", async () => {
    const id = generatePlanId();
    await writePlan(id, { goal: "writePlan path test" }, fakeHome);
    expect(existsSync(planPath(id, fakeHome))).toBe(true);
  });
});

// ─── listPlans ──────────────────────────────────────────────

describe("listPlans", () => {
  it("returns [] when plans directory does not exist (no throw)", async () => {
    // Drop a brand-new fakeHome without ensurePlanDirs running.
    const freshHome = mkdtempSync(join(tmpdir(), "pilot-plan-empty-"));
    try {
      const plans = await listPlans(freshHome);
      expect(plans).toEqual([]);
    } finally {
      rmSync(freshHome, { recursive: true, force: true });
    }
  });

  it("sorts plans by updatedAt descending (newest first)", async () => {
    const idA = generatePlanId();
    const idB = generatePlanId();
    const idC = generatePlanId();

    await writePlan(idA, { goal: "A" }, fakeHome);
    await new Promise((r) => setTimeout(r, 5));
    await writePlan(idB, { goal: "B" }, fakeHome);
    await new Promise((r) => setTimeout(r, 5));
    await writePlan(idC, { goal: "C" }, fakeHome);

    const plans = await listPlans(fakeHome);
    expect(plans.map((p) => p.id)).toEqual([idC, idB, idA]);
  });
});

// ─── deletePlan ─────────────────────────────────────────────

describe("deletePlan", () => {
  it("returns false when plan doesn't exist", async () => {
    const ok = await deletePlan("nope", fakeHome);
    expect(ok).toBe(false);
  });

  it("returns true and removes file when plan exists", async () => {
    const id = generatePlanId();
    await writePlan(id, { goal: "x" }, fakeHome);
    expect(existsSync(planPath(id, fakeHome))).toBe(true);

    const ok = await deletePlan(id, fakeHome);
    expect(ok).toBe(true);
    expect(existsSync(planPath(id, fakeHome))).toBe(false);
  });
});

// ─── generatePlanId ─────────────────────────────────────────

describe("generatePlanId", () => {
  it("returns a non-empty id", () => {
    const id = generatePlanId();
    expect(id.length).toBeGreaterThan(5);
  });

  it("format: <15-char timestamp>_<6-char random suffix>", () => {
    const id = generatePlanId();
    expect(id).toMatch(/^\d{15}_[a-z0-9]{6}$/);
  });
});

// ─── deriveTitle ────────────────────────────────────────────

describe("deriveTitle", () => {
  it("strips common Chinese prefixes", () => {
    expect(deriveTitle("帮我实现用户登录")).toBe("实现用户登录");
    expect(deriveTitle("请修复 login bug")).toBe("修复 login bug");
    expect(deriveTitle("实现 CSV 解析")).toBe("CSV 解析");
    expect(deriveTitle("创建一个 plan")).toBe("一个 plan");
  });

  it("truncates to 60 chars + ellipsis when longer", () => {
    const long = "请" + "x".repeat(80);
    const title = deriveTitle(long);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("...")).toBe(true);
  });

  it("returns original when <= 60 chars", () => {
    expect(deriveTitle("short goal")).toBe("short goal");
  });
});

// ─── suggestTools ───────────────────────────────────────────

describe("suggestTools", () => {
  it("matches tools whose name or description contains a goal keyword", () => {
    const tools = [
      {
        name: "read",
        source: "built-in",
        safety: "safe",
        description: "Read a file",
      },
      {
        name: "bash",
        source: "built-in",
        safety: "unsafe",
        description: "Run shell command",
      },
      {
        name: "write",
        source: "built-in",
        safety: "unsafe",
        description: "Write a file",
      },
    ];
    const suggestion = suggestTools("read a file", tools, []);
    expect(suggestion.matchedTools.map((t) => t.name)).toContain("read");
  });

  it("keyword matching is case-insensitive", () => {
    const tools = [
      {
        name: "Read",
        source: "built-in",
        safety: "safe",
        description: "Reads files",
      },
    ];
    const suggestion = suggestTools("READ a file", tools, []);
    expect(suggestion.matchedTools).toHaveLength(1);
  });

  it("returns empty matchedTools when no keyword overlaps", () => {
    const tools = [
      {
        name: "bash",
        source: "built-in",
        safety: "unsafe",
        description: "shell",
      },
    ];
    const suggestion = suggestTools("make coffee", tools, []);
    expect(suggestion.matchedTools).toEqual([]);
  });

  it("matches profiles whose name or packages contain a keyword", () => {
    const profiles = [
      { name: "reviewer", model: "sonnet", packages: ["@pi/reviewer"] },
      { name: "default", model: "haiku", packages: [] },
    ];
    const suggestion = suggestTools("review code", [], profiles);
    expect(suggestion.matchedProfiles.map((p) => p.name)).toContain("reviewer");
  });
});

// ─── appendPlanEvent ────────────────────────────────────────

describe("appendPlanEvent", () => {
  it("writes a JSONL file under plansHistoryDir/<plan-id>_<timestamp>.jsonl", async () => {
    const id = generatePlanId();
    const timestamp = "2026-07-07T11:00:00.000Z";

    await appendPlanEvent(
      {
        timestamp,
        planId: id,
        type: "plan_created",
        data: { goal: "x" },
      },
      fakeHome,
    );

    const dir = plansHistoryDir(fakeHome);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    // appendPlanEvent strips [-:T.Z] from the ISO timestamp, then takes
    // the first 15 chars. "2026-07-07T11:00:00.000Z" → "202607071100000".
    expect(files[0]).toMatch(new RegExp(`^${id}_202607071100000\\.jsonl$`));

    const line = readFileSync(join(dir, files[0]!), "utf-8").trim();
    const parsed = JSON.parse(line);
    expect(parsed.planId).toBe(id);
    expect(parsed.type).toBe("plan_created");
    expect(parsed.data).toEqual({ goal: "x" });
  });

  it("appends multiple events to the same file (JSONL)", async () => {
    const id = generatePlanId();
    const ts = "2026-07-07T11:00:00.000Z";

    await appendPlanEvent(
      { timestamp: ts, planId: id, type: "plan_created", data: {} },
      fakeHome,
    );
    await appendPlanEvent(
      { timestamp: ts, planId: id, type: "plan_started", data: {} },
      fakeHome,
    );
    await appendPlanEvent(
      { timestamp: ts, planId: id, type: "plan_completed", data: {} },
      fakeHome,
    );

    const dir = plansHistoryDir(fakeHome);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const lines = readFileSync(join(dir, files[0]!), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toEqual(["plan_created", "plan_started", "plan_completed"]);
  });
});

// ─── ensurePlanDirs ─────────────────────────────────────────

describe("ensurePlanDirs", () => {
  it("creates plans/, plans-history/, runtime/plans/", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "pilot-plan-dirs-"));
    try {
      await ensurePlanDirs(fresh);
      expect(existsSync(plansDir(fresh))).toBe(true);
      expect(existsSync(plansHistoryDir(fresh))).toBe(true);
      // runtime/plans/ also created (unused for v0.5.7, lands in v0.6.0 executor)
      expect(existsSync(join(fresh, ".pilot/runtime/plans"))).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
