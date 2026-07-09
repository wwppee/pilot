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
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from "node:fs";
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
  listPlanEvents,
  planPath,
  plansDir,
  plansHistoryDir,
  PlanError,
  PlanErrors,
  type StepAction,
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

  it("throws PlanError(500) when a plan file has missing required fields", async () => {
    // P1#6 (v0.5.7 review): the old behavior swallowed this and
    // returned null. The new behavior surfaces it as a 500 PlanError
    // so "missing" (404) and "corrupt" (500) stay distinguishable.
    const id = generatePlanId();
    const file = planPath(id, fakeHome);
    const fs = await import("node:fs/promises");
    await fs.writeFile(file, 'status = "draft"\n', "utf-8");

    await expect(readPlan(id, fakeHome)).rejects.toThrow(PlanError);
    try {
      await readPlan(id, fakeHome);
    } catch (e) {
      expect((e as PlanError).statusCode).toBe(500);
    }
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

// ─── listPlanEvents (v0.5.13+) ──────────────────────────────

describe("listPlanEvents", () => {
  it("returns [] when no history directory exists", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "pilot-events-empty-"));
    try {
      const events = await listPlanEvents("nonexistent", fresh);
      expect(events).toEqual([]);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it("returns [] when history dir exists but has no matching files", async () => {
    const id = generatePlanId();
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:00.000Z",
        planId: "other-plan",
        type: "plan_created",
        data: {},
      },
      fakeHome,
    );
    const events = await listPlanEvents(id, fakeHome);
    expect(events).toEqual([]);
  });

  it("returns sorted events for one plan, ignoring others", async () => {
    const id = generatePlanId();
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:02.000Z",
        planId: id,
        type: "plan_started",
        data: {},
      },
      fakeHome,
    );
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:00.000Z",
        planId: id,
        type: "plan_created",
        data: { goal: "g" },
      },
      fakeHome,
    );
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:01.000Z",
        planId: id,
        type: "task_started",
        data: { taskId: "t1" },
      },
      fakeHome,
    );
    // unrelated event for a different plan
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:00.000Z",
        planId: "unrelated",
        type: "plan_created",
        data: {},
      },
      fakeHome,
    );

    const events = await listPlanEvents(id, fakeHome);
    expect(events.map((e) => e.type)).toEqual([
      "plan_created",
      "task_started",
      "plan_started",
    ]);
    // sorted ascending
    expect(events[0]!.timestamp).toBe("2026-07-07T11:00:00.000Z");
    expect(events[1]!.timestamp).toBe("2026-07-07T11:00:01.000Z");
    expect(events[2]!.timestamp).toBe("2026-07-07T11:00:02.000Z");
  });

  it("merges events from multiple history files (process-restart case)", async () => {
    const id = generatePlanId();
    // Two different history files (different timestamps in filename).
    await appendPlanEvent(
      {
        timestamp: "2026-07-07T11:00:00.000Z",
        planId: id,
        type: "plan_created",
        data: {},
      },
      fakeHome,
    );
    await appendPlanEvent(
      {
        timestamp: "2026-07-08T09:00:00.000Z",
        planId: id,
        type: "plan_resumed",
        data: {},
      },
      fakeHome,
    );

    const events = await listPlanEvents(id, fakeHome);
    expect(events.map((e) => e.type)).toEqual(["plan_created", "plan_resumed"]);
  });

  it("skips malformed JSONL lines without throwing", async () => {
    const id = generatePlanId();
    const dir = plansHistoryDir(fakeHome);
    // Manually craft a file with a valid line + garbage + another valid line
    const file = join(dir, `${id}_202607071100000.jsonl`);
    writeFileSync(
      file,
      [
        JSON.stringify({
          timestamp: "2026-07-07T11:00:00.000Z",
          planId: id,
          type: "plan_created",
          data: {},
        }),
        "this is not json",
        JSON.stringify({
          timestamp: "2026-07-07T11:00:01.000Z",
          planId: id,
          type: "plan_started",
          data: {},
        }),
      ].join("\n") + "\n",
      "utf-8",
    );

    const events = await listPlanEvents(id, fakeHome);
    expect(events.map((e) => e.type)).toEqual(["plan_created", "plan_started"]);
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

// ─── P0#5 — condition sub-steps are validated, not free-form ─────

describe("condition sub-steps (P0#5 regression)", () => {
  it("PlanSchema.parse accepts a condition with leaf-action sub-steps", async () => {
    const id = generatePlanId();
    await writePlan(
      id,
      {
        goal: "test condition",
        tasks: [
          {
            id: "t1",
            description: "branch on flag",
            steps: [
              {
                id: "s1",
                description: "if",
                action: {
                  type: "condition",
                  check: "branch.flag == true",
                  then: [
                    {
                      id: "s1a",
                      description: "ls",
                      action: {
                        type: "pilot_command",
                        command: "tool",
                        args: ["ls"],
                      },
                    },
                  ],
                  else: [
                    {
                      id: "s1b",
                      description: "wait",
                      action: {
                        type: "wait",
                        condition: "ready",
                        timeoutMs: 1000,
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      fakeHome,
    );

    const back = await readPlan(id, fakeHome);
    expect(back?.tasks[0]?.steps[0]?.action.type).toBe("condition");
  });

  it("PlanSchema.parse rejects a condition with a nested condition in sub-steps", async () => {
    const id = generatePlanId();
    await expect(
      writePlan(
        id,
        {
          goal: "nested condition attempt",
          tasks: [
            {
              id: "t1",
              description: "nope",
              steps: [
                {
                  id: "s1",
                  description: "outer",
                  action: {
                    type: "condition",
                    check: "x",
                    then: [
                      {
                        id: "s1a",
                        description: "inner",
                        action: {
                          type: "condition",
                          check: "y",
                          then: [],
                          else: [],
                        },
                      },
                    ],
                    else: [],
                  },
                },
              ],
            },
          ],
        },
        fakeHome,
      ),
    ).rejects.toThrow();
  });
});

// ─── P1#6 — readPlan distinguishes missing from corrupt ─────────

describe("readPlan (P1#6: missing vs corrupt)", () => {
  it("returns null when file doesn't exist (ENOENT)", async () => {
    const back = await readPlan("definitely-not-here", fakeHome);
    expect(back).toBeNull();
  });

  it("throws PlanError (500) when TOML is invalid", async () => {
    const id = generatePlanId();
    const file = planPath(id, fakeHome);
    writeFileSync(file, "this is not valid TOML = = = {{{\n", "utf-8");
    await expect(readPlan(id, fakeHome)).rejects.toThrow(PlanError);
    try {
      await readPlan(id, fakeHome);
    } catch (e) {
      expect((e as PlanError).statusCode).toBe(500);
    }
  });

  it("throws PlanError (500) when schema validation fails", async () => {
    const id = generatePlanId();
    const file = planPath(id, fakeHome);
    // Valid TOML but missing required `goal` field
    writeFileSync(file, 'title = "no goal here"\n', "utf-8");
    await expect(readPlan(id, fakeHome)).rejects.toThrow(PlanError);
  });
});

// ─── P1#10 — PlanErrors factory + PlanError class ───────────────

describe("PlanError + PlanErrors factory (P1#10)", () => {
  it("PlanError carries statusCode for HTTP mapping", () => {
    const e = new PlanError("bad", 409);
    expect(e.message).toBe("bad");
    expect(e.statusCode).toBe(409);
    expect(e.name).toBe("PlanError");
  });

  it("PlanErrors.notFound returns a 404 PlanError", () => {
    const e = PlanErrors.notFound("abc");
    expect(e).toBeInstanceOf(PlanError);
    expect(e.statusCode).toBe(404);
    expect(e.message).toContain("abc");
  });

  it("PlanErrors.alreadyRunning / alreadyCompleted use 409", () => {
    expect(PlanErrors.alreadyRunning("x").statusCode).toBe(409);
    expect(PlanErrors.alreadyCompleted("x").statusCode).toBe(409);
  });

  it("PlanErrors.notRunning / notPaused / cannotCancel include current status in message", () => {
    const a = PlanErrors.notRunning("p1", "draft");
    expect(a.statusCode).toBe(409);
    expect(a.message).toContain("draft");
    const b = PlanErrors.notPaused("p1", "running");
    expect(b.statusCode).toBe(409);
    expect(b.message).toContain("running");
    const c = PlanErrors.cannotCancel("p1", "completed");
    expect(c.statusCode).toBe(409);
    expect(c.message).toContain("completed");
  });
});

// ─── StepAction discriminated union (P0#5 type safety) ──────────

describe("StepAction discriminated union shape (P0#5)", () => {
  it("8 action types are present in the union", () => {
    // Type-level only: each action's .type is one of the 8 literals.
    const actions: StepAction[] = [
      { type: "pilot_command", command: "x", args: [] },
      { type: "pi_session", prompt: "p" },
      { type: "profile_switch", profile: "default" },
      { type: "pack_install", source: "npm:foo" },
      { type: "policy_apply", policy: "safe-bash" },
      { type: "condition", check: "x", then: [], else: [] },
      { type: "wait", condition: "ready", timeoutMs: 1000 },
      { type: "manual", prompt: "do it" },
    ];
    const types = new Set(actions.map((a) => a.type));
    expect(types.size).toBe(8);
  });
});
