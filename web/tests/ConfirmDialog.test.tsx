/**
 * v0.7.2 (P1 #5): RTL test coverage for the v0.7.1.1
 * `<ConfirmDialog>` (replaces `window.confirm` for
 * destructive actions in /workflows).
 *
 * The v0.7.1.1 self-audit hotfix added three things
 * that this test file locks in:
 *   - real `cancelRef` focus on the cancel button (bug #5
 *     was "the comment said focus cancel but the code
 *     focused the card div")
 *   - Esc and backdrop click are no-ops when `busy` is
 *     true (bug #6 was "Esc during an in-flight request
 *     unmounted the dialog while the awaited promise
 *     later resolved against a gone component")
 *   - the `busy` prop disables the confirm button (bug #7
 *     was "the prop was never passed, so double-click
 *     fired duplicate destructive actions")
 *
 * We also assert the basic happy paths (open/close,
 * confirm click) so a future refactor of the dialog's
 * internals doesn't silently break the call site.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog } from "../src/app/workflows/ConfirmDialog";

describe("v0.7.1.1 + v0.7.2: <ConfirmDialog>", () => {
  beforeEach(() => {
    cleanup();
  });

  // helper: re-render with fresh handlers
  function renderDialog(
    opts: {
      open?: boolean;
      busy?: boolean;
      destructive?: boolean;
      onConfirm?: () => void;
      onCancel?: () => void;
    } = {},
  ) {
    const onConfirm = opts.onConfirm ?? vi.fn();
    const onCancel = opts.onCancel ?? vi.fn();
    const result = render(
      <ConfirmDialog
        open={opts.open ?? true}
        title="Delete this?"
        description="This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={opts.destructive ?? true}
        busy={opts.busy ?? false}
        onConfirm={onConfirm}
        onCancel={onCancel}
        data-testid="test-dialog"
      />,
    );
    return { onConfirm, onCancel, ...result };
  }

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId("test-dialog")).toBeNull();
  });

  it("renders title + description + both buttons when open", () => {
    renderDialog();
    expect(screen.getByText("Delete this?")).toBeTruthy();
    expect(screen.getByText("This can't be undone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("clicking the confirm button calls onConfirm (not onCancel)", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("clicking the cancel button calls onCancel (not onConfirm)", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ─── v0.7.1.1 fix: real cancel-button focus ─────────
  // bug #5: comment said "focus cancel button on open"
  // but code did cardRef.current?.focus() (the card div,
  // tabIndex=-1). We assert activeElement IS the cancel
  // button so a future regression back to focusing the
  // card would fail this test.
  it("focuses the cancel button on open (v0.7.1.1 bug #5 fix)", () => {
    renderDialog();
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(document.activeElement).toBe(cancelBtn);
  });

  // ─── v0.7.1.1 fix: Esc is no-op when busy ───────────
  // bug #6: pressing Esc while the DELETE round-trip is
  // in flight unmounted the dialog, but the awaited
  // promise later resolved against a gone component.
  // We assert that Esc with busy=true is ignored.
  it("Esc is ignored when busy=true (v0.7.1.1 bug #6 fix)", () => {
    const { onCancel } = renderDialog({ busy: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Esc fires onCancel when not busy", () => {
    const { onCancel } = renderDialog({ busy: false });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // ─── v0.7.1.1 fix: backdrop is no-op when busy ──────
  // Symmetric to Esc. The backdrop's role="dialog"
  // wrapper accepts a click that bubbles from anywhere
  // outside the card; we only treat it as "cancel" if
  // the click landed on the backdrop itself, and only
  // when not busy.
  it("backdrop click is ignored when busy=true (v0.7.1.1 bug #6 fix)", () => {
    const { onCancel } = renderDialog({ busy: true });
    const backdrop = screen.getByTestId("test-dialog");
    // Click the backdrop directly (not the card).
    fireEvent.click(backdrop, { target: backdrop });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("backdrop click fires onCancel when not busy", () => {
    const { onCancel } = renderDialog({ busy: false });
    const backdrop = screen.getByTestId("test-dialog");
    fireEvent.click(backdrop, { target: backdrop });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // ─── v0.7.1.1 fix: confirm disabled when busy ───────
  // bug #7: the busy prop was never passed, so
  // double-click on the destructive button fired
  // duplicate DELETEs. We assert the confirm button
  // is disabled when busy=true.
  it("confirm button is disabled when busy=true (v0.7.1.1 bug #7 fix)", () => {
    renderDialog({ busy: true });
    // When busy, the confirm label becomes "…" (see the
    // "confirm label becomes '…' when busy" test below)
    // — so we look it up by that name, not by "delete".
    const confirmBtn = screen.getByRole("button", {
      name: "…",
    }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("confirm button is enabled when busy=false", () => {
    renderDialog({ busy: false });
    const confirmBtn = screen.getByRole("button", {
      name: /delete/i,
    }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  // ─── v0.7.1.1 polish: confirm shows "…" when busy ───
  // The `busy` prop is also used to swap the confirm
  // label to a single character "…" so the user can
  // see the request is in flight even if their screen
  // reader doesn't read the disabled attribute.
  it("confirm label becomes '…' when busy=true", () => {
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: "…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  // ─── v0.7.1 polish: destructive variant styles ──────
  // The destructive variant styles the confirm button
  // with the --error CSS var so it visually reads as
  // "dangerous" (red border + red text). The non-
  // destructive variant falls back to the default
  // button styling. We assert via inline style.
  it("destructive variant sets --error color on confirm button", () => {
    renderDialog({ destructive: true });
    const confirmBtn = screen.getByRole("button", {
      name: /delete/i,
    }) as HTMLButtonElement;
    expect(confirmBtn.style.color).toBe("var(--error)");
    expect(confirmBtn.style.borderColor).toBe("var(--error)");
  });

  it("non-destructive variant leaves the confirm button unstyled", () => {
    renderDialog({ destructive: false });
    const confirmBtn = screen.getByRole("button", {
      name: /delete/i,
    }) as HTMLButtonElement;
    expect(confirmBtn.style.color).toBe("");
    expect(confirmBtn.style.borderColor).toBe("");
  });
});
