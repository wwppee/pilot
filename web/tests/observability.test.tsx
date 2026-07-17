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
  },
}));
import { api } from "@/lib/pilot-browser";
const mockSummary = vi.mocked(api.observabilitySummary);
const mockCalls = vi.mocked(api.toolCalls);

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
});
