/**
 * nav-links.test.tsx — coverage for the v1.0.1 7-module nav.
 *
 * v0.5.x → v0.9.x: 3 groups (Inspect / Manage / Learn) + 18 entries.
 * v1.0.1: 7 flat items (Hub / Workflow / Policy & Security / Insight
 *         / Sessions / Context / Settings).
 *
 * The 3-group layout is gone — with only 7 items, group labels were
 * visual noise. The legacy test asserted `role="group"` containers
 * and group-item counts; the new test asserts the flat list, the
 * order, and the active-link behaviour that actually matters to
 * keyboard / screen-reader users.
 *
 * What we still lock:
 *   - 7 items render in the documented order
 *   - Every item has a translated label (not a raw key)
 *   - Every item has a tooltip with a non-empty i18n'd hint
 *   - Active link gets `aria-current="page"`
 *   - Prefix matching: `/sessions/abc` highlights the `/sessions` link
 *   - Special case: there's no root `/` link in v1.0.1 (the brand
 *     logo in <header> handles that), so the "exact /" case from
 *     the legacy test is gone
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLinks, NAV_ITEMS } from "../src/components/NavLinks";

describe("NavLinks (v1.0.1 server component, en)", () => {
  it("renders the 7 module items in the documented order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/hub",
      "/workflow",
      "/policy",
      "/insight",
      "/sessions",
      "/context",
      "/settings",
    ]);
  });

  it("renders 7 nav items, no group containers", () => {
    const { container } = render(<NavLinks currentPath="/hub" locale="en" />);
    // No `role="group"` containers — the v1.0.1 nav is flat.
    expect(container.querySelectorAll('[role="group"]').length).toBe(0);
    // 7 nav <a> elements, one per module.
    const links = container.querySelectorAll("nav a");
    expect(links.length).toBe(7);
  });

  it("uses the new v1.0.1 label keys (no legacy nav.dashboard etc.)", () => {
    // Lock the exact labelKey set so adding a new module forces
    // a test re-baseline (same idea as the legacy "bump 16 → 17
    // → 18" comment in v0.7.x).
    expect(NAV_ITEMS.map((i) => i.labelKey).sort()).toEqual([
      "nav.context",
      "nav.hub",
      "nav.insight",
      "nav.policySafe",
      "nav.sessions",
      "nav.settings",
      "nav.workflow",
    ]);
  });

  it("marks the active link with aria-current=page", () => {
    render(<NavLinks currentPath="/policy" locale="en" />);
    const active = screen.getByText("Policy & Security").closest("a");
    expect(active?.getAttribute("aria-current")).toBe("page");

    const hub = screen.getByText("Hub").closest("a");
    expect(hub?.getAttribute("aria-current")).toBeNull();
  });

  it("marks nested paths active (e.g. /sessions/abc is in /sessions)", () => {
    render(<NavLinks currentPath="/sessions/abc-123" locale="en" />);
    const link = screen.getByText("Sessions").closest("a");
    expect(link?.getAttribute("aria-current")).toBe("page");
  });

  it("renders a tooltip for every nav item, with i18n'd hint", () => {
    const { container } = render(<NavLinks currentPath="/hub" locale="en" />);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    // 7 tooltips, one per module. Hard-coded so adding an
    // 8th item forces a re-baseline.
    expect(tooltips.length).toBe(7);
    for (const t of tooltips) {
      const text = t.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/^nav\.hint\./); // raw key would fail
    }
  });
});

describe("NavLinks (v1.0.1 server component, zh)", () => {
  it("renders translated labels in zh", () => {
    render(<NavLinks currentPath="/hub" locale="zh" />);
    // zh labels per dict.zh.ts.
    expect(screen.getByText("能力中心")).toBeTruthy(); // nav.hub
    expect(screen.getByText("工作流")).toBeTruthy(); // nav.workflow
    expect(screen.getByText("策略安全")).toBeTruthy(); // nav.policySafe
    expect(screen.getByText("洞察")).toBeTruthy(); // nav.insight
    expect(screen.getByText("会话")).toBeTruthy(); // nav.sessions
    expect(screen.getByText("上下文")).toBeTruthy(); // nav.context
    expect(screen.getByText("设置")).toBeTruthy(); // nav.settings
  });

  it("renders zh tooltips (not raw keys)", () => {
    const { container } = render(<NavLinks currentPath="/hub" locale="zh" />);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    expect(tooltips.length).toBe(7);
    for (const t of tooltips) {
      const text = t.textContent ?? "";
      expect(text).not.toMatch(/^nav\.hint\./);
    }
    const allText = Array.from(tooltips)
      .map((t) => t.textContent ?? "")
      .join(" ");
    // At least one tooltip should contain Chinese characters.
    expect(allText).toMatch(/[\u4e00-\u9fff]/);
  });
});
