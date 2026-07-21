/**
 * /usage — token usage & cost dashboard.
 *
 * v0.4.2: server-side fetches `/usage?range=week` by default and renders
 * totals + by-model + by-day. Range selector is a Server Component
 * prop (`?range=today|week|month|all`); clients pick via plain links.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/pilot";
export const dynamic = "force-dynamic";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { RichT } from "@/components/RichT";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { PageHeader } from "@/components/PageHeader";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { UsageReport } from "@/lib/types";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const which = sp.range ?? "week";
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const RANGES = [
    {
      key: "today",
      range: { kind: "today" as const },
      label: renderT(locale, "usage.range.today"),
    },
    {
      key: "week",
      range: { kind: "lastDays" as const, days: 7 },
      label: renderT(locale, "usage.range.week"),
    },
    {
      key: "month",
      range: { kind: "lastDays" as const, days: 30 },
      label: renderT(locale, "usage.range.month"),
    },
    {
      key: "all",
      range: { kind: "all" as const },
      label: renderT(locale, "usage.range.all"),
    },
  ];
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
          <PageHeader
            icon={<BarChart3 size={20} strokeWidth={1.75} />}
            title={<T k="usage.h1" />}
            subtitle={<T k="usage.subtitle" />}
          />
        </div>
        <nav
          className="flex gap-1 text-xs"
          aria-label={renderT(locale, "btn.ariaRange")}
        >
          {RANGES.map((r) => {
            // v0.6.16: pin all four range buttons to the same
            // minimum width so the active pill doesn't visually
            // "shrink" when the active label is the shortest
            // one ("今天" / "Today" / "All") vs. the widest
            // ("近 30 天" / "Last 30 days"). 5rem is enough for
            // the longest current label in any locale; if a
            // future label overflows, the min-w acts as a
            // floor and the button grows as needed.
            const isActive = r.key === which;
            return (
              <Link
                key={r.key}
                href={`/usage?range=${r.key}`}
                aria-current={isActive ? "page" : undefined}
                className={`min-w-[5rem] text-center px-2.5 py-1 rounded transition-colors ${
                  isActive
                    ? // v0.6.17: was `text-[var(--bg)]` (dark text on
                      // blue background). User reported the dark
                      // text read as "green and unreadable" on
                      // certain display profiles — the deep
                      // #0b0d10 sits in the same value range as
                      // the active blue and the small font weight
                      // loses contrast at typical browser DPRs.
                      // Pure white is the safest reading color on
                      // a saturated blue background across all
                      // themes; the underlying bg is bright enough
                      // (var(--accent) = #79c0ff) that white still
                      // passes WCAG AA.
                      "bg-[var(--accent)] text-white font-semibold"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mb-2">
        <Hint summary={<T k="usage.hint.summary" />}>
          <RichT
            locale={locale}
            k="usage.hint.body"
            values={{
              token: (
                <GlossaryTerm term="token" locale={locale}>
                  Tokens
                </GlossaryTerm>
              ),
              c1: <code className="kbd">cacheRead</code>,
              c2: <code className="kbd">cacheWrite</code>,
              profile: (
                <GlossaryTerm term="profile" locale={locale}>
                  profile
                </GlossaryTerm>
              ),
            }}
          />
        </Hint>
      </div>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)]">
          {renderT(locale, "usage.loadError", { message: error })}
        </div>
      ) : !report ? null : report.totalAssistantMessages === 0 ? (
        <EmptyState
          title={renderT(locale, "usage.empty")}
          hint={
            <RichT
              locale={locale}
              k="usage.empty.hint"
              values={{
                cmd: <code className="kbd">pi</code>,
              }}
            />
          }
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card
              label={renderT(locale, "usage.card.sessions")}
              value={String(report.totalSessions)}
            />
            <Card
              label={renderT(locale, "usage.card.assistantMessages")}
              value={String(report.totalAssistantMessages)}
            />
            <Card
              label={renderT(locale, "usage.card.totalTokens")}
              value={formatInt(report.totalTokens)}
            />
            <Card
              label={renderT(locale, "usage.card.totalCost")}
              value={renderT(locale, "currency.usd", {
                amount: report.totalCost.toFixed(4),
              })}
              accent
            />
          </div>

          {/* By model */}
          <div className="surface rounded-lg overflow-hidden">
            <div className="px-4 py-2 surface-2 section-h2">
              <T k="usage.byModel.title" />
            </div>
            {report.byModel.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-muted)] italic">
                <T k="usage.empty.model" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="surface-2 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      <T k="usage.col.model" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.msgs" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.input" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.output" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.cacheR" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.cacheW" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.total" />
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      <T k="usage.col.cost" />
                    </th>
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
                        {renderT(locale, "currency.usd", {
                          amount: m.cost.toFixed(4),
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* By day */}
          <div className="surface rounded-lg overflow-hidden">
            <div className="px-4 py-2 surface-2 section-h2">
              <T k="usage.byDay.title" />
            </div>
            {report.byDay.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-muted)] italic">
                <T k="usage.empty.day" />
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
                        {renderT(locale, "currency.usd", {
                          amount: d.cost.toFixed(4),
                        })}
                      </span>
                    </div>
                  );
                })}
                {report.byDay.length > 14 && (
                  <div className="text-xs text-[var(--text-muted)] italic pt-1">
                    <T
                      k="usage.showingLastN"
                      params={{ n: report.byDay.length }}
                    />
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
