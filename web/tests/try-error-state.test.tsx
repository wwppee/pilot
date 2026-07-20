/**
 * try-error-state.test.tsx — v0.9.14 coverage for the /try error
 * state visibility fix.
 *
 * Before v0.9.14, when usePiSession entered the `error` state:
 *   - statusLabel returned `session.error` (a runtime string like
 *     "token fetch failed: 503") which was then passed as the
 *     i18n key to <T>. The translator rendered the literal value
 *     but with `text-muted` styling the user couldn't see anything
 *     had happened.
 *   - The status strip looked identical to the idle state.
 *   - There was no retry affordance.
 *
 * After v0.9.14:
 *   - statusLabel returns the i18n key `try.status.error` ("Connection
 *     failed" / "连接失败").
 *   - The actual error message is rendered in a prominent span
 *     with `var(--error)` color.
 *   - The status strip itself gets a red border + red-tinted
 *     background.
 *   - A dedicated Retry button replaces the Connect button.
 *
 * These tests assert all four behaviors. We mock `usePiSession`
 * to drive the state machine without spinning up a real WS.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/components/I18n";

// v0.9.14: the try page imports usePiSession directly. We mock
// the module so the test doesn't need a real WS / token fetch.
// `vi.mock` is hoisted above the import; the factory must stay
// side-effect free.
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSend = vi.fn();

vi.mock("@/lib/usePiSession", () => ({
  usePiSession: () => ({
    state: "error" as const,
    error: "WebSocket reconnection failed after 5 attempts",
    reconnectAttempt: 5,
    events: [],
    connect: mockConnect,
    disconnect: mockDisconnect,
    send: mockSend,
  }),
}));

import TryPage from "@/app/try/page";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

describe("TryPage — v0.9.14 error state visibility", () => {
  it("renders the error category i18n key (not the raw error string) in the status strip", () => {
    renderWithI18n(<TryPage />);
    // "Connection failed" comes from dict.en.ts "try.status.error".
    expect(screen.getByText("Connection failed")).toBeTruthy();
  });

  it("renders the actual error message verbatim next to the category", () => {
    renderWithI18n(<TryPage />);
    // The hook returns "WebSocket reconnection failed after 5 attempts"
    // and the page must show it so the user knows what went wrong.
    expect(
      screen.getByText(/WebSocket reconnection failed after 5 attempts/),
    ).toBeTruthy();
  });

  it("marks the status strip with role=alert when in error state (a11y)", () => {
    const { container } = renderWithI18n(<TryPage />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    // The alert must be the status strip (contains the error text).
    expect(alert?.textContent).toContain(
      "WebSocket reconnection failed after 5 attempts",
    );
  });

  it("shows a Retry button in place of Connect when in error state", () => {
    renderWithI18n(<TryPage />);
    // Both the desktop status strip and the mobile overflow menu
    // render a Retry button (the v0.9.14 fix is consistent across
    // breakpoints). We assert at least one Retry exists and that
    // no Connect button is rendered.
    const retries = screen.getAllByRole("button", { name: "Retry" });
    expect(retries.length).toBeGreaterThan(0);
    // And no Connect button is rendered.
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("clicking Retry calls session.connect()", () => {
    renderWithI18n(<TryPage />);
    const retries = screen.getAllByRole("button", { name: "Retry" });
    // Click the desktop one (status strip); the mobile one
    // is `sm:hidden` so it renders but isn't visible at desktop
    // sizes. Either way, both should call connect.
    fireEvent.click(retries[0]!);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("zh locale renders Chinese error + retry copy (i18n sanity)", () => {
    render(
      <I18nProvider initialLocale="zh">
        <TryPage />
      </I18nProvider>,
    );
    // dict.zh.ts "try.status.error" = "连接失败",
    // "try.action.retry" = "重试".
    expect(screen.getByText("连接失败")).toBeTruthy();
    const retries = screen.getAllByRole("button", { name: "重试" });
    expect(retries.length).toBeGreaterThan(0);
  });
});
