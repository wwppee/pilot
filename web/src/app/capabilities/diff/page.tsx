/**
 * /capabilities/diff — compare two installed Capabilities.
 *
 * Server-side: loads the full capability list and (if `?a=&b=` are
 * provided) the diff result. Client-side `<CapabilityDiffClient>`
 * handles picker interactions by updating URL search params.
 *
 * URL: /capabilities/diff?a=<id>&b=<id>
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Capability, CapabilityDiff } from "@/lib/types";
import { CapabilityDiffClient } from "@/components/CapabilityDiffClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function CapabilityDiffPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aId = (sp.a ?? "").trim();
  const bId = (sp.b ?? "").trim();

  const list = await api.listCapabilities().catch(() => [] as Capability[]);

  let initialDiff: CapabilityDiff | null = null;
  if (aId && bId && aId !== bId) {
    try {
      initialDiff = await api.capabilityDiff(aId, bId);
    } catch {
      initialDiff = null;
    }
  }

  let locale: "en" | "zh" = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation */
  }
  const t = (k: string, params?: Record<string, string | number>): string =>
    renderT(locale, k, params);

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/capabilities">← back to capabilities</Link>
      </div>

      <header>
        <h1 className="hub-h1">{t("capdiff.h1")}</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {t("capdiff.subtitle")}
        </p>
      </header>

      <CapabilityDiffClient
        capabilities={list}
        initialDiff={initialDiff}
        t={t}
      />
    </div>
  );
}
