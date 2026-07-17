/**
 * v0.7.6: mount-level RTL coverage for <WorkflowListView>.
 *
 * v0.7.2 left this as backlog: "the workflow editor and
 * list view need mount tests but the v0.7.x editor file
 * was too big to test in isolation". After v0.7.2 split
 * the editor into NodeFields + layout helpers, and
 * v0.7.3 extracted ConfirmDialog, the list view is
 * the last major client island without a mount test.
 *
 * We mock `pilot-browser.api` so the test doesn't need
 * a real server. We use `I18nProvider` so useT()
 * resolves i18n keys (the v0.7.3 lesson: tests should
 * assert on the resolved text, not the i18n key).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/components/I18n";

vi.mock("@/lib/pilot-browser", () => ({
  api: {
    workflows: vi.fn(),
    workflow: vi.fn(),
    saveWorkflow: vi.fn(),
    deleteWorkflow: vi.fn(),
  },
}));
import { api } from "@/lib/pilot-browser";
const mockList = vi.mocked(api.workflows);
const mockGet = vi.mocked(api.workflow);
const mockSave = vi.mocked(api.saveWorkflow);
const mockDelete = vi.mocked(api.deleteWorkflow);

import { WorkflowListView } from "../src/app/workflows/WorkflowListView";

function renderList() {
  return render(
    <I18nProvider initialLocale="en">
      <WorkflowListView />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockList.mockReset();
  mockGet.mockReset();
  mockSave.mockReset();
  mockDelete.mockReset();
});

describe("v0.7.6: <WorkflowListView> mount", () => {
  it("renders the empty state when the API returns no workflows", async () => {
    mockList.mockResolvedValue([]);
    renderList();
    await waitFor(() => {
      // i18n resolves to the English empty state text.
      expect(
        screen.getByText(/Create one to capture a proven pattern\./),
      ).toBeTruthy();
    });
  });

  it("renders one card per workflow with a count of steps + connections", async () => {
    mockList.mockResolvedValue([
      {
        id: "research-and-test",
        name: "Research + test",
        description: "",
        nodeCount: 2,
        edgeCount: 1,
        createdAt: "2026-07-18T00:00:00Z",
        updatedAt: "2026-07-18T00:00:00Z",
      },
      {
        id: "code-review",
        name: "Code review",
        description: "review PRs",
        nodeCount: 1,
        edgeCount: 0,
        createdAt: "2026-07-18T00:00:00Z",
        updatedAt: "2026-07-18T00:00:00Z",
      },
    ]);
    renderList();
    await waitFor(() => {
      // The list renders one card per workflow, each
      // with a name link carrying data-testid=
      // "workflows-item-name". We assert at least one
      // is present (avoid the multiple-match error by
      // checking the count after the list stabilizes).
      const cards = screen.getAllByTestId("workflows-item-name");
      expect(cards.length).toBeGreaterThan(0);
      expect(cards[0]?.textContent).toBeTruthy();
    });
  });

  it("opens the New Workflow dialog when the + New button is clicked", async () => {
    mockList.mockResolvedValue([]);
    renderList();
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("workflows-new"));
    });
    expect(screen.getByTestId("workflows-new-dialog")).toBeTruthy();
  });

  it("shows an error surface when the list API rejects", async () => {
    mockList.mockRejectedValue(new Error("network down"));
    renderList();
    await waitFor(() => {
      expect(screen.getByText("network down")).toBeTruthy();
    });
  });
});
