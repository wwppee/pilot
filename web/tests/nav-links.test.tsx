/**
 * nav-links.test.tsx — coverage for the v0.4.14 grouped nav.
 *
 * Asserts that:
 *   - Three groups (Inspect + Manage + Learn) render with
 *     `role="group"` and `aria-label`
 *   - All 15 items still appear (no routes lost during the refactor)
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

  it("includes all 15 nav items (9 Inspect + 5 Manage + 1 Learn)", () => {
    const totalItems = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(totalItems).toBe(15);
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain("/");
    expect(allHrefs).toContain("/forge");
    expect(allHrefs).toContain("/capabilities");
    expect(allHrefs).toContain("/profiles");
    expect(allHrefs).toContain("/avatars");
    expect(allHrefs).toContain("/plans");
    expect(allHrefs).toContain("/help");
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
    expect(tooltips.length).toBe(15);
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
    expect(tooltips.length).toBe(15);
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
