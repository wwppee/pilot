/**
 * v0.7.0: server-side persistence for /workflows.
 *
 * Each workflow is one `Workflow` JSON file under
 * `~/.pilot/workflows/<safe-id>/workflow.json`. Same
 * "one-file-per-record" pattern as `compose-boards.ts`, so
 * list / get / save / delete are independent and don't
 * touch each other's files.
 *
 * v0.7.0 scope is "draw + save", not "run". The runtime
 * (feeding a workflow to a pi session, executing the
 * nodes, etc.) is a v0.7.3+ concern. The data model is
 * already shaped for it: each node has its own model +
 * prompt + tools, and edges describe the data flow.
 *
 * v0.7.0 keeps the API surface small — just list / load /
 * save / delete. The web client does "duplicate" by
 * `load → modify id → save`, which is simpler than adding
 * a `duplicateWorkflow` server method (and doesn't need
 * one — it's a 3-line operation on the client).
 */

import { join } from "node:path";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { z } from "zod";

const MAX_ID_LENGTH = 64;
const VALID_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** v0.7.0: per-node LLM configuration. */
const WorkflowNodeModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
  apiKeyRef: z.string().optional(),
});

/** v0.7.0: what to do when a step's LLM call fails. */
const WorkflowNodeOnFailureSchema = z.enum([
  "stop",
  "skip",
  "retry",
  "escalate",
]);

/** v0.7.0: a single step in a workflow. */
const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.literal("step").default("step"),
  model: WorkflowNodeModelSchema,
  systemPrompt: z.string().default(""),
  inputTemplate: z.string().default(""),
  outputVar: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "outputVar must be a valid identifier"),
  tools: z.array(z.string()).default([]),
  onFailure: WorkflowNodeOnFailureSchema.default("stop"),
  retryCount: z.number().int().nonnegative().optional(),
  escalateToModel: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .default({ x: 0, y: 0 }),
});

/** v0.7.0: a directed edge from one node to another. */
const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

/**
 * v0.7.0: the persisted shape. `version: 1` is the only
 * accepted value for now; the field is there so future
 * versions can be detected (and migration code can run)
 * without breaking the v0.7.0 loader.
 */
const WorkflowSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(MAX_ID_LENGTH)
    .regex(VALID_ID_RE, "id must be kebab-case (lowercase + dash)"),
  name: z.string().default(""),
  description: z.string().default(""),
  version: z.literal(1).default(1),
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

/** Input shape for `saveWorkflow` — same as Workflow but
 *  the server fills in `metadata.createdAt` on first save
 *  and bumps `metadata.updatedAt` on every save. */
export const WorkflowInputSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LENGTH).regex(VALID_ID_RE),
  name: z.string().default(""),
  description: z.string().default(""),
  version: z.literal(1).default(1),
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
});
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

/** Lightweight summary for the list page. */
export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
  createdAt: string;
}

// ─── Paths ──────────────────────────────────────────────

function workflowDir(id: string, home?: string): string {
  const base = home ?? join(process.env.HOME ?? "", ".pilot");
  return join(base, "workflows", id);
}

function workflowFile(id: string, home?: string): string {
  return join(workflowDir(id, home), "workflow.json");
}

export function isValidWorkflowId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID_LENGTH && VALID_ID_RE.test(id);
}

// ─── List ───────────────────────────────────────────────

/**
 * v0.7.0: list all workflow summaries. We `JSON.parse`
 * each file (need to count `nodes.length` / `edges.length`)
 * but skip the per-field Zod validation — same
 * "list fast, validate on load" pattern as
 * `compose-boards.readBoardSummary`. Returns `[]` on
 * missing / corrupt files (we never want a single bad
 * file to fail the whole list).
 */
export async function listWorkflows(home?: string): Promise<WorkflowSummary[]> {
  const baseDir = home ?? join(process.env.HOME ?? "", ".pilot");
  const dir = join(baseDir, "workflows");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: WorkflowSummary[] = [];
  for (const entry of entries) {
    if (!isValidWorkflowId(entry)) continue;
    const summary = await readWorkflowSummary(entry, home);
    if (summary) out.push(summary);
  }
  // Newest first — users care about what they touched last.
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

async function readWorkflowSummary(
  id: string,
  home?: string,
): Promise<WorkflowSummary | null> {
  const file = workflowFile(id, home);
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
  // Loose shape check — we trust the per-field validation
  // to `loadWorkflow` instead of doing it on every list.
  // If the shape is wildly wrong, skip the file rather
  // than crash the whole list.
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.metadata !== "object") return null;
  const meta = p.metadata as Record<string, unknown>;
  if (
    typeof meta.createdAt !== "string" ||
    typeof meta.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: p.id,
    name: typeof p.name === "string" ? p.name : "",
    description: typeof p.description === "string" ? p.description : "",
    nodeCount: Array.isArray(p.nodes) ? p.nodes.length : 0,
    edgeCount: Array.isArray(p.edges) ? p.edges.length : 0,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
  };
}

// ─── Load ───────────────────────────────────────────────

/**
 * v0.7.0: load a workflow with full Zod validation. Throws
 * on validation error (the API route turns this into a
 * 400 with the Zod error details). Returns `null` when
 * the file doesn't exist — the API route turns this into
 * a 404.
 */
export async function loadWorkflow(
  id: string,
  home?: string,
): Promise<Workflow | null> {
  if (!isValidWorkflowId(id)) return null;
  const file = workflowFile(id, home);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw);
  return WorkflowSchema.parse(parsed);
}

// ─── Save ───────────────────────────────────────────────

/**
 * v0.7.0: write a workflow to disk. If the file already
 * exists, the `createdAt` is preserved (we read it first
 * and merge); if it's new, we set `createdAt = now`. The
 * `updatedAt` is always set to now. The file is written
 * atomically: we write to `<file>.tmp` first, then
 * `rename` over the target, so a crash mid-write can't
 * leave a half-written file the loader would reject.
 */
export async function saveWorkflow(
  input: WorkflowInput,
  home?: string,
): Promise<Workflow> {
  if (!isValidWorkflowId(input.id)) {
    throw new Error(`invalid workflow id: ${input.id}`);
  }
  const now = new Date().toISOString();
  // Preserve createdAt if the workflow already exists.
  const existing = await loadWorkflow(input.id, home);
  const createdAt = existing?.metadata.createdAt ?? now;
  const full: Workflow = WorkflowSchema.parse({
    ...input,
    version: 1,
    metadata: { createdAt, updatedAt: now },
  });
  const dir = workflowDir(input.id, home);
  await mkdir(dir, { recursive: true });
  const file = workflowFile(input.id, home);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(full, null, 2), "utf-8");
  await rename(tmp, file);
  return full;
}

// ─── Delete ─────────────────────────────────────────────

/**
 * v0.7.0: delete a workflow's directory. Idempotent —
 * returns `true` if anything was deleted, `false` if
 * the workflow didn't exist. We check existence first
 * (rather than relying on `rm` to error) because
 * `rm { force: true }` succeeds silently on a missing
 * path, which would conflate "deleted" with "didn't
 * exist" — a distinction the caller needs for UX
 * messaging ("deleted!" vs "nothing to delete").
 */
export async function deleteWorkflow(
  id: string,
  home?: string,
): Promise<boolean> {
  if (!isValidWorkflowId(id)) return false;
  const dir = workflowDir(id, home);
  let exists = false;
  try {
    const { stat } = await import("node:fs/promises");
    await stat(dir);
    exists = true;
  } catch {
    return false;
  }
  if (!exists) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}
