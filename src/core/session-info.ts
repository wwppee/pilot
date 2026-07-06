/**
 * core/session-info.ts — per-session summary card (v0.5.3+).
 *
 * ## What this is
 *
 * A single, pre-aggregated view of a session that the Web UI can
 * render at the top of `/sessions/[id]` so users see at a glance:
 *
 *   model        : which model produced the assistant messages
 *   duration     : wall-clock span (first → last entry timestamp)
 *   totalTokens  : sum of AssistantMessage.usage.totalTokens
 *   totalCost    : sum of AssistantMessage.usage.cost.total (USD)
 *   tools used   : per-tool call count, sorted descending
 *   messages     : total + assistant-only counts
 *
 * All fields are derived from the same JSONL trace v0.4.2 usage
 * stats already pull from — we just slice per-session here instead
 * of aggregating across all sessions.
 *
 * ## Why this lives in `core/` instead of `web/`
 *
 * The aggregation logic is identical to what we'd want in a CLI
 * command (`pilot session info <id>`) — it's not UI-specific. Keeping
 * it in core means we can add a CLI subcommand later without
 * duplicating the JSONL walking.
 *
 * ## Failure modes
 *
 * - Session file gone (pruned by the user outside Pilot) → return null
 *   from `deriveSessionInfo`, same shape as `deriveSnapshot`.
 * - Empty / legacy v1 sessions with no `message.usage` → fields
 *   default to 0 / undefined. UI shows "(no usage recorded)".
 * - Mixed-format session (some entries with usage, some without) →
 *   we accumulate only the entries that carry usage, leaving the
 *   absent ones silent. No error.
 */

import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { piAgentDir } from "./types.js";
import { readEntries } from "./jsonl-parser.js";
import type { SessionEntry, Usage } from "./types.js";

/** Per-tool call summary. */
export interface SessionToolUsage {
  toolName: string;
  /** Number of `toolCall` blocks with this name in assistant messages. */
  count: number;
}

/**
 * Aggregated summary for one session. Fields are designed so the UI
 * can render a compact card without re-deriving anything client-side.
 */
export interface SessionInfoSummary {
  sessionId: string;
  cwd?: string;
  /** First assistant message's model — undefined if no assistant msgs. */
  model?: string;
  startedAt?: string;
  endedAt?: string;
  /** Wall-clock duration in ms; 0 when start/end missing. */
  durationMs: number;
  /** Every entry, including user/assistant/tool/system. */
  totalMessages: number;
  /** Just the assistant messages. */
  assistantMessages: number;
  totalTokens: number;
  totalCost: number;
  toolsUsed: SessionToolUsage[];
}

/**
 * Derive a summary for the given session id. Returns null when the
 * session file is gone (the same shape `deriveSnapshot` uses).
 *
 * Walks the JSONL once, accumulating in a single pass. Cost is
 * USD (`AssistantMessage.usage.cost.total` is already USD-scaled by
 * pi). Tokens are the raw `totalTokens` from each usage block.
 */
export async function deriveSessionInfo(
  sessionId: string,
  home?: string,
): Promise<SessionInfoSummary | null> {
  const filePath = await findSessionFile(sessionId, home);
  if (!filePath) return null;

  const cwd = extractCwd(filePath);

  let model: string | undefined;
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let totalMessages = 0;
  let assistantMessages = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const toolCounts = new Map<string, number>();

  for await (const entry of readEntries(filePath)) {
    totalMessages += 1;
    const ts = entry.timestamp;
    if (ts) {
      if (!startedAt) startedAt = ts;
      endedAt = ts;
    }
    if (entry.type !== "message" || !entry.message) continue;

    const msg = entry.message as Record<string, unknown>;
    if (msg["role"] !== "assistant") continue;

    assistantMessages += 1;

    // First assistant message wins for the model's identity.
    if (!model && typeof msg["model"] === "string") {
      model = msg["model"];
    }

    // Usage block — present on every assistant message in pi v3.
    const usage = msg["usage"] as Usage | undefined;
    if (usage) {
      totalTokens += usage.totalTokens ?? 0;
      // Cost is a nested object. Pi ships `cost: { input, output,
      // total }` where `total === input + output`. Summing every
      // numeric field would double-count (input + output + total).
      // Strategy: prefer the canonical `total` field; if absent,
      // sum the rest so we still work with future pi versions that
      // add new cost sub-fields (e.g. cacheRead cost).
      if (usage.cost) {
        if (typeof usage.cost.total === "number") {
          totalCost += usage.cost.total;
        } else {
          for (const [k, v] of Object.entries(usage.cost)) {
            if (k === "total") continue; // already missing, but defensive
            if (typeof v === "number") totalCost += v;
          }
        }
      }
    }

    // Tool calls — counted from content blocks (toolCall type).
    accumulateToolCalls(msg["content"], toolCounts);
  }

  const durationMs = computeDurationMs(startedAt, endedAt);

  const toolsUsed: SessionToolUsage[] = [...toolCounts.entries()]
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count || a.toolName.localeCompare(b.toolName));

  return {
    sessionId,
    ...(cwd !== undefined ? { cwd } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
    durationMs,
    totalMessages,
    assistantMessages,
    totalTokens,
    totalCost,
    toolsUsed,
  };
}

/**
 * Walk an assistant message's content (string | array of blocks) and
 * count `type: "toolCall"` blocks by name.
 */
function accumulateToolCalls(content: unknown, out: Map<string, number>): void {
  if (typeof content === "string") return;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b["type"] === "toolCall" && typeof b["name"] === "string") {
        out.set(b["name"], (out.get(b["name"]) ?? 0) + 1);
      }
    }
  }
}

/** Wall-clock duration. Returns 0 when start or end is missing. */
function computeDurationMs(
  start: string | undefined,
  end: string | undefined,
): number {
  if (!start || !end) return 0;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, e - s);
}

/**
 * Locate <sessionId>.jsonl under pi's sessions dir. Same walker
 * pattern used by `session-snapshot.ts` / `session-template.ts` —
 * kept duplicated to avoid cross-imports.
 */
async function findSessionFile(
  sessionId: string,
  home?: string,
): Promise<string | null> {
  const root = piAgentDir(home) + "/sessions";
  if (!existsSync(root)) return null;
  const cwdDirs = await readdir(root, { withFileTypes: true }).catch(
    () => [] as import("node:fs").Dirent[],
  );
  for (const d of cwdDirs) {
    if (!d.isDirectory()) continue;
    const candidate = join(root, d.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Pull encoded cwd from a session file path. */
function extractCwd(filePath: string): string | undefined {
  const idx = filePath.lastIndexOf(`${sep}sessions${sep}`);
  if (idx < 0) return undefined;
  const after = filePath.slice(idx + `${sep}sessions${sep}`.length);
  const seg = after.split(sep)[0];
  return seg && seg.length > 0 ? seg : undefined;
}

// Re-export so tests can poke at the underlying type. Kept narrow
// on purpose — `SessionEntry` is already exported by core/types.ts.
export type { SessionEntry };
