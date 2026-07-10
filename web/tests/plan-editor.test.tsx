/**
 * Tests for the v0.6.1 PlanEditor (visual plan builder).
 *
 * Strategy: render the component in isolation, drive
 * interactions through fireEvent, and assert visible
 * structure. We don't drive a full submit because the
 * editor uses fetch + router.push, which would require
 * mocking the next router — out of scope for smoke tests.
 *
 * v0.6.1 introduced: per-page Hint i18n, action-type-specific
 * field rendering, add/remove/move for both tasks and
 * steps, dependsOn chip picker, and a sticky submit bar.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation — the editor calls router.push on submit.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

// Mock useI18n to a stable English t() for predictable assertions.
// We resolve a few key strings the editor uses so tests can
// match against visible English text. Unknown keys fall back
// to the key itself.
const T_DICT: Record<string, string> = {
  "plans.editor.goalLabel": "Goal",
  "plans.editor.goalPlaceholder": "What do you want pi to do?",
  "plans.editor.titleLabel": "Title",
  "plans.editor.titlePlaceholder": "(auto-derived from goal)",
  "plans.editor.strategyLabel": "Strategy",
  "plans.editor.tasksLabel": "Tasks",
  "plans.editor.addTask": "Add task",
  "plans.editor.noTasks": "No tasks yet — add at least one.",
  "plans.editor.taskIndex": "Task {n}",
  "plans.editor.taskDescriptionPlaceholder": "What this task does",
  "plans.editor.profileLabel": "Profile",
  "plans.editor.profileNone": "(none)",
  "plans.editor.dependsOnLabel": "Depends on",
  "plans.editor.dependsOnNone": "—",
  "plans.editor.stepsLabel": "Steps ({n})",
  "plans.editor.addStep": "Add step",
  "plans.editor.noSteps": "No steps yet — add at least one.",
  "plans.editor.stepDescriptionPlaceholder": "What this step does",
  "plans.editor.removeTask": "Remove task",
  "plans.editor.removeStep": "Remove step",
  "plans.editor.moveUp": "Move up",
  "plans.editor.moveDown": "Move down",
  "plans.editor.conditionHelp":
    "DSL: true / false / step.<id>.success / and(a,b) / or(a,b) / not(a) / eq(a,b) / neq(a,b) / contains(a,b)",
  "plans.editor.submit": "Create plan",
  "plans.editor.submitting": "Creating…",
  "plans.editor.cancel": "Cancel",
  "plans.editor.error.goalEmpty": "Goal cannot be empty.",
  "plans.editor.error.noTasks": "Add at least one task.",
  "plans.editor.error.fieldRequired":
    "Task {task}, step {step}: {field} is required.",
  "plans.editor.field.command": "command",
  "plans.editor.field.prompt": "prompt",
  "plans.editor.field.profileName": "profile name",
  "plans.editor.field.packSource": "pack source",
  "plans.editor.field.policyName": "policy name",
  "plans.editor.field.check": "check expression",
  "plans.strategy.sequential": "Sequential",
  "plans.strategy.parallel": "Parallel",
  "plans.strategy.adaptive": "Adaptive",
  "plans.actionType.pilot_command": "pilot command",
  "plans.actionType.pi_session": "pi session",
  "plans.actionType.profile_switch": "profile switch",
  "plans.actionType.pack_install": "install pack",
  "plans.actionType.policy_apply": "apply policy",
  "plans.actionType.condition": "if / condition",
  "plans.actionType.wait": "wait",
  "plans.actionType.manual": "manual",
};

vi.mock("@/components/I18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (k: string, params?: Record<string, string | number>) => {
      const raw = T_DICT[k] ?? k;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, n: string) =>
        String(params[n] ?? ""),
      );
    },
  }),
}));

import { PlanEditor } from "../src/components/PlanEditor";

describe("PlanEditor", () => {
  beforeEach(() => {
    // jsdom has no scrollTo; the sticky submit bar calls it.
    // Stub it so the test doesn't error.
    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = vi.fn();
    }
  });

  it("renders empty state with the goal input + add-task button", () => {
    render(<PlanEditor />);
    expect(
      screen.getByPlaceholderText(/What do you want pi to do/i),
    ).toBeTruthy();
    expect(screen.getByText(/No tasks yet/i)).toBeTruthy();
    expect(screen.getByTestId("add-task")).toBeTruthy();
    expect(screen.getByTestId("submit-plan")).toBeTruthy();
  });

  it("starts with the initialGoal if provided", () => {
    render(<PlanEditor initialGoal="deploy pilot to staging" />);
    const textarea = screen.getByPlaceholderText(
      /What do you want pi to do/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("deploy pilot to staging");
  });

  it("adds a task when + Add task is clicked", () => {
    render(<PlanEditor />);
    const addBtn = screen.getByTestId("add-task");
    fireEvent.click(addBtn);
    // After adding, the "No tasks yet" empty state is gone.
    expect(screen.queryByText(/No tasks yet/i)).toBeNull();
    // The new task shows up with a "Task 1" label.
    expect(screen.getByText("Task 1")).toBeTruthy();
    // The new task gets one empty step by default.
    expect(screen.getByText("1.")).toBeTruthy();
  });

  it("adds multiple tasks and reorders them", () => {
    render(<PlanEditor />);
    const addBtn = screen.getByTestId("add-task");
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // "Task N" appears in the task header AND in every other
    // task's dependsOn picker. So we assert by counting task
    // headers (which is what the user sees at the top of each
    // task card) — each header is the "Task {n}" span inside
    // the task flex row.
    const headers = screen.getAllByText(/^Task \d+$/);
    expect(headers.length).toBeGreaterThanOrEqual(3);
    // Move the last task up by clicking its "↑" button.
    const moveUpButtons = screen.getAllByLabelText("Move up");
    fireEvent.click(moveUpButtons[moveUpButtons.length - 1]!);
    // After move, we still have 3 tasks. The headers
    // remained (no crash).
    expect(screen.getAllByText(/^Task \d+$/).length).toBeGreaterThanOrEqual(3);
  });

  it("removes a task via the ✕ button", () => {
    render(<PlanEditor />);
    fireEvent.click(screen.getByTestId("add-task"));
    fireEvent.click(screen.getByTestId("add-task"));
    const removeButtons = screen.getAllByLabelText("Remove task");
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]!);
    expect(screen.getAllByLabelText("Remove task")).toHaveLength(1);
  });

  it("switches the action type and shows the per-type fields", () => {
    render(<PlanEditor />);
    fireEvent.click(screen.getByTestId("add-task"));
    // Find the step's action-type select (the second select in
    // the rendered output — the first is the task profile select).
    const selects = screen.getAllByRole("combobox");
    // The step action select is the one whose options start with
    // "pilot_command" / "pi_session" / etc.
    const stepSelect = selects.find((s) =>
      Array.from((s as HTMLSelectElement).options).some(
        (o) => o.value === "pilot_command",
      ),
    ) as HTMLSelectElement | undefined;
    expect(stepSelect).toBeDefined();
    // Default is pilot_command → shows "command" + "args" inputs.
    expect(
      screen.getByPlaceholderText(/command \(e\.g\. doctor\)/i),
    ).toBeTruthy();
    // Switch to "pi_session" → shows a prompt textarea.
    fireEvent.change(stepSelect!, { target: { value: "pi_session" } });
    expect(screen.getByPlaceholderText("prompt for pi")).toBeTruthy();
    // Switch to "condition" → shows the check input + help line.
    fireEvent.change(stepSelect!, { target: { value: "condition" } });
    expect(screen.getByPlaceholderText(/step\.s1\.success/)).toBeTruthy();
    expect(
      screen.getByText(/DSL: true \/ false \/ step\.<id>\.success/),
    ).toBeTruthy();
  });

  it("blocks submit when goal is empty (inline error, no network)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(
        () => Promise.resolve(new Response("{}", { status: 200 })) as any,
      );
    render(<PlanEditor />);
    fireEvent.click(screen.getByTestId("add-task"));
    // Goal is empty, so submit should set an inline error
    // and NOT call fetch.
    fireEvent.click(screen.getByTestId("submit-plan"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(
      /Goal cannot be empty/i,
    );
    fetchSpy.mockRestore();
  });

  it("blocks submit when there are no tasks (inline error)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(
        () => Promise.resolve(new Response("{}", { status: 200 })) as any,
      );
    render(<PlanEditor initialGoal="do something" />);
    fireEvent.click(screen.getByTestId("submit-plan"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least one task/i);
    fetchSpy.mockRestore();
  });

  it("calls fetch on submit when goal + tasks are present", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "fake-plan-id" }),
    } as any);
    render(<PlanEditor initialGoal="do something" />);
    fireEvent.click(screen.getByTestId("add-task"));
    // Set the task's required field (default action is
    // pilot_command → needs a command).
    const commandInput = screen.getByPlaceholderText(
      /command \(e\.g\. doctor\)/i,
    );
    fireEvent.change(commandInput, { target: { value: "doctor" } });
    fireEvent.click(screen.getByTestId("submit-plan"));
    // fetch should be called with /api/pilot/plans + JSON body
    // that contains the goal + the task.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/pilot/plans");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.goal).toBe("do something");
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].steps[0].action.command).toBe("doctor");
    fetchSpy.mockRestore();
  });
});
