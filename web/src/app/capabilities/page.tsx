/**
 * /capabilities — list installed Capabilities (read-only).
 */
import Link from "next/link";
export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { AutoRefresh, LivePulse } from "@/components/AutoRefresh";
import { T } from "@/components/I18n";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Capability } from "@/lib/types";

export default async function CapabilitiesPage() {
  const list = await api.listCapabilities().catch(() => [] as Capability[]);

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={15_000} />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            <T k="capabilities.h1" />
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            <T
              k="capabilities.subtitle"
              params={{ n: list.length }}
            />
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <LivePulse live />
          <span>
            <T k="capabilities.refreshHint" />
          </span>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          <T k="capabilities.empty" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/capabilities/${c.id}`}
              className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
            >
              <div className="flex items-start justify-between gap-2">
                <code className="kbd">{c.id}</code>
                {c.type && (
                  <span
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: "var(--accent)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {c.type}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold mt-2">{c.title}</h3>
              {c.description && (
                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                  {c.description}
                </p>
              )}
              <div className="flex gap-4 mt-3 text-[10px] text-[var(--text-muted)] font-mono">
                <span>
                  {renderT(locale, "capabilities.sources", {
                    n: c.sources.length,
                  })}
                </span>
                {c.compatibility.requires.length > 0 && (
                  <span>
                    {renderT(locale, "capabilities.requires", {
                      n: c.compatibility.requires.length,
                    })}
                  </span>
                )}
                {c.compatibility.conflicts.length > 0 && (
                  <span style={{ color: "var(--warn)" }}>
                    {renderT(locale, "capabilities.conflicts", {
                      n: c.compatibility.conflicts.length,
                    })}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}