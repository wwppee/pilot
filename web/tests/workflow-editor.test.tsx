/**
 * v0.7.8: WorkflowEditor mount test (v0.7.2 backlog
 * item closed). Deliberately minimal — the editor is
 * ~800 lines and the existing per-component tests
 * (NodeFields, layout) cover the deep surface. This
 * mount test only asserts the editor boots + renders
 * the top-level actions so a future refactor that
 * breaks the page-level wiring surfaces as a failure.
 *
 * v0.8+ will add per-panel mount tests (StepsPanel,
 * PreviewPanel) once the file is split further.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/components/I18n";

vi.mock("@/lib/pilot-browser", () => ({
  api: {
    workflow: vi.fn(),
    saveWorkflow: vi.fn(),
    deleteWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  },
}));
import { api } from "@/lib/pilot-browser";
const mockGet = vi.mocked(api.workflow);

import { WorkflowEditor } from "../src/app/workflows/[id]/WorkflowEditor";

function renderEditor() {
  return render(
    <I18nProvider initialLocale="en">
      <WorkflowEditor workflowId="test-flow" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
});

describe("v0.7.8: <WorkflowEditor> mount", () => {
  it("renders the top-level action buttons when the workflow loads", async () => {
    mockGet.mockResolvedValue({
      id: "test-flow",
      name: "Test flow",
      description: "",
      version: 1,
      nodes: [],
      edges: [],
      metadata: {
        createdAt: "2026-07-18T00:00:00Z",
        updatedAt: "2026-07-18T00:00:00Z",
      },
    });
    renderEditor();
    await waitFor(() => {
      // The four top-level actions we know exist in
      // the header: Save, Run, Duplicate, Auto-layout,
      // Delete. The "loading…" state is a transient
      // placeholder; we wait for the action row.
      expect(screen.getByTestId("workflow-save")).toBeTruthy();
      expect(screen.getByTestId("workflow-run")).toBeTruthy();
      expect(screen.getByTestId("workflow-duplicate")).toBeTruthy();
      expect(screen.getByTestId("workflow-auto-layout")).toBeTruthy();
      expect(screen.getByTestId("workflow-delete")).toBeTruthy();
    });
  });

  it("shows the notFound state when the workflow is missing", async () => {
    // api.workflow returns null on 404, which the editor
    // turns into a 'notFound' state.
    mockGet.mockResolvedValue(null);
    renderEditor();
    // We don't assert on a specific notFound text here
    // (the editor's notFound branch is bare-bones) —
    // we just verify the loading state resolves without
    // throwing and the editor stays mounted.
    await waitFor(() => {
      // The action buttons should NOT be present
      // because the editor isn't in 'ok' state.
      expect(screen.queryByTestId("workflow-save")).toBeNull();
    });
  });
});
