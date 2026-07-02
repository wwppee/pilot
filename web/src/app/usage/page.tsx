/**
 * /usage — token usage & cost dashboard.
 *
 * v0.4.2: server-side fetches `/usage?range=week` by default and renders
 * totals + by-model + by-day. Range selector is a Server Component
 * prop (`?range=today|week|month|all`); clients pick via plain links.
 */

import Link from "next/link";
import { api } from "@/lib/pilot";
import type { UsageRange, UsageReport } from "@/lib/types";

const RANGES: Array<{ key: string; range: UsageRange; label: string }> = [
  { key: "today", range: { kind: "today" }, label: "Today" },
  { key: "week", range: { kind: "lastDays", days: 7 }, label: "7 days" },
  { key: "month", range: { kind: "lastDays", days: 30 }, label: "30 days" },
  { key: "all", range: { kind: "all" }, label: "All" },
];

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const which = sp.range ?? "week";
  const selected = RANGES.find((r) => r.key === which) ?? RANGES[1]!;

  let report: UsageReport | null = null;
  let error: string | null = null;
  try {
    report = await api.usage(selected.range);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Token usage &amp; cost</h1>
          <p className="text-[var(--text-muted)] text-sm">
            Aggregated from <code>AssistantMessage.usage</code> across every pi
            v3 session.
          </p>
        </div>
        <nav className="flex gap-1 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/usage?range=${r.key}`}
              className={`px-2.5 py-1 rounded ${
                r.key === which
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)]">
          Couldn&apos;t load usage: {error}
        </div>
      ) : !report ? null : report.totalAssistantMessages === 0 ? (
        <div className="surface rounded-lg p-8 text-sm text-[var(--text-muted)] italic text-center">
          No usage data yet. Run pi with a real model to record tokens and cost.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Sessions" value={String(report.totalSessions)} />
            <Card
              label="Assistant messages"
              value={String(report.totalAssistantMessages)}
            />
            <Card label="Total tokens" value={formatInt(report.totalTokens)} />
            <Card
              label="Total cost"
              value={`$${report.totalCost.toFixed(4)}`}
              accent
            />
          </div>

          {/* By model */}
          <div className="surface rounded-lg overflow-hidden">
            <div className="px-4 py-2 surface-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              By model
            </div>
            {report.byModel.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-muted)] italic">
                No model data.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="surface-2 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium text-right">Msgs</th>
                    <th className="px-3 py-2 font-medium text-right">Input</th>
                    <th className="px-3 py-2 font-medium text-right">Output</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Cache R
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Cache W
                    </th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byModel.map((m) => (
                    <tr
                      key={m.model}
                      className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                    >
                      <td className="px-3 py-2">
                        <code className="kbd">{m.model}</code>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.messages}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {formatInt(m.input)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {formatInt(m.output)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {formatInt(m.cacheRead)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {formatInt(m.cacheWrite)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatInt(m.totalTokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        ${m.cost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* By day */}
          <div className="surface rounded-lg overflow-hidden">
            <div className="px-4 py-2 surface-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              By day (local TZ)
            </div>
            {report.byDay.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-muted)] italic">
                No daily data.
              </div>
            ) : (
              <div className="p-4 space-y-1.5">
                {report.byDay.slice(-14).map((d) => {
                  const max = Math.max(
                    ...report!.byDay.map((x) => x.totalTokens),
                    1,
                  );
                  const pct = Math.round((d.totalTokens / max) * 100);
                  return (
                    <div
                      key={d.date}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="font-mono text-xs text-[var(--text-muted)] w-24 flex-shrink-0">
                        {d.date}
                      </span>
                      <div className="flex-1 bg-[var(--surface-2)] rounded h-4 overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)] opacity-70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-[var(--text-muted)] w-24 text-right">
                        {formatInt(d.totalTokens)} tok
                      </span>
                      <span className="tabular-nums text-xs w-20 text-right">
                        ${d.cost.toFixed(4)}
                      </span>
                    </div>
                  );
                })}
                {report.byDay.length > 14 && (
                  <div className="text-xs text-[var(--text-muted)] italic pt-1">
                    (showing last 14 of {report.byDay.length} days)
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="surface rounded-lg p-4">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums ${
          accent ? "text-[var(--accent)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
