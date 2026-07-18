/**
 * v0.7.3 (B2): pilot observability — record every tool call decision
 * the engine makes, aggregate by tool, surface in the dashboard.
 *
 * Three outcomes the engine can produce for a tool call:
 *   - "success" — the tool ran and returned without error
 *   - "fail"    — the tool ran but returned isError: true
 *   - "denied"  — pilot's policy engine blocked the call before it ran
 *
 * We persist all three to a single JSONL append-only log so the
 * dashboard can answer:
 *   - which tools fail most often,
 *   - which deny rules fire most often (so the user can revisit
 *     policy), and
 *   - what the actual error text was for a given call (so the user
 *     can decide if the failure is a model bug, a tool bug, or a
 *     config bug).
 *
 * Design notes (engineering philosophy, see user memory §Engineering):
 *   - Storage path is hidden from the UI (no `~/.pilot/observability/...`
 *     string in any user-visible copy). The dashboard says "本地记录"
 *     and "local records", full stop.
 *   - We do NOT normalize the raw error message. "file not found" and
 *     "permission denied" stay as the tool returned them, because
 *     collapsing them to "工具失败" loses the actionable signal.
 *   - We DO normalize the record shape itself (one Zod schema, one
 *     dashboard card component) so adding a 4th outcome in the future
 *     is a single line, not a sweep.
 *
 * This module does NOT depend on React, the web layer, or the policy
 * engine internals — it's a pure data layer the policy hook writes to
 * and the dashboard reads from.
 */

