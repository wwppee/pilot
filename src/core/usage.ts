/**
 * Token usage & cost aggregation across pi sessions.
 *
 * v0.4.2: reads `AssistantMessage.usage` from each session's JSONL
 * (pi v3 format — see `types.ts` `SessionEntry`).
 *
 * Output is a `UsageReport`:
 *  - `totalTokens` / `totalCost` (USD) across the range
 *  - by-model breakdown
 *  - by-day breakdown (local-tz dates)
 *  - raw entries for charts / drill-down
 *
 * Streamed across sessions (bounded concurrency), entries aggregated
 * incrementally — same pattern as `stats.ts`.
 *
 * See: docs/v0.4.2-dev-plan.md §1.
 */

import { listAllSessions, sortByRecent } from "./sessions.js";
import { readEntries } from "./jsonl-parser.js";
import type { SessionInfo, Usage } from "./types.js";

// ─── Types ──────────────────────────────────────────────────

/** Range selector — same shape as `StatsRange` in stats.ts. */
export type UsageRange =
  | { kind: "today" }
  | { kind: "lastDays"; days: number }
  | { kind: "all" };

/** Per-model token + cost bucket. */
export interface UsageModelBucket {
  model: string;
  /** Number of assistant messages from this model. */
  messages: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

/** Per-day token + cost bucket. Dates are local YYYY-MM-DD. */
export interface UsageDayBucket {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  /** Distinct sessions that contributed. */
  sessions: number;
}

/** Full report returned by `aggregateUsage`. */
export interface UsageReport {
  /** Sessions included in the range. */
  totalSessions: number;
  /** Assistant messages that carried a usage block. */
  totalAssistantMessages: number;
  /** Sum of totalTokens. */
  totalTokens: number;
  /** Sum of cost.total (USD). */
  totalCost: number;
  byModel: UsageModelBucket[];
  byDay: UsageDayBucket[];
  /** Range used for the report — echoed back for UI. */
  range: UsageRange;
}

// ─── Aggregation ──────────────────────────────────────────

/**
 * Aggregate token usage and cost across all sessions in the range.
 *
 * Streams each session file (bounded concurrency) and accumulates
 * usage from every `AssistantMessage`. Skips sessions outside the range
 * and entries that don't carry usage (e.g. legacy v1 sessions, or
 * pre-v0.4.2 fixtures with no `message.usage`).
 */
export async function aggregateUsage(
  range: UsageRange,
  home?: string,
): Promise<UsageReport> {
  const all = sortByRecent(await listAllSessions(home));
  const filtered = filterByRange(all, range);

  const CONCURRENCY = 8;
  const queue = [...filtered];
  const modelCounts = new Map<string, UsageModelBucket>();
  const dayCounts = new Map<string, UsageDayBucket>();
  let totalAssistantMessages = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const sessionsContributingByDay = new Map<string, Set<string>>();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const s = queue.shift();
        if (!s) return;
        try {
          for await (const entry of readEntries(s.path)) {
            if (entry.type !== "message" || !entry.message) continue;
            const msg = entry.message;
            if (!isAssistantMessage(msg)) continue;
            const u = msg.usage;
            if (!u) continue;

            totalAssistantMessages += 1;
            totalTokens += u.totalTokens;
            totalCost += u.cost.total;

            // by-model
            const m = modelCounts.get(msg.model) ?? emptyModelBucket(msg.model);
            m.messages += 1;
            m.input += u.input;
            m.output += u.output;
            m.cacheRead += u.cacheRead;
            m.cacheWrite += u.cacheWrite;
            m.totalTokens += u.totalTokens;
            m.cost += u.cost.total;
            modelCounts.set(msg.model, m);

            // by-day (use session's lastUsedAt; fallback to entry timestamp)
            const dayKey = localDateString(
              entry.timestamp ?? s.lastUsedAt ?? new Date().toISOString(),
            );
            const d = dayCounts.get(dayKey) ?? emptyDayBucket(dayKey);
            d.input += u.input;
            d.output += u.output;
            d.cacheRead += u.cacheRead;
            d.cacheWrite += u.cacheWrite;
            d.totalTokens += u.totalTokens;
            d.cost += u.cost.total;
            dayCounts.set(dayKey, d);

            // Track distinct sessions per day
            let set = sessionsContributingByDay.get(dayKey);
            if (!set) {
              set = new Set();
              sessionsContributingByDay.set(dayKey, set);
            }
            set.add(s.id);
          }
        } catch {
          // Skip unreadable / malformed files.
        }
      }
    }),
  );

  // Apply per-day distinct session counts
  for (const [day, set] of sessionsContributingByDay) {
    const d = dayCounts.get(day);
    if (d) d.sessions = set.size;
  }

  return {
    totalSessions: filtered.length,
    totalAssistantMessages,
    totalTokens,
    totalCost,
    byModel: [...modelCounts.values()].sort((a, b) => b.cost - a.cost),
    byDay: [...dayCounts.values()].sort((a, b) => a.date.localeCompare(b.date)),
    range,
  };
}

// ─── Filtering ─────────────────────────────────────────────

function filterByRange(
  sessions: SessionInfo[],
  range: UsageRange,
): SessionInfo[] {
  if (range.kind === "all") return sessions;
  const cutoff = computeCutoff(range);
  return sessions.filter((s) => {
    const ts = s.lastUsedAt ? Date.parse(s.lastUsedAt) : 0;
    return ts >= cutoff;
  });
}

function computeCutoff(range: UsageRange): number {
  const now = new Date();
  if (range.kind === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range.kind === "lastDays") {
    return now.getTime() - range.days * 24 * 60 * 60 * 1000;
  }
  return 0;
}

// ─── Helpers ───────────────────────────────────────────────

function isAssistantMessage(msg: unknown): msg is {
  role: "assistant";
  model: string;
  usage: Usage;
  [key: string]: unknown;
} {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return (
    m["role"] === "assistant" &&
    typeof m["model"] === "string" &&
    typeof m["usage"] === "object" &&
    m["usage"] !== null
  );
}

function emptyModelBucket(model: string): UsageModelBucket {
  return {
    model,
    messages: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
  };
}

function emptyDayBucket(date: string): UsageDayBucket {
  return {
    date,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
    sessions: 0,
  };
}

/** Local YYYY-MM-DD for an ISO timestamp (matches `stats.ts` behavior). */
function localDateString(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
