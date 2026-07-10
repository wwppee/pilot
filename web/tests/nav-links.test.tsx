/**
 * nav-links.test.tsx — coverage for the v0.4.14 grouped nav.
 *
 * Asserts that:
 *   - Both groups (Inspect + Manage) render with `role="group"` and
 *     `aria-label`
 *   - All 11 items still appear (no routes lost during the refactor)
 *   - Active link gets `aria-current="page"`
 *   - sr-only + visible group labels coexist
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Stub the I18n module — NavLinks calls useT() which needs a Provider.
// We mock the whole component to bypass that setup.
vi.mock("../src/components/I18n", () => ({
  useT: () => (k: string) => k, // identity t — key is the label
}));

import { NavLinks, NAV_GROUPS } from "../src/components/NavLinks";

describe("NavLinks (v0.4.14 grouped nav)", () => {
  it("renders two role=group containers with aria-labels", () => {
    const { container } = render(<NavLinks currentPath="/" />);
    const groups = container.querySelectorAll('[role="group"]');
    expect(groups.length).toBe(2);

    const inspect = container.querySelector(
      '[role="group"][aria-label="nav.groupInspect"]',
    );
    const manage = container.querySelector(
      '[role="group"][aria-label="nav.groupManage"]',
    );
    expect(inspect).not.toBeNull();
    expect(manage).not.toBeNull();
  });

  it("includes all 14 nav items (9 Inspect + 5 Manage)", () => {
    const totalItems = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(totalItems).toBe(14);
    // Spot-check key entries survived the refactor.
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain("/");
    expect(allHrefs).toContain("/forge");
    expect(allHrefs).toContain("/capabilities");
    expect(allHrefs).toContain("/profiles");
    expect(allHrefs).toContain("/avatars");
    expect(allHrefs).toContain("/plans");
  });

  it("marks the active link with aria-current=page", () => {
    render(<NavLinks currentPath="/profiles" />);
    // The /profiles link should be active; the / dashboard link should not.
    const active = screen.getByText("nav.profiles").closest("a");
    expect(active?.getAttribute("aria-current")).toBe("page");

    const dashboard = screen.getByText("nav.dashboard").closest("a");
    expect(dashboard?.getAttribute("aria-current")).toBeNull();
  });

  it("marks the dashboard active only on exact '/'", () => {
    const { rerender } = render(<NavLinks currentPath="/sessions" />);
    // /sessions is active, / is not.
    expect(
      screen
        .getByText("nav.dashboard")
        .closest("a")
        ?.getAttribute("aria-current"),
    ).toBeNull();
    rerender(<NavLinks currentPath="/" />);
    expect(
      screen
        .getByText("nav.dashboard")
        .closest("a")
        ?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("marks nested paths active (e.g. /sessions/abc is in /sessions)", () => {
    render(<NavLinks currentPath="/sessions/abc-123" />);
    const link = screen.getByText("nav.sessions").closest("a");
    expect(link?.getAttribute("aria-current")).toBe("page");
  });

  it("renders visible group labels on ≥ sm screens via aria-hidden span", () => {
    const { container } = render(<NavLinks currentPath="/" />);
    const visibleLabels = container.querySelectorAll(
      'span[aria-hidden="true"]',
    );
    // 2 group labels + 1 separator (•) between groups
    expect(visibleLabels.length).toBeGreaterThanOrEqual(3);
  });

  it("Inspect group contains 9 items (Dashboard, Sessions, Usage, Tools, Context, Capabilities, Avatars, Plans, Try pi)", () => {
    const inspectGroup = NAV_GROUPS.find(
      (g) => g.labelKey === "nav.groupInspect",
    )!;
    expect(inspectGroup.items.map((i) => i.labelKey)).toEqual([
      "nav.dashboard",
      "nav.sessions",
      "nav.usage",
      "nav.tools",
      "nav.context",
      "nav.capabilities",
      "nav.avatars",
      "nav.plans",
      "nav.try",
    ]);
  });

  it("Manage group contains 5 items (Packages, Forge, Policy, Compose, Profiles)", () => {
    const manageGroup = NAV_GROUPS.find(
      (g) => g.labelKey === "nav.groupManage",
    )!;
    expect(manageGroup.items.map((i) => i.labelKey)).toEqual([
      "nav.packages",
      "nav.forge",
      "nav.policy",
      "nav.compose",
      "nav.profiles",
    ]);
  });

  it("includes an sr-only group label for screen readers (not visible)", () => {
    const { container } = render(<NavLinks currentPath="/" />);
    const srLabels = container.querySelectorAll("span.sr-only");
    expect(srLabels.length).toBe(2);
    expect(srLabels[0]?.textContent).toBe("nav.groupInspect");
    expect(srLabels[1]?.textContent).toBe("nav.groupManage");
  });
});
