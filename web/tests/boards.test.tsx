/**
 * v0.6.12: tests for the /compose/boards list page.
 *
 * Covers the four states (loading / ok-empty / ok-with-rows / error)
 * plus the three user actions on a single row (rename / delete / share)
 * and the bulk select + bulk delete + bulk copy affordances.
 *
 * Mocking strategy: `pilot-browser` is hoisted via `vi.mock` and
 * we only stub the four `compose*` methods we actually call. Other
 * exports pass through to the real module. This keeps the mock
 * surface narrow so unrelated regressions don't sneak in.
 *
 * `window.confirm` is stubbed per-test so the dialog doesn't block
 * (jsdom has no native confirm dialog). `navigator.clipboard` is
 * stubbed via `vi.stubGlobal` because jsdom doesn't ship it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/components/I18n";
import type { BoardSummary } from "@/lib/types";

// vi.mock is hoisted — keep the factory side-effect free.
const mockComposeBoards = vi.fn<() => Promise<BoardSummary[]>>();
const mockRenameComposeBoard =
  vi.fn<(id: string, name: string) => Promise<unknown>>();
const mockDeleteComposeBoard = vi.fn<(id: string) => Promise<boolean>>();
const mockComposeBoard = vi.fn<(id: string) => Promise<unknown>>();
const mockSaveComposeBoard = vi.fn();
const mockComposeCatalog = vi.fn();

vi.mock("@/lib/pilot-browser", () => ({
  api: {
    composeBoards: () => mockComposeBoards(),
    renameComposeBoard: (id: string, name: string) =>
      mockRenameComposeBoard(id, name),
    deleteComposeBoard: (id: string) => mockDeleteComposeBoard(id),
    composeBoard: (id: string) => mockComposeBoard(id),
    saveComposeBoard: (...args: unknown[]) => mockSaveComposeBoard(...args),
    composeCatalog: () => mockComposeCatalog(),
  },
}));

// Imported AFTER the mock so the module picks up the stubbed api.
import { BoardListView } from "@/app/compose/boards/BoardListView";

function renderView() {
  return render(
    <I18nProvider initialLocale="en">
      <BoardListView />
    </I18nProvider>,
  );
}

const SAMPLE: BoardSummary[] = [
  {
    id: "board-1",
    name: "Alpha",
    updatedAt: "2026-07-14T10:00:00.000Z",
    createdAt: "2026-07-14T09:00:00.000Z",
    blockCount: 3,
    connectionCount: 2,
  },
  {
    id: "board-2",
    name: "Beta",
    updatedAt: "2026-07-13T10:00:00.000Z",
    createdAt: "2026-07-13T09:00:00.000Z",
    blockCount: 1,
    connectionCount: 0,
  },
];

beforeEach(() => {
  mockComposeBoards.mockReset();
  mockRenameComposeBoard.mockReset();
  mockDeleteComposeBoard.mockReset();
  mockComposeBoard.mockReset();
  mockSaveComposeBoard.mockReset();
  mockComposeCatalog.mockReset();

  // navigator.clipboard stub for share tests.
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── States ───────────────────────────────────────────

describe("BoardListView — states", () => {
  it("shows a loading message on first render", () => {
    mockComposeBoards.mockReturnValue(new Promise(() => {})); // never resolves
    renderView();
    expect(screen.getByText("Loading boards…")).toBeTruthy();
  });

  it("shows the empty state when the server returns []", async () => {
    mockComposeBoards.mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(screen.getByText("No boards yet")).toBeTruthy();
    });
  });

  it("renders a row per board when the list is non-empty", async () => {
    mockComposeBoards.mockResolvedValue(SAMPLE);
    renderView();
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeTruthy();
    });
    expect(screen.getByText("Beta")).toBeTruthy();
    // Both ids shown as monospace captions.
    expect(screen.getByText("board-1")).toBeTruthy();
    expect(screen.getByText("board-2")).toBeTruthy();
  });

  it("shows the error state with a retry button when the list fetch fails", async () => {
    mockComposeBoards.mockRejectedValue(new Error("network down"));
    renderView();
    await waitFor(() => {
      expect(screen.getByText("Couldn't load boards")).toBeTruthy();
    });
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeTruthy();
    // Retry calls composeBoards again.
    fireEvent.click(retry);
    expect(mockComposeBoards).toHaveBeenCalledTimes(2);
  });
});

// ─── Row actions ─────────────────────────────────────

describe("BoardListView — single-row actions", () => {
  beforeEach(() => {
    mockComposeBoards.mockResolvedValue(SAMPLE);
    mockRenameComposeBoard.mockResolvedValue({
      ...SAMPLE[0],
      name: "Alpha renamed",
    });
    mockDeleteComposeBoard.mockResolvedValue(true);
  });

  it("opens the rename dialog when Rename is clicked, then submits via the api", async () => {
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const renameButtons = screen.getAllByRole("button", {
      name: "Rename this board",
    });
    fireEvent.click(renameButtons[0]!);

    // Dialog mounts with a prefilled input.
    const input = (await waitFor(() =>
      screen.getByRole("textbox"),
    )) as HTMLInputElement;
    expect(input.value).toBe("Alpha");

    // Replace the value and submit.
    fireEvent.change(input, { target: { value: "Alpha renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockRenameComposeBoard).toHaveBeenCalledWith(
        "board-1",
        "Alpha renamed",
      );
    });
  });

  it("cancels the rename dialog when Cancel is clicked", async () => {
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const renameButtons = screen.getAllByRole("button", {
      name: "Rename this board",
    });
    fireEvent.click(renameButtons[0]!);
    await waitFor(() => screen.getByRole("textbox"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRenameComposeBoard).not.toHaveBeenCalled();
  });

  it("deletes a board when the user confirms the prompt", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete this board",
    });
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() => {
      expect(mockDeleteComposeBoard).toHaveBeenCalledWith("board-1");
    });
    expect(confirmSpy).toHaveBeenCalled();
  });

  it("does NOT delete when the user cancels the confirm dialog", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete this board",
    });
    fireEvent.click(deleteButtons[0]!);
    // Give the (skipped) promise a tick to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDeleteComposeBoard).not.toHaveBeenCalled();
  });

  it("copies a board's full JSON to the clipboard on Share", async () => {
    mockComposeBoard.mockResolvedValue({
      blocks: [
        { id: "b1", kind: "session", refId: "r1", x: 0, y: 0, label: "A" },
      ],
      connections: [],
      version: 3,
    });
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const shareButtons = screen.getAllByRole("button", {
      name: /Copy this board/,
    });
    fireEvent.click(shareButtons[0]!);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const payload = JSON.parse(
      (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as string,
    );
    expect(payload.id).toBe("board-1");
    expect(payload.name).toBe("Alpha");
    expect(payload.version).toBe(3);
    expect(Array.isArray(payload.blocks)).toBe(true);
  });
});

// ─── Bulk actions ────────────────────────────────────

describe("BoardListView — bulk actions", () => {
  beforeEach(() => {
    mockComposeBoards.mockResolvedValue(SAMPLE);
    mockDeleteComposeBoard.mockResolvedValue(true);
    mockComposeBoard.mockResolvedValue({
      blocks: [],
      connections: [],
      version: 3,
    });
  });

  it("shows the bulk bar after a single checkbox is checked", async () => {
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is the select-all; the rest are per-row.
    // Click the second (which corresponds to board-1 / Alpha).
    fireEvent.click(checkboxes[1]!);
    // The bulk bar is the only `role="region"` whose accessible
    // name contains the selected count. (The select-all row uses
    // a <label> for the same count text, but isn't a region.)
    await waitFor(() => {
      const bulkBar = screen.getByRole("region", { name: /1 selected/ });
      expect(bulkBar).toBeTruthy();
    });
  });

  it("bulk-delete calls deleteComposeBoard for every selected id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(checkboxes[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    await waitFor(() => {
      expect(mockDeleteComposeBoard).toHaveBeenCalledWith("board-1");
      expect(mockDeleteComposeBoard).toHaveBeenCalledWith("board-2");
    });
  });

  it("bulk-share copies a JSON array of all selected boards", async () => {
    renderView();
    await waitFor(() => screen.getByText("Alpha"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(checkboxes[2]!);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy selected as JSON" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const payload = JSON.parse(
      (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as string,
    );
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload[0].id).toBe("board-1");
    expect(payload[1].id).toBe("board-2");
  });
});

// ─── BoardRow formatting ────────────────────────────

describe("BoardRow — date formatting", () => {
  beforeEach(() => {
    mockComposeBoards.mockResolvedValue([
      {
        id: "b1",
        name: "DateTest",
        updatedAt: "2026-07-14T10:30:00.000Z",
        createdAt: "2026-07-14T10:00:00.000Z",
        blockCount: 0,
        connectionCount: 0,
      },
    ]);
  });

  it("renders the updatedAt timestamp in YYYY-MM-DD HH:MM (local TZ)", async () => {
    renderView();
    await waitFor(() => screen.getByText("DateTest"));
    // The exact string depends on the test runner's TZ, so we
    // match the shape rather than a hard-coded value.
    const cells = document.querySelectorAll("td");
    const formatted = Array.from(cells).find((c) =>
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(c.textContent ?? ""),
    );
    expect(formatted).toBeTruthy();
  });
});
