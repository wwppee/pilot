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
// v0.7.2 (P3 #9 closeout): the audit suggested aligning
// this with `compose-boards.SAFE_ID_PATTERN` for
// "consistency", but on closer inspection the two regexes
// are *intentionally different*:
//   - workflow id: kebab-case URL slug, lowercase + dash,
//     validated at the client (input field + NewWorkflowDialog)
//     and the server (Zod). Used in URL paths
//     (`/workflows/<id>`), so the URL-safe lowercase is
//     the right call.
//   - board id (compose-boards): "safe filename"
//     character set, allows upper case + underscore,
//     because boards were originally just `mktemp`-style
//     auto-generated names that occasionally got renamed
//     by users who like `My_Board_1` style.
// Forcing one to match the other would either break
// existing workflow URLs or weaken the workflow id
// contract. The two are documented as different on
// purpose; closing this P3 as "won't fix, by design".

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

// ─── v0.7.2 (P3 #8): shared read+JSON.parse ─────────────
//
// Before v0.7.2 both `readWorkflowSummary` and `loadWorkflow`
// did the same two steps: read the file, JSON.parse it, with
// the same try/catch shape. The only difference was whether
// they `console.warn` on JSON parse failure (loadWorkflow
// did, because the warn is a UX feature for the user-facing
// load path; readWorkflowSummary didn't, because it's
// called from a list loop and would spam the log).
//
// This helper makes the read+parse one place. Callers
// decide what to do with each outcome (missing → return
// null; corrupt → return null; ok → validate / extract).
// The `warn` opt-in matches the v0.7.1.1 self-audit
// observation: saveWorkflow shouldn't warn, loadWorkflow
// should.

type ReadJsonResult =
  | { kind: "ok"; parsed: unknown }
  | { kind: "missing" }
  | { kind: "corrupt"; error: Error };

async function readWorkflowJson(
  id: string,
  home: string | undefined,
  opts: { warn?: boolean } = {},
): Promise<ReadJsonResult> {
  const file = workflowFile(id, home);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return { kind: "missing" };
  }
  try {
    return { kind: "ok", parsed: JSON.parse(raw) };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (opts.warn) {
      console.warn(
        `[workflow] ${file} exists but is not valid JSON — returning 404. ` +
          `Delete the file or fix the JSON to recover. (${error.message})`,
      );
    }
    return { kind: "corrupt", error };
  }
}

