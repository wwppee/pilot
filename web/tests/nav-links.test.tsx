/**
 * nav-links.test.tsx — coverage for the v0.4.14 grouped nav.
 *
 * Asserts that:
 *   - Three groups (Inspect + Manage + Learn) render with
 *     `role="group"` and `aria-label`
 *   - All 16 items still appear (no routes lost during the refactor)
 *   - Active link gets `aria-current="page"`
 *   - sr-only + visible group labels coexist
 *   - Every nav item has a tooltip with an i18n'd hint
 *
 * v0.5.21: NavLinks was rewritten as a Server Component that takes
 * `locale` as a prop. We pass `"en"` in these tests and assert
 * against the translated English labels. The zh test below uses
 * `"zh"` and asserts against the Chinese labels — guarantees the
 * hint + label keys are wired through correctly in both locales.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLinks, NAV_GROUPS } from "../src/components/NavLinks";

describe("NavLinks (v0.5.21 server component, en)", () => {
  it("renders three role=group containers with aria-labels", () => {
    const { container } = render(<NavLinks currentPath="/" locale="en" />);
    const groups = container.querySelectorAll('[role="group"]');
    expect(groups.length).toBe(3);

    const inspect = container.querySelector(
      '[role="group"][aria-label="Inspect"]',
    );
    const manage = container.querySelector(
      '[role="group"][aria-label="Manage"]',
    );
    const learn = container.querySelector('[role="group"][aria-label="Learn"]');
    expect(inspect).not.toBeNull();
    expect(manage).not.toBeNull();
    expect(learn).not.toBeNull();
  });

  it("includes all 17 nav items (10 Inspect + 6 Manage + 1 Learn)", () => {
    // v0.7.0: Workflows added → 16 (9+6+1).
    // v0.7.3 (B2): Observability added to Inspect → 17 (10+6+1).
    const totalItems = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(totalItems).toBe(17);
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain("/");
    expect(allHrefs).toContain("/forge");
    expect(allHrefs).toContain("/capabilities");
    expect(allHrefs).toContain("/profiles");
    expect(allHrefs).toContain("/workflows");
    expect(allHrefs).toContain("/avatars");
    expect(allHrefs).toContain("/plans");
    expect(allHrefs).toContain("/help");
    expect(allHrefs).toContain("/observability");
  });

  it("marks the active link with aria-current=page", () => {
    render(<NavLinks currentPath="/profiles" locale="en" />);
    // 'Profiles' is the en label for nav.profiles.
    const active = screen.getByText("Profiles").closest("a");
    expect(active?.getAttribute("aria-current")).toBe("page");

    const dashboard = screen.getByText("Dashboard").closest("a");
    expect(dashboard?.getAttribute("aria-current")).toBeNull();
  });

  it("marks the dashboard active only on exact '/'", () => {
    const { rerender } = render(
      <NavLinks currentPath="/sessions" locale="en" />,
    );
    expect(
      screen.getByText("Dashboard").closest("a")?.getAttribute("aria-current"),
    ).toBeNull();
    rerender(<NavLinks currentPath="/" locale="en" />);
    expect(
      screen.getByText("Dashboard").closest("a")?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("marks nested paths active (e.g. /sessions/abc is in /sessions)", () => {
    render(<NavLinks currentPath="/sessions/abc-123" locale="en" />);
    const link = screen.getByText("Sessions").closest("a");
    expect(link?.getAttribute("aria-current")).toBe("page");
  });

  it("renders a tooltip for every nav item, with i18n'd hint", () => {
    const { container } = render(<NavLinks currentPath="/" locale="en" />);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    // v0.7.0: 16 items (added Workflows). v0.7.3 (B2): 17
    // items (added Observability). Bumping this number is
    // the canonical signal that a nav item was added — it
    // forces the test to be re-baselined rather than
    // silently passing.
    expect(tooltips.length).toBe(17);
    // Spot-check: every tooltip body is non-empty (not a raw key).
    for (const t of tooltips) {
      const text = t.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/^nav\.hint\./); // raw key would fail
    }
  });

  it("Inspect group contains 9 items in the order Dashboard → Plans", () => {
    const inspectGroup = NAV_GROUPS.find(
      (g) => g.labelKey === "nav.groupInspect",
    )!;
    expect(inspectGroup.items.map((i) => i.labelKey)).toEqual([
      "nav.dashboard",
      "nav.try",
      "nav.sessions",
      "nav.usage",
      "nav.tools",
      "nav.context",
      "nav.capabilities",
      "nav.avatars",
      "nav.plans",
    ]);
  });

  it("Manage group contains 7 items (Packages, Forge, Policy, Compose, Profiles, Workflows, Observability)", () => {
    // v0.7.0 added Workflows. v0.7.3 (B2) added
    // Observability. Order matters here — the test pins
    // the exact sequence so an accidental reorder
    // surfaces as a failure.
    const manageGroup = NAV_GROUPS.find(
      (g) => g.labelKey === "nav.groupManage",
    )!;
    expect(manageGroup.items.map((i) => i.labelKey)).toEqual([
      "nav.packages",
      "nav.forge",
      "nav.policy",
      "nav.compose",
      "nav.profiles",
      "nav.workflows",
      "nav.observability",
    ]);
  });

  it("Learn group contains Help", () => {
    const learnGroup = NAV_GROUPS.find((g) => g.labelKey === "nav.groupLearn")!;
    expect(learnGroup.items.map((i) => i.labelKey)).toEqual(["nav.help"]);
  });
});

describe("NavLinks (v0.5.21 server component, zh)", () => {
  it("renders translated labels in zh", () => {
    render(<NavLinks currentPath="/" locale="zh" />);
    // zh labels per dict.zh.ts.
    expect(screen.getByText("概览")).toBeTruthy(); // nav.dashboard
    expect(screen.getByText("试玩 pi")).toBeTruthy(); // nav.try
    expect(screen.getByText("会话")).toBeTruthy(); // nav.sessions
    expect(screen.getByText("帮助")).toBeTruthy(); // nav.help
  });

  it("renders zh tooltips (not raw keys)", () => {
    const { container } = render(<NavLinks currentPath="/" locale="zh" />);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    // v0.7.0: 16 items. v0.7.3 (B2): 17 items. See the en
    // test for why this is hard-coded rather than computed
    // from NAV_GROUPS.
    expect(tooltips.length).toBe(17);
    for (const t of tooltips) {
      const text = t.textContent ?? "";
      // Every hint is non-empty Chinese / English phrase, not a key.
      expect(text).not.toMatch(/^nav\.hint\./);
    }
    // At least one tooltip should contain Chinese characters.
    const allText = Array.from(tooltips)
      .map((t) => t.textContent ?? "")
      .join(" ");
    expect(allText).toMatch(/[\u4e00-\u9fff]/);
  });
});
