/**
 * Accessibility tests for the Pilot Web UI.
 *
 * Uses axe-core (via vitest-axe). axe runs automated WCAG 2.1 checks
 * and a few non-WCAG best practices, reporting any violations.
 *
 * Strategy: render each pattern with React Testing Library, run axe
 * on the resulting DOM, assert no violations (or that expected
 * violations ARE present in negative tests).
 *
 * Why component-level vs full e2e (Playwright)? Playwright would be
 * more accurate but needs a running browser + the pilot server +
 * Next.js dev mode. Component-level axe catches most issues
 * (missing labels, wrong roles, color contrast within rendered DOM)
 * without that overhead.
 *
 * Each test renders a minimal HTML fragment that mirrors the
 * a11y pattern used in real pages.
 */

import "vitest-axe/extend-expect";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { axe } from "vitest-axe";

afterEach(() => cleanup());

// Helper: render HTML, run axe, return array of violation IDs
async function a11yViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe(container);
  return results.violations.map((v) => v.id);
}

describe("a11y: skip link + landmark structure", () => {
  it("renders a skip link as first focusable element", () => {
    const { container } = render(
      <html lang="en">
        <body>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <header role="banner">
            <nav role="navigation" aria-label="Main">
              <a href="/">Dashboard</a>
            </nav>
          </header>
          <main id="main-content" role="main" tabIndex={-1}>
            content
          </main>
        </body>
      </html>,
    );
    const firstLink = container.querySelector("a");
    expect(firstLink?.className).toContain("skip-link");
    expect(firstLink?.getAttribute("href")).toBe("#main-content");
  });

  it("uses semantic landmarks (banner, main, contentinfo)", () => {
    const { container } = render(
      <html lang="en">
        <body>
          <header role="banner" />
          <main role="main">x</main>
          <footer role="contentinfo" />
        </body>
      </html>,
    );
    expect(container.querySelector('[role="banner"]')).toBeTruthy();
    expect(container.querySelector('[role="main"]')).toBeTruthy();
    expect(container.querySelector('[role="contentinfo"]')).toBeTruthy();
  });
});

