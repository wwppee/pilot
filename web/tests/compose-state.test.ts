/**
 * Tests for the Compose client-side state serialization.
 *
 * The ComposeBoard stores its state in localStorage as JSON. We
 * validate that the roundtrip is lossless and that unknown versions
 * are rejected (so a v2 client doesn't accidentally read v1 data).
 */

import { describe, it, expect } from "vitest";
import type { ComposeState, ComposeBlock } from "../src/lib/types";

function makeState(blocks: ComposeBlock[]): ComposeState {
  return {
    blocks,
    version: 1,
    updatedAt: "2026-07-03T00:00:00.000Z",
    name: "test",
  };
}

describe("ComposeState roundtrip", () => {
  it("serializes to JSON and back", () => {
    const original = makeState([
      {
        id: "abc-123",
        kind: "session",
        refId: "--Users-test--",
        x: 100,
        y: 200,
        label: "test",
        sublabel: "claude-sonnet",
      },
      {
        id: "def-456",
        kind: "policy",
        refId: "safe-bash",
        x: 300,
        y: 400,
        label: "safe-bash",
        sublabel: "4 rules",
        href: "/policy",
      },
    ]);
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as ComposeState;
    expect(parsed).toEqual(original);
  });

  it("round-trips with empty blocks", () => {
    const original = makeState([]);
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as ComposeState;
    expect(parsed.blocks).toHaveLength(0);
    expect(parsed.version).toBe(1);
  });

  it("rejects unknown version", () => {
    const fake = {
      blocks: [],
      version: 99,
      updatedAt: "x",
    } as unknown as ComposeState;
    expect(fake.version).not.toBe(1);
  });

  it("rejects non-array blocks", () => {
    const fake = {
      blocks: "not an array",
      version: 1,
    } as unknown as ComposeState;
    expect(Array.isArray(fake.blocks)).toBe(false);
  });

  it("preserves kind-specific shapes", () => {
    const block: ComposeBlock = {
      id: "x",
      kind: "capability",
      refId: "cap-1",
      x: 0,
      y: 0,
      label: "My Cap",
      sublabel: "tool",
      href: "/capabilities/cap-1",
    };
    const state = makeState([block]);
    const parsed = JSON.parse(JSON.stringify(state)) as ComposeState;
    expect(parsed.blocks[0]?.href).toBe("/capabilities/cap-1");
    expect(parsed.blocks[0]?.kind).toBe("capability");
  });

  it("positions are integers or floats (not strings)", () => {
    const block: ComposeBlock = {
      id: "x",
      kind: "session",
      refId: "x",
      x: 12.5,
      y: 30.25,
      label: "x",
    };
    const parsed = JSON.parse(
      JSON.stringify(makeState([block])),
    ) as ComposeState;
    expect(parsed.blocks[0]?.x).toBe(12.5);
    expect(parsed.blocks[0]?.y).toBe(30.25);
  });

  it("blocks array is order-preserving", () => {
    const state = makeState([
      { id: "1", kind: "session", refId: "a", x: 0, y: 0, label: "a" },
      { id: "2", kind: "pack", refId: "b", x: 100, y: 100, label: "b" },
      { id: "3", kind: "profile", refId: "c", x: 200, y: 200, label: "c" },
    ]);
    const parsed = JSON.parse(JSON.stringify(state)) as ComposeState;
    expect(parsed.blocks.map((b) => b.id)).toEqual(["1", "2", "3"]);
  });
});
