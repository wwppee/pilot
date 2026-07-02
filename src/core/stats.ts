/**
 * Stats — aggregate metrics across all local sessions.
 *
 * Streams every session JSONL once and accumulates:
 *   - total messages / tool calls
 *   - by model (count of assistant messages, count of tool calls made)
 *   - by tool name
 *   - by day (in the user's local timezone — same as the cutoff)
 *
 * Time windows:
 *   - `today`   — local midnight today → now (Asia/Shanghai if user is in CN)
 *   - `lastDays` — now − N×24h
 *   - `all`     — every session
 *
 * No token accounting yet — pi's session format may carry usage data
 * but we don't depend on it. Add later when we know the field shape.
 *
 * v0.3.0-c: read-only CLI/server surface. No writes.
 *
 * See: docs/roadmap.md §2 (v0.3.0-c).
 */

import { readEntries } from "./jsonl-parser.js";
import { listAllSessions } from "./sessions.js";
import type { SessionInfo } from "./types.js";

// ─── Types ──────────────────────────────────────────────────

/** Range selector. */
export type StatsRange =
  | { kind: "today" }
  | { kind: "lastDays"; days: number }
  | { kind: "all" };

/** A single bucket in the by-model / by-tool / by-day arrays. */
export interface ModelBucket {
  model: string;
  messages: number;
  toolCalls: number;
}
export interface ToolBucket {
  tool: string;
  count: number;
}
export interface DayBucket {
  date: string; // YYYY-MM-DD
  messages: number;
  toolCalls: number;
}

export interface StatsReport {
  /** Sessions included in the range. */
  totalSessions: number;
  /** Total entries (user + assistant + tool + system) across all sessions. */
  totalMessages: number;
  /** Total tool calls. */
  totalToolCalls: number;
  byModel: ModelBucket[];
  byTool: ToolBucket[];
  byDay: DayBucket[];
}

// ─── Aggregation ──────────────────────────────────────────

/** Aggregate stats over the given sessions, filtered by `range`. */
export async function aggregateStats(
  range: StatsRange,
  home?: string,
): Promise<StatsReport> {
  const all = await listAllSessions(home);
  const filtered = filterByRange(all, range);

  // Bounded concurrency — don't open all session files at once.
  const CONCURRENCY = 8;
  const queue = [...filtered];
  const modelCounts = new Map<string, ModelBucket>();
  const toolCounts = new Map<string, number>();
  const dayCounts = new Map<string, DayBucket>();
  let totalMessages = 0;
  let totalToolCalls = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const s = queue.shift();
        if (!s) return;
        try {
          for await (const entry of readEntries(s.path)) {
            const role = messageRole(entry);
            const isAssistant = role === "assistant";
            const isToolResult = role === "toolResult";
            const isUser = role === "user";
            const isMessage = entry.type === "message";

            // Skip session header, model_change, label, etc.
            if (!isMessage && !isUser && !isAssistant && !isToolResult) {
              // Still count "user"/"assistant"/"tool"/"system" legacy types
              if (
                entry.type !== "user" &&
                entry.type !== "assistant" &&
                entry.type !== "tool" &&
                entry.type !== "system"
              ) {
                continue;
              }
            }

            totalMessages++;
            if (isToolResult || entry.type === "tool") totalToolCalls++;

            if (isAssistant) {
              const m = extractModelFromEntry(entry);
              if (m) {
                const cur = modelCounts.get(m) ?? {
                  model: m,
                  messages: 0,
                  toolCalls: 0,
                };
                cur.messages++;
                modelCounts.set(m, cur);
              }
            }

            if (isToolResult) {
              const t = extractToolNameFromEntry(entry);
              if (t) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
            } else if (entry.type === "tool") {
              // legacy
              const t = extractToolName(entry.data);
              if (t) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
            }

            if (entry.timestamp) {
              const day = localDateString(entry.timestamp);
              const cur = dayCounts.get(day) ?? {
                date: day,
                messages: 0,
                toolCalls: 0,
              };
              cur.messages++;
              if (isToolResult || entry.type === "tool") cur.toolCalls++;
              dayCounts.set(day, cur);
            }
          }
        } catch {
          // skip unreadable
        }
      }
    }),
  );

  return {
    totalSessions: filtered.length,
    totalMessages,
    totalToolCalls,
    byModel: [...modelCounts.values()].sort((a, b) => b.messages - a.messages),
    byTool: [...toolCounts.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count),
    byDay: [...dayCounts.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── Filtering ─────────────────────────────────────────────

function filterByRange(
  sessions: SessionInfo[],
  range: StatsRange,
): SessionInfo[] {
  if (range.kind === "all") return sessions;
  const cutoff = computeCutoff(range);
  return sessions.filter((s) => {
    const ts = s.lastUsedAt ? Date.parse(s.lastUsedAt) : 0;
    return ts >= cutoff;
  });
}

/**
 * Compute the cutoff timestamp for a range, in the user's local timezone.
 *
 * `today` = start of local-today (matches what "today" means to a human),
 * `lastDays` = now − N×24h (timezone-agnostic since we just want a window),
 * `all` = 0.
 */
function computeCutoff(range: StatsRange): number {
  const now = new Date();
  if (range.kind === "today") {
    // Local midnight today. getFullYear/Month/Date use the host's TZ.
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range.kind === "lastDays") {
    return now.getTime() - range.days * 24 * 60 * 60 * 1000;
  }
  return 0;
}

// ─── Helpers ───────────────────────────────────────────────

/** Local YYYY-MM-DD for an ISO timestamp, matching the local-tz cutoff. */
function localDateString(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractModel(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj["model"] === "string") return obj["model"];
  const meta = obj["metadata"];
  if (meta && typeof meta === "object") {
    const m = (meta as Record<string, unknown>)["model"];
    if (typeof m === "string") return m;
  }
  return undefined;
}

function extractModelFromEntry(entry: import("./types.js").SessionEntry): string | undefined {
  // v3: assistant message carries model directly
  if (entry.type === "message" && entry.message) {
    const m = (entry.message as Record<string, unknown>)["model"];
    if (typeof m === "string") return m;
  }
  // v3: model_change entry carries model
  if (entry.type === "model_change" && typeof entry.model === "string") {
    return entry.model;
  }
  // Legacy
  if (entry.type === "assistant" && entry.data) {
    return extractModel(entry.data);
  }
  return undefined;
}

function messageRole(entry: import("./types.js").SessionEntry): string | undefined {
  if (entry.type === "message" && entry.message) {
    return (entry.message as { role?: string }).role;
  }
  return entry.type;
}

function extractToolName(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj["name"] === "string") return obj["name"];
  // Some formats: { tool: "read", ... } or { function: { name: "..." } }
  if (typeof obj["tool"] === "string") return obj["tool"];
  const fn = obj["function"];
  if (fn && typeof fn === "object") {
    const n = (fn as Record<string, unknown>)["name"];
    if (typeof n === "string") return n;
  }
  return undefined;
}

function extractToolNameFromEntry(
  entry: import("./types.js").SessionEntry,
): string | undefined {
  // v3 tool result
  if (entry.type === "message" && entry.message) {
    const m = entry.message as Record<string, unknown>;
    if (m["role"] === "toolResult" && typeof m["toolName"] === "string") {
      return m["toolName"];
    }
  }
  return undefined;
}