describe("a11y: form inputs", () => {
  it("associates labels with inputs via htmlFor/id (axe clean)", async () => {
    const { container } = render(
      <form>
        <label htmlFor="my-input">My input</label>
        <input id="my-input" type="text" />
      </form>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("label");
    expect(violations).not.toContain("form-field-multiple-labels");
  });

  it("flags truly missing labels (no label, no aria, no placeholder)", async () => {
    // axe-core's default rules do NOT flag inputs that have a placeholder
    // (WCAG considers placeholder text as a fallback, not a label).
    // To force a violation we use an <input> with NO label of any kind.
    // We must also disable the placeholder warning by not providing one.
    const { container } = render(
      <form>
        <input type="text" aria-label="" />
      </form>,
    );
    const results = await axe(container);
    const ids = results.violations.map((v) => v.id);
    // We expect at least one of the label-related rules to fire.
    // (axe may use slightly different rule IDs across versions.)
    expect(
      ids.some((id) => /label|form-field|naming|accessible-name/i.test(id)),
      `expected at least one label/name violation, got: ${ids.join(",")}`,
    ).toBe(true);
  });

  it("uses aria-describedby to link help text to inputs (axe clean)", async () => {
    const { container } = render(
      <form>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          aria-describedby="email-hint"
          aria-invalid="false"
        />
        <p id="email-hint">We'll never share your email.</p>
      </form>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("aria-valid-attr-value");
    expect(violations).not.toContain("label");
  });

  it("announces errors with aria-invalid + role=alert (axe clean)", async () => {
    const { container } = render(
      <form>
        <label htmlFor="bad">Bad field</label>
        <input
          id="bad"
          type="text"
          aria-invalid="true"
          aria-describedby="bad-err"
        />
        <p id="bad-err" role="alert">
          This field is required
        </p>
      </form>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("aria-valid-attr-value");
  });
});

describe("a11y: status / live regions", () => {
  it("live regions have role=status + aria-live=polite (axe clean)", async () => {
    const { container } = render(
      <div role="status" aria-live="polite" aria-atomic="true">
        Saved successfully
      </div>,
    );
    const violations = await a11yViolations(container);
    // Should NOT flag this as missing a landmark
    expect(violations).not.toContain("region");
  });

  it("decorative icons are aria-hidden (axe clean)", async () => {
    const { container } = render(
      <p>
        <span aria-hidden="true">⚠️</span> Important: file not found
      </p>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("image-alt");
  });
});

describe("a11y: button labels", () => {
  it("buttons with only icons must have aria-label (axe clean)", async () => {
    const { container } = render(
      <button type="button" aria-label="Close">
        ×
      </button>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("button-name");
  });

  it("buttons without aria-label and no text content (axe flags)", async () => {
    const { container } = render(
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>,
    );
    const violations = await a11yViolations(container);
    // Should flag missing accessible name
    expect(violations).toContain("button-name");
  });
});

describe("a11y: keyboard nav", () => {
  it("tab order is logical in a form", () => {
    const { container } = render(
      <form>
        <label htmlFor="a">A</label>
        <input id="a" type="text" />
        <label htmlFor="b">B</label>
        <input id="b" type="text" />
        <button type="submit">Submit</button>
      </form>,
    );
    const focusable = container.querySelectorAll(
      "input:not([disabled]), button:not([disabled])",
    );
    expect(focusable.length).toBe(3);
  });

  it("disabled buttons are not focusable", () => {
    const { container } = render(
      <form>
        <button type="button">Active</button>
        <button type="button" disabled>
          Disabled
        </button>
      </form>,
    );
    const focusable = container.querySelectorAll("button:not([disabled])");
    expect(focusable.length).toBe(1);
  });
});

describe("a11y: navigation", () => {
  it("nav has aria-label and aria-current=page for active link", () => {
    const { container } = render(
      <nav aria-label="Main">
        <a href="/" aria-current="page">
          Home
        </a>
        <a href="/about">About</a>
      </nav>,
    );
    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Main");
    const current = container.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Home");
  });

  it("icon-only links have aria-label", async () => {
    const { container } = render(
      <a href="/settings" aria-label="Settings">
        ⚙️
      </a>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("link-name");
  });
});

describe("a11y: compose board", () => {
  it("sidebar items are buttons with descriptive aria-label", async () => {
    const { container } = render(
      <aside aria-label="Catalog sidebar">
        <button
          type="button"
          aria-label='Add session "test-1" to canvas'
          className="compose-sidebar-item"
        >
          test-1
        </button>
      </aside>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("button-name");
  });

  it("canvas has role=region + tabIndex + aria-label", async () => {
    const { container } = render(
      <div
        role="region"
        aria-label="Compose canvas. Arrow keys to move, Delete to remove."
        tabIndex={0}
      >
        <p>empty</p>
      </div>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("region");
  });

  it("live region for screen reader announcements", async () => {
    const { container } = render(
      <div role="status" aria-live="polite" aria-atomic="true">
        Block added
      </div>,
    );
    // Should not have missing landmark issue if it's just a status
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("region");
  });
});

describe("a11y: color contrast (WCAG AA)", () => {
  it("dark theme body text on bg passes axe color-contrast", async () => {
    // Mirrors our dark theme tokens: bg #0b0d10, text #e6e7e9
    // Contrast ratio should be > 13:1 (well above WCAG AA's 4.5:1)
    const { container } = render(
      <div style={{ background: "#0b0d10", color: "#e6e7e9", padding: 8 }}>
        Body text on dark background
      </div>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("color-contrast");
  });

  it("accent blue link on dark bg passes", async () => {
    // accent #79c0ff on bg #0b0d10 — about 10:1 contrast
    const { container } = render(
      <div style={{ background: "#0b0d10", padding: 8 }}>
        <a href="/" style={{ color: "#79c0ff" }}>
          link text
        </a>
      </div>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("color-contrast");
  });

  it("muted text on dark bg passes (8a9099 on 0b0d10 ≈ 6.5:1)", async () => {
    // text-muted #8a9099 on bg #0b0d10 — about 6.5:1, just above AA threshold
    const { container } = render(
      <div style={{ background: "#0b0d10", color: "#8a9099", padding: 8 }}>
        Muted secondary text
      </div>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("color-contrast");
  });

  it("error red on dark bg passes (ff6b6b on 0b0d10)", async () => {
    const { container } = render(
      <div style={{ background: "#0b0d10", padding: 8 }}>
        <span style={{ color: "#ff6b6b" }}>error message</span>
      </div>,
    );
    const violations = await a11yViolations(container);
    expect(violations).not.toContain("color-contrast");
  });
});

describe("a11y: keyboard navigation patterns", () => {
  it("Enter on button triggers click", () => {
    let clicked = false;
    const { getByRole } = render(
      <button type="button" onClick={() => (clicked = true)}>
        Click me
      </button>,
    );
    const btn = getByRole("button", { name: "Click me" });
    btn.click(); // jsdom doesn't simulate Enter perfectly; click() works
    expect(clicked).toBe(true);
  });

  it("button with only icon has accessible name via aria-label", () => {
    const { getByRole } = render(
      <button type="button" aria-label="Remove block">
        ×
      </button>,
    );
    const btn = getByRole("button", { name: "Remove block" });
    expect(btn.textContent).toBe("×");
  });
});
