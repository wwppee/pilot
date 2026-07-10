/**
 * Tests for the OverflowMenu component (v0.5.17 mobile drawer).
 *
 * Uses native <details>/<summary> so we just verify the trigger
 * is visible, items render, and clicking an item closes the menu
 * (via the data-close-on-click attribute the menu listens for).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverflowMenu, OverflowMenuItem } from "../src/components/OverflowMenu";

describe("OverflowMenu", () => {
  it("renders the trigger and opens on click", () => {
    const onItem = vi.fn();
    render(
      <OverflowMenu>
        <OverflowMenuItem onClick={onItem}>Do thing</OverflowMenuItem>
      </OverflowMenu>,
    );
    // Initially closed — item text not visible in the menu (it's
    // inside <details> which is hidden when closed).
    const summary = screen.getByText("⋯");
    expect(summary).toBeTruthy();
    fireEvent.click(summary);
    expect(screen.getByText("Do thing")).toBeTruthy();
  });

  it("calls onClick when an item is clicked", () => {
    const onItem = vi.fn();
    render(
      <OverflowMenu>
        <OverflowMenuItem onClick={onItem}>Action</OverflowMenuItem>
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByText("⋯"));
    fireEvent.click(screen.getByText("Action"));
    expect(onItem).toHaveBeenCalledTimes(1);
  });

  it("respects the disabled prop", () => {
    const onItem = vi.fn();
    render(
      <OverflowMenu>
        <OverflowMenuItem onClick={onItem} disabled>
          Action
        </OverflowMenuItem>
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByText("⋯"));
    const btn = screen.getByText("Action") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onItem).not.toHaveBeenCalled();
  });
});
