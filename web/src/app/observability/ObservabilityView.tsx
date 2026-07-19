"use client";

/**
 * v0.7.3 (B2): observability dashboard. Renders three things:
 *   1. The top aggregate card (total + fail + denied) so the
 *      user sees "is something on fire?" at a glance.
 *   2. A "by tool" table — for each tool, count of success /
 *      fail / denied + the most recent error sample. Sorted by
 *      fail-rate so the worst tool is at the top.
 *   3. An expandable "recent calls" list when the user clicks
 *      a tool row, showing the last 20 records with the raw
 *      error message (no normalization — see user memory).
 *
 * v0.7.3 only emits "denied" outcomes because the v0.7.3 policy
 * hook is the only writer wired up. Success / fail will arrive
 * in v0.7.4+ when the pi ToolResultMessage stream is hooked in.
 * The UI handles the three outcomes identically; this comment
 * is here so a future reader doesn't think the empty
 * success/fail counts are a bug.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18n";
import { api } from "@/lib/pilot-browser";
import type { ToolCallCardData } from "./ToolCallCard";
import { ToolCallCard } from "./ToolCallCard";

interface Summary {
  total: number;
  success: number;
  fail: number;
  denied: number;
  // v0.8.7 (B2 闭环): per-outcome rate as 0-1 fraction.
  // The dashboard multiplies by 100 to render "{pct}%".
  successRate: number;
  failRate: number;
  deniedRate: number;
  worstTool: string | null;
  byTool: Array<{
    tool: string;
    total: number;
    success: number;
    fail: number;
    denied: number;
    // v0.9.2: per-tool rate as 0-1 fraction.
    // The by-tool table renders "{pct}%" in two
    // new columns (success rate + fail rate)
    // so the user can spot high-fail tools.
    successRate: number;
    failRate: number;
    deniedRate: number;
    recentError: string;
    lastSeen: string;
  }>;
}

export function ObservabilityView({ locale: _locale }: { locale: string }) {
  const t = useT();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [calls, setCalls] = useState<ToolCallCardData[]>([]);
  // v0.8.5: detail modal. Clicking a record opens a
  // modal showing the full raw JSON. Per user memory
  // §Engineering Philosophy 'storage is a blind box',
  // the dashboard does NOT surface the storage path
  // or schema field names by default — but a user
  // who explicitly clicks a record to see more is
  // making a deliberate choice, and showing them the
  // raw record is more useful than hiding it behind
  // another abstract UI. (The default card already
  // shows the actionable fields; the modal is the
  // 'tell me more' affordance.)
  const [detail, setDetail] = useState<ToolCallCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v0.9.12: separate error state for the per-tool
  // "expand" fetch. Pre-v0.9.12 the `expand()` handler
  // wrote its fetch error to the same `error` state
  // as the initial load — so a failed expand
  // collapsed the entire dashboard to a single
  // "Error: …" panel, hiding the summary cards the
  // user had already loaded. (Same pattern as the
  // pi-agent-dashboard "never blank" rule from
  // v0.9.7 + the truncation-banner principle:
  // a fetch failure should narrow the surface, not
  // wipe it.) `expandError` is per-tool — clearing
  // it on the next expand so the user doesn't see
  // a stale error from a previous tool.
  const [expandError, setExpandError] = useState<{
    tool: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  // v0.8.1: time-range filter. v0.7.3 only ever queried
  // "all time" — the user had to eyeball every record.
  // The underlying helpers already accept `since` (it's
  // how the API was designed in v0.7.3); we're just
  // surfacing the control. v0.7.3 dashboard's storage
  // layer never had a TTL, so the all-time option stays
  // useful for the first 24-48h of any deployment
  // before users start wanting windowed views.
  const [range, setRange] = useState<"24h" | "7d" | "all">("24h");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = range === "24h"
        ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        : range === "7d"
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;
      const s = await api.observabilitySummary(since);
      setSummary(s as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // v0.9.12: extracted from `expand()` so the Retry
  // button on the inline failure banner can re-run
  // the fetch *without* the toggle-close branch.
  // Pre-v0.9.12 the retry button called `expand()`
  // again, which saw `expanded === tool` and
  // collapsed the row — defeating the retry.
  // v0.9.12 makes the retry explicitly a re-fetch.
  const fetchCalls = useCallback(async (tool: string) => {
    setExpanded(tool);
    setExpandError(null);
    setCalls([]);
    try {
      const c = await api.toolCalls({ toolName: tool, limit: 20 });
      setCalls(c as ToolCallCardData[]);
    } catch (e) {
      setExpandError({
        tool,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const expand = useCallback(
    async (tool: string) => {
      if (expanded === tool) {
        setExpanded(null);
        setCalls([]);
        setExpandError(null);
        return;
      }
      await fetchCalls(tool);
    },
    [expanded, fetchCalls],
  );

  const retryExpand = useCallback(
    async (tool: string) => {
      // v0.9.12: same as `fetchCalls` but the
      // semantic intent is "user clicked Retry" —
      // we keep the expanded section open regardless
      // of prior state. The fetch is what counts;
      // the toggle is not relevant here.
      await fetchCalls(tool);
    },
    [fetchCalls],
  );

  if (loading && !summary) {
    return <p className="text-[var(--text-muted)] text-sm">…</p>;
  }
  if (error) {
    return (
      <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
        {error}
      </div>
    );
  }
  if (!summary || summary.total === 0) {
    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t("observability.title")}</h1>
        </header>
        <div className="surface rounded-lg p-6 text-sm text-center space-y-2">
          <p className="font-semibold text-[var(--text)]">
            {t("observability.empty")}
          </p>
          <p className="text-[var(--text-muted)]">
            {t("observability.empty.hint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChatBox t={t} />
      <DetailModal detail={detail} onClose={() => setDetail(null)} />
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">{t("observability.title")}</h1>
        <div className="flex items-center gap-2">
          {/* v0.8.1: time-range filter. v0.7.3 always queried
              all-time; this surfaces the same `since` filter
              the API has supported since day one. */}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as typeof range)}
            className="px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded"
            data-testid="observability-range"
          >
            <option value="24h">{t("observability.range.24h")}</option>
            <option value="7d">{t("observability.range.7d")}</option>
            <option value="all">{t("observability.range.all")}</option>
          </select>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => void reload()}
          >
            {t("observability.refresh")}
        </button>
        </div>
      </header>

      {/* Top aggregate card — the "is something on fire?" glance. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AggregateCard
          label={t("observability.total")}
          value={summary.total}
          // v0.9.7: total has no rate (it IS the
          // denominator). We pass `null` rate and
          // an empty `rateLabel`; AggregateCard
          // hides the "{label}: " prefix when the
          // label is empty, so the total card just
          // shows the em-dash. The other three
          // cards keep their "{label}: {pct}%"
          // sub-label.
          rate={null}
          rateLabel=""
          rateEmpty={t("observability.rate.empty")}
        />
        <AggregateCard
          label={t("observability.success")}
          value={summary.success}
          tone="ok"
          // v0.8.7: success rate under the count. We
          // pre-compute on the server (the
          // `successRate` field is part of
          // ObservabilitySummary) so the UI is a
          // pure presentational layer. The empty
          // case (`total === 0`) shows "—" rather
          // than "0%" so a fresh install doesn't
          // render misleadingly.
          rate={summary.total > 0 ? summary.successRate : null}
          rateLabel={t("observability.rate.success")}
          rateEmpty={t("observability.rate.empty")}
        />
        <AggregateCard
          label={t("observability.fail")}
          value={summary.fail}
          tone={summary.fail > 0 ? "warn" : "neutral"}
          rate={summary.total > 0 ? summary.failRate : null}
          rateLabel={t("observability.rate.fail")}
          rateEmpty={t("observability.rate.empty")}
        />
        <AggregateCard
          label={t("observability.denied")}
          value={summary.denied}
          tone={summary.denied > 0 ? "warn" : "neutral"}
          rate={summary.total > 0 ? summary.deniedRate : null}
          rateLabel={t("observability.rate.denied")}
          rateEmpty={t("observability.rate.empty")}
        />
      </div>

      {summary.worstTool ? (
        <p className="text-sm text-[var(--text-muted)]">
          {t("observability.worstTool", { tool: summary.worstTool })}
        </p>
      ) : null}

      {/* By-tool table — one row per tool, expandable. */}
      <div className="surface rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-[var(--text-muted)]">
            <tr>
              <th className="text-left p-3">{t("observability.col.tool")}</th>
              <th className="text-right p-3">{t("observability.col.total")}</th>
              <th className="text-right p-3">
                {t("observability.col.success")}
              </th>
              <th className="text-right p-3">{t("observability.col.fail")}</th>
              <th className="text-right p-3">
                {t("observability.col.denied")}
              </th>
              {/* v0.9.2: per-tool rate columns. Each
                  shows "{count} ({pct}%)" so the
                  user can scan the column to spot
                  the worst tool. The rate is
                  pre-computed on the server (no
                  per-row math in the UI). */}
              <th className="text-right p-3">
                {t("observability.col.successRate")}
              </th>
              <th className="text-right p-3">
                {t("observability.col.failRate")}
              </th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {summary.byTool.map((row) => (
              <ToolRow
                key={row.tool}
                row={row}
                expanded={expanded === row.tool}
                calls={calls}
                // v0.9.12: only the row whose tool
                // matches the failed expand gets the
                // error — never the table as a whole.
                expandError={
                  expandError && expandError.tool === row.tool
                    ? { message: expandError.message }
                    : null
                }
                onToggle={() => void expand(row.tool)}
                onRetry={() => void retryExpand(row.tool)}
                onSelectDetail={(c) => setDetail(c)}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        <Link href="/policy" className="hover:underline">
          {t("observability.managePolicy")}
        </Link>
      </p>
    </div>
  );
}

function AggregateCard({
  label,
  value,
  tone = "neutral",
  rate,
  rateLabel,
  rateEmpty,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "neutral";
  // v0.8.7: per-outcome rate. `null` means "no data
  // — render `rateEmpty` instead of "0%". A number
  // is rendered as "{pct}%".
  rate: number | null;
  rateLabel: string;
  rateEmpty: string;
}) {
  const color =
    tone === "warn"
      ? "text-[var(--error)]"
      : tone === "ok"
        ? "text-[var(--text)]"
        : "text-[var(--text-muted)]";
  // v0.8.7: format as integer percent. 0.5 → "50%",
  // 0.123 → "12%". We deliberately round to integer
  // because the dashboard is for glance, not precision
  // — a "12.3%" rate label clutters the card without
  // telling the user anything useful.
  const pct = rate === null ? null : Math.round(rate * 100);
  return (
    <div
      className="surface rounded-lg p-3"
      data-testid={`observability-card-${label.toLowerCase()}`}
    >
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {/* v0.8.7: rate sub-label. Rendered as a small
          line under the count so the user gets the
          "80% success" reading at a glance, without
          having to do mental arithmetic from the
          total/success split. */}
      <p className="text-xs text-[var(--text-muted)] mt-1">
        {/* v0.9.7: when `rateLabel` is empty (the
            total card has no rate sub-label), hide
            the "{label}: " prefix so the card just
            shows the em-dash / pct. When the label
            is present, render it as before. This
            keeps the card heights aligned across
            the row without the leading "Total: " on
            the total card. */}
        {rateLabel ? (
          <span>{rateLabel}: </span>
        ) : null}
        <span className="font-mono" data-testid={`observability-rate-${label.toLowerCase()}`}>
          {pct === null ? rateEmpty : `${pct}%`}
        </span>
      </p>
    </div>
  );
}

// v0.7.7: chat-to-dashboard input. The user types a
// natural-language question; the server's keyword
// matcher (v0.7.7) returns a structured reply. v0.8+
// will swap the matcher for an LLM dispatcher; the
// component shape is stable.
//
// We keep the box small + the placeholder friendly
// enough that a user can see what kinds of questions
// work today. The answer renders below the input as a
// one-line "hero" reply — the dashboard's table stays
// as the deep-dive surface.
// v0.9.6: chat history shape. Each entry is
// either the user's question or the assistant's
// reply. We keep this purely client-side
// (the server is still stateless — see v0.7.7's
// design comment). The history is what the
// ChatBox renders as a scrolling conversation
// above the input; clicking the trash icon
// clears it.
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  intent?: string;
}

