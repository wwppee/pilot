/**
 * capability-diff.test.ts — coverage for core/capability-diff.ts.
 *
 * Pure-function tests — no fs side-effects, no mocking needed.
 */

import { describe, it, expect } from "vitest";
import { diffCapability } from "../../src/core/capability-diff.js";
import type { Capability } from "../../src/core/capability.js";

function makeCap(overrides: Partial<Capability> = {}): Capability {
  return {
    id: "test-cap",
    title: "Test Capability",
    type: "integration",
    description: "A test capability",
    sources: [{ type: "npm", ref: "npm:test@1.0.0", mode: "L1-referenced" }],
    artifacts: {},
    compatibility: { conflicts: [], requires: [] },
    metadata: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("diffCapability — equal", () => {
  it("returns equal=true for two identical capabilities", () => {
    const a = makeCap();
    const b = makeCap();
    expect(diffCapability(a, b).equal).toBe(true);
  });

  it("returns equal=true even when createdAt/updatedAt differ — wait, it should NOT", () => {
    // We DO diff createdAt/updatedAt because the user should know
    // if one is stale. Document the actual behavior.
    const a = makeCap();
    const b = makeCap({
      metadata: {
        ...a.metadata,
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    });
    const diff = diffCapability(a, b);
    expect(diff.equal).toBe(false);
    expect(diff.metadata.updatedAt.status).toBe("drift");
  });
});

describe("diffCapability — scalar fields", () => {
  it("title drift when strings differ", () => {
    const a = makeCap({ title: "Old" });
    const b = makeCap({ title: "New" });
    const diff = diffCapability(a, b);
    expect(diff.title.status).toBe("drift");
    expect(diff.title.a).toBe("Old");
    expect(diff.title.b).toBe("New");
    expect(diff.equal).toBe(false);
  });

  it("type drift when enums differ", () => {
    const diff = diffCapability(
      makeCap({ type: "tool" }),
      makeCap({ type: "integration" }),
    );
    expect(diff.type.status).toBe("drift");
  });

  it("description match when identical", () => {
    const diff = diffCapability(
      makeCap({ description: "same" }),
      makeCap({ description: "same" }),
    );
    expect(diff.description.status).toBe("match");
  });
});

describe("diffCapability — sources", () => {
  it("sources match when both have identical refs", () => {
    const diff = diffCapability(makeCap(), makeCap());
    expect(diff.sources.status).toBe("match");
    expect(diff.sourceDetails).toHaveLength(1);
    expect(diff.sourceDetails[0]?.status).toBe("match");
  });

  it("source missing when A has it but B doesn't", () => {
    const a = makeCap({
      sources: [{ type: "npm", ref: "npm:a", mode: "L1-referenced" }],
    });
    const b = makeCap({
      sources: [{ type: "npm", ref: "npm:b", mode: "L1-referenced" }],
    });
    const diff = diffCapability(a, b);
    expect(diff.sources.status).toBe("drift");
    const aSide = diff.sourceDetails.find((d) => d.ref === "npm:a");
    const bSide = diff.sourceDetails.find((d) => d.ref === "npm:b");
    expect(aSide?.status).toBe("missing");
    expect(bSide?.status).toBe("extra");
  });

  it("source drift when same ref but mode changed", () => {
    const a = makeCap({
      sources: [{ type: "npm", ref: "npm:foo", mode: "L1-referenced" }],
    });
    const b = makeCap({
      sources: [{ type: "npm", ref: "npm:foo", mode: "L2-wrapped" }],
    });
    const diff = diffCapability(a, b);
    expect(diff.sources.status).toBe("match"); // refs match
    expect(diff.sourceDetails[0]?.status).toBe("drift"); // but mode differs
    expect(diff.equal).toBe(false);
  });
});

describe("diffCapability — artifacts", () => {
  it("extensions match when both empty", () => {
    const diff = diffCapability(makeCap(), makeCap());
    expect(diff.artifacts.extensions.status).toBe("match");
    expect(diff.artifacts.skills.status).toBe("match");
  });

  it("skills missing/extra between A and B", () => {
    const a = makeCap({ artifacts: { skills: ["s1", "s2"] } });
    const b = makeCap({ artifacts: { skills: ["s2", "s3"] } });
    const diff = diffCapability(a, b);
    expect(diff.artifacts.skills.status).toBe("drift");
    expect(diff.artifacts.skills.a).toEqual(["s1", "s2"]);
    expect(diff.artifacts.skills.b).toEqual(["s2", "s3"]);
  });
});

describe("diffCapability — eval", () => {
  it("eval match with note when both absent", () => {
    const diff = diffCapability(makeCap(), makeCap());
    expect(diff.eval.status).toBe("match");
    if ("note" in diff.eval) {
      expect(diff.eval.note).toBe("both absent");
    } else {
      throw new Error("expected note variant");
    }
  });

  it("eval missing when A has it but B doesn't", () => {
    const a = makeCap({
      eval: { score: 0.9, lastRun: "2026-01-01T00:00:00Z", fixtureCount: 5 },
    });
    const b = makeCap();
    const diff = diffCapability(a, b);
    expect(diff.eval.status).toBe("missing");
  });

  it("eval drift when scores differ", () => {
    const a = makeCap({
      eval: { score: 0.9, lastRun: "2026-01-01T00:00:00Z", fixtureCount: 5 },
    });
    const b = makeCap({
      eval: { score: 0.7, lastRun: "2026-01-01T00:00:00Z", fixtureCount: 5 },
    });
    const diff = diffCapability(a, b);
    expect(diff.eval.status).toBe("drift");
  });

  it("eval match when both present and equal", () => {
    const ev = { score: 0.9, lastRun: "2026-01-01T00:00:00Z", fixtureCount: 5 };
    const diff = diffCapability(
      makeCap({ eval: ev }),
      makeCap({ eval: { ...ev } }),
    );
    expect(diff.eval.status).toBe("match");
  });
});

describe("diffCapability — compatibility", () => {
  it("conflicts match when both empty", () => {
    expect(
      diffCapability(makeCap(), makeCap()).compatibility.conflicts.status,
    ).toBe("match");
  });

  it("requires drift when A has node>=20 and B has node>=22", () => {
    const a = makeCap({
      compatibility: { conflicts: [], requires: ["node>=20"] },
    });
    const b = makeCap({
      compatibility: { conflicts: [], requires: ["node>=22"] },
    });
    const diff = diffCapability(a, b);
    expect(diff.compatibility.requires.status).toBe("drift");
  });
});

describe("diffCapability — metadata", () => {
  it("inspiredBy missing when A has it but B doesn't", () => {
    const a = makeCap({
      metadata: {
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        inspiredBy: ["other-cap"],
      },
    });
    const b = makeCap();
    const diff = diffCapability(a, b);
    expect(diff.metadata.inspiredBy.status).toBe("missing");
  });

  it("tags extra when B has them but A doesn't", () => {
    const a = makeCap();
    const b = makeCap({
      metadata: {
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tags: ["beta"],
      },
    });
    const diff = diffCapability(a, b);
    expect(diff.metadata.tags.status).toBe("extra");
  });
});

describe("diffCapability — overall equal", () => {
  it("equal=true with deeply nested metadata equality", () => {
    const cap = makeCap();
    expect(
      diffCapability(cap, JSON.parse(JSON.stringify(cap)) as Capability).equal,
    ).toBe(true);
  });

  it("equal=false when ANY non-id field drifts", () => {
    const base = makeCap();
    const drifted = makeCap({ title: "Different Title" });
    expect(diffCapability(base, drifted).equal).toBe(false);
  });
});
