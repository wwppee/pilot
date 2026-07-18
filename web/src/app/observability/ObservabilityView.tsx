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

import { useCallback, useEffect, useState } from "react";
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

  const expand = useCallback(
    async (tool: string) => {
      if (expanded === tool) {
        setExpanded(null);
        setCalls([]);
        return;
      }
      setExpanded(tool);
      try {
        const c = await api.toolCalls({ toolName: tool, limit: 20 });
        setCalls(c as ToolCallCardData[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [expanded],
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
          // v0.8.7: total has no rate (it IS the
          // denominator), but AggregateCard requires
          // the props. We pass `null` rate and
          // `rateLabel: ""` so the rate line still
          // renders consistently — a single "—"
          // character keeps the card heights aligned
          // across the row.
          rate={null}
          rateLabel={t("observability.total")}
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
                onToggle={() => void expand(row.tool)}
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
        <span>{rateLabel}: </span>
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
function ChatBox({ t }: { t: (k: string, p?: Record<string, string | number>) => string }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<{ intent: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.observabilityChat(message);
      setReply(r as { intent: string; text: string });
    } catch (e) {
      setReply({
        intent: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [message, busy]);
  return (
    <div className="surface rounded-lg p-3 space-y-2">
      <p className="text-xs text-[var(--text-muted)]">
        {t("observability.chat.hint")}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
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
      {reply ? (
        <p
          className="text-sm text-[var(--text)]"
          data-testid="observability-chat-reply"
        >
          <span className="text-xs text-[var(--text-muted)] mr-1">
            [{reply.intent}]
          </span>
          {reply.text}
        </p>
      ) : null}
    </div>
  );
}

function ToolRow({
  row,
  expanded,
  calls,
  onToggle,
  onSelectDetail,
  t,
}: {
  row: Summary["byTool"][number];
  expanded: boolean;
  calls: ToolCallCardData[];
  onToggle: () => void;
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
        <td className="p-3 text-right text-xs text-[var(--text-muted)]">
          {expanded ? "▾" : "▸"}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-[var(--border)] bg-[var(--bg)]">
          <td colSpan={6} className="p-3">
            {calls.length === 0 ? (
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