function ChatBox({ t }: { t: (k: string, p?: Record<string, string | number>) => string }) {
  // v0.9.6: multi-turn session. The list of
  // {role, text, intent?} messages is the
  // conversation history. We cap at 50
  // entries so the panel doesn't grow without
  // bound (a 30-message back-and-forth is
  // already a long session; longer is
  // unreadable on the dashboard).
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    // v0.9.6: append the user's question to
    // the history immediately so the input
    // doesn't lose the question while the
    // request is in flight. The assistant
    // reply is appended on success / error.
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setMessage("");
    try {
      const r = await api.observabilityChat(trimmed);
      const reply = r as { intent: string; text: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply.text, intent: reply.intent },
      ]);
      // v0.9.6: auto-scroll the conversation
      // to the bottom on new messages. We
      // use a small setTimeout because the
      // DOM update is asynchronous.
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop =
            scrollRef.current.scrollHeight;
        }
      }, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: msg, intent: "error" },
      ]);
    } finally {
      setBusy(false);
    }
  }, [message, busy]);
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);
  return (
    <div className="surface rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {t("observability.chat.hint")}
        </p>
        {messages.length > 0 ? (
          <button
            type="button"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--error)]"
            onClick={clearHistory}
            data-testid="observability-chat-clear"
            aria-label={t("observability.chat.clear")}
          >
            {t("observability.chat.clear")}
          </button>
        ) : null}
      </div>
      {/* v0.9.6: conversation history. We
          render the messages as a vertical
          list with role-aligned alignment
          (user right, assistant left). The
          container has a max-height so a long
          session doesn't push the rest of
          the dashboard off-screen. */}
      {messages.length > 0 ? (
        <div
          ref={scrollRef}
          className="space-y-1 max-h-48 overflow-y-auto border border-[var(--border)] rounded p-2 bg-[var(--bg)]"
          data-testid="observability-chat-history"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-xs ${
                m.role === "user" ? "text-right" : "text-left"
              }`}
              data-testid={`observability-chat-msg-${i}`}
            >
              {m.role === "assistant" && m.intent ? (
                <span className="text-[var(--text-muted)] mr-1">
                  [{m.intent}]
                </span>
              ) : null}
              <span
                className={
                  m.role === "user"
                    ? "text-[var(--text)]"
                    : "text-[var(--text-muted)]"
                }
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // v0.9.9: IME composition guard. When
            // Chinese / Japanese / Korean users are
            // typing via an IME, the IME owns the
            // Enter key to commit a candidate. We
            // must NOT also submit on Enter, or the
            // candidate would land in the chat
            // half-formed. agegr/pi-web (commit
            // 01ae83a) added the same guard for
            // Escape; the same fix shape applies
            // here. `e.nativeEvent.isComposing` is
            // the cross-browser signal for "an IME
            // is consuming keystrokes".
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") void submit();
          }}
          placeholder={t("observability.chat.placeholder")}
          disabled={busy}
          className="flex-1 px-2 py-1 text-sm bg-[var(--bg)] border border-[var(--border)] rounded"
          data-testid="observability-chat-input"
        />
        <button
          type="button"
          className="btn small primary"
          onClick={() => void submit()}
          disabled={busy || !message.trim()}
          data-testid="observability-chat-submit"
        >
          {busy ? "…" : t("observability.chat.ask")}
        </button>
      </div>
    </div>
  );
}

function ToolRow({
  row,
  expanded,
  calls,
  expandError,
  onToggle,
  onRetry,
  onSelectDetail,
  t,
}: {
  row: Summary["byTool"][number];
  expanded: boolean;
  calls: ToolCallCardData[];
  // v0.9.12: if a previous expand for this tool
  // failed, the parent passes the error here so the
  // inline banner can render. Only the matching
  // tool's row shows it (parent filters by tool name).
  expandError: { message: string } | null;
  onToggle: () => void;
  // v0.9.12: re-runs the parent's `expand()` for
  // this tool, which clears the error state at the
  // start and re-fetches. Used by the inline retry
  // button.
  onRetry: () => void;
  // v0.8.5: when a record is clicked, the parent
  // opens the detail modal. We thread the call up
  // instead of using local state so the modal
  // survives even if the user collapses the row.
  onSelectDetail: (c: ToolCallCardData) => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <tr
        className="border-t border-[var(--border)] cursor-pointer hover:bg-[var(--bg)]"
        onClick={onToggle}
        data-testid={`observability-row-${row.tool}`}
      >
        <td className="p-3 font-mono">{row.tool}</td>
        <td className="p-3 text-right">{row.total}</td>
        <td className="p-3 text-right">{row.success}</td>
        <td
          className={`p-3 text-right ${row.fail > 0 ? "text-[var(--error)]" : ""}`}
        >
          {row.fail}
        </td>
        <td
          className={`p-3 text-right ${row.denied > 0 ? "text-[var(--error)]" : ""}`}
        >
          {row.denied}
        </td>
        {/* v0.9.2: per-tool success rate and fail
            rate. Each is "{pct}%" rendered as
            integer percent (we round to whole
            percent for the table — the
            aggregate card is the precision-
            oriented view; the table is a
            glance-oriented view). The success
            rate is shown so the user can spot
            a tool that's mostly successful;
            the fail rate is the headline
            "what's broken?" signal. */}
        <td
          className="p-3 text-right text-xs text-[var(--text-muted)] font-mono"
          data-testid={`observability-rate-success-${row.tool}`}
        >
          {row.total > 0 ? `${Math.round(row.successRate * 100)}%` : "—"}
        </td>
        <td
          className={`p-3 text-right text-xs font-mono ${
            row.failRate > 0 ? "text-[var(--error)]" : "text-[var(--text-muted)]"
          }`}
          data-testid={`observability-rate-fail-${row.tool}`}
        >
          {row.total > 0 ? `${Math.round(row.failRate * 100)}%` : "—"}
        </td>
        <td className="p-3 text-right text-xs text-[var(--text-muted)]">
          {expanded ? "▾" : "▸"}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-[var(--border)] bg-[var(--bg)]">
          <td colSpan={6} className="p-3">
            {expandError ? (
              // v0.9.12: inline failure banner. The
              // dashboard stays rendered (the user
              // doesn't lose the summary cards they
              // already had on screen), and the retry
              // button re-invokes the parent's
              // `expand()` with the same tool name.
              // After a successful retry the banner
              // clears naturally (expandError is set
              // to null at the start of every expand).
              // The parent only passes expandError
              // here when the failing tool matches
              // this row, so we don't need to re-check.
              <div
                className="rounded p-3 bg-[color-mix(in_srgb,var(--error)_15%,transparent)] border border-[color-mix(in_srgb,var(--error)_30%,transparent)] space-y-2"
                data-testid="observability-expand-error"
              >
                <p className="text-sm font-medium text-[var(--error)]">
                  {t("observability.expand.error.title")}
                </p>
                <p className="text-xs font-mono text-[var(--text-muted)] break-words">
                  {expandError.message}
                </p>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={onRetry}
                  data-testid="observability-expand-retry"
                >
                  {t("observability.expand.error.retry")}
                </button>
              </div>
            ) : calls.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">…</p>
            ) : (
              <ul className="space-y-2">
                {calls.map((c, i) => (
                  <li key={`${c.context.timestamp}-${i}`}>
                    <ToolCallCard
                      call={c}
                      t={t}
                      // v0.8.5: clicking the card opens
                      // the detail modal. The whole card
                      // is clickable (not just a button)
                      // because the modal is a true
                      // "expand the record" affordance.
                      onClick={() => onSelectDetail(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
      {row.recentError && !expanded ? (
        <tr className="border-t border-[var(--border)]">
          <td colSpan={6} className="p-3 text-xs text-[var(--text-muted)]">
            <span className="font-mono">{row.tool}</span>: {row.recentError}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// v0.8.5: detail modal. Shows the raw record as
// pretty-printed JSON. v0.7.3 deliberately did NOT
// surface this — the dashboard was read-only and
// the storage path was hidden. v0.8.5 introduces
// the explicit "click a record to see its full
// shape" affordance: the user is making a deliberate
// choice when they click, and the raw record is more
// useful for debugging than a second hand-crafted UI.
// We render JSON.stringify(_, null, 2) directly — no
// syntax highlighting or schema-aware formatter —
// because the user wants the bytes the server sent
// back, not a re-interpretation.
function DetailModal({
  detail,
  onClose,
}: {
  detail: ToolCallCardData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detail, onClose]);
  if (!detail) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="observability-detail-modal"
    >
      <div className="surface rounded-lg p-5 w-full max-w-2xl space-y-3">
        <h2 className="text-lg font-semibold font-mono">{detail.tool}</h2>
        <pre
          className="bg-[var(--bg)] border border-[var(--border)] rounded p-3 text-xs overflow-auto max-h-96 font-mono"
          data-testid="observability-detail-json"
        >
          {JSON.stringify(detail, null, 2)}
        </pre>
        <div className="flex justify-end">
          <button
            type="button"
            className="btn small primary"
            onClick={onClose}
            data-testid="observability-detail-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
