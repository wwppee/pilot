/**
 * Tool call trace — extract per-tool-call events from pi sessions.
 *
 * v0.4.2: pulls `ToolResultMessage` entries out of pi v3 JSONL. Each
 * call yields a `ToolCallEvent` with name, args preview, error state,
 * latency proxy, and timestamp. The caller can then render this in
 * CLI / Web / stats.
 *
 * Note: pi v3 stores the result, not the original tool call arguments,
 * in the ToolResultMessage. To get the args (the `toolCall` block in
 * the preceding assistant message), we also surface a lookup helper.
 *
 * See: docs/v0.4.2-dev-plan.md §2.
 */

import { readEntries, isToolResultEntry } from "./jsonl-parser.js";
import type { ToolResultMessage } from "./types.js";

// ─── Types ──────────────────────────────────────────────────

/** A single tool call event extracted from a session. */
export interface ToolCallEvent {
  /** Stable id (entry id). */
  id: string;
  /** Tool call id (matches the assistant message's toolCall.id). */
  toolCallId: string;
  /** Tool name, e.g. "read", "bash", "edit", "write". */
  toolName: string;
  /** Whether the call returned an error. */
  isError: boolean;
  /** ISO timestamp of the result. */
  timestamp: string;
  /** First ~120 chars of result content (truncated). */
  contentPreview: string;
  /** Optional tool call args (looked up from preceding assistant message). */
  arguments?: Record<string, unknown>;
  /** Latency proxy in ms: now − assistant_message_timestamp. May be 0 if unknown. */
  latencyMs?: number;
}

/** Optional filter for `traceToolCalls`. */
export interface ToolTraceFilter {
  /** Only include calls to this tool name (exact match). */
  toolName?: string;
  /** Only include failed (isError: true) calls. */
  onlyErrors?: boolean;
  /** Stop reading after this many events. */
  limit?: number;
}

// ─── Tracer ─────────────────────────────────────────────────

/**
 * Stream tool call events from a single session file.
 *
 * Yields events in the order they appear in the JSONL. The tracer
 * scans assistant messages first to capture the original tool call
 * arguments (since `ToolResultMessage` only carries the result), then
 * emits one event per `ToolResultMessage` with the args filled in.
 *
 * Note: for v0.4.2 this is a streaming API. The caller can either
 * iterate directly, or use the convenience `collectToolCalls` below
 * to gather into an array.
 */
export async function* traceToolCalls(
  filePath: string,
  filter: ToolTraceFilter = {},
): AsyncIterable<ToolCallEvent> {
  // First pass: build a map of toolCallId → arguments from assistant
  // messages. This is needed because pi stores the call in the assistant
  // message and the result in a separate toolResult message.
  const argsByCallId = new Map<string, { args: Record<string, unknown>; ts: number }>();
  for await (const entry of readEntries(filePath)) {
    if (entry.type !== "message" || !entry.message) continue;
    const msg = entry.message as Record<string, unknown>;
    if (msg["role"] !== "assistant") continue;
    const c = msg["content"];
    if (!Array.isArray(c)) continue;
    const ts = typeof msg["timestamp"] === "number" ? (msg["timestamp"] as number) : Date.now();
    for (const block of c) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b["type"] === "toolCall" && typeof b["id"] === "string" && b["arguments"]) {
        argsByCallId.set(b["id"] as string, {
          args: b["arguments"] as Record<string, unknown>,
          ts,
        });
      }
    }
  }

  // Second pass: yield events for each tool result.
  let emitted = 0;
  for await (const entry of readEntries(filePath)) {
    if (filter.limit !== undefined && emitted >= filter.limit) return;
    if (!isToolResultEntry(entry)) continue;
    const tr = (entry.message as ToolResultMessage);
    if (filter.toolName && tr.toolName !== filter.toolName) continue;
    if (filter.onlyErrors && !tr.isError) continue;

    const ts = entry.timestamp ?? new Date(tr.timestamp ?? Date.now()).toISOString();
    const args = argsByCallId.get(tr.toolCallId);
    const latency =
      args && tr.timestamp
        ? Math.max(0, tr.timestamp - args.ts)
        : undefined;

    emitted++;
    yield {
      id: entry.id ?? `${tr.toolCallId}-${ts}`,
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      isError: tr.isError,
      timestamp: ts,
      contentPreview: previewContent(tr.content),
      ...(args ? { arguments: args.args } : {}),
      ...(latency !== undefined ? { latencyMs: latency } : {}),
    };
  }
}

/** Collect a trace into a single array. */
export async function collectToolCalls(
  filePath: string,
  filter: ToolTraceFilter = {},
): Promise<ToolCallEvent[]> {
  const out: ToolCallEvent[] = [];
  for await (const e of traceToolCalls(filePath, filter)) {
    out.push(e);
  }
  return out;
}

// ─── Helpers ───────────────────────────────────────────────

/** Truncate a content block array to a short preview. */
function previewContent(content: unknown): string {
  if (typeof content === "string") return truncate(content);
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b["type"] === "text" && typeof b["text"] === "string") {
        return truncate(b["text"]);
      }
    }
  }
  return "";
}

function truncate(s: string, max = 120): string {
  // Strip newlines for compact display
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 3) + "..." : flat;
}
