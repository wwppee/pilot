/**
 * v0.7.2 (P1 #5): RTL test coverage for the newly-extracted
 * `<NodeFields>` component.
 *
 * Before v0.7.2 the node fields block (provider / model /
 * system prompt / input template / output var / on-failure
 * strategy + retry/escalate) was 150 lines of JSX inside
 * `NodeCard` inside `WorkflowEditor.tsx` — testing it in
 * isolation required a 320-line `WorkflowEditor` mount with
 * a full editor state. Now `NodeFields` is a pure
 * `{ node, onUpdate, t }` component, so we can feed it a
 * minimal `WorkflowNode` and assert on each `onUpdate`
 * call directly.
 *
 * The `name` input is *not* tested here — it lives in
 * `NodeCard` (sibling test) because it shares a row with
 * the `#index` badge and the `×` remove button.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeFields } from "../src/app/workflows/[id]/NodeFields";
import type { WorkflowNode } from "../src/lib/types";

const t = (k: string) => k;

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: "n1",
    name: "Step 1",
    kind: "step",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    systemPrompt: "do thing",
    inputTemplate: "",
    outputVar: "out1",
    tools: [],
    onFailure: "stop",
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe("v0.7.2: <NodeFields>", () => {
  it("renders the model + system prompt + input/output fields", () => {
    render(<NodeFields node={makeNode()} onUpdate={vi.fn()} t={t} availableVars={[]} />);
    // Model fields carry data-testid; system prompt / input
    // template / output var are looked up by label.
    expect(screen.getByTestId("step-model")).toBeTruthy();
    expect(screen.getByTestId("step-output-var")).toBeTruthy();
  });

  it("changing the model input patches model.model", () => {
    const onUpdate = vi.fn();
    render(<NodeFields node={makeNode()} onUpdate={onUpdate} t={t} availableVars={[]} />);
    fireEvent.change(screen.getByTestId("step-model"), {
      target: { value: "claude-sonnet-4-5" },
    });
    expect(onUpdate).toHaveBeenCalledWith({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });
  });

  it("changing the output var patches outputVar", () => {
    const onUpdate = vi.fn();
    render(<NodeFields node={makeNode()} onUpdate={onUpdate} t={t} availableVars={[]} />);
    fireEvent.change(screen.getByTestId("step-output-var"), {
      target: { value: "my_output" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ outputVar: "my_output" });
  });

  it("changing onFailure to 'retry' reveals the retryCount field", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <NodeFields node={makeNode()} onUpdate={onUpdate} t={t} availableVars={[]} />,
    );
    // onFailure = "stop" (default) — no retryCount input visible
    expect(screen.queryByText("workflows.field.retryCount")).toBeNull();

    // Switch to retry — the retryCount label should now appear
    rerender(
      <NodeFields
        node={makeNode({ onFailure: "retry" })}
        onUpdate={onUpdate}
        t={t}
        availableVars={[]}
      />,
    );
    expect(screen.getByText("workflows.field.retryCount")).toBeTruthy();
  });

  it("changing onFailure to 'escalate' reveals the escalateToModel field", () => {
    const { rerender } = render(
      <NodeFields node={makeNode()} onUpdate={vi.fn()} t={t} availableVars={[]} />,
    );
    rerender(
      <NodeFields
        node={makeNode({ onFailure: "escalate" })}
        onUpdate={vi.fn()}
        t={t}
        availableVars={[]}
      />,
    );
    expect(screen.getByText("workflows.field.escalateToModel")).toBeTruthy();
  });

  it("changing onFailure to 'stop' or 'skip' hides the conditional field", () => {
    const { rerender } = render(
      <NodeFields
        node={makeNode({ onFailure: "retry", retryCount: 2 })}
        onUpdate={vi.fn()}
        t={t}
        availableVars={[]}
      />,
    );
    expect(screen.getByText("workflows.field.retryCount")).toBeTruthy();
    rerender(
      <NodeFields
        node={makeNode({ onFailure: "stop" })}
        onUpdate={vi.fn()}
        t={t}
        availableVars={[]}
      />,
    );
    expect(screen.queryByText("workflows.field.retryCount")).toBeNull();
  });
});
