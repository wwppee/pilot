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
  rename,
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
 * v0.6.18: connection direction. Same (from, to) pair can
 * have up to three connections (one per direction); a
 * `"bidirectional"` connection is the same as having both
 * a `"forward"` and a `"backward"` connection collapsed into
 * one — semantically they're equivalent, but the user
 * picked bidirectional for "this is a back-and-forth, not
 * two separate edges" intent.
 */
const ConnectionDirectionSchema = z.enum([
  "forward",
  "backward",
  "bidirectional",
]);

/**
 * v0.6.19: per-edge color override. Constrained to `#`-prefixed
 * 3/4/6/8-digit hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`)
 * because that's the exact format the native `<input type="color">`
 * produces, so the picker → save → load → render round-trip is
 * byte-stable. Named colors (`"red"`, `"crimson"`, ...) and
 * `rgb()`/`hsl()` are deliberately rejected — if the user wants
 * a theme color, they leave the field empty and the renderer
 * falls back to the theme's `currentColor`.
 */
const ConnectionColorSchema = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{3,8}$/,
    "color must be #rgb / #rgba / #rrggbb / #rrggbbaa hex",
  )
  .optional();

/**
 * v0.6.20: routing style of the connection line.
 *
 * - `"curve"` (default when missing) — cubic bezier, the
 *   v0.6.19 look.
 * - `"orthogonal"` — 3-segment right-angle polyline (the
 *   same `<path>` element with multiple `L` commands; the
 *   marker-end / marker-start logic from v0.6.18 keeps
 *   working because the last segment is still horizontal).
 *
 * Block-center avoidance is out of scope for v0.6.20 —
 * adding a real A* grid router on top is a separate
 * concern. This enum gives us the rendering styles; a
 * future version can add a `routeHints?: { waypoints }`
 * field or a sibling `obstacleAvoidance?: boolean` without
 * a v7 bump.
 */
const ConnectionRouteSchema = z.enum(["curve", "orthogonal"]);

/**
 * One edge between two blocks. v0.6.7 baseline + v0.6.9 free-text
 * label and `ConnectionLabelKind` enum (the enum is verified as a
 * string here — web UI prevents anything else from being set).
 *
 * v0.6.18: optional `dir` field. When missing, the loader
 * defaults to `"forward"` so v1-v3 boards load with the same
 * single-arrow look the user is used to.
 *
 * v0.6.19: optional `color` field. Hex CSS color used as the SVG
 * stroke; missing falls back to the theme accent (currentColor).
 *
 * v0.6.20: optional `route` field. "curve" (default) or
 * "orthogonal". Missing falls back to "curve", so v0.6.19
 * boards render unchanged.
 */
const ConnectionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  kind: z
    .enum(["flows", "uses", "feeds", "depends", "produces", "manual"])
    .optional(),
  dir: ConnectionDirectionSchema.optional(),
  color: ConnectionColorSchema,
  route: ConnectionRouteSchema.optional(),
});

/**
 * The persisted shape on disk. Includes `id` (file identity) +
 * `createdAt` (never changes after first save) in addition to
 * the `ComposeState`-shaped payload.
 *
 * v0.6.20: `version` is now `1 | 2 | 3 | 4 | 5 | 6`. Boards
 * saved at v5 or earlier continue to load — the loader accepts
 * all six and `route` defaults to `"curve"` when missing. New
 * writes from the web client land at v6.
 */
export const BoardSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  blocks: z.array(BlockSchema),
  connections: z.array(ConnectionSchema).default([]),
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
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
  version: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ])
    .default(6),
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
 * v0.6.11: read just the summary fields of a single board,
 * without the full `BoardSnapshotSchema` validation. We still
 * `JSON.parse` the file (you can't count `blocks.length` without
 * it) but we skip the per-field Zod checks. Used by
 * `listBoards` to avoid linear degradation — 100 boards ×
 * full Zod parse was ~50-100ms; this cuts that by ~3× because
 * blocks/connections don't get nested schema validation.
 *
 * Returns `null` on missing / corrupt / wrong-shape file. The
 * full `loadBoard` still runs the strict schema (used when
 * actually loading a board's content into the canvas).
 */
async function readBoardSummary(
  id: string,
  home?: string,
): Promise<BoardSummary | null> {
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
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.name !== "string" ||
    typeof obj.updatedAt !== "string" ||
    typeof obj.createdAt !== "string" ||
    !Array.isArray(obj.blocks)
  ) {
    return null;
  }
  const connections = Array.isArray(obj.connections) ? obj.connections : [];
  return {
    id: obj.id,
    name: obj.name,
    updatedAt: obj.updatedAt,
    createdAt: obj.createdAt,
    blockCount: obj.blocks.length,
    connectionCount: connections.length,
  };
}

/**
 * v0.6.10: list every persisted board, sorted newest first.
 * Returns [] when the directory doesn't exist yet (first run).
 * Corrupt files are silently skipped (one bad board shouldn't
 * take down the whole sidebar).
 *
 * v0.6.11: switched from per-board `loadBoard` (full Zod) to
 * `readBoardSummary` (lightweight field checks). The summary
 * path is what the UI needs for the list panel — it doesn't
 * need to validate the full block / connection shapes. The
 * heavy path is reserved for actual board loads.
 *
 * Files are read in parallel via `Promise.all` so a 100-board
 * listing takes ~1 IO round-trip instead of 100 serial reads
 * (fs cache makes the actual reads cheap, but paralleling
 * also avoids scheduler jitter).
 */
export async function listBoards(home?: string): Promise<BoardSummary[]> {
  const dir = composeBoardsDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const ids = entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length));
  const summaries = await Promise.all(
    ids.map((id) => readBoardSummary(id, home)),
  );
  return summaries
    .filter((s): s is BoardSummary => s !== null)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
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
  // Atomic save: write to a temp file, then `rename` to the
  // final path. POSIX guarantees `rename` is atomic within
  // the same filesystem, so a crash mid-write never leaves
  // a half-truncated `.json` — the old file stays intact
  // until the rename completes. (`unlink` + `writeFile` is
  // NOT atomic: there's a window where the file is missing.)
  const data = JSON.stringify(snapshot, null, 2);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data, "utf-8");
  try {
    await rename(tmp, file);
  } catch (e) {
    // Best-effort cleanup of the temp file on rename failure
    // (e.g. cross-device rename on some FSes — unlikely on
    // ~/.pilot but be defensive).
    await unlink(tmp).catch(() => {
      /* already gone */
    });
    throw e;
  }
  return snapshot;
}

// ─── Rename ───────────────────────────────────────────────────

/**
 * v0.6.12: rename a board without touching its blocks or
 * connections. Returns the new snapshot on success, or null
 * when the id is invalid or the board doesn't exist.
 *
 * Implementation: load → mutate name → saveBoard. saveBoard
 * already does the atomic rename (v0.6.11 §9.5 pattern) and
 * preserves `createdAt` while bumping `updatedAt`, which is
 * the correct semantic for "the user renamed this board".
 *
 * The name must be a non-empty, non-whitespace string; we
 * trim before validation so " " fails the same way as "".
 * Length cap (200) matches what the v0.6.10 save path accepts
 * in practice (UI text input limit) and keeps the filesystem
 * path sane on all OSes.
 */
export async function renameBoard(
  id: string,
  name: string,
  home?: string,
): Promise<BoardSnapshot | null> {
  if (!isValidBoardId(id)) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  const existing = await loadBoard(id, home);
  if (!existing) return null;
  return saveBoard({ ...existing, name: trimmed }, home);
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