async function readWorkflowSummary(
  id: string,
  home?: string,
): Promise<WorkflowSummary | null> {
  const r = await readWorkflowJson(id, home);
  if (r.kind !== "ok") return null;
  // Loose shape check — we trust the per-field validation
  // to `loadWorkflow` instead of doing it on every list.
  // If the shape is wildly wrong, skip the file rather
  // than crash the whole list.
  const parsed = r.parsed;
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
 *
 * v0.7.1 (audit fix): `JSON.parse` and `WorkflowSchema.parse`
 * are both wrapped in try/catch. A user who hand-edits
 * `~/.pilot/workflows/<id>/workflow.json` and breaks the
 * JSON or the schema would otherwise get a 500 from a raw
 * `SyntaxError` or `ZodError` thrown past the route
 * boundary. With the try/catch we degrade gracefully:
 * `null` (→ 404) for missing, `null` (→ 404) for
 * unparseable, and a thrown `Error` with the Zod issue
 * list for "found but invalid" so the API route can
 * surface it as a 400. The `console.warn` gives the
 * developer (or the user, if they look at the dashboard
 * log) a hint about where the broken file is.
 */
export async function loadWorkflow(
  id: string,
  home?: string,
): Promise<Workflow | null> {
  if (!isValidWorkflowId(id)) return null;
  // v0.7.2 (P3 #8): the read + JSON.parse step moved to
  // `readWorkflowJson` so listWorkflows, saveWorkflow, and
  // loadWorkflow all share one parser. `warn: true` keeps
  // the v0.7.1 console.warn on the user-facing load path
  // (the warn is what tells the user their hand-edited
  // file is broken — see the v0.7.1 self-audit).
  const r = await readWorkflowJson(id, home, { warn: true });
  if (r.kind === "missing" || r.kind === "corrupt") return null;
  try {
    return WorkflowSchema.parse(r.parsed);
  } catch (e) {
    // Throw with a friendlier message so the API layer can
    // surface a 400 with the Zod issue list, not a raw
    // ZodError which the default error handler turns into
    // a 500. Same pattern as `compose-boards.saveBoard`.
    if (e instanceof Error) {
      throw new Error(`workflow ${id} failed schema validation: ${e.message}`);
    }
    throw e;
  }
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
  //
  // v0.7.1.1 (self-audit): we used to call `loadWorkflow`
  // here, but `loadWorkflow` v0.7.1 wraps `JSON.parse` in
  // `try/catch + console.warn` for corrupt files. That's
  // correct behavior for the user-facing "load this
  // workflow" path (the warning is what tells the user
  // their hand-edited file is broken), but `saveWorkflow`
  // is a *write* operation: we're about to overwrite the
  // file atomically anyway, so the warning would only
  // pollute the server log on every save of a previously-
  // corrupted workflow (a self-inflicted log spam from
  // fixing the very bug the warning is meant to surface).
  //
  // `readWorkflowSummary` is the right tool: it parses
  // the file leniently (no Zod validation, no warning,
  // just the `createdAt` / `updatedAt` / counts), and
  // returns `null` for missing-or-corrupt — which the
  // caller then treats as "no prior createdAt, use now",
  // i.e. the same fallback as a brand-new file.
  const existing = await readWorkflowSummary(input.id, home);
  const createdAt = existing?.createdAt ?? now;
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

// ─── Validate (v0.8.10) ─────────────────────────────────

/**
 * v0.8.10: structural validation of a workflow before
 * it's run. Returns a list of issues (each with a
 * severity + a human-readable message + the offending
 * node/edge id when applicable). A workflow with no
 * issues returns `{ok: true, issues: []}`.
 *
 * Three classes of issues:
 *
 *   - **cycle**: an edge back-edge in the graph. A
 *     workflow with a cycle has no topological order,
 *     so the v0.9.x runtime can't execute it. We use
 *     a 3-color DFS (white = unvisited, gray =
 *     currently in the recursion stack, black =
 *     done). A gray node reached from a gray node is
 *     a back-edge — that's a cycle.
 *
 *   - **orphan**: a node with neither incoming nor
 *     outgoing edges. This isn't a hard error (a
 *     zero-node workflow is fine; a 1-node workflow
 *     with no edges is just a single-step run), but
 *     in a 2+ node workflow an orphan usually means
 *     the user forgot to connect it. We report it
 *     as a `warning` so the editor can show a hint
 *     without blocking the run.
 *
 *   - **dangling reference**: a node's `inputTemplate`
 *     mentions a variable (e.g. `{out1}`) that no
 *     other node's `outputVar` produces. This is a
 *     `warning` because the v0.9.x runtime will
 *     probably fail at execution time but the editor
 *     can show "this looks broken" without refusing
 *     to save.
 *
 * The function is pure (no I/O) so the test file
 * can exercise every branch without spinning up a
 * server.
 */
export type WorkflowIssueSeverity = "error" | "warning";

export interface WorkflowIssue {
  severity: WorkflowIssueSeverity;
  code:
    | "cycle"
    | "orphan-node"
    | "dangling-reference"
    | "self-edge"
    | "unknown-target"
    | "unknown-source";
  message: string;
  /** The offending node id (when applicable). */
  nodeId?: string;
  /** The offending edge id (when applicable). */
  edgeId?: string;
}

export interface WorkflowValidationResult {
  ok: boolean;
  issues: WorkflowIssue[];
}

export function validateWorkflow(
  wf: Pick<Workflow, "nodes" | "edges">,
): WorkflowValidationResult {
  const issues: WorkflowIssue[] = [];
  const nodeIds = new Set(wf.nodes.map((n) => n.id));
  const edges = wf.edges;

  // 1. Edge integrity — every `from` and `to` must
  //    reference an existing node id. A dangling
  //    edge is a structural error (the file is
  //    corrupt or the user did something through a
  //    path we don't have a UI for).
  for (const e of edges) {
    if (!nodeIds.has(e.from)) {
      issues.push({
        severity: "error",
        code: "unknown-source",
        message: `Edge ${e.id} references unknown source node "${e.from}".`,
        edgeId: e.id,
      });
    }
    if (!nodeIds.has(e.to)) {
      issues.push({
        severity: "error",
        code: "unknown-target",
        message: `Edge ${e.id} references unknown target node "${e.to}".`,
        edgeId: e.id,
      });
    }
    if (e.from === e.to) {
      // A self-edge is a degenerate cycle of length
      // 1. The cycle detection below will also catch
      // it, but reporting it explicitly with a
      // clearer message is more useful.
      issues.push({
        severity: "error",
        code: "self-edge",
        message: `Node ${e.from} has a self-edge.`,
        nodeId: e.from,
        edgeId: e.id,
      });
    }
  }

  // 2. Cycle detection via 3-color DFS. We build
  //    an adjacency list once, then DFS from each
  //    unvisited node. A back-edge (white→gray) is
  //    a cycle.
  const adj = new Map<string, string[]>();
  for (const n of wf.nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      adj.get(e.from)!.push(e.to);
    }
  }
  const color = new Map<string, "white" | "gray" | "black">(
    wf.nodes.map((n) => [n.id, "white"]),
  );
  function dfs(node: string): void {
    color.set(node, "gray");
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next) ?? "white";
      if (c === "gray") {
        issues.push({
          severity: "error",
          code: "cycle",
          message: `Cycle detected: node ${next} is reachable from itself via ${node}.`,
          nodeId: next,
        });
      } else if (c === "white") {
        dfs(next);
      }
    }
    color.set(node, "black");
  }
  for (const n of wf.nodes) {
    if (color.get(n.id) === "white") dfs(n.id);
  }

  // 3. Orphan detection — a node with no edges in
  //    OR out. Only flag in workflows with 2+ nodes
  //    (a 1-node workflow with no edges is the
  //    legitimate "single step, no upstream" shape).
  if (wf.nodes.length >= 2) {
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();
    for (const e of edges) {
      hasOutgoing.add(e.from);
      hasIncoming.add(e.to);
    }
    for (const n of wf.nodes) {
      if (!hasIncoming.has(n.id) && !hasOutgoing.has(n.id)) {
        issues.push({
          severity: "warning",
          code: "orphan-node",
          message: `Node "${n.name}" (${n.id}) has no connections.`,
          nodeId: n.id,
        });
      }
    }
  }

  // 4. Dangling reference — a node's inputTemplate
  //    contains `{varname}` where no other node's
  //    outputVar produces `varname`. We extract
  //    {…} placeholders with a simple regex (the
  //    runtime will use the same lookup).
  const outputs = new Set(wf.nodes.map((n) => n.outputVar).filter(Boolean));
  for (const n of wf.nodes) {
    if (!n.inputTemplate) continue;
    const refs = n.inputTemplate.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g) ?? [];
    for (const ref of refs) {
      const name = ref.slice(1, -1);
      if (name === n.outputVar) continue; // self-reference is fine
      if (!outputs.has(name)) {
        issues.push({
          severity: "warning",
          code: "dangling-reference",
          message: `Node "${n.name}" references {${name}} but no node produces that output.`,
          nodeId: n.id,
        });
      }
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
  };
}
