/**
 * /packages — list installed + search box.
 *
 * Read-only in v1 (no install button). Install still goes through
 * `pilot pack install` CLI until we wire POST + CSRF in the UI.
 */
import Link from "next/link";
export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import type { Pack } from "@/lib/types";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { RichT } from "@/components/RichT";
import { negotiateLocale, renderT } from "@/lib/i18n";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PackagesPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // Server-side locale (matches what layout.tsx computed) so we can
  // pre-render attribute strings like `placeholder`. The <T> children
  // are server-rendered with the same locale by React.
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  const searchPlaceholder = renderT(locale, "packages.searchPlaceholder");

  const [installed, searchResults] = await Promise.allSettled([
    api.packs(),
    query.length >= 2 ? api.packSearch(query) : Promise.resolve(null),
  ]);

  const installedList: Pack[] =
    installed.status === "fulfilled" ? installed.value : [];
  const searchList: Pack[] | null =
    searchResults.status === "fulfilled" ? searchResults.value : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="packages.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          <T k="packages.subtitle" params={{ n: installedList.length }} />
        </p>
      </header>

      <form className="flex gap-2" action="/packages" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder={searchPlaceholder}
          aria-label={renderT(locale, "btn.ariaSearch")}
          className="flex-1 surface rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        <button type="submit" className="btn">
          <T k="btn.search" />
        </button>
      </form>

      {searchList && (
        <section>
          <h2 className="section-h2 mb-3">
            <T k="packages.searchResultsFor" params={{ q: query }} />
          </h2>
          <div className="surface rounded-lg overflow-hidden">
            {searchList.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] italic p-4 text-center">
                <T k="packages.nothingMatches" />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {searchList.map((r) => (
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
        <h2 className="section-h2 mb-3">
          <T k="packages.installed" />
        </h2>
        {installedList.length === 0 ? (
          <EmptyState
            title={renderT(locale, "packages.noPacksHint")}
            hint={
              <RichT
                locale={locale}
                k="packages.installed.emptyHint"
                values={{
                  cmd: <code className="kbd">pilot pack search subagent</code>,
                }}
              />
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {installedList.map((p) => (
              <Link
                key={p.name}
                href={`/packages/${p.name}`}
                className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
              >
                <div className="flex items-start justify-between mb-1">
                  <code className="kbd">{p.name}</code>
                  {p.kind && (
                    <span
                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                      style={{
                        color: "var(--accent)",
                        border: "1px solid var(--border)",
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
                  <span className={p.enabled ? "" : "text-[var(--warn)]"}>
                    {p.enabled
                      ? renderT(locale, "packages.installed")
                      : renderT(locale, "status.disabled")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
