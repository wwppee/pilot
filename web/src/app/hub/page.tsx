/**
 * /hub — v1.0.2: Capability Hub.
 *
 * Merges the four pre-Phase-1 surfaces:
 *   - /packages        (npm pack search + install)
 *   - /forge           (local capability exploration)
 *   - /capabilities    (absorbed capability library)
 *   - /tools           (tool inventory)
 *
 * v1.0.2 ships the search + installed-list halves. Detail pages
 * and the security-classification UI land in v1.0.2.1; the
 * /tools enable/disable switch lands in v1.0.4.
 *
 * Layout follows the v0.9-era page pattern (server-rendered
 * <header> + section grid), but the visual surface pulls from
 * the `pilot-webui-redesign` Dark Sci-Fi Tech tokens (cyan
 * primary, 4 state colors). See `globals.css :root` for the new
 * `--color-*` / `--state-*` family added in v1.0.2.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Capability, Pack, ToolInventoryItem } from "@/lib/types";
import { HubSearchBar } from "@/components/HubSearchBar";
import { HubPackRow } from "@/components/HubPackRow";
import { HubCapabilityRow } from "@/components/HubCapabilityRow";
import { HubToolRow } from "@/components/HubToolRow";

export const dynamic = "force-dynamic";

export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  // Negotiate locale for the subtitle.
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  const installedCount = renderT(locale, "hub.installedCount", {
    n: "?", // filled below
    s: "",
  });

  // Load four lists in parallel. Each is best-effort: if the
  // server is down / a particular endpoint 404s, that section
  // renders an empty state but the rest of the page still works.
  // v1.0.4: added listTools() for the Tools section.
  const [packsResult, capsResult, searchResult, toolsResult] =
    await Promise.allSettled([
      api.packs(),
      api.listCapabilities(),
      q ? api.packSearch(q) : Promise.resolve([] as Pack[]),
      api.listTools(),
    ]);

  const packs: Pack[] = packsResult.status === "fulfilled" ? packsResult.value : [];
  const caps: Capability[] =
    capsResult.status === "fulfilled" ? capsResult.value : [];
  const searchHits: Pack[] =
    searchResult.status === "fulfilled" ? searchResult.value : [];
  const tools: ToolInventoryItem[] =
    toolsResult.status === "fulfilled" ? toolsResult.value : [];

  const subtitle = q
    ? renderT(locale, "hub.subtitle.search", { q, n: searchHits.length })
    : renderT(locale, "hub.subtitle.idle");

  return (
    <div className="space-y-8 hub-page">
      <header>
        <h1 className="hub-h1">
          <T k="hub.h1" />
        </h1>
        <p className="hub-subtitle">{subtitle}</p>
      </header>

      {/* Search bar — form GET round-trip is the canonical
          "shareable URL" pattern; we don't use client-side
          state for v1.0.2. */}
      <HubSearchBar initialQuery={q} locale={locale} />

      {/* Search results (only when q is set) */}
      {q && (
        <section className="hub-section" aria-label="Search results">
          <h2 className="hub-section-h2">
            <T k="hub.section.searchResults" />
          </h2>
          {searchHits.length === 0 ? (
            <EmptyState
              title={renderT(locale, "hub.search.empty.title", { q })}
              hint={renderT(locale, "hub.search.empty.hint")}
            />
          ) : (
            <ul className="hub-list">
              {searchHits.map((p) => (
                <li key={p.name} className="hub-list-item">
                  <HubPackRow pack={p} locale={locale} query={q} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Installed packs (the npm-installed part of the merged surface) */}
      <section className="hub-section" aria-label="Installed packs">
        <h2 className="hub-section-h2">
          <T k="hub.section.installed" />
          <span className="hub-section-count">
            {renderT(locale, "hub.installedCount", {
              n: packs.length,
              s: packs.length === 1 ? "" : "s",
            })}
          </span>
        </h2>
        {packs.length === 0 ? (
          <EmptyState
            title={renderT(locale, "hub.installed.empty.title")}
            hint={renderT(locale, "hub.installed.empty.hint")}
          />
        ) : (
          <ul className="hub-list">
            {packs.map((p) => (
              <li key={p.name} className="hub-list-item">
                <HubPackRow pack={p} locale={locale} query={q} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Absorbed capabilities (the "explore + reuse" part) */}
      <section className="hub-section" aria-label="Capabilities">
        <h2 className="hub-section-h2">
          <T k="hub.section.capabilities" />
          <span className="hub-section-count">
            {renderT(locale, "hub.capCount", { n: caps.length })}
          </span>
        </h2>
        {caps.length === 0 ? (
          <EmptyState
            title={renderT(locale, "hub.capabilities.empty.title")}
            hint={
              <>
                <T k="hub.capabilities.empty.hint" />
                {" · "}
                <Link href="/forge" className="hub-link">
                  <T k="hub.capabilities.empty.hintForge" />
                </Link>
              </>
            }
          />
        ) : (
          <ul className="hub-list">
            {caps.map((c) => (
              <li key={c.id} className="hub-list-item">
                <HubCapabilityRow cap={c} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* v1.0.4: Tools section. Each tool is a single row
          with a toggle (built-ins can be disabled but not
          uninstalled; npm tools toggle both display and
          pi-runtime registration via the state override). */}
      <section className="hub-section" aria-label="Tools">
        <h2 className="hub-section-h2">
          <T k="hub.section.tools" />
          <span className="hub-section-count">
            {renderT(locale, "hub.toolsCount", { n: tools.length })}
          </span>
        </h2>
        {tools.length === 0 ? (
          <EmptyState
            title={renderT(locale, "hub.tools.empty.title")}
            hint={renderT(locale, "hub.tools.empty.hint")}
          />
        ) : (
          <ul className="hub-list">
            {tools.map((t) => (
              <li key={t.name} className="hub-list-item">
                <HubToolRow tool={t} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer: pointing at the not-yet-merged surfaces. Once
          v1.0.2.1 lands the security classification + v1.0.4
          the tool enable toggle, this footer can go away. */}
      <footer className="hub-footer">
        <p className="hub-footer-text">
          <T k="hub.footer.legacy" />
        </p>
        <ul className="hub-footer-list">
          <li>
            <Link href="/packages" className="hub-link">
              /packages
            </Link>
          </li>
          <li>
            <Link href="/forge" className="hub-link">
              /forge
            </Link>
          </li>
          <li>
            <Link href="/capabilities" className="hub-link">
              /capabilities
            </Link>
          </li>
          <li>
            <Link href="/tools" className="hub-link">
              /tools
            </Link>
          </li>
        </ul>
      </footer>

      {/* Avoid an unused-binding warning when nothing is searched
          and the subtitle copy above is the idle variant. */}
      <span className="hidden">{installedCount}</span>
    </div>
  );
}
