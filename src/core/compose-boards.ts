/**
 * v0.6.10: server-side persistence for /compose boards.
 *
 * Each board is one `ComposeState` JSON file under
 * `~/.pilot/compose-boards/<safe-id>.json`. The web client keeps
 * the canonical editor (localStorage + undo/redo) and uses these
 * APIs as a "Save to server" / "Load from server" affordance
 * (the dedicated list page `/compose/boards` lands in v0.6.11).
 *
 * Why JSON (not TOML like plans):
 *   - matches the web's localStorage format byte-for-byte, so
 *     save/load is a 1-line copy instead of a schema round-trip
 *   - `kind` / `label` fields are free-form user text — TOML
 *     escaping is unnecessary friction
 *   - v0.4.4 already serialises to JSON for export/import, so
 *     this is the path of least surprise
 *
 * File naming: `<safe-id>.json` where safe-id = alphanumeric +
 * dash + underscore, max 64 chars. Anything else is rejected at
 * `saveBoard` (we don't want a board named `../../etc/passwd` to
 * land in our JSON file).
 */

import { join } from "node:path";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { z } from "zod";
import { pilotDir } from "./types.js";

// ─── Path helpers ─────────────────────────────────────────────

/** Directory for persisted compose boards. */
export function composeBoardsDir(home?: string): string {
  return `${pilotDir(home)}/compose-boards`;
}

/** Path to a single board's JSON file. */
export function composeBoardPath(id: string, home?: string): string {
  return join(composeBoardsDir(home), `${id}.json`);
}

// ─── ID validation ────────────────────────────────────────────

/**
 * v0.6.10: board ids are user-provided (or auto-generated as
 * `board-<timestamp>-<random>`). We constrain to a safe subset
 * so the file-system mapping is unambiguous and we never end up
 * with a board named `..` or with NUL bytes.
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidBoardId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

/** Auto-generated id used when the client doesn't supply one. */
export function generateBoardId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `board-${ts}-${rand}`;
}

// ─── Zod schemas ─────────────────────────────────────────────

/**
 * One block on the compose canvas. Mirrors web/src/lib/types.ts
 * `ComposeBlock` — keep in sync if web adds new optional fields.
 * `kind` is left as a free string (instead of a closed enum) so
 * Pilot can introduce new entity kinds server-side without a
 * server version bump.
 */
const BlockSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  refId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  label: z.string(),
  sublabel: z.string().optional(),
  href: z.string().optional(),
});

/**
 * One edge between two blocks. v0.6.7 baseline + v0.6.9 free-text
 * label and `ConnectionLabelKind` enum (the enum is verified as a
 * string here — web UI prevents anything else from being set).
 */
const ConnectionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  kind: z
    .enum(["flows", "uses", "feeds", "depends", "produces", "manual"])
    .optional(),
});

/**
 * The persisted shape on disk. Includes `id` (file identity) +
 * `createdAt` (never changes after first save) in addition to
 * the `ComposeState`-shaped payload.
 *
 * `version: 3` matches web's `ComposeState.version`; the loader
 * accepts 1/2/3 so old saves keep loading. See `migrateBoard`.
 */
export const BoardSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  blocks: z.array(BlockSchema),
  connections: z.array(ConnectionSchema).default([]),
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  updatedAt: z.string(),
  createdAt: z.string(),
});

export type BoardSnapshot = z.infer<typeof BoardSnapshotSchema>;

/** Input shape for `saveBoard` — id optional, derived from `name` if absent. */
export const BoardInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  blocks: z.array(BlockSchema),
  connections: z.array(ConnectionSchema).default([]),
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
});

export type BoardInput = z.infer<typeof BoardInputSchema>;

/** Lightweight summary returned by `listBoards` (no blocks / connections). */
export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  blockCount: number;
  connectionCount: number;
}

// ─── List ─────────────────────────────────────────────────────

/**
 * v0.6.10: list every persisted board, sorted newest first.
 * Returns [] when the directory doesn't exist yet (first run).
 * Corrupt files are silently skipped (one bad board shouldn't
 * take down the whole sidebar).
 */
export async function listBoards(home?: string): Promise<BoardSummary[]> {
  const dir = composeBoardsDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: BoardSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const id = entry.slice(0, -".json".length);
    const board = await loadBoard(id, home);
    if (!board) continue;
    results.push({
      id: board.id,
      name: board.name,
      updatedAt: board.updatedAt,
      createdAt: board.createdAt,
      blockCount: board.blocks.length,
      connectionCount: (board.connections ?? []).length,
    });
  }
  return results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

// ─── Load ─────────────────────────────────────────────────────

/**
 * v0.6.10: load a single board by id. Returns null on missing
 * file OR schema validation failure (corrupt JSON, version
 * we don't know). Callers should treat null as "not found" — the
 * /compose/boards page can show "this board is corrupt" only
 * once we have a dedicated inspector (planned v0.6.11).
 */
export async function loadBoard(
  id: string,
  home?: string,
): Promise<BoardSnapshot | null> {
  if (!isValidBoardId(id)) return null;
  const file = composeBoardPath(id, home);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = BoardSnapshotSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

// ─── Save ─────────────────────────────────────────────────────

/**
 * v0.6.10: create or update a board. When `id` is omitted, the
 * function derives one (auto-generated) so the client can POST
 * a "save my current state" payload without thinking about
 * identity.
 *
 * The first save of a new board captures `createdAt`; subsequent
 * saves preserve it. `updatedAt` always reflects the current
 * call's timestamp.
 */
export async function saveBoard(
  input: BoardInput,
  home?: string,
): Promise<BoardSnapshot> {
  const now = new Date().toISOString();
  // Derive id if absent. Prefer the input's id when supplied.
  const id = input.id ?? generateBoardId();
  if (!isValidBoardId(id)) {
    throw new Error(`invalid board id: must match ${SAFE_ID_PATTERN.source}`);
  }
  // Preserve createdAt on update; assign on first save.
  const existing = await loadBoard(id, home);
  const createdAt = existing?.createdAt ?? now;
  const snapshot: BoardSnapshot = BoardSnapshotSchema.parse({
    id,
    name: input.name,
    blocks: input.blocks,
    connections: input.connections,
    version: input.version,
    updatedAt: now,
    createdAt,
  });
  const dir = composeBoardsDir(home);
  await mkdir(dir, { recursive: true });
  const file = composeBoardPath(id, home);
  // Write to a temp file then rename — atomic save so a crash
  // mid-write doesn't leave a corrupt `.json`. (Same pattern
  // plan-history uses for snapshot writes.)
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf-8");
  await unlink(file).catch(() => {
    /* missing is fine */
  });
  await writeFile(file, JSON.stringify(snapshot, null, 2), "utf-8");
  await unlink(tmp).catch(() => {
    /* best-effort cleanup */
  });
  return snapshot;
}

// ─── Delete ───────────────────────────────────────────────────

/**
 * v0.6.10: delete a board. Returns true when the file existed
 * and was removed; false when the id was invalid or the file
 * was already gone.
 */
export async function deleteBoard(id: string, home?: string): Promise<boolean> {
  if (!isValidBoardId(id)) return false;
  const file = composeBoardPath(id, home);
  try {
    await stat(file);
  } catch {
    return false;
  }
  await unlink(file);
  return true;
}
