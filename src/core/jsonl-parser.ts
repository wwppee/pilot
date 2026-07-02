/**
 * Stream-based JSONL parser for pi session files.
 *
 * Pi sessions are JSONL files: each line is a JSON object with `id` and
 * optional `parentId`, forming a DAG. We don't load the whole file when
 * callers only need metadata — we stream and aggregate as we go.
 *
 * Supports both:
 *  - v3 format (current): header `{type:"session", version:3}`, then entries
 *    like `{type:"message", message:{role:"assistant", model:"...", usage:{...}}}`.
 *  - Legacy (pre-v0.4.2): `{type:"assistant", data:{model:"..."}}`.
 *
 * See: `@earendil-works/pi-coding-agent/docs/session-format.md`.
 */

import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import type {
  AgentMessage,
  AssistantMessage,
  SessionEntry,
  SessionInfo,
  SessionTree,
  SessionTreeNode,
  ToolResultMessage,
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

    const m = extractModelFromEntry(entry);
    if (!model && m) model = m;
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
 * Best-effort extraction of the model name from a session entry.
 *
 * Tries in order:
 *  1. v3: `entry.message.model` (when entry is `{type:"message"}` and message is assistant)
 *  2. v3: `entry.model` (when entry is `{type:"model_change"}`)
 *  3. Legacy: `entry.data.model` (when entry is `{type:"assistant"}` in old format)
 *  4. Legacy: `entry.data.metadata.model`
 */
function extractModelFromEntry(entry: SessionEntry): string | undefined {
  // v3 message entry
  if (entry.type === "message" && entry.message) {
    const msg = entry.message as Record<string, unknown>;
    if (typeof msg["model"] === "string") return msg["model"];
  }
  // v3 model_change entry
  if (entry.type === "model_change" && typeof entry.model === "string") {
    return entry.model;
  }
  // Legacy: assistant + data.model
  if (entry.type === "assistant" && entry.data) {
    return extractModel(entry.data);
  }
  return undefined;
}

/**
 * Legacy helper: best-effort model extraction from a data payload.
 * Kept for backward compat with the pre-v0.4.2 flat format.
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
 * Type guard: returns true if the entry's message is an assistant message.
 * Use this to narrow before reading `entry.message.usage`.
 */
export function isAssistantEntry(
  entry: SessionEntry,
): entry is SessionEntry & { message: AssistantMessage } {
  if (entry.type !== "message" || !entry.message) return false;
  return (entry.message as AgentMessage).role === "assistant";
}

/**
 * Type guard: returns true if the entry's message is a tool result.
 * Use this to narrow before reading `entry.message.toolName` / `isError`.
 */
export function isToolResultEntry(
  entry: SessionEntry,
): entry is SessionEntry & { message: ToolResultMessage } {
  if (entry.type !== "message" || !entry.message) return false;
  return (entry.message as AgentMessage).role === "toolResult";
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
    if (!entry.id) continue;
    // Skip the session header — it's file metadata, not part of the DAG.
    if (entry.type === "session") continue;
    entryById.set(entry.id, entry);
    const preview = extractPreviewFromEntry(entry);
    const displayType = displayTypeForEntry(entry);
    const node: SessionTreeNode = {
      id: entry.id,
      type: displayType,
      ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
      ...(preview !== undefined ? { preview } : {}),
      children: [],
    };
    nodes.set(entry.id, node);

    const m = extractModelFromEntry(entry);
    if (m) models.add(m);
  }

  // Pass 2: link children to parents
  let root: SessionTreeNode | null = null;
  for (const entry of entryById.values()) {
    if (!entry.id) continue;
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
 * Map an entry's raw type to a UI-friendly display type.
 *
 * v3 entries with `type: "message"` get refined to the role of the
 * embedded message (assistant / user / toolResult / etc.) so the tree
 * can show meaningful labels.
 */
function displayTypeForEntry(entry: SessionEntry): string {
  if (entry.type === "message" && entry.message) {
    const role = (entry.message as { role?: string }).role;
    if (role) return role;
  }
  return entry.type;
}

/**
 * Extract a short text preview from a session entry.
 *
 * Handles v3 (where preview is inside `message.content` or `message.toolName`/etc.)
 * and legacy (where preview is in `data`).
 */
function extractPreviewFromEntry(entry: SessionEntry): string | undefined {
  // v3 message entry
  if (entry.type === "message" && entry.message) {
    return extractPreviewFromMessage(entry.message);
  }
  // Legacy
  if (entry.data) {
    return extractPreviewFromData(entry.data);
  }
  return undefined;
}

function extractPreviewFromMessage(msg: AgentMessage | unknown): string | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as Record<string, unknown>;

  const role = m["role"];

  // User text
  if (role === "user") {
    const c = m["content"];
    if (typeof c === "string" && c.length > 0) {
      return truncate(c);
    }
    if (Array.isArray(c)) {
      // Find first text block
      for (const block of c) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b["type"] === "text" && typeof b["text"] === "string") {
            return truncate(b["text"]);
          }
        }
      }
    }
  }

  // Assistant text
  if (role === "assistant") {
    const c = m["content"];
    if (Array.isArray(c)) {
      for (const block of c) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b["type"] === "text" && typeof b["text"] === "string") {
            return truncate(b["text"]);
          }
          if (b["type"] === "toolCall" && typeof b["name"] === "string") {
            return previewToolCall(b);
          }
        }
      }
    }
  }

  // Tool result
  if (role === "toolResult") {
    const name = m["toolName"];
    const err = m["isError"] ? " (error)" : "";
    if (typeof name === "string") {
      return `${name}${err}`;
    }
  }

  // Bash execution
  if (role === "bashExecution" && typeof m["command"] === "string") {
    return `$ ${m["command"]}`;
  }

  // Custom message
  if (role === "custom") {
    const t = m["customType"];
    if (typeof t === "string") return t;
  }

  return undefined;
}

function previewToolCall(b: Record<string, unknown>): string {
  const name = b["name"] ?? "tool";
  const args = b["arguments"];
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    const arg =
      a["command"] ?? a["path"] ?? a["query"] ?? a["file_path"] ?? a["url"];
    if (typeof arg === "string") {
      return truncate(`${name}: ${arg}`);
    }
  }
  return String(name);
}

function truncate(s: string, max = 100): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

/**
 * Legacy: extract preview from the flat `data` payload (pre-v0.4.2).
 */
function extractPreviewFromData(data: unknown): string | undefined {
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
