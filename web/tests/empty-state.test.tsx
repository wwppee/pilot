import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../src/components/EmptyState";

describe("EmptyState (v0.5.6 UX pattern)", () => {
  it("renders the title as the primary heading", () => {
    render(<EmptyState title="Nothing here yet." hint="Do a thing." />);
    // title is the first thing the user reads — keep it semantically strong
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
  });

  it("renders string hint verbatim", () => {
    render(
      <EmptyState
        title="No profiles"
        hint="Use the form above to create one."
      />,
    );
    expect(screen.getByText("Use the form above to create one.")).toBeTruthy();
  });

  it("renders ReactNode hint (allows <code> / JSX)", () => {
    const { container } = render(
      <EmptyState
        title="No sessions"
        hint={
          <>
            Run <code>pi</code> to create your first session.
          </>
        }
      />,
    );
    // Verify the inline <code> renders with its accessible text.
    expect(container.textContent).toContain("Run");
    expect(container.textContent).toContain("pi");
    expect(container.querySelector("code")).toBeTruthy();
  });

  it("renders action link when actionHref + actionLabel are provided", () => {
    const { container } = render(
      <EmptyState
        title="No avatars"
        hint="Capture one."
        actionHref="/avatars/new"
        actionLabel="Open the capture form"
      />,
    );
    // The action link appends a visual arrow ("→"), so we look it up
    // by partial text instead of exact match.
    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Open the capture form"),
    );
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/avatars/new");
  });

  it("does not render an action link when only one of actionHref / actionLabel is given", () => {
    const { container } = render(
      <EmptyState
        title="X"
        hint="y"
        actionHref="/x"
        // no actionLabel
      />,
    );
    expect(container.querySelector("a")).toBeNull();
  });
});
