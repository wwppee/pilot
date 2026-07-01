/**
 * Dashboard — at-a-glance: today's stats + recent sessions + installed packs.
 *
 * Server Component. Reads three endpoints in parallel; renders empty
 * states for whatever is missing.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { Pack, SessionInfo, StatsReport } from '@/lib/types';

async function loadDashboard(): Promise<{
  stats: StatsReport | null;
  packs: Pack[] | null;
  sessions: SessionInfo[] | null;
  error: string | null;
}> {
  const [statsR, packsR, sessionsR] = await Promise.allSettled([
    api.stats({ kind: 'lastDays', days: 1 }),
    api.packs(),
    api.sessions(),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null;

  let error: string | null = null;
  const errs = [statsR, packsR, sessionsR].filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  if (errs.length > 0) {
    error = (errs[0]?.reason as Error)?.message ?? 'unknown error';
  }

  return {
    stats: unwrap(statsR),
    packs: unwrap(packsR),
    sessions: unwrap(sessionsR),
    error,
  };
}

export default async function DashboardPage() {
  const { stats, packs, sessions, error } = await loadDashboard();

  if (error) {
    return (
      <ErrorScreen
        title="Can't reach pilot server"
        message={`${error}\n\nIs \`pilot server start\` running? Run \`pilot dashboard\` to start it for you.`}
      />
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-[var(--text-muted)] text-sm">
          A live look at your local pi activity. Last 24 hours.
        </p>
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)] mb-3">
          Today
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Sessions"
            value={stats?.totalSessions ?? 0}
            accent="accent"
          />
          <StatCard
            label="Messages"
            value={stats?.totalMessages ?? 0}
            accent="accent"
          />
          <StatCard
            label="Tool calls"
            value={stats?.totalToolCalls ?? 0}
            accent="accent-2"
          />
        </div>
      </section>

      {stats && (stats.byModel.length > 0 || stats.byTool.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.byModel.length > 0 && (
            <div className="surface rounded-lg p-4">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
                By model
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
                Top tools
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
            Recent sessions
          </h2>
          <Link
            href="/sessions"
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            See all →
          </Link>
        </div>
        <div className="surface rounded-lg overflow-hidden">
          {sessions && sessions.length === 0 && <Empty msg="No sessions yet." />}
          {sessions && sessions.length > 0 && (
            <table className="w-full text-sm">
              <thead className="surface-2 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">CWD</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium text-right">Entries</th>
                  <th className="px-3 py-2 font-medium">Model</th>
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
                      {s.lastUsedAt ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.entries}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.model ? <code className="kbd">{s.model}</code> : '—'}
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
            Installed packs
          </h2>
          <Link
            href="/packages"
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Manage →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {packs && packs.length === 0 && <Empty msg="No packs installed." />}
          {packs && packs.slice(0, 6).map((p) => <PackCard key={p.name} pack={p} />)}
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
}: {
  label: string;
  value: number;
  accent: 'accent' | 'accent-2' | 'warn';
}) {
  return (
    <div className="surface rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className="text-3xl font-semibold mt-1 tabular-nums"
        style={{ color: `var(--${accent})` }}
      >
        {value.toLocaleString()}
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
              color: 'var(--accent)',
              border: '1px solid var(--border)',
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
        v{pack.version} · {!pack.enabled && 'disabled'}
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
      <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--error)' }}>
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
  return '…' + s.slice(-(n - 1));
}
