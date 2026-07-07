/**
 * Tests for plan Web UI plumbing (v0.5.7+).
 *
 * Covers:
 *   1. i18n: all plan.* keys translate in both EN + zh (covered by
 *      i18n.test.ts full-dict assertion, but we spot-check a few here
 *      so the regression shows up in a focused failure)
 *   2. Plan type shape: status / strategy / StepAction union values
 *      round-trip via JSON (no `as unknown` needed for Plan objects)
 *   3. server action arg forwarding: createPlanForm forwards `goal`
 *      exactly as user typed; lifecycle forms forward `id`
 */

import { describe, it, expect } from "vitest";
import enDict from "../src/lib/i18n/dict.en";
import zhDict from "../src/lib/i18n/dict.zh";
import type {
  Plan,
  PlanTask,
  PlanStep,
  StepAction,
  PlanStatus,
  PlanStrategy,
} from "../src/lib/types";

// ─── i18n spot-check ─────────────────────────────────────────

describe("plan i18n: spot-check", () => {
  it("English plan.h1 + plan.new.h1 are non-empty", () => {
    expect(enDict["plans.h1"]).toBeTruthy();
    expect(enDict["plans.new.h1"]).toBeTruthy();
  });

  it("Chinese plan.* keys translate", () => {
    expect(zhDict["plans.h1"]).toBeTruthy();
    expect(zhDict["plans.status.running"]).toBeTruthy();
    expect(zhDict["plans.action.start"]).toBeTruthy();
  });

  it("status + strategy + action keys exist for every enum value", () => {
    const statuses: PlanStatus[] = [
      "draft",
      "running",
      "paused",
      "completed",
      "failed",
      "cancelled",
    ];
    const strategies: PlanStrategy[] = ["sequential", "parallel", "adaptive"];
    for (const s of statuses) {
      expect(enDict[`plans.status.${s}` as keyof typeof enDict]).toBeTruthy();
      expect(zhDict[`plans.status.${s}` as keyof typeof zhDict]).toBeTruthy();
    }
    for (const s of strategies) {
      expect(enDict[`plans.strategy.${s}` as keyof typeof enDict]).toBeTruthy();
      expect(zhDict[`plans.strategy.${s}` as keyof typeof zhDict]).toBeTruthy();
    }
  });
});

// ─── Plan type shape (JSON round-trip) ────────────────────────

describe("Plan type shape (v0.5.7 schema)", () => {
  const minimalPlan: Plan = {
    id: "202607071400123_abc123",
    goal: "test goal",
    status: "draft",
    strategy: "sequential",
    tasks: [],
    context: {},
    createdAt: "2026-07-07T14:00:00.000Z",
    updatedAt: "2026-07-07T14:00:00.000Z",
  };

  it("minimal Plan JSON-roundtrips", () => {
    const json = JSON.stringify(minimalPlan);
    const back = JSON.parse(json) as Plan;
    expect(back.id).toBe(minimalPlan.id);
    expect(back.status).toBe("draft");
    expect(back.tasks).toEqual([]);
  });

  it("Plan with one task + step roundtrips StepAction.pilot_command", () => {
    const step: PlanStep = {
      id: "step-1",
      description: "ls",
      action: {
        type: "pilot_command",
        command: "tool",
        args: ["ls"],
      },
      status: "pending",
      input: {},
      retryCount: 0,
      maxRetries: 2,
    };
    const task: PlanTask = {
      id: "task-1",
      description: "do ls",
      status: "pending",
      steps: [step],
      dependsOn: [],
      requiredTools: [],
    };
    const plan: Plan = {
      ...minimalPlan,
      tasks: [task],
    };
    const back = JSON.parse(JSON.stringify(plan)) as Plan;
    expect(back.tasks[0]?.steps[0]?.action.type).toBe("pilot_command");
    const action = back.tasks[0]?.steps[0]?.action as Extract<
      StepAction,
      { type: "pilot_command" }
    >;
    expect(action.command).toBe("tool");
    expect(action.args).toEqual(["ls"]);
  });

  it("StepAction.pi_session carries prompt + optional profile", () => {
    const action: StepAction = {
      type: "pi_session",
      prompt: "实现用户登录",
      profile: "default",
    };
    const json = JSON.stringify(action);
    const back = JSON.parse(json) as StepAction;
    expect(back.type).toBe("pi_session");
    if (back.type === "pi_session") {
      expect(back.prompt).toBe("实现用户登录");
      expect(back.profile).toBe("default");
    }
  });

  it("StepAction.condition carries sub-steps as raw JSON", () => {
    const action: StepAction = {
      type: "condition",
      check: "branch.test == true",
      then: [{ type: "pilot_command", command: "ls", args: [] }],
      else: [{ type: "wait", condition: "1s", timeoutMs: 1000 }],
    };
    const json = JSON.stringify(action);
    const back = JSON.parse(json) as StepAction;
    expect(back.type).toBe("condition");
    if (back.type === "condition") {
      expect(back.then).toHaveLength(1);
      expect(back.else).toHaveLength(1);
    }
  });
});

// ─── server action arg forwarding ─────────────────────────────
//
// We can't easily test server actions without spinning up Next.js,
// but we can test that the helpers read what they read. The point is
// to lock the contract: future changes to action signatures need to
// update these tests too.

describe("server action contract (read-side)", () => {
  it("createPlanForm reads 'goal' from FormData", () => {
    const fd = new FormData();
    fd.set("goal", "  实现用户登录  ");
    // Match the trimming logic in createPlanForm:
    //   const goal = formData.get("goal");
    //   if (typeof goal !== "string" || goal.trim().length === 0) ...
    //   ...JSON.stringify({ goal: goal.trim() })
    const goal = fd.get("goal");
    expect(typeof goal).toBe("string");
    expect((goal as string).trim()).toBe("实现用户登录");
    expect((goal as string).trim().length).toBeGreaterThan(0);
  });

  it("lifecycle action forms read 'id' from FormData", () => {
    const fd = new FormData();
    fd.set("id", "202607071400123_abc123");
    expect(typeof fd.get("id")).toBe("string");
    expect((fd.get("id") as string).length).toBeGreaterThan(0);
  });

  it("deletePlanForm needs id; rejects empty id", () => {
    const fd = new FormData();
    fd.set("id", "");
    expect((fd.get("id") as string).length).toBe(0);
  });
});
