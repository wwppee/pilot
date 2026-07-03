/**
 * /context — project context browser.
 *
 * v0.4.2: surfaces the same files pi auto-loads (AGENTS.md / CLAUDE.md
 * in cwd + ancestors + ~/.pi/agent/) plus informational-only files
 * (README.md, .cursor/rules, CONTRIBUTING.md). The "loaded" badge
 * tells the user which files actually go into pi's prompt.
 *
 * `?cwd=...` lets the user inspect context for any directory.
 */

import { headers } from "next/headers";
import { api } from "@/lib/pilot";
export const dynamic = "force-dynamic";
import { T } from "@/components/I18n";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { ProjectContextRef } from "@/lib/types";

export default async function ContextPage({
  searchParams,
}: {
  searchParams: Promise<{ cwd?: string }>;
}) {
  const sp = await searchParams;
  const cwd = sp.cwd ?? process.cwd();

  let refs: ProjectContextRef[] = [];
  let error: string | null = null;
  try {
    refs = await api.context(cwd);
  } catch (e) {
    error = (e as Error).message;
  }

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  const subtitle = renderT(locale, "context.subtitle", { cwd });
  const loadedTitle = renderT(locale, "context.loadedTitle");
  const infoTitle = renderT(locale, "context.infoTitle");

  const loaded = refs.filter((r) => r.loaded);
  const info = refs.filter((r) => !r.loaded);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="context.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>
      </header>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)]">
          Couldn&apos;t load context: {error}
        </div>
      ) : refs.length === 0 ? (
        <div className="surface rounded-lg p-8 text-sm text-[var(--text-muted)] italic text-center">
          <T k="context.empty" />
        </div>
      ) : (
        <>
          {loaded.length > 0 && (
            <ContextSection
              title={renderT(locale, "context.section.loaded.title")}
              subtitle={renderT(locale, "context.section.loaded.subtitle")}
              refs={loaded}
              loaded
              loadedTitle={loadedTitle}
              infoTitle={infoTitle}
            />
          )}
          {info.length > 0 && (
            <ContextSection
              title={renderT(locale, "context.section.info.title")}
              subtitle={renderT(locale, "context.section.info.subtitle")}
              refs={info}
              loadedTitle={loadedTitle}
              infoTitle={infoTitle}
            />
          )}
        </>
      )}
    </div>
  );
}

function ContextSection({
  title,
  subtitle,
  refs,
  loaded,
  loadedTitle,
  infoTitle,
}: {
  title: string;
  subtitle: string;
  refs: ProjectContextRef[];
  loaded?: boolean;
  loadedTitle: string;
  infoTitle: string;
}) {
  return (
    <div className="surface rounded-lg overflow-hidden">
      <div className="px-4 py-2 surface-2 text-xs uppercase tracking-wide text-[var(--text-muted)] flex items-baseline gap-3">
        <span className="font-medium text-[var(--text)]">{title}</span>
        <span>{subtitle}</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {refs.map((r) => (
          <li key={r.path} className="px-4 py-3 hover:bg-[var(--surface-2)]">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                {loaded ? (
                  <span
                    className="text-[var(--accent-2)] flex-shrink-0"
                    title={loadedTitle}
                    aria-label={loadedTitle}
                  >
                    ●
                  </span>
                ) : (
                  <span
                    className="text-[var(--text-muted)] flex-shrink-0"
                    title={infoTitle}
                    aria-label={infoTitle}
                  >
                    ○
                  </span>
                )}
                <code className="kbd flex-shrink-0">{r.filename}</code>
                <span className="text-xs text-[var(--text-muted)] font-mono truncate">
                  {r.location}
                </span>
              </div>
              <div className="flex items-baseline gap-3 text-xs text-[var(--text-muted)] flex-shrink-0">
                <span className="tabular-nums">{formatBytes(r.bytes)}</span>
                <span>{new Date(r.mtime).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="mt-1.5 ml-5 text-xs text-[var(--text-muted)] line-clamp-2">
              {r.preview}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