import { mkdir, appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

/**
 * A single recorded tool call. Five fields, minimal on purpose:
 *   - tool:         which tool (bash, read, write, ...)
 *   - outcome:      three-valued — see file header
 *   - reason:       optional rule id or short cause (e.g. "denyPaths",
 *                   "tool returned isError"). Empty string for "no
 *                   particular reason" so the field can be optional
 *                   in JSON without `null`.
 *   - errorSample:  raw tool error text (for "fail") or policy reason
 *                   text (for "denied"). Empty for "success".
 *   - context:      minimal LLM/workflow context — enough to correlate
 *                   with a session or workflow run, not enough to leak
 *                   user input.
 */
export interface RecordedToolCall {
  tool: string;
  outcome: "success" | "fail" | "denied";
  reason: string;
  errorSample: string;
  context: {
    sessionId?: string;
    workflowId?: string;
    /** ISO timestamp. */
    timestamp: string;
  };
}

/** Filter passed to `collectRecordedToolCalls`. */
export interface ObservabilityFilter {
  /** Only include this tool. */
  toolName?: string;
  /** Only include calls whose outcome matches. */
  outcome?: RecordedToolCall["outcome"];
  /** Only include calls at or after this ISO timestamp. */
  since?: string;
  /** Stop after this many records. */
  limit?: number;
}

/** Per-tool summary row used by the dashboard table. */
export interface ToolCallSummary {
  tool: string;
  total: number;
  success: number;
  fail: number;
  denied: number;
  /** Most recent error sample seen for this tool, if any. */
  recentError: string;
  /** ISO timestamp of the most recent call to this tool. */
  lastSeen: string;
}

/** Top-of-dashboard aggregate card. */
export interface ObservabilitySummary {
  total: number;
  success: number;
  fail: number;
  denied: number;
  // v0.8.7 (B2 闭环): per-outcome rate, expressed
  // as a 0-1 fraction (0.5 = 50%). The dashboard
  // multiplies by 100 for display. We compute these
  // here (not in the UI) so a non-React caller
  // (e.g. the chat endpoint) can answer "what's
  // the success rate?" without re-deriving it.
  //
  // When `total === 0` every rate is 0, not NaN
  // — the dashboard renders "—" in that case
  // (zero-data UI is clearer than zero-percent).
  successRate: number;
  failRate: number;
  deniedRate: number;
  /** Tool with the highest fail-rate (min 5 calls to qualify). */
  worstTool: string | null;
  byTool: ToolCallSummary[];
}

// ─── Paths ──────────────────────────────────────────────────

function observabilityDir(home?: string): string {
  const base = home ?? join(process.env.HOME ?? "", ".pilot");
  return join(base, "observability");
}

function logFile(home?: string): string {
  return join(observabilityDir(home), "tool-calls.jsonl");
}

// ─── Write ──────────────────────────────────────────────────

/**
 * Append a single tool call record to the log. Creates the parent
 * directory if needed. Failures are intentionally swallowed (we
 * log to stderr) so a broken recorder never breaks a tool call.
 */
export async function recordToolCall(
  event: RecordedToolCall,
  home?: string,
): Promise<void> {
  try {
    const dir = observabilityDir(home);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const line = JSON.stringify(event) + "\n";
    await appendFile(logFile(home), line, "utf-8");
  } catch (e) {
    // Recording is best-effort. A 5xx on the recorder must not turn
    // into a 5xx on the tool call itself.
    console.error(
      `[observability] failed to record tool call for ${event.tool}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

// ─── Read ───────────────────────────────────────────────────

/**
 * Read all recorded tool calls, newest first. Malformed lines are
 * skipped (the recorder is best-effort; we should still answer "what
 * was the failure rate yesterday?" when one line is corrupt).
 */
export async function collectRecordedToolCalls(
  home?: string,
  filter: ObservabilityFilter = {},
): Promise<RecordedToolCall[]> {
  const file = logFile(home);
  if (!existsSync(file)) return [];
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return [];
  }
  const out: RecordedToolCall[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: RecordedToolCall;
    try {
      parsed = JSON.parse(line) as RecordedToolCall;
    } catch {
      continue; // skip malformed
    }
    if (filter.toolName && parsed.tool !== filter.toolName) continue;
    if (filter.outcome && parsed.outcome !== filter.outcome) continue;
    if (filter.since && parsed.context.timestamp < filter.since) continue;
    out.push(parsed);
    if (filter.limit && out.length >= filter.limit) break;
  }
  // Newest first — easier on the dashboard.
  out.reverse();
  return out;
}

/**
 * Group all recorded calls by tool, compute success/fail/denied counts
 * and a "recentError" sample (the most recent non-empty errorSample
 * across fail + denied). "worstTool" picks the tool with the highest
 * fail-rate among tools with at least 5 calls — small samples aren't
 * a useful signal.
 */
export async function summarizeRecordedToolCalls(
  home?: string,
  since?: string,
): Promise<ObservabilitySummary> {
  const all = await collectRecordedToolCalls(home, since ? { since } : {});
  const byTool = new Map<string, ToolCallSummary>();
  for (const c of all) {
    let s = byTool.get(c.tool);
    if (!s) {
      s = {
        tool: c.tool,
        total: 0,
        success: 0,
        fail: 0,
        denied: 0,
        recentError: "",
        lastSeen: c.context.timestamp,
      };
      byTool.set(c.tool, s);
    }
    s.total++;
    if (c.outcome === "success") s.success++;
    else if (c.outcome === "fail") s.fail++;
    else if (c.outcome === "denied") s.denied++;
    if (c.errorSample && !s.recentError) s.recentError = c.errorSample;
    if (c.context.timestamp > s.lastSeen) {
      s.lastSeen = c.context.timestamp;
    }
  }
  const rows = Array.from(byTool.values()).sort(
    (a, b) =>
      b.fail / Math.max(1, b.total) - a.fail / Math.max(1, a.total) ||
      b.total - a.total,
  );
  // "worst tool" = highest fail-rate, min 5 calls.
  const candidates = rows.filter((r) => r.total >= 5);
  const worst = candidates[0] ?? null;
  const total = all.length;
  // v0.8.7: rates. We divide by `total` and return 0
  // when `total === 0` so a fresh install (no records
  // at all) doesn't render "NaN%" in the dashboard.
  const success = all.filter((c) => c.outcome === "success").length;
  const fail = all.filter((c) => c.outcome === "fail").length;
  const denied = all.filter((c) => c.outcome === "denied").length;
  const safe = total > 0 ? total : 1; // avoid /0; rates clamp to 0 anyway
  const summary: ObservabilitySummary = {
    total,
    success,
    fail,
    denied,
    successRate: total > 0 ? success / safe : 0,
    failRate: total > 0 ? fail / safe : 0,
    deniedRate: total > 0 ? denied / safe : 0,
    worstTool: worst && worst.fail > 0 ? worst.tool : null,
    byTool: rows,
  };
  return summary;
}
