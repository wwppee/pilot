/**
 * /insight — v1.1.0: real Insight page (replaces the placeholder).
 *
 * v1.0.1 created /insight as a placeholder; v1.0.2 replaced the
 * `Dashboard` redirect target with this route. v1.1.0 fills in
 * the actual content: a 4-card "today" header, a top-models
 * breakdown, a top-tools breakdown, and a recent-sessions
 * table — all sourced from the existing `/stats`, `/usage`,
 * and `/sessions` endpoints.
 *
 * Visual: same Dark Sci-Fi Tech tokens as /hub and /context/edit
 * (cyan primary, 4 state colors, glow on focus). The
 * `pilot-webui-redesign` dashboard.html was the design
 * reference for the stat-card / list-row / table layout.
 *
 * Future v1.x work moves some of this to:
 *   - v1.1.1: by-day / by-week / by-month range switch
 *   - v1.2.0: alert rules + cost cap ("pause if > $1 / day")
 *   - v1.3.0: per-session drill-down (calls `/sessions/:id/tree`
 *     for the SessionTreeExplorer)
 */
import { headers } from "next/headers";
import { Satellite } from "lucide-react";
import { api } from "@/lib/pilot";
import { T } from "@/components/I18n";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { SessionInfo, StatsReport, UsageReport } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface TodayShape {
  sessions: number;
  messages: number;
  tokens: number;
  costUsd: number;
  topModels: Array<{ name: string; count: number }>;
  topTools: Array<{ name: string; count: number }>;
}

function shapeToday(
  stats: StatsReport | null,
  usage: UsageReport | null,
  sessions: SessionInfo[],
): TodayShape {
  // StatsReport shape depends on the server; the most common
  // fields across the v0.5 → v0.9 server are `models: { name: count }`,
  // `tools: { name: count }`, `messages: number`, `tokens: number`.
  // We tolerate missing fields by falling back to 0.
  const s = (stats ?? {}) as unknown as {
    messages?: number;
    tokens?: number;
    models?: Record<string, number> | Array<{ name: string; count: number }>;
    tools?: Record<string, number> | Array<{ name: string; count: number }>;
  };
  const u = (usage ?? {}) as unknown as {
    totalCostUsd?: number;
    costUsd?: number;
  };

  function top(
    v: Record<string, number> | Array<{ name: string; count: number }> | undefined,
  ): Array<{ name: string; count: number }> {
    if (!v) return [];
    const arr = Array.isArray(v)
      ? v
      : Object.entries(v).map(([name, count]) => ({ name, count }));
    return arr.sort((a, b) => b.count - a.count).slice(0, 5);
  }

  return {
    sessions: sessions.length,
    messages: s.messages ?? 0,
    tokens: s.tokens ?? 0,
    costUsd: u.totalCostUsd ?? u.costUsd ?? 0,
    topModels: top(s.models),
    topTools: top(s.tools),
  };
}

