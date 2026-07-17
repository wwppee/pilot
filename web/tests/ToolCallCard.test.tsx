/**
 * v0.7.3 (B2): RTL coverage for the generic <ToolCallCard>.
 * Six tests — each locks in one of the per-card details
 * (outcome badge, tool name, reason, error sample, etc.)
 * so a future refactor of the card's internals can't
 * silently regress them.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolCallCard } from "../src/app/observability/ToolCallCard";

const t = (k: string, p?: Record<string, string | number>) => {
  if (k === "observability.reason" && p) return `rule: ${p.reason}`;
  return k;
};

const baseCall = {
  context: { timestamp: "2026-07-18T00:00:00Z" },
};

describe("v0.7.3: <ToolCallCard>", () => {
  it("renders the tool name + a denied badge for a denied call", () => {
    render(
      <ToolCallCard
        call={{ ...baseCall, tool: "bash", outcome: "denied", reason: "denyCommands", errorSample: "rm -rf" }}
        t={t}
      />,
    );
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByTestId("observability-outcome-denied")).toBeTruthy();
  });

  it("renders a fail badge for a failed call", () => {
    render(
      <ToolCallCard
        call={{ ...baseCall, tool: "read", outcome: "fail", reason: "", errorSample: "ENOENT" }}
        t={t}
      />,
    );
    expect(screen.getByTestId("observability-outcome-fail")).toBeTruthy();
  });

  it("renders a success badge for a successful call", () => {
    render(
      <ToolCallCard
        call={{ ...baseCall, tool: "write", outcome: "success", reason: "", errorSample: "" }}
        t={t}
      />,
    );
    expect(screen.getByTestId("observability-outcome-success")).toBeTruthy();
  });

  it("shows the raw error sample verbatim (no normalization)", () => {
    render(
      <ToolCallCard
        call={{
          ...baseCall,
          tool: "write",
          outcome: "fail",
          reason: "",
          errorSample: "Error: EACCES: permission denied, open '/etc/hosts'",
        }}
        t={t}
      />,
    );
    const sample = screen.getByTestId("observability-error-sample");
    expect(sample.textContent).toContain("EACCES");
    expect(sample.textContent).toContain("/etc/hosts");
  });

  it("shows the reason via t('observability.reason', {reason}) when present", () => {
    render(
      <ToolCallCard
        call={{ ...baseCall, tool: "bash", outcome: "denied", reason: "denyPaths", errorSample: "/etc" }}
        t={t}
      />,
    );
    expect(screen.getByText(/rule: denyPaths/)).toBeTruthy();
  });

  it("does not render the reason block when reason is empty", () => {
    render(
      <ToolCallCard
        call={{ ...baseCall, tool: "bash", outcome: "success", reason: "", errorSample: "" }}
        t={t}
      />,
    );
    expect(screen.queryByText(/rule:/)).toBeNull();
  });
});
