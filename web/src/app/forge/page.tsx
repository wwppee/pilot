/**
 * /forge — Web entrypoint for Capability absorption (v0.4.14+).
 *
 * Search → list of npm packages → click → /forge/[name] for inspect.
 *
 * Pre-existing CLI: `pilot forge search|inspect|absorb`. The Web
 * version reuses the same core helpers (core/forge.ts) through
 * `PilotService.forgeSearch` / `forgeInspect` — no shell-outs.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { EmptyState } from "@/components/EmptyState";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { Pack } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ForgePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  let results: Pack[] = [];
  if (q.length >= 2) {
    try {
      results = await api.forgeSearch(q);
    } catch {
      results = [];
    }
  }

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  const subtitle = renderT(locale, "forge.subtitle");
  const placeholder = renderT(locale, "forge.searchPlaceholder");
  const searchLabel = renderT(locale, "forge.searchLabel");
  const searchButton = renderT(locale, "forge.searchButton");
  const emptyText = renderT(locale, "forge.empty");
  const resultCountText = renderT(locale, "forge.resultCount", {
    n: results.length,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          {renderT(locale, "forge.h1")}
        </h1>
        <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>
      </header>

      <form
        method="get"
        action="/forge"
        className="surface rounded-lg p-4 flex items-end gap-2"
      >
        <label className="flex-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {searchLabel}
          </span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            minLength={2}
            placeholder={placeholder}
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded text-[var(--bg)]"
          style={{ background: "var(--accent)" }}
        >
          {searchButton}
        </button>
      </form>

      {q.length < 2 ? (
        <EmptyState
          title={renderT(locale, "forge.empty.unsearched")}
          hint={<>{renderT(locale, "forge.empty.hint")}</>}
        />
      ) : results.length === 0 ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] text-center">
          {emptyText}
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--text-muted)]">{resultCountText}</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((p) => (
              <li
                key={p.name}
                className="surface rounded-lg p-4 hover:bg-[var(--surface-2)]"
              >
                <Link
                  href={`/forge/${encodeURIComponent(p.name)}`}
                  className="block"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-mono font-semibold">{p.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      v{p.version}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  {p.kind && (
                    <span className="inline-block mt-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded surface-2 text-[var(--accent)]">
                      {p.kind}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
