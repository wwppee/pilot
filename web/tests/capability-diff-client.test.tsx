/**
 * capability-diff-client.test.tsx — coverage for the v0.5.1 diff UI.
 *
 * The picker state lives in the URL search params (via Next.js
 * router), so we mock `next/navigation` ONCE at the top and control
 * pickers via the `useSearchParams` mock per test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const pushMock = vi.fn();
let mockSearchParams = new URLSearchParams("?a=cap-a&b=cap-b");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => mockSearchParams,
}));

import { CapabilityDiffClient } from "../src/components/CapabilityDiffClient";
import type { Capability, CapabilityDiff } from "../src/lib/types";

const t = (k: string, params?: Record<string, string | number>) => {
  const raw = k;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? ""));
};

const fakeCaps: Capability[] = [
  {
    id: "cap-a",
    title: "Cap A",
    type: "integration",
    description: "first",
    sources: [{ type: "npm", ref: "npm:a", mode: "L1-referenced" }],
    artifacts: {},
    compatibility: { conflicts: [], requires: [] },
    metadata: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
  {
    id: "cap-b",
    title: "Cap B",
    type: "tool",
    description: "second",
    sources: [{ type: "npm", ref: "npm:b", mode: "L1-referenced" }],
    artifacts: {},
    compatibility: { conflicts: [], requires: [] },
    metadata: {
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    },
  },
];

const fakeDiff: CapabilityDiff = {
  aId: "cap-a",
  bId: "cap-b",
  equal: false,
  title: { status: "drift", a: "Cap A", b: "Cap B" },
  type: { status: "drift", a: "integration", b: "tool" },
  description: { status: "drift", a: "first", b: "second" },
  sources: { status: "drift", a: ["npm:a"], b: ["npm:b"] },
  sourceDetails: [
    {
      ref: "npm:a",
      status: "missing",
      a: { type: "npm", ref: "npm:a", mode: "L1-referenced" },
    },
    {
      ref: "npm:b",
      status: "extra",
      b: { type: "npm", ref: "npm:b", mode: "L1-referenced" },
    },
  ],
  artifacts: {
    extensions: { status: "match", a: [], b: [] },
    skills: { status: "match", a: [], b: [] },
    prompts: { status: "match", a: [], b: [] },
    themes: { status: "match", a: [], b: [] },
  },
  eval: { status: "match", note: "both absent" },
  compatibility: {
    conflicts: { status: "match", a: [], b: [] },
    requires: { status: "match", a: [], b: [] },
  },
  metadata: {
    inspiredBy: { status: "match", a: [], b: [] },
    tags: { status: "match", a: [], b: [] },
    createdAt: {
      status: "drift",
      a: "2026-01-01T00:00:00.000Z",
      b: "2026-02-01T00:00:00.000Z",
    },
    updatedAt: {
      status: "drift",
      a: "2026-01-01T00:00:00.000Z",
      b: "2026-02-01T00:00:00.000Z",
    },
  },
};

beforeEach(() => {
  mockSearchParams = new URLSearchParams("?a=cap-a&b=cap-b");
  pushMock.mockClear();
});

describe("CapabilityDiffClient", () => {
  it("renders the empty state when fewer than 2 capabilities exist", () => {
    render(
      <CapabilityDiffClient
        capabilities={[fakeCaps[0]!]}
        initialDiff={null}
        t={t}
      />,
    );
    expect(screen.getByText("capdiff.empty")).toBeTruthy();
  });

  it("renders the diff table with status badges when initialDiff is provided", () => {
    render(
      <CapabilityDiffClient
        capabilities={fakeCaps}
        initialDiff={fakeDiff}
        t={t}
      />,
    );
    expect(screen.getByText("capdiff.unequal")).toBeTruthy();
    // Drift badges are present (status="drift" appears multiple times
    // — once per drifting field). Use getAllByText to count.
    const driftBadges = screen.getAllByText("drift");
    expect(driftBadges.length).toBeGreaterThan(0);
  });

  it("renders 'Identical' header when diff.equal=true", () => {
    render(
      <CapabilityDiffClient
        capabilities={fakeCaps}
        initialDiff={{ ...fakeDiff, equal: true }}
        t={t}
      />,
    );
    expect(screen.getByText("capdiff.equal")).toBeTruthy();
  });

  it("renders the notFound banner when initialDiff=null but pickers set", () => {
    render(
      <CapabilityDiffClient capabilities={fakeCaps} initialDiff={null} t={t} />,
    );
    expect(screen.getByText("capdiff.notFound")).toBeTruthy();
  });

  it("shows evalAbsent when eval.status='match' with note='both absent'", () => {
    render(
      <CapabilityDiffClient
        capabilities={fakeCaps}
        initialDiff={fakeDiff}
        t={t}
      />,
    );
    // Both A and B columns show "evalAbsent" since neither side has
    // an eval block. The two values are inside separate <td>s so
    // getAllByText is correct here.
    expect(screen.getAllByText("capdiff.evalAbsent").length).toBe(2);
  });

  it("shows the empty subtitle when no pickers are set", () => {
    mockSearchParams = new URLSearchParams("");
    render(
      <CapabilityDiffClient capabilities={fakeCaps} initialDiff={null} t={t} />,
    );
    // With no pickers, we show the instructional subtitle.
    expect(screen.getByText("capdiff.subtitle")).toBeTruthy();
  });

  it("swap button is disabled when pickers are empty", () => {
    mockSearchParams = new URLSearchParams("");
    render(
      <CapabilityDiffClient capabilities={fakeCaps} initialDiff={null} t={t} />,
    );
    const swap = screen.getByRole("button", { name: /swap/i });
    expect(swap.hasAttribute("disabled")).toBe(true);
  });

  it("swap button is enabled when both pickers are set", () => {
    render(
      <CapabilityDiffClient
        capabilities={fakeCaps}
        initialDiff={fakeDiff}
        t={t}
      />,
    );
    const swap = screen.getByRole("button", { name: /swap/i });
    expect(swap.hasAttribute("disabled")).toBe(false);
  });
});
