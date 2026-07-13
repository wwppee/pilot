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
