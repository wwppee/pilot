/**
 * session-tree-explorer.test.tsx — coverage for the interactive
 * session tree component.
 *
 * Renders with @testing-library/react, drives user interactions
 * (search input + type filter chips + collapse chevrons), and
 * asserts the visible DOM matches expectations.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SessionTreeExplorer } from "../src/components/SessionTreeExplorer";
import type { SessionTreeNode } from "../src/lib/types";

// Minimal English-only stub mirroring the real i18n keys used by
// SessionTreeExplorer. Enough for `getByPlaceholderText` and
// `getByRole({ name })` to match.
const DICT: Record<string, string> = {
  "sessions.tree.searchPlaceholder": "search preview…",
  "sessions.tree.searchLabel": "Search node preview text",
  "sessions.tree.filterLabel": "Filter by node type",
  "sessions.tree.expandAll": "expand all",
  "sessions.tree.collapseAll": "collapse all",
  "sessions.tree.matchCount": "{n} match{es}",
};

const t = (k: string, params?: Record<string, string | number>) => {
  const raw = DICT[k] ?? k;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name) => String(params[name] ?? ""));
};

const sampleTree: SessionTreeNode = {
  id: "root",
  type: "user",
  preview: "find me something",
  children: [
    {
      id: "a1",
      type: "assistant",
      preview: "thinking about it",
      children: [
        {
          id: "a2",
          type: "tool",
          preview: "running bash",
          children: [],
        },
      ],
    },
    {
      id: "b1",
      type: "assistant",
      preview: "all done here",
      children: [],
    },
    {
      id: "c1",
      type: "system",
      preview: "system message",
      children: [],
    },
  ],
};

describe("SessionTreeExplorer", () => {
  it("renders all nodes by default", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);
    expect(screen.getByText("find me something")).toBeTruthy();
    expect(screen.getByText("thinking about it")).toBeTruthy();
    expect(screen.getByText("running bash")).toBeTruthy();
    expect(screen.getByText("all done here")).toBeTruthy();
    expect(screen.getByText("system message")).toBeTruthy();
  });

  it("collapses a subtree when chevron is clicked", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);
    // Initially expanded — grandchild visible.
    expect(screen.getByText("running bash")).toBeTruthy();

    // Click the chevron on a1.
    const a1Row = screen.getByText("thinking about it").closest("li")!;
    const chevron = within(a1Row).getByRole("button", {
      name: /collapse subtree/i,
    });
    fireEvent.click(chevron);

    // Grandchild now hidden.
    expect(screen.queryByText("running bash")).toBeNull();
    // a1 still visible.
    expect(screen.getByText("thinking about it")).toBeTruthy();

    // Re-expand by clicking the now-▸ chevron.
    const expandBtn = within(a1Row).getByRole("button", {
      name: /expand subtree/i,
    });
    fireEvent.click(expandBtn);
    expect(screen.getByText("running bash")).toBeTruthy();
  });

  it("filters out hidden node types when a type chip is toggled off", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);
    // Initially all 5 previews visible.
    expect(screen.getByText("system message")).toBeTruthy();

    // Click "system" chip — should hide the system node.
    const systemChip = screen.getByRole("button", { name: "system" });
    fireEvent.click(systemChip);
    expect(screen.queryByText("system message")).toBeNull();
    // Other nodes still visible.
    expect(screen.getByText("find me something")).toBeTruthy();
  });

  it("search highlights matches with <mark> and hides non-matching leaves", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);

    const search = screen.getByPlaceholderText(/search preview/i);
    fireEvent.change(search, { target: { value: "bash" } });

    // Only "running bash" matches → grandchild visible. Use a
    // function matcher because the <mark> wrapper breaks up the
    // text node into "running " + <mark>bash</mark>.
    const bashNode = screen.getByText((_, el) => {
      if (!el) return false;
      return (
        el.textContent === "running bash" &&
        !!el.querySelector("mark") &&
        el.querySelector("mark")?.textContent === "bash"
      );
    });
    expect(bashNode.outerHTML).toMatch(/<mark[^>]*>bash<\/mark>/i);
    expect(screen.queryByText("all done here")).toBeNull();
    expect(screen.queryByText("system message")).toBeNull();
  });

  it("'collapse all' hides every non-leaf node's children", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: /collapse all/i }));
    // Grandchild + middle-tier + sibling children all gone.
    expect(screen.queryByText("running bash")).toBeNull();
    expect(screen.queryByText("thinking about it")).toBeNull();
    expect(screen.queryByText("all done here")).toBeNull();
    // Only the root's own preview remains.
    expect(screen.getByText("find me something")).toBeTruthy();
  });

  it("'expand all' restores a collapsed tree", () => {
    render(<SessionTreeExplorer root={sampleTree} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: /collapse all/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));
    expect(screen.getByText("running bash")).toBeTruthy();
  });

  it("renders nothing for missing preview text (no crash)", () => {
    const noPreview: SessionTreeNode = {
      id: "x",
      type: "user",
      preview: "",
      children: [],
    };
    render(<SessionTreeExplorer root={noPreview} t={t} />);
    // No errors thrown. Just an empty <li>.
    expect(screen.getAllByRole("list")).toBeTruthy();
  });

  it("escapeHTML prevents XSS via preview text", () => {
    const xss: SessionTreeNode = {
      id: "x",
      type: "user",
      preview: '<script>alert("pwn")</script>',
      children: [],
    };
    const { container } = render(
      <SessionTreeExplorer root={xss} t={t} />,
    );
    // Should be escaped, not executed.
    expect(container.innerHTML).not.toMatch(/<script>alert/i);
    expect(container.innerHTML).toMatch(/&lt;script&gt;/);
  });
});