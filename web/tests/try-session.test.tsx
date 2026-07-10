/**
 * Tests for the /try session-tree actions (rename / clone / fork).
 *
 * v0.5.16: SessionPanel renders session info + rename + clone;
 * BubbleActions shows a confirm dialog before fork.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider } from "../src/components/I18n";
import {
  SessionPanel,
  emptySessionState,
} from "../src/components/SessionPanel";
import { BubbleActions } from "../src/components/BubbleActions";

/** Wrap children in the I18nProvider so useT() works in tests. */
function WithProviders({ children }: { children: React.ReactNode }) {
  return <I18nProvider initialLocale="en">{children}</I18nProvider>;
}

const baseProps = {
  onRename: vi.fn(),
  onClone: vi.fn(),
  forkedFrom: null as string | null,
};

describe("SessionPanel", () => {
  it("renders unnamed when session has no name", () => {
    render(
      <WithProviders>
        <SessionPanel sessionState={emptySessionState()} {...baseProps} />
      </WithProviders>,
    );
    expect(screen.getByText(/Untitled session/)).toBeTruthy();
  });

  it("renders session name + message count when present", () => {
    render(
      <WithProviders>
        <SessionPanel
          sessionState={{
            ...emptySessionState(),
            sessionId: "abc",
            sessionName: "My session",
            messageCount: 5,
          }}
          {...baseProps}
        />
      </WithProviders>,
    );
    expect(screen.getByText("My session")).toBeTruthy();
    expect(screen.getByText(/5 messages/)).toBeTruthy();
  });

  it("uses singular 'message' when count is 1", () => {
    render(
      <WithProviders>
        <SessionPanel
          sessionState={{
            ...emptySessionState(),
            sessionId: "abc",
            sessionName: "S",
            messageCount: 1,
          }}
          {...baseProps}
        />
      </WithProviders>,
    );
    expect(screen.getByText(/^1 message$/)).toBeTruthy();
  });

  it("shows 'forked from X' when forkedFrom is set", () => {
    render(
      <WithProviders>
        <SessionPanel
          sessionState={{
            ...emptySessionState(),
            sessionId: "abc",
            sessionName: "New branch",
            messageCount: 0,
          }}
          {...baseProps}
          forkedFrom="old name"
        />
      </WithProviders>,
    );
    expect(screen.getByText(/Forked from .old name./)).toBeTruthy();
  });

  it("calls onClone when Clone button is clicked", () => {
    const onClone = vi.fn();
    render(
      <WithProviders>
        <SessionPanel
          sessionState={{
            ...emptySessionState(),
            sessionId: "abc",
            sessionName: "S",
            messageCount: 2,
          }}
          onRename={vi.fn()}
          onClone={onClone}
          forkedFrom={null}
        />
      </WithProviders>,
    );
    fireEvent.click(screen.getByText(/^Clone$/));
    expect(onClone).toHaveBeenCalledTimes(1);
  });

  it("calls onRename with trimmed name when Save is clicked", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(
      <WithProviders>
        <SessionPanel
          sessionState={{
            ...emptySessionState(),
            sessionId: "abc",
            sessionName: "Old",
            messageCount: 0,
          }}
          onRename={onRename}
          onClone={vi.fn()}
          forkedFrom={null}
        />
      </WithProviders>,
    );
    // Click the name to start editing.
    fireEvent.click(screen.getByText("Old"));
    const input = screen.getByPlaceholderText(
      /Session name/,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  New name  " } });
    await act(async () => {
      fireEvent.click(screen.getByText(/^Save$/));
    });
    expect(onRename).toHaveBeenCalledWith("New name");
  });
});

describe("BubbleActions", () => {
  it("does not render when disabled", () => {
    const { container } = render(
      <WithProviders>
        <BubbleActions onFork={vi.fn()} disabled />
      </WithProviders>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("reveals confirm panel after first click, calls onFork on confirm", async () => {
    const onFork = vi.fn().mockResolvedValue(undefined);
    render(
      <WithProviders>
        <BubbleActions onFork={onFork} />
      </WithProviders>,
    );
    fireEvent.click(screen.getByText(/Fork from here/));
    expect(screen.getByText(/Start a new branch/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText(/^Fork$/));
    });
    expect(onFork).toHaveBeenCalledTimes(1);
  });

  it("does not call onFork if user cancels", async () => {
    const onFork = vi.fn().mockResolvedValue(undefined);
    render(
      <WithProviders>
        <BubbleActions onFork={onFork} />
      </WithProviders>,
    );
    fireEvent.click(screen.getByText(/Fork from here/));
    fireEvent.click(screen.getByText(/^Cancel$/));
    expect(onFork).not.toHaveBeenCalled();
  });
});
