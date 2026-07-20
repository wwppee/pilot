/**
 * language-switcher.test.tsx — coverage for the v0.9.14 visibility fix.
 *
 * v0.9.14: the inactive language button used to render with
 * `background: transparent` + `color: var(--text-muted)`, which was
 * effectively invisible on the dark theme. Users saw only the active
 * button and assumed there was nothing to switch to. The fix gives
 * the inactive button a subtle text-tinted background and uses
 * `--text` (not `--text-muted`) for the foreground.
 *
 * These tests assert:
 *   1. Both EN and 中 buttons render (no missing option).
 *   2. The active button has the accent background; the inactive
 *      button does NOT use `transparent` (regression: the
 *      visibility bug returns if someone reverts the inline style).
 *   3. The inactive button foreground is `--text`, not `--text-muted`
 *      (same regression net).
 *   4. Clicking the inactive button calls `setLocale`, which writes
 *      `pilot-locale` to localStorage (the I18nProvider's persistence
 *      hook — easiest behavior to assert without mocking the
 *      context internals).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/components/I18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function renderSwitcher(initialLocale: "en" | "zh" = "en") {
  // localStorage is polyfilled by setup.ts so writeStoredLocale
  // works in the jsdom environment.
  window.localStorage.clear();
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <LanguageSwitcher />
    </I18nProvider>,
  );
}

describe("LanguageSwitcher (v0.9.14 visibility fix)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders both EN and 中 buttons (no missing option)", () => {
    renderSwitcher();
    expect(screen.getByRole("button", { name: "EN" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "中" })).toBeTruthy();
  });

  it("active button uses accent background; inactive does not use transparent (regression: v0.9.14 dark-theme invisibility)", () => {
    renderSwitcher("en");
    const en = screen.getByRole("button", { name: "EN" });
    const zh = screen.getByRole("button", { name: "中" });

    const enStyle = (en as HTMLElement).style;
    const zhStyle = (zh as HTMLElement).style;

    // Active EN: accent background, dark text.
    expect(enStyle.background).toBe("var(--accent)");
    expect(enStyle.color).toBe("var(--bg)");

    // Inactive 中: NOT transparent (the v0.9.14 fix replaces
    // `transparent` with a subtle text-tinted color-mix). The
    // exact string is asserted so a regression to "transparent"
    // would be caught.
    expect(zhStyle.background).not.toBe("transparent");
    expect(zhStyle.background).toContain("var(--text)");
    expect(zhStyle.background).toContain("transparent");
    // Foreground: full --text, not the muted variant.
    expect(zhStyle.color).toBe("var(--text)");
    expect(zhStyle.color).not.toBe("var(--text-muted)");
  });

  it("clicking the inactive button writes pilot-locale to localStorage (setLocale side effect)", () => {
    renderSwitcher("en");
    const zh = screen.getByRole("button", { name: "中" });
    fireEvent.click(zh);
    // The I18nProvider's setLocale persists the choice via
    // writeStoredLocale. We assert the localStorage side
    // effect rather than the React state because state
    // assertions would require a render-on-change harness.
    expect(window.localStorage.getItem("pilot-locale")).toBe("zh");
  });

  it("inactive button has aria-pressed=false and active has aria-pressed=true", () => {
    renderSwitcher("en");
    const en = screen.getByRole("button", { name: "EN" });
    const zh = screen.getByRole("button", { name: "中" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
    expect(zh.getAttribute("aria-pressed")).toBe("false");
  });

  it("in zh initial locale, the active/inactive styling flips", () => {
    renderSwitcher("zh");
    const en = screen.getByRole("button", { name: "EN" });
    const zh = screen.getByRole("button", { name: "中" });

    // Now 中 is active, EN is inactive.
    expect((zh as HTMLElement).style.background).toBe("var(--accent)");
    expect((zh as HTMLElement).style.color).toBe("var(--bg)");
    expect((en as HTMLElement).style.background).not.toBe("transparent");
    expect((en as HTMLElement).style.color).toBe("var(--text)");
  });
});
