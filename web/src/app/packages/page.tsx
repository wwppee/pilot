/**
 * /packages — list installed + search box.
 *
 * Read-only in v1 (no install button). Install still goes through
 * `pilot pack install` CLI until we wire POST + CSRF in the UI.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { Pack } from '@/lib/types';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PackagesPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const [installed, searchResults] = await Promise.allSettled([
    api.packs(),
    query.length >= 2
      ? api.packSearch(query)
      : Promise.resolve(null),
  ]);

  const installedList: Pack[] = installed.status === 'fulfilled' ? installed.value : [];
  const searchList = searchResults.status === 'fulfilled' ? searchResults.value : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">Package Center</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {installedList.length} installed · search npm without leaving the dashboard.
        </p>
      </header>

      <form className="flex gap-2" action="/packages" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="search npm… (e.g. pi-subagents)"
          className="flex-1 surface rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded text-[var(--bg)]"
          style={{ background: 'var(--accent)' }}
        >
          Search
        </button>
      </form>

      {searchList && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Search results for &ldquo;{query}&rdquo;
          </h2>
          <div className="surface rounded-lg overflow-hidden">
            {searchList.results.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] italic px-3 py-6 text-center">
                Nothing matches.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {searchList.results.map((r) => (
                  <li key={r.name} className="px-3 py-3">
                    <div className="flex items-baseline justify-between">
                      <Link href={`/packages/${r.name}`} className="kbd">
                        {r.name}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)] font-mono">
                        v{r.version}
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                        {r.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wide text-[var(--text-muted)] mb-3">
          Installed
        </h2>
        {installedList.length === 0 ? (
          <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
            No packs installed yet. Try <code className="kbd">pilot pack search subagent</code>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {installedList.map((p) => (
              <Link
                key={p.name}
                href={`/packages/${p.name}`}
                className="surface rounded-lg p-3 hover:bg-[var(--surface-2)] block"
              >
                <div className="flex items-start justify-between mb-1">
                  <code className="kbd">{p.name}</code>
                  {p.kind && (
                    <span
                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                      style={{
                        color: 'var(--accent)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {p.kind}
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-2">
                    {p.description}
                  </p>
                )}
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                  <span>v{p.version}</span>
                  <span>{p.enabled ? 'enabled' : 'disabled'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}