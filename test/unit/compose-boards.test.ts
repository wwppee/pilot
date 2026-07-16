/**
 * Tests for `core/compose-boards.ts` — v0.6.10 server-side
 * persistence for /compose layouts.
 *
 * Covers:
 *  1. listBoards returns [] when directory missing
 *  2. saveBoard creates + returns snapshot with id/timestamps
 *  3. saveBoard preserves createdAt across updates
 *  4. saveBoard auto-generates id when omitted
 *  5. saveBoard rejects invalid id
 *  6. loadBoard round-trips blocks + connections
 *  7. loadBoard returns null on missing / corrupt / wrong-version file
 *  8. deleteBoard returns true on hit, false on miss
 *  9. listBoards sorts by updatedAt desc
 * 10. isValidBoardId allows safe subset, rejects path traversal
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isValidBoardId,
  generateBoardId,
  listBoards,
  loadBoard,
  saveBoard,
  deleteBoard,
  renameBoard,
  composeBoardsDir,
  composeBoardPath,
  type BoardInput,
} from "../../src/core/compose-boards.js";

let fakeHome: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "pilot-compose-boards-test-"));
  originalEnv = { ...process.env };
  process.env.HOME = fakeHome;
});

afterEach(() => {
  process.env = originalEnv;
  if (existsSync(fakeHome)) {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

// ─── Path helpers ─────────────────────────────────────────────

describe("path helpers", () => {
  it("composeBoardsDir returns ~/.pilot/compose-boards", () => {
    expect(composeBoardsDir(fakeHome)).toBe(
      join(fakeHome, ".pilot", "compose-boards"),
    );
  });
  it("composeBoardPath joins the id with .json", () => {
    expect(composeBoardPath("abc", fakeHome)).toBe(
      join(fakeHome, ".pilot", "compose-boards", "abc.json"),
    );
  });
});

// ─── ID validation ────────────────────────────────────────────

describe("isValidBoardId", () => {
  it("accepts alphanumeric, dash, underscore up to 64 chars", () => {
    expect(isValidBoardId("board-1")).toBe(true);
    expect(isValidBoardId("Board_2026_07_12")).toBe(true);
    expect(isValidBoardId("a".repeat(64))).toBe(true);
  });
  it("rejects empty / whitespace / dot / slash / NUL", () => {
    expect(isValidBoardId("")).toBe(false);
    expect(isValidBoardId("..")).toBe(false);
    expect(isValidBoardId("../etc/passwd")).toBe(false);
    expect(isValidBoardId("with/slash")).toBe(false);
    expect(isValidBoardId("with space")).toBe(false);
    expect(isValidBoardId("with\nnewline")).toBe(false);
    expect(isValidBoardId("a".repeat(65))).toBe(false);
  });
  it("generateBoardId produces the documented shape", () => {
    const id = generateBoardId();
    expect(id).toMatch(/^board-[a-z0-9]+-[a-z0-9]{6}$/);
  });
});

// ─── listBoards ───────────────────────────────────────────────

describe("listBoards", () => {
  it("returns [] when the directory does not exist yet", async () => {
    const boards = await listBoards(fakeHome);
    expect(boards).toEqual([]);
  });

  it("returns one summary per saved board", async () => {
    await saveBoard(
      {
        name: "Alpha",
        version: 3,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "session A",
          },
        ],
        connections: [],
      },
      fakeHome,
    );
    await saveBoard(
      {
        name: "Beta",
        version: 3,
        blocks: [],
        connections: [],
      },
      fakeHome,
    );
    const boards = await listBoards(fakeHome);
    expect(boards).toHaveLength(2);
    const byName = Object.fromEntries(boards.map((b) => [b.name, b]));
    expect(byName.Alpha?.blockCount).toBe(1);
    expect(byName.Alpha?.connectionCount).toBe(0);
    expect(byName.Beta?.blockCount).toBe(0);
  });

  it("sorts newest-first by updatedAt", async () => {
    const a = await saveBoard(
      { name: "A", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    // Force a 1ms+ gap so the second save has a strictly later
    // timestamp — Date.now() can collide under fast tests.
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveBoard(
      { name: "B", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const boards = await listBoards(fakeHome);
    expect(boards[0]?.id).toBe(b.id);
    expect(boards[1]?.id).toBe(a.id);
  });

  it("skips corrupt JSON files without throwing", async () => {
    await saveBoard(
      { name: "Good", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    // Drop a malformed file in the same dir
    writeFileSync(
      join(composeBoardsDir(fakeHome), "broken.json"),
      "{ this is not json",
    );
    const boards = await listBoards(fakeHome);
    expect(boards.map((b) => b.name)).toEqual(["Good"]);
  });
});

// ─── loadBoard ────────────────────────────────────────────────

describe("loadBoard", () => {
  it("round-trips blocks and connections through save → load", async () => {
    const saved = await saveBoard(
      {
        name: "Round-trip",
        version: 3,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 12.5,
            y: 30,
            label: "s1",
            sublabel: "claude-sonnet",
            href: "/sessions/abc",
          },
          {
            id: "b2",
            kind: "profile",
            refId: "p1",
            x: 400,
            y: 100,
            label: "fast",
          },
        ],
        connections: [
          {
            id: "c1",
            from: "b1",
            to: "b2",
            label: "via npm",
            kind: "uses",
          },
        ],
      },
      fakeHome,
    );
    const loaded = await loadBoard(saved.id, fakeHome);
    expect(loaded).not.toBeNull();
    expect(loaded?.blocks).toHaveLength(2);
    expect(loaded?.connections).toHaveLength(1);
    expect(loaded?.connections?.[0]?.label).toBe("via npm");
    expect(loaded?.connections?.[0]?.kind).toBe("uses");
  });

  it("returns null when the id does not exist", async () => {
    const loaded = await loadBoard("never-saved", fakeHome);
    expect(loaded).toBeNull();
  });

  it("returns null on a corrupt JSON file", async () => {
    // save once first to materialise the directory, then drop a
    // malformed file next to it. Avoids a mkdir import just for
    // a test setup.
    await saveBoard(
      { name: "_seed", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const dir = composeBoardsDir(fakeHome);
    writeFileSync(join(dir, "broken.json"), "{ not json", { flag: "w" });
    const loaded = await loadBoard("broken", fakeHome);
    expect(loaded).toBeNull();
  });

  it("returns null when id is unsafe (path traversal)", async () => {
    // isValidBoardId gates everything; even if the file exists
    // we won't try to read it. The directory may not even
    // exist yet — this just exercises the safety check.
    const loaded = await loadBoard("../etc/passwd", fakeHome);
    expect(loaded).toBeNull();
  });

  it("returns null on unknown future version (defensive against schema drift)", async () => {
    await saveBoard(
      { name: "_seed", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const dir = composeBoardsDir(fakeHome);
    writeFileSync(
      join(dir, "future.json"),
      JSON.stringify({
        id: "future",
        name: "future",
        blocks: [],
        connections: [],
        version: 99,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    );
    const loaded = await loadBoard("future", fakeHome);
    expect(loaded).toBeNull();
  });
});

// ─── saveBoard ────────────────────────────────────────────────

describe("saveBoard", () => {
  it("returns a snapshot with id, createdAt, updatedAt filled in", async () => {
    const input: BoardInput = {
      name: "Test",
      version: 3,
      blocks: [],
      connections: [],
    };
    const saved = await saveBoard(input, fakeHome);
    expect(saved.id).toMatch(/^board-[a-z0-9]+-[a-z0-9]{6}$/);
    expect(typeof saved.createdAt).toBe("string");
    expect(typeof saved.updatedAt).toBe("string");
    expect(new Date(saved.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("preserves createdAt across updates", async () => {
    const first = await saveBoard(
      { name: "Persist", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveBoard(
      {
        id: first.id,
        name: "Persist",
        version: 3,
        blocks: [
          {
            id: "b-new",
            kind: "session",
            refId: "r",
            x: 0,
            y: 0,
            label: "added",
          },
        ],
        connections: [],
      },
      fakeHome,
    );
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.blocks).toHaveLength(1);
  });

  it("auto-generates an id when not provided", async () => {
    const a = await saveBoard(
      { name: "auto-1", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const b = await saveBoard(
      { name: "auto-2", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    expect(a.id).not.toBe(b.id);
  });

  it("honours caller-supplied id", async () => {
    const saved = await saveBoard(
      {
        id: "my-board",
        name: "Custom",
        version: 3,
        blocks: [],
        connections: [],
      },
      fakeHome,
    );
    expect(saved.id).toBe("my-board");
  });

  it("rejects invalid id (path traversal / too long / empty)", async () => {
    await expect(
      saveBoard(
        {
          id: "../escape",
          name: "x",
          version: 3,
          blocks: [],
          connections: [],
        },
        fakeHome,
      ),
    ).rejects.toThrow(/invalid board id/);

    await expect(
      saveBoard(
        {
          id: "a".repeat(65),
          name: "x",
          version: 3,
          blocks: [],
          connections: [],
        },
        fakeHome,
      ),
    ).rejects.toThrow(/invalid board id/);
  });

  it("rejects an invalid kind on a connection", async () => {
    await expect(
      saveBoard(
        {
          name: "bad kind",
          version: 3,
          blocks: [],
          connections: [
            {
              id: "c-bad",
              from: "b1",
              to: "b2",
              // @ts-expect-error — runtime check
              kind: "bogus",
            },
          ],
        },
        fakeHome,
      ),
    ).rejects.toThrow();
  });

  it("rejects a connection whose from / to are empty", async () => {
    await expect(
      saveBoard(
        {
          name: "missing ref",
          version: 3,
          blocks: [],
          connections: [
            {
              id: "c-noop",
              from: "",
              to: "b2",
            },
          ],
        },
        fakeHome,
      ),
    ).rejects.toThrow();
  });
});

// ─── deleteBoard ──────────────────────────────────────────────

describe("deleteBoard", () => {
  it("returns true when the file existed and was removed", async () => {
    const saved = await saveBoard(
      { name: "x", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const ok = await deleteBoard(saved.id, fakeHome);
    expect(ok).toBe(true);
    const reloaded = await loadBoard(saved.id, fakeHome);
    expect(reloaded).toBeNull();
  });

  it("returns false when the file was already gone", async () => {
    const ok = await deleteBoard("never-existed", fakeHome);
    expect(ok).toBe(false);
  });

  it("returns false on an unsafe id (no filesystem touch)", async () => {
    const ok = await deleteBoard("../../etc/passwd", fakeHome);
    expect(ok).toBe(false);
  });
});

// ─── Composite: list reflects save / delete ──────────────────

describe("list ↔ save ↔ delete roundtrip", () => {
  it("list shrinks as boards are deleted", async () => {
    const a = await saveBoard(
      { name: "A", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const b = await saveBoard(
      { name: "B", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    expect(await listBoards(fakeHome)).toHaveLength(2);
    await deleteBoard(a.id, fakeHome);
    const after = await listBoards(fakeHome);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(b.id);
  });
});

// ─── renameBoard (v0.6.12) ───────────────────────────────────

describe("renameBoard", () => {
  it("updates the name and preserves blocks / connections", async () => {
    const saved = await saveBoard(
      {
        name: "Original",
        version: 3,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 10,
            y: 20,
            label: "session A",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b1", label: "self" }],
      },
      fakeHome,
    );
    const renamed = await renameBoard(saved.id, "New name", fakeHome);
    expect(renamed).not.toBeNull();
    expect(renamed?.name).toBe("New name");
    expect(renamed?.id).toBe(saved.id);
    expect(renamed?.blocks).toEqual(saved.blocks);
    expect(renamed?.connections).toEqual(saved.connections);
  });

  it("preserves createdAt and bumps updatedAt", async () => {
    const saved = await saveBoard(
      { name: "X", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    // 5ms gap so updatedAt is strictly later (Date.now() can
    // collide under fast tests).
    await new Promise((r) => setTimeout(r, 5));
    const renamed = await renameBoard(saved.id, "X renamed", fakeHome);
    expect(renamed?.createdAt).toBe(saved.createdAt);
    expect(new Date(renamed!.updatedAt).getTime()).toBeGreaterThan(
      new Date(saved.updatedAt).getTime(),
    );
  });

  it("trims surrounding whitespace before persisting", async () => {
    const saved = await saveBoard(
      { name: "X", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const renamed = await renameBoard(saved.id, "  Hello  ", fakeHome);
    expect(renamed?.name).toBe("Hello");
  });

  it("returns null for an empty / whitespace-only name", async () => {
    const saved = await saveBoard(
      { name: "X", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    expect(await renameBoard(saved.id, "", fakeHome)).toBeNull();
    expect(await renameBoard(saved.id, "   ", fakeHome)).toBeNull();
    // The original file is untouched.
    const reloaded = await loadBoard(saved.id, fakeHome);
    expect(reloaded?.name).toBe("X");
  });

  it("returns null for a name longer than 200 chars", async () => {
    const saved = await saveBoard(
      { name: "X", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    const result = await renameBoard(saved.id, "a".repeat(201), fakeHome);
    expect(result).toBeNull();
  });

  it("returns null when the board doesn't exist", async () => {
    const result = await renameBoard("never-existed", "Whatever", fakeHome);
    expect(result).toBeNull();
  });

  it("returns null for an unsafe id (path traversal guard)", async () => {
    const result = await renameBoard("../etc/passwd", "pwned", fakeHome);
    expect(result).toBeNull();
  });

  it("rename is reflected in the next listBoards call", async () => {
    const saved = await saveBoard(
      { name: "Original", version: 3, blocks: [], connections: [] },
      fakeHome,
    );
    await renameBoard(saved.id, "Renamed", fakeHome);
    const list = await listBoards(fakeHome);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Renamed");
  });
});

// ─── v0.6.18: schema v4 + connection direction ─────────────

describe("v0.6.18 schema v4 + connection direction", () => {
  it("accepts version 4 with `dir` on connections", async () => {
    const saved = await saveBoard(
      {
        name: "V4",
        version: 4,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "A",
          },
          {
            id: "b2",
            kind: "session",
            refId: "r2",
            x: 100,
            y: 0,
            label: "B",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b2", dir: "bidirectional" }],
      },
      fakeHome,
    );
    expect(saved.version).toBe(4);
    expect(saved.connections[0]?.dir).toBe("bidirectional");
  });

  it("rejects an unknown dir value (zod enum)", async () => {
    // v0.6.18: saveBoard runs the input through the Zod schema;
    // an out-of-set dir must throw rather than silently
    // round-tripping as "forward". This is the v0.6.11 §9.6
    // pattern ("error 400 vs silent default") applied to the
    // new enum.
    await expect(
      saveBoard(
        {
          name: "BadDir",
          version: 4,
          blocks: [
            {
              id: "b1",
              kind: "session",
              refId: "r1",
              x: 0,
              y: 0,
              label: "A",
            },
          ],
          connections: [
            { id: "c1", from: "b1", to: "b1", dir: "sideways" as never },
          ],
        },
        fakeHome,
      ),
    ).rejects.toThrow();
  });

  it("loads v3 boards without dir field unchanged", async () => {
    // v0.6.18 backward-compat: a v3 board saved before the dir
    // field existed must still load — dir defaults to undefined
    // in the loaded snapshot, and the caller is expected to
    // treat that as "forward".
    const v3 = await saveBoard(
      {
        name: "V3",
        version: 3,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "A",
          },
          {
            id: "b2",
            kind: "session",
            refId: "r2",
            x: 100,
            y: 0,
            label: "B",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b2" }],
      },
      fakeHome,
    );
    const reloaded = await loadBoard(v3.id, fakeHome);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.version).toBe(3);
    expect(reloaded?.connections[0]?.dir).toBeUndefined();
  });
});

// ─── v0.6.19: schema v5 + connection color ─────────────

describe("v0.6.19 schema v5 + connection color", () => {
  it("accepts version 5 with a hex `color` on a connection", async () => {
    // v0.6.19: the server's zod schema accepts #rgb / #rgba /
    // #rrggbb / #rrggbbaa. The native <input type="color">
    // always emits #rrggbb, so that's the format the picker
    // round-trips, but the regex is wider to leave room for
    // future palette presets that want alpha.
    const saved = await saveBoard(
      {
        name: "V5",
        version: 5,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "A",
          },
          {
            id: "b2",
            kind: "session",
            refId: "r2",
            x: 100,
            y: 0,
            label: "B",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b2", color: "#ff8800" }],
      },
      fakeHome,
    );
    expect(saved.version).toBe(5);
    expect(saved.connections[0]?.color).toBe("#ff8800");
  });

  it("accepts v5 connections without `color` (theme default)", async () => {
    // v0.6.19: missing `color` is the default — the rendered
    // SVG falls back to currentColor, so a v5 save without
    // any color override must round-trip cleanly.
    const saved = await saveBoard(
      {
        name: "V5NoColor",
        version: 5,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "A",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b1" }],
      },
      fakeHome,
    );
    const reloaded = await loadBoard(saved.id, fakeHome);
    expect(reloaded?.connections[0]?.color).toBeUndefined();
  });

  it("rejects a non-hex `color` value (zod regex)", async () => {
    // v0.6.19: named colors and rgb()/hsl() are deliberately
    // rejected — the picker emits hex and the renderer needs
    // a stable format for the `style.color` cascade. If the
    // user wants a theme color they leave the field empty.
    await expect(
      saveBoard(
        {
          name: "BadColor",
          version: 5,
          blocks: [
            {
              id: "b1",
              kind: "session",
              refId: "r1",
              x: 0,
              y: 0,
              label: "A",
            },
          ],
          connections: [
            { id: "c1", from: "b1", to: "b1", color: "crimson" as never },
          ],
        },
        fakeHome,
      ),
    ).rejects.toThrow();
  });

  it("loads v4 boards without `color` unchanged", async () => {
    // v0.6.19 backward-compat: v4 boards saved before the
    // color field existed must still load — color is
    // undefined on the loaded connection, and the renderer
    // treats that as "use theme accent" (no `style.color`).
    const v4 = await saveBoard(
      {
        name: "V4NoColor",
        version: 4,
        blocks: [
          {
            id: "b1",
            kind: "session",
            refId: "r1",
            x: 0,
            y: 0,
            label: "A",
          },
          {
            id: "b2",
            kind: "session",
            refId: "r2",
            x: 100,
            y: 0,
            label: "B",
          },
        ],
        connections: [{ id: "c1", from: "b1", to: "b2", dir: "forward" }],
      },
      fakeHome,
    );
    const reloaded = await loadBoard(v4.id, fakeHome);
    expect(reloaded?.version).toBe(4);
    expect(reloaded?.connections[0]?.color).toBeUndefined();
  });
});
