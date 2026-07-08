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
  // v0.5.8+ chip labels per bucket.
  "sessions.tree.types.user": "User",
  "sessions.tree.types.assistant": "Assistant",
  "sessions.tree.types.tool": "Tool",
  "sessions.tree.types.system": "System",
  "sessions.tree.types.model_change": "Model",
  "sessions.tree.types.thinking_level_change": "Thinking",
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
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);
    expect(screen.getByText("find me something")).toBeTruthy();
    expect(screen.getByText("thinking about it")).toBeTruthy();
    expect(screen.getByText("running bash")).toBeTruthy();
    expect(screen.getByText("all done here")).toBeTruthy();
    expect(screen.getByText("system message")).toBeTruthy();
  });

  it("collapses a subtree when chevron is clicked", () => {
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);
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
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);
    // Initially all 5 previews visible.
    expect(screen.getByText("system message")).toBeTruthy();

    // Click "System" chip — should hide the system node.
    // v0.5.8+: chip labels are translated; capitalised.
    const systemChip = screen.getByRole("button", { name: "System" });
    fireEvent.click(systemChip);
    expect(screen.queryByText("system message")).toBeNull();
    // Other nodes still visible.
    expect(screen.getByText("find me something")).toBeTruthy();
  });

  it("search highlights matches with <mark> and hides non-matching leaves", () => {
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);

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
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: /collapse all/i }));
    // Grandchild + middle-tier + sibling children all gone.
    expect(screen.queryByText("running bash")).toBeNull();
    expect(screen.queryByText("thinking about it")).toBeNull();
    expect(screen.queryByText("all done here")).toBeNull();
    // Only the root's own preview remains.
    expect(screen.getByText("find me something")).toBeTruthy();
  });

  it("'expand all' restores a collapsed tree", () => {
    render(<SessionTreeExplorer root={sampleTree} locale="en" />);
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
    render(<SessionTreeExplorer root={noPreview} locale="en" />);
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
      <SessionTreeExplorer root={xss} locale="en" />,
    );
    // Should be escaped, not executed.
    expect(container.innerHTML).not.toMatch(/<script>alert/i);
    expect(container.innerHTML).toMatch(/&lt;script&gt;/);
  });

  // ─── v0.5.8+ pi v3 type coverage ────────────────────────────────

  it("renders pi v3 meta types (model_change, thinking_level_change)", () => {
    const v3Tree: SessionTreeNode = {
      id: "root",
      type: "user",
      preview: "switch the model",
      children: [
        {
          id: "mc1",
          type: "model_change",
          preview: "→ claude-opus-4-6",
          children: [
            {
              id: "tlc1",
              type: "thinking_level_change",
              preview: "→ deep",
              children: [],
            },
          ],
        },
      ],
    };
    render(<SessionTreeExplorer root={v3Tree} locale="en" />);
    expect(screen.getByText("switch the model")).toBeTruthy();
    expect(screen.getByText("→ claude-opus-4-6")).toBeTruthy();
    expect(screen.getByText("→ deep")).toBeTruthy();
    // v3 chip labels appear in the toolbar.
    expect(screen.getByRole("button", { name: "Model" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thinking" })).toBeTruthy();
  });

  it("bucketizes toolResult / bashExecution under the 'Tool' chip", () => {
    const v3ToolTree: SessionTreeNode = {
      id: "root",
      type: "user",
      preview: "run the test",
      children: [
        {
          id: "tr1",
          type: "toolResult",
          preview: "ok (12 ms)",
          children: [],
        },
        {
          id: "be1",
          type: "bashExecution",
          preview: "npm test",
          children: [],
        },
      ],
    };
    render(<SessionTreeExplorer root={v3ToolTree} locale="en" />);
    // Both nodes visible at start.
    expect(screen.getByText("ok (12 ms)")).toBeTruthy();
    expect(screen.getByText("npm test")).toBeTruthy();

    // Toggle the Tool chip off — both nodes should disappear (they
    // bucket under "tool").
    const toolChip = screen.getByRole("button", { name: "Tool" });
    fireEvent.click(toolChip);
    expect(screen.queryByText("ok (12 ms)")).toBeNull();
    expect(screen.queryByText("npm test")).toBeNull();
    // Root still visible.
    expect(screen.getByText("run the test")).toBeTruthy();
  });

  it("bucketizes meta types (compaction, label, session_info) under 'System'", () => {
    const metaTree: SessionTreeNode = {
      id: "root",
      type: "user",
      preview: "long session",
      children: [
        { id: "c1", type: "compaction", preview: "compacted", children: [] },
        {
          id: "l1",
          type: "label",
          preview: "milestone: shipped v0.5",
          children: [],
        },
        {
          id: "si1",
          type: "session_info",
          preview: "session metadata",
          children: [],
        },
      ],
    };
    render(<SessionTreeExplorer root={metaTree} locale="en" />);

    // Toggle System chip off — all three meta entries vanish together.
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.queryByText("compacted")).toBeNull();
    expect(screen.queryByText("milestone: shipped v0.5")).toBeNull();
    expect(screen.queryByText("session metadata")).toBeNull();
    // Root stays.
    expect(screen.getByText("long session")).toBeTruthy();
  });

  it("shows a friendly capitalized label for snake_case v3 types", () => {
    const tree: SessionTreeNode = {
      id: "r",
      type: "user",
      preview: "change model",
      children: [
        {
          id: "mc",
          type: "model_change",
          preview: "to opus",
          children: [],
        },
        {
          id: "tlc",
          type: "thinking_level_change",
          preview: "to high",
          children: [],
        },
      ],
    };
    render(<SessionTreeExplorer root={tree} locale="en" />);
    // "model_change" → "Model Change"; "thinking_level_change" →
    // "Thinking Level Change". NOT raw "MODEL_CHANGE" in shouty caps.
    expect(screen.getByText("Model Change")).toBeTruthy();
    expect(screen.getByText("Thinking Level Change")).toBeTruthy();
    // And definitely NOT the raw snake_case in any form.
    expect(screen.queryByText("model_change")).toBeNull();
    expect(screen.queryByText("thinking_level_change")).toBeNull();
  });

  it("falls back to muted color for unknown types (no crash, no var(--type-unknown) error)", () => {
    const tree: SessionTreeNode = {
      id: "r",
      type: "user",
      preview: "future v4",
      children: [
        {
          id: "u1",
          type: "some_future_v4_type",
          preview: "should still render",
          children: [],
        },
      ],
    };
    // Should not throw — the bucket default keeps it under "system",
    // which maps to --type-system. We just assert the node renders.
    const { container } = render(
      <SessionTreeExplorer root={tree} locale="en" />,
    );
    expect(container.textContent).toContain("should still render");
    expect(container.textContent).toContain("Some Future V4 Type");
  });
});
