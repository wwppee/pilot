import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanStatusPill } from "../src/components/PlanStatusPill";
import type { PlanTask } from "../src/lib/types";
import { PlanTaskGraph } from "../src/components/PlanTaskGraph";
import type { PlanEvent } from "../src/lib/types";
import { PlanEventTimeline } from "../src/components/PlanEventTimeline";

/**
 * Stub translator. We don't need real i18n here — just verify the
 * components pass the right keys through. The keys themselves are
 * validated by the dedicated i18n.test.ts (en + zh parity).
 */
const t = (k: string) => `__${k}__`;

describe("PlanStatusPill (v0.5.13)", () => {
  it("looks up plan status under plans.status.{value}", () => {
    render(<PlanStatusPill kind="plan" value="running" t={t} />);
    expect(screen.getByText("__plans.status.running__")).toBeTruthy();
  });

  it("looks up task status under plans.taskStatus.{value}", () => {
    render(<PlanStatusPill kind="task" value="blocked" t={t} />);
    expect(screen.getByText("__plans.taskStatus.blocked__")).toBeTruthy();
  });

  it("looks up step status under plans.stepStatus.{value}", () => {
    render(<PlanStatusPill kind="step" value="failed" t={t} />);
    expect(screen.getByText("__plans.stepStatus.failed__")).toBeTruthy();
  });

  it("renders with the matching tone pill class", () => {
    const { container } = render(
      <PlanStatusPill kind="step" value="completed" t={t} />,
    );
    const pill = container.querySelector(".pill");
    expect(pill?.className).toContain("pill");
    expect(pill?.className).toContain("ok");
  });
});

describe("PlanTaskGraph (v0.5.13)", () => {
  const baseTask = (overrides: Partial<PlanTask> = {}): PlanTask => ({
    id: "t1",
    description: "first",
    status: "pending",
    steps: [],
    dependsOn: [],
    requiredTools: [],
    ...overrides,
  });

  it("renders the empty hint when there are no tasks", () => {
    render(<PlanTaskGraph tasks={[]} t={t} />);
    expect(screen.getByText("__plans.detail.graph.empty__")).toBeTruthy();
  });

  it("renders each task with id + description", () => {
    const tasks = [
      baseTask({ id: "task_a", description: "alpha" }),
      baseTask({ id: "task_b", description: "beta" }),
    ];
    const { container } = render(<PlanTaskGraph tasks={tasks} t={t} />);
    expect(container.textContent).toContain("task_a");
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("task_b");
    expect(container.textContent).toContain("beta");
  });

  it("shows dependsOn edges in the second column", () => {
    const tasks = [
      baseTask({ id: "task_a" }),
      baseTask({ id: "task_b", dependsOn: ["task_a"] }),
    ];
    const { container } = render(<PlanTaskGraph tasks={tasks} t={t} />);
    // task_a row's forward column should list "task_b"
    expect(container.textContent).toContain("task_b");
  });
});

describe("PlanEventTimeline (v0.5.13)", () => {
  const event = (overrides: Partial<PlanEvent> = {}): PlanEvent => ({
    timestamp: "2026-07-09T05:34:04.819Z",
    planId: "p1",
    type: "plan_created",
    data: {},
    ...overrides,
  });

  it("renders the empty hint when there are no events", () => {
    render(<PlanEventTimeline events={[]} t={t} />);
    expect(screen.getByText("__plans.detail.events.empty__")).toBeTruthy();
  });

  it("renders the localized event-type label for each event", () => {
    const events = [
      event({ type: "plan_created" }),
      event({ type: "plan_started" }),
      event({ type: "plan_cancelled" }),
    ];
    const { container } = render(<PlanEventTimeline events={events} t={t} />);
    expect(container.textContent).toContain("__plans.event.plan_created__");
    expect(container.textContent).toContain("__plans.event.plan_started__");
    expect(container.textContent).toContain("__plans.event.plan_cancelled__");
  });

  it("renders each event as a <time> with a valid ISO datetime attribute", () => {
    const { container } = render(
      <PlanEventTimeline events={[event()]} t={t} />,
    );
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-07-09T05:34:04.819Z");
  });

  it("summarizes the goal field when present", () => {
    const events = [
      event({ data: { goal: "ship the thing", strategy: "sequential" } }),
    ];
    const { container } = render(<PlanEventTimeline events={events} t={t} />);
    // goal takes precedence over strategy in summarizeData.
    expect(container.textContent).toContain("ship the thing");
  });
});
