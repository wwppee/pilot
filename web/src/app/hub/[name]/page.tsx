/**
 * /hub/[name] — v2.0.8: pack detail page.
 *
 * Pre-v2.0.8, the Hub search results listed packs with no
 * detail link — clicking a row just toggled the install
 * button. v2.0.8 turns each row into a link to this page,
 * which shows the full pack metadata and a clearer
 * install / uninstall control.
 *
 * Reuses the same data source as `/packages/[name]` (the
 * legacy route) — both pages call `api.packInfo(name)`.
 * The legacy route is preserved for deep-link compatibility
 * (next.config.ts redirects /packages to /hub, but the
 * in-place page still renders for direct URL hits).
 */
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, ArrowLeft, ExternalLink, Terminal } from "lucide-react";
import { api } from "@/lib/pilot";
import { T } from "@/components/I18n";
import { PageHeader } from "@/components/PageHeader";
import { HubPackRow } from "@/components/HubPackRow";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Pack } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HubDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  // packInfo returns 404 if the pack isn't on the registry.
  // The Hub uses all lower-case npm names so we lowercase
  // before the lookup; the server is case-insensitive in
  // practice but a typo'd URL would otherwise bounce.
  const pack: Pack | null = await api
    .packInfo(decoded)
    .catch(() => null);
  if (!pack) notFound();

  const homepageHost = pack.homepage
    ? (() => {
        try {
          return new URL(pack.homepage).hostname;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="space-y-6 hub-page">
      <Link
        href="/hub"
        className="hub-link text-sm inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        {renderT(locale, "hub.detail.back")}
      </Link>

      <PageHeader
        icon={<Package size={20} strokeWidth={1.75} />}
        title={pack.name}
        subtitle={
          pack.description ?? renderT(locale, "hub.detail.noDescription")
        }
      />

      {/* Metadata card */}
      <div className="hub-detail-card">
        <div className="hub-detail-row">
          <span className="hub-detail-key">
            <T k="hub.detail.version" />
          </span>
          <span className="hub-detail-val hub-detail-mono">
            {pack.version}
          </span>
        </div>
        {pack.kind && (
          <div className="hub-detail-row">
            <span className="hub-detail-key">
              <T k="hub.detail.kind" />
            </span>
            <span className="hub-detail-val hub-detail-mono">{pack.kind}</span>
          </div>
        )}
        {homepageHost && (
          <div className="hub-detail-row">
            <span className="hub-detail-key">
              <T k="hub.detail.homepage" />
            </span>
            <a
              href={pack.homepage}
              target="_blank"
              rel="noreferrer noopener"
              className="hub-link inline-flex items-center gap-1"
            >
              {homepageHost}
              <ExternalLink size={12} strokeWidth={1.75} />
            </a>
          </div>
        )}
        <div className="hub-detail-row">
          <span className="hub-detail-key">
            <T k="hub.detail.source" />
          </span>
          <code className="hub-detail-mono hub-detail-code">
            {pack.source}
          </code>
        </div>
      </div>

      {/* Install / uninstall control — reuses the HubPackRow
          client component. We pass `query` undefined so the
          row reads as an installed row (Uninstall button).
          HubPackRow handles the optimistic update + reload. */}
      <div className="hub-detail-section">
        <h2 className="hub-detail-section-h2">
          <Terminal size={14} strokeWidth={1.75} />
          <T k="hub.detail.action" />
        </h2>
        <HubPackRow pack={pack} locale={locale} />
      </div>
    </div>
  );
}
