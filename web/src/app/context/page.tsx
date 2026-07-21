/**
 * /context — project context browser.
 *
 * v0.4.2: surfaces the same files pi auto-loads (AGENTS.md / CLAUDE.md
 * in cwd + ancestors + ~/.pi/agent/) plus informational-only files
 * (README.md, .cursor/rules, CONTRIBUTING.md). The "loaded" badge
 * tells the user which files actually go into pi's prompt.
 *
 * v0.5.12: added a "discovery rules" panel so the user understands
 * the *why* behind the file list — search priority, search path,
 * and which files actually go into pi's prompt vs. which are
 * Pilot-only. Previously users only saw results, not the rules.
 *
 * `?cwd=...` lets the user inspect context for any directory.
 */

import { headers } from "next/headers";
import Link from "next/link";
import { api } from "@/lib/pilot";
export const dynamic = "force-dynamic";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { RichT } from "@/components/RichT";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";
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
        <p className="subtitle">{subtitle}</p>
      </header>

      <div className="mb-2">
        <Hint summary={<T k="context.hint.summary" />}>
          <RichT
            locale={locale}
            k="context.hint.body"
            values={{
              s1: <strong>loaded</strong>,
              s2: <strong>info</strong>,
              em1: <em>not</em>,
              context: (
                <GlossaryTerm term="context" locale={locale}>
                  context
                </GlossaryTerm>
              ),
            }}
          />
        </Hint>
      </div>

      {/* v0.5.12: discovery rules — explains how the file list above was
          built so users can debug "why isn't my AGENTS.md showing up".
          Lives between the header and the file lists so it's the
          first reference when a user opens the page. */}
      <DiscoveryRules />

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {renderT(locale, "context.error.title", { error })}
        </div>
      ) : refs.length === 0 ? (
        <EmptyState
          title={renderT(locale, "context.empty")}
          hint={
            <RichT
              locale={locale}
              k="context.empty.hint"
              values={{
                file1: <code className="kbd">AGENTS.md</code>,
                file2: <code className="kbd">CLAUDE.md</code>,
              }}
            />
          }
        />
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
              cwd={cwd}
            />
          )}
          {info.length > 0 && (
            <ContextSection
              title={renderT(locale, "context.section.info.title")}
              subtitle={renderT(locale, "context.section.info.subtitle")}
              refs={info}
              loadedTitle={loadedTitle}
              infoTitle={infoTitle}
              cwd={cwd}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Discovery rules panel — the "why is this file showing up" explainer.
 *
 * Lays out two short rules (filename priority + search path) and one
 * clarification about what counts as "informational only". Compact
 * enough that it doesn't push the file list off the fold on the
 * 14" MacBook viewport.
 */
function DiscoveryRules() {
  return (
    <details className="surface rounded-lg overflow-hidden group">
      <summary className="px-4 py-2 cursor-pointer select-none surface-2 hover:bg-[var(--surface)] flex items-baseline gap-3">
        <span className="text-[var(--text-muted)] text-xs">▸</span>
        <span className="section-h2 !mb-0 !text-[var(--text)] !normal-case !tracking-normal !text-sm flex-1">
          <T k="context.discovery.h2" />
        </span>
        {/* v1.1.1: link to the rules editor. Sits inside the
            <summary> so the click target is the whole row
            (not just the link) — clicking the link still
            toggles the panel, which is mildly surprising
            but standard <details> behaviour. The link's
            own click also navigates, so the experience is
            "click edit → navigate" or "click anywhere else
            → toggle the panel". */}
        <Link
          href="/context/edit-rules"
          className="hub-link text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <T k="context.discovery.edit" />
        </Link>
      </summary>
      <div className="px-4 py-3 text-xs text-[var(--text-muted)] space-y-3">
        <div>
          <div className="font-medium text-[var(--text)] mb-1">
            <T k="context.discovery.filenames" />
          </div>
          <p className="leading-relaxed">
            <T k="context.discovery.filenamesHint" />
          </p>
          <code className="kbd mt-1 inline-block">
            AGENTS.md &gt; AGENTS.MD &gt; CLAUDE.md &gt; CLAUDE.MD
          </code>
        </div>
        <div>
          <div className="font-medium text-[var(--text)] mb-1">
            <T k="context.discovery.paths" />
          </div>
          <p className="leading-relaxed">
            <T k="context.discovery.pathsHint" />
          </p>
          <code className="kbd mt-1 inline-block">
            ~/.pi/agent/ → cwd → .../parent → .../grandparent → ...
          </code>
        </div>
        <p className="leading-relaxed italic border-t border-[var(--border)] pt-3">
          <T k="context.discovery.info" />
        </p>
      </div>
    </details>
  );
}

function ContextSection({
  title,
  subtitle,
  refs,
  loaded,
  loadedTitle,
  infoTitle,
  cwd,
}: {
  title: string;
  subtitle: string;
  refs: ProjectContextRef[];
  loaded?: boolean;
  loadedTitle: string;
  infoTitle: string;
  cwd: string;
}) {
  return (
    <div className="surface rounded-lg overflow-hidden">
      <div className="px-4 py-2 surface-2 section-h2 flex items-baseline gap-3">
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
                {/* v1.0.3: every discovered file is now editable
                    in-browser. Loaded files get the full editor
                    (read+write); informational files open a
                    read-only preview. Click target uses the
                    "edit" link in the row's action column rather
                    than wrapping the whole <li> — keeps hover
                    styling on the row and makes the click target
                    explicit for keyboard users. */}
                <Link
                  href={`/context/edit?path=${encodeURIComponent(r.path)}&cwd=${encodeURIComponent(cwd)}`}
                  className="hub-link"
                >
                  <T k="context.row.edit" />
                </Link>
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
