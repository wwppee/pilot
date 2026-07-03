/**
 * Dashboard — at-a-glance: today's stats + recent sessions + installed packs.
 *
 * Server Component. Reads three endpoints in parallel; renders empty
 * states for whatever is missing.
 */
import Link from "next/link";
export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { AutoRefresh, LivePulse } from "@/components/AutoRefresh";
import { T } from "@/components/I18n";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Pack, SessionInfo, StatsReport, UsageReport } from "@/lib/types";

async function loadDashboard(): Promise<{
  stats: StatsReport | null;
  usage: UsageReport | null;
  packs: Pack[] | null;
  sessions: SessionInfo[] | null;
  error: string | null;
}> {
  const [statsR, usageR, packsR, sessionsR] = await Promise.allSettled([
    api.stats({ kind: "lastDays", days: 1 }),
    api.usage({ kind: "lastDays", days: 1 }),
    api.packs(),
    api.sessions(),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  let error: string | null = null;
  const errs = [statsR, usageR, packsR, sessionsR].filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (errs.length > 0) {
    error = (errs[0]?.reason as Error)?.message ?? "unknown error";
  }

  return {
    stats: unwrap(statsR),
    usage: unwrap(usageR),
    packs: unwrap(packsR),
    sessions: unwrap(sessionsR),
    error,
  };
}

export default async function DashboardPage() {
  const { stats, usage, packs, sessions, error } = await loadDashboard();

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  if (error) {
    return (
      <ErrorScreen
        title={renderT(locale, "home.error.title")}
        message={renderT(locale, "home.error.body") + "\n\n" + error}
      />
    );
  }

  return (
    <div className="space-y-10">
      <AutoRefresh intervalMs={10_000} />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            <T k="home.h1" />
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            <T k="home.subtitle" />
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <LivePulse live />
          <span>
            <T k="home.refreshHint" />
          </span>
        </div>
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)] mb-3">
          <T k="home.section.today" />
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            label={renderT(locale, "home.card.sessions")}
            value={stats?.totalSessions ?? 0}
            accent="accent"
          />
          <StatCard
            label={renderT(locale, "home.card.messages")}
            value={stats?.totalMessages ?? 0}
            accent="accent"
          />
          <StatCard
            label={renderT(locale, "home.card.toolCalls")}
            value={stats?.totalToolCalls ?? 0}
            accent="accent-2"
          />
          <StatCard
            label={renderT(locale, "home.card.tokens")}
            value={usage?.totalTokens ?? 0}
            accent="accent-2"
            isTokens
          />
          <StatCard
            label={renderT(locale, "home.card.cost")}
            value={usage ? Math.round(usage.totalCost * 10000) / 10000 : 0}
            accent="warn"
            isFloat
          />
        </div>
      </section>

      {stats && (stats.byModel.length > 0 || stats.byTool.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.byModel.length > 0 && (
            <div className="surface rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
                <T k="home.section.byModel" />
              </h3>
              <ul className="space-y-2">
                {stats.byModel.map((m) => (
                  <li key={m.model} className="flex justify-between text-sm">
                    <code className="kbd">{m.model}</code>
                    <span>{m.messages} msg</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.byTool.length > 0 && (
            <div className="surface rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
                <T k="home.section.topTools" />
              </h3>
              <ul className="space-y-2 text-sm">
                {stats.byTool.slice(0, 6).map((t) => (
                  <li key={t.tool} className="flex justify-between">
                    <code className="kbd">{t.tool}</code>
                    <span>{t.count} calls</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            <T k="home.section.recentSessions" />
          </h2>
          <Link
            href="/sessions"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <T k="home.link.seeAll" />
          </Link>
        </div>
        <div className="surface rounded-lg overflow-hidden">
          {sessions && sessions.length === 0 && (
            <Empty msg={renderT(locale, "home.empty.sessions")} />
          )}
          {sessions && sessions.length > 0 && (
            <table className="w-full text-sm">
              <thead className="surface-2 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.id" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.cwd" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.lastUsed" />
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    <T k="sessions.col.entries" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.model" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      <Link href={`/sessions/${s.id}`} className="kbd">
                        {s.id.slice(0, 16)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                      {shorten(s.cwd, 30)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {s.lastUsedAt ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.entries}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.model ? <code className="kbd">{s.model}</code> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            <T k="home.section.installedPacks" />
          </h2>
          <Link
            href="/packages"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <T k="home.link.manage" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {packs && packs.length === 0 && (
            <Empty msg={renderT(locale, "home.empty.packs")} />
          )}
          {packs &&
            packs.slice(0, 6).map((p) => <PackCard key={p.name} pack={p} />)}
        </div>
      </section>
    </div>
  );
}

// ─── Small components ───────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  isTokens,
  isFloat,
}: {
  label: string;
  value: number;
  accent: "accent" | "accent-2" | "warn";
  isTokens?: boolean;
  isFloat?: boolean;
}) {
  let display: string;
  if (isFloat) {
    display = `$${value.toFixed(4)}`;
  } else if (isTokens) {
    display = value.toLocaleString();
  } else {
    display = value.toLocaleString();
  }
  return (
    <div className="surface rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className="text-3xl font-semibold mt-1 tabular-nums"
        style={{ color: `var(--${accent})` }}
      >
        {display}
      </div>
    </div>
  );
}

function PackCard({ pack }: { pack: Pack }) {
  return (
    <Link
      href={`/packages/${pack.name}`}
      className="surface rounded-lg p-3 hover:bg-[var(--surface-2)] block"
    >
      <div className="flex items-start justify-between">
        <code className="kbd">{pack.name}</code>
        {pack.kind && (
          <span
            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
            style={{
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            {pack.kind}
          </span>
        )}
      </div>
      {pack.description && (
        <p className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2">
          {pack.description}
        </p>
      )}
      <div className="text-[10px] text-[var(--text-muted)] mt-2 font-mono">
        v{pack.version} · {!pack.enabled && "disabled"}
      </div>
    </Link>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="text-sm text-[var(--text-muted)] italic px-3 py-6 text-center">
      {msg}
    </div>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="surface rounded-lg p-6 my-12 max-w-xl mx-auto">
      <h2
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--error)" }}
      >
        {title}
      </h2>
      <pre className="text-sm text-[var(--text-muted)] whitespace-pre-wrap font-mono">
        {message}
      </pre>
    </div>
  );
}

function shorten(s: string, n: number): string {
  if (s.length <= n) return s;
  return "…" + s.slice(-(n - 1));
}