export default async function InsightPage() {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  // Load 3 endpoints in parallel. Each is best-effort: if the
  // server is down or an endpoint 404s, that section falls
  // back to a placeholder zero rather than blocking the
  // whole page.
  const [statsResult, usageResult, sessionsResult] =
    await Promise.allSettled([
      api.stats({ kind: "today" } as never).catch(() => null),
      api.usage({ kind: "today" } as never).catch(() => null),
      api.sessions().catch(() => [] as SessionInfo[]),
    ]);

  const stats: StatsReport | null =
    statsResult.status === "fulfilled" ? statsResult.value : null;
  const usage: UsageReport | null =
    usageResult.status === "fulfilled" ? usageResult.value : null;
  const sessions: SessionInfo[] =
    sessionsResult.status === "fulfilled" ? sessionsResult.value : [];

  const today = shapeToday(stats, usage, sessions);

  // Header: today's totals.
  const stats2 = [
    {
      key: "sessions",
      label: renderT(locale, "insight.stat.sessions"),
      value: today.sessions.toLocaleString(),
    },
    {
      key: "messages",
      label: renderT(locale, "insight.stat.messages"),
      value: today.messages.toLocaleString(),
    },
    {
      key: "tokens",
      label: renderT(locale, "insight.stat.tokens"),
      value: formatTokens(today.tokens),
    },
    {
      key: "cost",
      label: renderT(locale, "insight.stat.cost"),
      value: `$${today.costUsd.toFixed(4)}`,
    },
  ];

  return (
    <div className="space-y-8 insight-page">
      <PageHeader
        icon={<Satellite size={20} strokeWidth={1.75} />}
        title={<T k="insight.h1" />}
        subtitle={<T k="insight.subtitle" />}
      />

      {/* Today — 4 stat cards in a grid */}
      <section className="insight-stats" aria-label="Today">
        {stats2.map((s) => (
          <div key={s.key} className="insight-stat-card">
            <div className="insight-stat-value">{s.value}</div>
            <div className="insight-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Two-column: by-model / by-tool */}
      <section className="insight-two-col" aria-label="By model / by tool">
        <div className="insight-col-card">
          <h2 className="insight-col-title">
            <span className="hub-pill hub-pill--info">
              <T k="insight.section.byModel" />
            </span>
          </h2>
          {today.topModels.length === 0 ? (
            <p className="insight-col-empty">
              <T k="insight.empty.models" />
            </p>
          ) : (
            <ul className="insight-bar-list">
              {today.topModels.map((m) => (
                <li key={m.name} className="insight-bar-row">
                  <span className="insight-bar-name">{m.name}</span>
                  <div className="insight-bar-wrap">
                    <div
                      className="insight-bar insight-bar--primary"
                      style={{
                        width: `${(m.count / today.topModels[0]!.count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="insight-bar-count">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insight-col-card">
          <h2 className="insight-col-title">
            <span className="hub-pill hub-pill--info">
              <T k="insight.section.byTool" />
            </span>
          </h2>
          {today.topTools.length === 0 ? (
            <p className="insight-col-empty">
              <T k="insight.empty.tools" />
            </p>
          ) : (
            <ul className="insight-bar-list">
              {today.topTools.map((t) => (
                <li key={t.name} className="insight-bar-row">
                  <span className="insight-bar-name">{t.name}</span>
                  <div className="insight-bar-wrap">
                    <div
                      className="insight-bar insight-bar--success"
                      style={{
                        width: `${(t.count / today.topTools[0]!.count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="insight-bar-count">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recent sessions table */}
      <section aria-label="Recent sessions">
        <h2 className="insight-section-h2">
          <T k="insight.section.recent" />
        </h2>
        {sessions.length === 0 ? (
          <p className="insight-col-empty">
            <T k="insight.empty.sessions" />
          </p>
        ) : (
          <div className="insight-table-wrap">
            <table className="insight-table">
              <thead>
                <tr>
                  <th>
                    <T k="insight.col.id" />
                  </th>
                  <th>
                    <T k="insight.col.cwd" />
                  </th>
                  <th>
                    <T k="insight.col.lastUsed" />
                  </th>
                  <th>
                    <T k="insight.col.entries" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((s) => (
                  <tr key={s.id}>
                    <td className="insight-table-id">
                      <Link
                        href={`/sessions/${encodeURIComponent(s.id)}`}
                        className="hub-link"
                      >
                        {s.id.slice(0, 12)}
                      </Link>
                    </td>
                    <td className="insight-table-mono">{s.cwd ?? "—"}</td>
                    <td>
                      {s.lastUsedAt
                        ? new Date(s.lastUsedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="insight-table-num">
                      {s.entries ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="hub-footer">
        <p className="hub-footer-text">
          <T k="insight.footer.legacy" />
        </p>
        <ul className="hub-footer-list">
          <li>
            <Link href="/observability" className="hub-link">
              /observability
            </Link>
          </li>
          <li>
            <Link href="/usage" className="hub-link">
              /usage
            </Link>
          </li>
        </ul>
      </footer>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
