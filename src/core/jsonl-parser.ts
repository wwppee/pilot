/**
 * Stream-based JSONL parser for pi session files.
 *
 * Pi sessions are JSONL files: each line is a JSON object with `id` and
 * optional `parentId`, forming a DAG. We don't load the whole file when
 * callers only need metadata — we stream and aggregate as we go.
 */

import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import type {
  SessionEntry,
  SessionInfo,
  SessionTree,
  SessionTreeNode,
} from "./types.js";

/**
 * Read session entries one at a time (streaming).
 *
 * Skips malformed lines rather than throwing — pi sessions occasionally
 * contain partial writes from interrupted runs.
 */
export async function* readEntries(
  filePath: string,
): AsyncIterable<SessionEntry> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as SessionEntry;
      yield entry;
    } catch {
      // Skip malformed lines silently.
    }
  }
}

/**
 * Extract lightweight metadata about a session without loading every entry.
 *
 * Stops reading as soon as it has the model + entry count + timestamps,
 * which is usually within the first ~50 lines for normal sessions.
 */
export async function readSessionInfo(
  filePath: string,
  id: string,
): Promise<SessionInfo> {
  let entries = 0;
  let startedAt: string | undefined;
  let lastUsedAt: string | undefined;
  let model: string | undefined;

  for await (const entry of readEntries(filePath)) {
    entries += 1;

    if (!startedAt && entry.timestamp) startedAt = entry.timestamp;
    if (entry.timestamp) lastUsedAt = entry.timestamp;

    // First assistant message usually carries the model name in data.
    if (!model && entry.type === "assistant") {
      const m = extractModel(entry.data);
      if (m) model = m;
    }
  }

  const stat = statSync(filePath);
  return {
    path: filePath,
    id,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
    entries,
    ...(model !== undefined ? { model } : {}),
    sizeBytes: stat.size,
  };
}

/**
 * Best-effort extraction of the model name from an assistant entry's data.
 *
 * Pi's session format is documented in `packages/coding-agent/docs/session-format.md`.
 * We probe a few common shapes; if none match, return undefined.
 */
function extractModel(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;

  // Common shapes: { model: "..." } or { metadata: { model: "..." } }
  if (typeof obj["model"] === "string") return obj["model"];
  const metadata = obj["metadata"];
  if (metadata && typeof metadata === "object") {
    const m = (metadata as Record<string, unknown>)["model"];
    if (typeof m === "string") return m;
  }
  return undefined;
}

/**
 * Search all entries in a session for a substring match.
 *
 * Returns the number of matches. Cheap to compute — only the JSON-stringified
 * entry is searched, not deep traversal.
 */
export async function searchSession(
  filePath: string,
  query: string,
  caseSensitive = false,
): Promise<number> {
  const needle = caseSensitive ? query : query.toLowerCase();
  let hits = 0;

  for await (const entry of readEntries(filePath)) {
    const haystack = caseSensitive
      ? JSON.stringify(entry)
      : JSON.stringify(entry).toLowerCase();
    if (haystack.includes(needle)) hits += 1;
  }
  return hits;
}

/**
 * Read a session and return it as a tree.
 *
 * Two passes: first builds the node map, then links children to parents.
 * Streams from disk — never loads the whole file into memory at once.
 *
 * The root is the first node encountered with no `parentId` (or whose
 * parent isn't in the file). If multiple roots exist, we pick the first.
 */
export async function readSessionTree(
  filePath: string,
  id: string,
): Promise<SessionTree> {
  const nodes = new Map<string, SessionTreeNode>();
  const models = new Set<string>();
  const entryById = new Map<string, SessionEntry>();

  // Pass 1: build node map
  for await (const entry of readEntries(filePath)) {
    entryById.set(entry.id, entry);
    const preview = extractPreview(entry.data);
    const node: SessionTreeNode = {
      id: entry.id,
      type: entry.type,
      ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
      ...(preview !== undefined ? { preview } : {}),
      children: [],
    };
    nodes.set(entry.id, node);

    if (entry.type === "assistant") {
      const m = extractModel(entry.data);
      if (m) models.add(m);
    }
  }

  // Pass 2: link children to parents
  let root: SessionTreeNode | null = null;
  for (const entry of entryById.values()) {
    const node = nodes.get(entry.id);
    if (!node) continue;

    if (entry.parentId) {
      const parent = nodes.get(entry.parentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
      // Parent referenced but not in file — treat as a separate root.
    }
    // No parent (or orphan): this is a root candidate.
    if (!root) root = node;
  }

  // Compute tree stats
  let maxDepth = 0;
  const branchPoints: string[] = [];
  const walk = (n: SessionTreeNode, depth: number): void => {
    if (depth > maxDepth) maxDepth = depth;
    if (n.children.length > 1) branchPoints.push(n.id);
    for (const c of n.children) walk(c, depth + 1);
  };
  if (root) walk(root, 0);

  return {
    id,
    root: root ?? { id: "empty", type: "empty", children: [] },
    totalNodes: nodes.size,
    maxDepth,
    models: [...models],
    branchPoints,
  };
}

/**
 * Extract a short text preview from an entry's data payload.
 * Used by readSessionTree to show one-line summaries in the tree.
 */
function extractPreview(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;

  // Text content patterns: { text: "..." }, { content: "..." }, { delta: "..." }
  for (const key of ["text", "content", "delta", "message"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) {
      return v.length > 100 ? v.slice(0, 97) + "..." : v;
    }
  }

  // Tool call patterns: { name: "read", path: "..." } or { name: "bash", command: "..." }
  const name = obj["name"];
  if (typeof name === "string") {
    const arg = obj["path"] ?? obj["command"] ?? obj["query"] ?? obj["input"];
    if (typeof arg === "string") {
      const combined = `${name}: ${arg}`;
      return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
    }
    return name;
  }

  return undefined;
}
