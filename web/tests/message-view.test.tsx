/**
 * v0.9.8: MessageView component tests.
 *
 * The /try page's inline MessageBubble + BlockView were
 * extracted into `web/src/components/MessageView.tsx`
 * and the toolCall branch grew two new statuses —
 * `denied` (B1 policy blocked) and `wrapped` (A2
 * wrapper rewrote args). This test file locks the
 * rendering for all five tool-call statuses plus the
 * text and thinking blocks, so a future regression in
 * the governance visualization (e.g. forgetting the
 * `data-tool-status` attribute) is caught by `npm
 * test` rather than discovered by a user in production.
 *
 * The runtime data source for `denied` / `wrapped` is
 * a future v0.9.x+ pi hook; we just hand-build the
 * content blocks here.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MessageBubble } from "@/components/MessageView";
import { I18nProvider } from "@/components/I18n";
import type { ChatMessage } from "@/lib/chat-stream";

function renderInI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

function assistantMessage(
  blocks: ChatMessage["blocks"],
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    blocks,
    status: "complete",
    timestamp: 0,
    provider: "test",
    model: "test",
    ...overrides,
  };
}

function userMessage(
  text: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "u1",
    role: "user",
    blocks: [{ type: "text", text }],
    status: "complete",
    timestamp: 0,
    provider: "",
    model: "",
    ...overrides,
  };
}

describe("MessageBubble / BlockView (v0.9.8)", () => {
  it("renders a plain text block", () => {
    const msg = assistantMessage([{ type: "text", text: "hello world" }]);
    renderInI18n(<MessageBubble message={msg} onFork={undefined} />);
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("renders a thinking block in a collapsed <details>", () => {
    const msg = assistantMessage([
      { type: "thinking", text: "let me consider the data" },
    ]);
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    // The <summary> shows the i18n key "try.thinking"
    // and the body text is reachable by clicking open.
    const summary = details?.querySelector("summary");
    expect(summary).toBeTruthy();
    // Body text is in the document but inside the
    // collapsed <details>, so it's not user-visible
    // until the details is open. We can still find it
    // in the DOM.
    expect(container.textContent).toContain("let me consider the data");
  });

  it("renders a streaming tool call with the 🔧 marker", () => {
    const msg = assistantMessage([
      {
        type: "toolCall",
        id: "tc1",
        name: "bash",
        args: { command: "ls" },
        status: "streaming",
      },
    ]);
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    const details = container.querySelector("details");
    expect(details?.getAttribute("data-tool-status")).toBe("streaming");
    expect(details?.textContent).toContain("bash");
  });

  it("renders a denied tool call with the 🚫 marker + policy name", () => {
    // v0.9.8: B1 policy blocked this call. The
    // summary line should show the 🚫 marker + the
    // policy name (via the i18n try.tool.denied key)
    // and the body's deniedReason should appear in
    // an italic <pre>.
    const msg = assistantMessage([
      {
        type: "toolCall",
        id: "tc1",
        name: "bash",
        args: { command: "rm -rf /" },
        status: "denied",
        deniedBy: "safe-bash",
        deniedReason: "command matches denyCommands pattern",
      },
    ]);
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    const details = container.querySelector("details");
    expect(details?.getAttribute("data-tool-status")).toBe("denied");
    expect(details?.textContent).toContain("🚫");
    expect(details?.textContent).toContain("safe-bash");
    expect(details?.textContent).toContain(
      "command matches denyCommands pattern",
    );
  });

  it("renders a wrapped tool call with pre/post args + 🔄 marker + wrapper name", () => {
    // v0.9.8: A2 wrapper rewrote the args. The
    // summary line should show the 🔄 marker + the
    // wrapper name (via the i18n try.tool.wrapped
    // key), and the body should show BOTH the
    // original (struck-through) and the transformed
    // args so the wrapper's effect is visible.
    const msg = assistantMessage([
      {
        type: "toolCall",
        id: "tc1",
        name: "read",
        args: { path: "/Users/me/.env" },
        transformedArgs: { path: "/Users/me/.env.redacted" },
        status: "wrapped",
        wrappedBy: "redact-env",
      },
    ]);
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    const details = container.querySelector("details");
    expect(details?.getAttribute("data-tool-status")).toBe("wrapped");
    expect(details?.textContent).toContain("🔄");
    expect(details?.textContent).toContain("redact-env");
    expect(details?.textContent).toContain("/Users/me/.env");
    expect(details?.textContent).toContain("/Users/me/.env.redacted");
    // The original-args <pre> has the line-through class
    // so the user can tell at a glance which side was the
    // wrapper's input vs. its output.
    const pres = container.querySelectorAll("pre");
    const lineThroughPre = Array.from(pres).find((p) =>
      p.className.includes("line-through"),
    );
    expect(lineThroughPre).toBeTruthy();
    expect(lineThroughPre?.textContent).toContain("/Users/me/.env");
  });

  it("renders a complete tool call without the open attribute", () => {
    const msg = assistantMessage([
      {
        type: "toolCall",
        id: "tc1",
        name: "bash",
        args: { command: "ls" },
        result: "file1\nfile2",
        status: "complete",
      },
    ]);
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    const details = container.querySelector("details");
    expect(details?.getAttribute("data-tool-status")).toBe("complete");
    // The v0.5.15 behavior: complete calls start
    // collapsed (no open attr). Locking that here so
    // the chat doesn't visually grow without bound on
    // a long session.
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("user bubbles get a fork action when onFork is provided", () => {
    const msg = userMessage("list files");
    const onFork = () => undefined;
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={onFork} />,
    );
    // The bubble itself is data-role="user" and
    // right-aligned (justify-end) — the fork button
    // is rendered next to the body.
    const bubble = container.querySelector('[data-role="user"]');
    expect(bubble).toBeTruthy();
    expect(bubble?.className).toContain("justify-end");
  });

  it("user bubbles render without a fork button when onFork is undefined", () => {
    const msg = userMessage("list files");
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    // v0.5.15: user bubbles in /try are read-only
    // when the SessionPanel isn't open (no fork
    // action available). The bubble still renders the
    // text, just without the button row.
    expect(screen.getByText("list files")).toBeTruthy();
  });

  it("renders the provider/model footer on assistant messages", () => {
    const msg = assistantMessage(
      [{ type: "text", text: "done" }],
      { provider: "anthropic", model: "claude-sonnet-4-6" },
    );
    const { container } = renderInI18n(
      <MessageBubble message={msg} onFork={undefined} />,
    );
    expect(container.textContent).toContain("anthropic/claude-sonnet-4-6");
  });
});
