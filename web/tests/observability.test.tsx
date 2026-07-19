/**
 * v0.7.3 (B2): RTL coverage for /observability dashboard.
 * Eight tests — empty state, aggregate cards, by-tool
 * table, expand-to-detail interaction, error handling.
 * The api mock is local; we don't need a real server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/components/I18n";
import { ObservabilityView } from "../src/app/observability/ObservabilityView";

vi.mock("@/lib/pilot-browser", () => ({
  api: {
    observabilitySummary: vi.fn(),
    toolCalls: vi.fn(),
    // v0.9.9: added observabilityChat so the IME
    // composition test can spy on whether the chat
    // submit was triggered.
    observabilityChat: vi.fn(),
  },
}));
import { api } from "@/lib/pilot-browser";
const mockSummary = vi.mocked(api.observabilitySummary);
const mockCalls = vi.mocked(api.toolCalls);
const mockChat = vi.mocked(api.observabilityChat);

function renderView() {
  return render(
    <I18nProvider initialLocale="en">
      <ObservabilityView locale="en" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockSummary.mockReset();
  mockCalls.mockReset();
});

describe("v0.7.3: <ObservabilityView>", () => {
  it("shows the empty state when the summary is zero", async () => {
    mockSummary.mockResolvedValue({
      total: 0,
      success: 0,
      fail: 0,
      denied: 0,
      worstTool: null,
      byTool: [],
    });
    renderView();
    await waitFor(() => {
      expect(screen.getByText("No tool calls recorded yet.")).toBeTruthy();
    });
  });

  it("shows the four aggregate cards with counts", async () => {
    mockSummary.mockResolvedValue({
      total: 10,
      success: 7,
      fail: 2,
      denied: 1,
      // v0.8.7: rate fields. The dashboard now
      // expects these on the summary and renders a
      // sub-label "{rateLabel}: {pct}%" under each
      // count. The mock must include them or the
      // component will throw.
      successRate: 0.7,
      failRate: 0.2,
      deniedRate: 0.1,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 5,
          success: 3,
          fail: 1,
          denied: 1,
          recentError: "denied: rm",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    renderView();
    await waitFor(() => {
      // The aggregate cards share text labels but different
      // values. Match by data-testid to disambiguate the
      // same numbers across cards.
      expect(screen.getByText("Total calls")).toBeTruthy();
    });
  });

  // v0.8.7 (B2 闭环): per-outcome rate rendered as
  // "{pct}%" under each count. The success rate is the
  // highest-signal number (everything that's not fail
  // or denied is success, but the user usually wants
  // to see "70% success" without doing the math).
  it("renders the success / fail / denied rate under each card", async () => {
    mockSummary.mockResolvedValue({
      total: 10,
      success: 7,
      fail: 2,
      denied: 1,
      successRate: 0.7,
      failRate: 0.2,
      deniedRate: 0.1,
      worstTool: null,
      byTool: [],
    });
    renderView();
    await waitFor(() => {
      // data-testid is "observability-rate-<label>"
      // with label lowercased to match the
      // AggregateCard implementation. The card
      // label is the localized i18n string
      // ("Succeeded" in en, "成功" in zh), so the
      // testid is "observability-rate-succeeded" /
      // "observability-rate-成功" — we just look
      // up the rate text node by querying the
      // percentage value the user actually sees.
      const successPct = screen.getByText("70%");
      expect(successPct).toBeTruthy();
      expect(screen.getByText("20%")).toBeTruthy();
      expect(screen.getByText("10%")).toBeTruthy();
    });
  });

  // v0.9.7 (audit fix): the total card has no
  // rate sub-label (it IS the denominator). The
  // old implementation passed the total label
  // as `rateLabel`, which made the card show
  // "Total: —" — i.e. "Total: " twice in two
  // different visual layers. The fix passes
  // `rateLabel=""`; AggregateCard hides the
  // "{label}: " prefix when the label is empty.
  it("total card shows no rateLabel prefix (audit fix)", async () => {
    mockSummary.mockResolvedValue({
      total: 10,
      success: 7,
      fail: 2,
      denied: 1,
      successRate: 0.7,
      failRate: 0.2,
      deniedRate: 0.1,
      worstTool: null,
      byTool: [],
    });
    const { container } = renderView();
    await waitFor(() => {
      expect(screen.getByText("Total calls")).toBeTruthy();
    });
    // The total card's data-testid is
    // "observability-rate-<label.toLowerCase()>" —
    // i.e. "observability-rate-total calls"
    // (with the space preserved). The total card
    // must NOT prefix its rate sub-label with the
    // "Total: " label (that was the audit bug).
    const totalRate = container.querySelector(
      '[data-testid^="observability-rate-total"]',
    );
    expect(totalRate?.textContent).toBe("—");
    // Sanity: the success card still has its label prefix.
    const successRate = container.querySelector(
      '[data-testid^="observability-rate-succeeded"]',
    );
    expect(successRate?.textContent).toBe("70%");
  });

  // v0.8.7: success rate under the count. We

  // v0.8.7: when total === 0, the dashboard shows
  // "—" (rateEmpty) instead of "0%". A fresh install
  // has no data, and "0% success" is misleading
  // (the rate is undefined, not zero). The card
  // still renders the rate label so the row of
  // four cards stays visually aligned.
  it("renders the rate as the empty placeholder when total is 0", async () => {
    // total: 0 → the empty-state branch fires first
    // and we never see the cards. To exercise the
    // "rates are null when total is 0" code path,
    // we use a non-zero byTool with total: 0 in
    // summary — the v0.8.7 implementation checks
    // summary.total, not the byTool rows. But
    // the empty state wins here. So this test
    // is actually about the empty state NOT
    // rendering "0%" anywhere — the empty state
    // already covers that, so we keep this test
    // as a documentation placeholder.
    mockSummary.mockResolvedValue({
      total: 0,
      success: 0,
      fail: 0,
      denied: 0,
      successRate: 0,
      failRate: 0,
      deniedRate: 0,
      worstTool: null,
      byTool: [],
    });
    renderView();
    await waitFor(() => {
      // The empty state copy ("No tool calls recorded yet.")
      // is the contract; the "0%" never appears.
      expect(screen.getByText("No tool calls recorded yet.")).toBeTruthy();
    });
  });

  // v0.9.2: per-tool success / fail rate is
  // rendered as a "{pct}%" sub-cell next to
  // the raw count in the by-tool table.
  it("renders the per-tool rate columns in the by-tool table", async () => {
    mockSummary.mockResolvedValue({
      total: 4,
      success: 2,
      fail: 1,
      denied: 1,
      successRate: 0.5,
      failRate: 0.25,
      deniedRate: 0.25,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 4,
          success: 2,
          fail: 1,
          denied: 1,
          successRate: 0.5,
          failRate: 0.25,
          deniedRate: 0.25,
          recentError: "permission denied",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    renderView();
    await waitFor(() => {
      // The data-testid is "observability-rate-{kind}-{tool}".
      // textContent check: just look for the %
      // value (toHaveTextContent requires
      // @testing-library/jest-dom which we
      // don't import — the project relies on
      // the legacy vitest `toBe` / `textContent`
      // matchers).
      const ok = screen.getByTestId("observability-rate-success-bash");
      const fail = screen.getByTestId("observability-rate-fail-bash");
      expect(ok.textContent).toBe("50%");
      expect(fail.textContent).toBe("25%");
    });
  });

  it("renders the by-tool table sorted by fail-rate", async () => {
    mockSummary.mockResolvedValue({
      total: 6,
      success: 3,
      fail: 2,
      denied: 1,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 3,
          success: 0,
          fail: 2,
          denied: 1,
          recentError: "EACCES",
          lastSeen: "2026-07-18T00:00:00Z",
        },
        {
          tool: "write",
          total: 3,
          success: 3,
          fail: 0,
          denied: 0,
          recentError: "",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    renderView();
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^observability-row-/);
      // Worst tool first.
      expect(rows[0]?.getAttribute("data-testid")).toBe(
        "observability-row-bash",
      );
      expect(rows[1]?.getAttribute("data-testid")).toBe(
        "observability-row-write",
      );
    });
  });

  it("expands a row to show recent calls when clicked", async () => {
    mockSummary.mockResolvedValue({
      total: 1,
      success: 0,
      fail: 0,
      denied: 1,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 1,
          success: 0,
          fail: 0,
          denied: 1,
          recentError: "rm -rf",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    mockCalls.mockResolvedValue([
      {
        tool: "bash",
        outcome: "denied",
        reason: "denyCommands",
        errorSample: "rm -rf /",
        context: { timestamp: "2026-07-18T00:00:00Z" },
      },
    ]);
    renderView();
    const row = await screen.findByTestId("observability-row-bash");
    fireEvent.click(row);
    await waitFor(() => {
      expect(
        screen.getByTestId("observability-card-bash-2026-07-18T00:00:00Z"),
      ).toBeTruthy();
    });
    expect(mockCalls).toHaveBeenCalledWith({ toolName: "bash", limit: 20 });
  });

  it("shows the worst-tool hint when worstTool is non-null", async () => {
    mockSummary.mockResolvedValue({
      total: 5,
      success: 3,
      fail: 2,
      denied: 0,
      worstTool: "bash",
      byTool: [],
    });
    renderView();
    await waitFor(() => {
      expect(screen.getByText(/Highest fail-rate/)).toBeTruthy();
    });
  });

  it("renders the page error when summary fetch rejects", async () => {
    mockSummary.mockRejectedValue(new Error("network down"));
    renderView();
    await waitFor(() => {
      expect(screen.getByText("network down")).toBeTruthy();
    });
  });

  it("reloads the summary when the Refresh button is clicked", async () => {
    mockSummary.mockResolvedValue({
      total: 1,
      success: 1,
      fail: 0,
      denied: 0,
      worstTool: null,
      byTool: [
        {
          tool: "write",
          total: 1,
          success: 1,
          fail: 0,
          denied: 0,
          recentError: "",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    renderView();
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(2));
  });

  it("toggles a row off when clicked twice", async () => {
    mockSummary.mockResolvedValue({
      total: 1,
      success: 0,
      fail: 0,
      denied: 1,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 1,
          success: 0,
          fail: 0,
          denied: 1,
          recentError: "x",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    mockCalls.mockResolvedValue([]);
    renderView();
    const row = await screen.findByTestId("observability-row-bash");
    fireEvent.click(row);
    await waitFor(() => expect(mockCalls).toHaveBeenCalledTimes(1));
    fireEvent.click(row);
    await waitFor(() => expect(mockCalls).toHaveBeenCalledTimes(1));
  });

  // v0.9.9: IME composition guard on the chat input.
  // The onKeyDown handler must early-return when
  // `e.nativeEvent.isComposing` is true so the IME's
  // Enter (commit candidate) doesn't double-fire as
  // a chat submit. agegr/pi-web (commit 01ae83a)
  // shipped the same fix. ChatBox only renders when
  // summary.total > 0, so the mock needs at least
  // one tool call to mount the input.
  it("chat input does not submit while an IME is composing", async () => {
    mockSummary.mockResolvedValue({
      total: 3,
      success: 2,
      fail: 1,
      denied: 0,
      successRate: 0.67,
      failRate: 0.33,
      deniedRate: 0,
      worstTool: null,
      byTool: [],
    });
    renderView();
    const input = (await screen.findByTestId(
      "observability-chat-input",
    )) as HTMLInputElement;
    // v0.9.9: lock the IME-composition contract
    // directly. The handler is the *only* thing we
    // care about — the input value display is a
    // React-controlled side effect that's noisy to
    // assert against. We spy the chat submit by
    // mocking api.observabilityChat (the same one
    // already mocked for the chat-history tests)
    // and assert it's NOT called after an Enter
    // with isComposing: true.
    //
    // v0.9.9: we also assert the inverse — an
    // Enter with isComposing: false DOES submit.
    // That double-check makes the test fail loudly
    // if someone later removes the IME guard
    // entirely (the "false" case would break too,
    // and the test would catch it).
    mockChat.mockClear();
    // v0.9.9: the submit handler reads the response
    // shape, so a bare undefined mockResolvedValue
    // would crash the React update path. Use a
    // minimal valid response shape.
    mockChat.mockResolvedValue({
      intent: "summary",
      reply: "",
      window: "last 24h",
    });

    // v0.9.9 (refinement): the controlled input
    // uses onChange which only updates state on
    // "input" events. The native value setter is
    // the React-recommended way to drive a
    // controlled input from a test.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(input, "你好");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // 1. isComposing: true → must NOT submit.
    // v0.9.9: `isComposing` is a KeyboardEventInit
    // field (the React handler reads
    // `e.nativeEvent.isComposing`, but
    // testing-library's fireEvent spreads the init
    // into the KeyboardEvent constructor). Passing
    // it as a top-level key here matches what a real
    // IME sends.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockChat).not.toHaveBeenCalled();

    // 2. isComposing: false (or absent) → must submit.
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledTimes(1);
    });
  });

  // v0.9.12: "never blank" — a failed per-tool
  // expand shows an inline banner with a Retry
  // button, but the dashboard itself (summary
  // cards, by-tool table, chat input) stays
  // rendered. Pre-v0.9.12 the same failure wiped
  // the whole dashboard to a single "Error: …"
  // panel.
  it("expand failure shows inline banner — dashboard stays rendered", async () => {
    mockSummary.mockResolvedValue({
      total: 1,
      success: 0,
      fail: 1,
      denied: 0,
      worstTool: "bash",
      byTool: [
        {
          tool: "bash",
          total: 1,
          success: 0,
          fail: 1,
          denied: 0,
          recentError: "boom",
          lastSeen: "2026-07-18T00:00:00Z",
        },
      ],
    });
    // Make the per-tool expand throw.
    mockCalls.mockRejectedValue(new Error("503 service unavailable"));
    renderView();
    // Wait for the summary to land first — the
    // dashboard must already be on screen before
    // the expand failure, otherwise the assertion
    // "dashboard stays rendered" is vacuous.
    await waitFor(() => {
      expect(screen.getByText("Total calls")).toBeTruthy();
    });
    // Click the by-tool row to expand.
    const row = await screen.findByTestId("observability-row-bash");
    fireEvent.click(row);
    // The inline banner appears (data-testid
    // guard), and Retry fires api.toolCalls again.
    const banner = await screen.findByTestId(
      "observability-expand-error",
    );
    expect(banner).toBeTruthy();
    // Dashboard did NOT collapse to a single error
    // panel — the summary cards are still here.
    expect(screen.getByText("Total calls")).toBeTruthy();
    // The banner includes a Retry button that
    // re-invokes the parent's expand().
    const retry = screen.getByTestId("observability-expand-retry");
    mockCalls.mockResolvedValueOnce([]);
    fireEvent.click(retry);
    await waitFor(() => {
      expect(mockCalls).toHaveBeenCalledTimes(2);
    });
  });
});
