/**
 * /packages/[name] — single pack detail with install form.
 *
 * v0.4.12: Added Uninstall button so the Web UI isn't install-only.
 * Before this, the only path to remove a pack was the CLI (which
 * didn't have an uninstall subcommand either — that was added in
 * the same commit). Now CRUD is complete.
 *
 * v0.4.14: install/uninstall success banners now render with
 * `role="status"` + `aria-live="polite"` so screen readers announce
 * them, and use i18n keys instead of hardcoded English.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { installPackForm, uninstallPackForm } from "@/lib/actions";
import { UninstallButton } from "@/components/UninstallButton";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

interface PageProps {
  params: Promise<{ name: string }>;
  searchParams: Promise<{
    installed?: string;
    uninstalled?: string;
    error?: string;
  }>;
}

export default async function PackageDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(name);

  let pack: Awaited<ReturnType<typeof api.packInfo>> | null = null;
  let error: string | null = null;
  try {
    pack = await api.packInfo(decoded);
  } catch (e) {
    error = (e as Error).message;
  }

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/packages">← back to packages</Link>
      </div>

      {error && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {renderT(locale, "packages.fetchError", { error })}
        </div>
      )}

      {sp.installed && (
        <div
          className="surface rounded-lg p-3 text-sm flex items-center justify-between"
          style={{
            color: "var(--accent-2)",
            borderLeft: "3px solid var(--accent-2)",
          }}
          role="status"
          aria-live="polite"
        >
          <span>
            {renderT(locale, "packages.installedToast", { name: decoded })}
          </span>
          <Link
            href="/packages"
            className="text-xs underline hover:no-underline"
          >
            {renderT(locale, "packages.viewAll")} →
          </Link>
        </div>
      )}
      {sp.uninstalled && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{
            color: "var(--accent-2)",
            borderLeft: "3px solid var(--accent-2)",
          }}
          role="status"
          aria-live="polite"
        >
          {renderT(locale, "packages.uninstalledToast", { name: decoded })}
        </div>
      )}
      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{
            color: "var(--error)",
            borderLeft: "3px solid var(--error)",
          }}
          role="alert"
        >
          {renderT(locale, "packages.installError", { error: sp.error })}
        </div>
      )}

      {pack && (
        <>
          <header className="surface rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold">
                  <code className="kbd">{pack.name}</code>
                </h1>
                <div className="text-sm text-[var(--text-muted)] mt-1">
                  v{pack.version} · {pack.source}
                </div>
              </div>
              {pack.kind && (
                <span
                  className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{
                    color: "var(--accent)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {pack.kind}
                </span>
              )}
            </div>
            {pack.description && (
              <p className="text-sm mt-4 text-[var(--text-muted)]">
                {pack.description}
              </p>
            )}
          </header>

          <div className="surface rounded-lg p-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field
                label={renderT(locale, "packages.field.source")}
                value={pack.source}
              />
              <Field
                label={renderT(locale, "packages.field.enabled")}
                value={renderT(
                  locale,
                  pack.enabled ? "packages.field.yes" : "packages.field.no",
                )}
              />
              <Field
                label={renderT(locale, "packages.field.homepage")}
                value={
                  pack.homepage ? (
                    <a href={pack.homepage} className="text-xs break-all">
                      {pack.homepage}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          </div>

          <div className="surface rounded-lg p-4">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              {renderT(locale, "packages.install.h2")}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {renderT(
                locale,
                pack.enabled
                  ? "packages.install.alreadyInstalled"
                  : "packages.install.notInstalled",
              )}
            </p>
            <form
              action={installPackForm}
              className="flex items-center gap-2 mb-3"
            >
              <input type="hidden" name="name" value={pack.name} />
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded text-[var(--bg)]"
                style={{ background: "var(--accent-2)" }}
              >
                {renderT(
                  locale,
                  pack.enabled
                    ? "packages.install.update"
                    : "packages.install.install",
                  { name: pack.name },
                )}
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                {renderT(locale, "packages.install.underHood.before")}
                <code className="kbd">pilot pack install {pack.name}</code>
                {renderT(locale, "packages.install.underHood.after")}
              </span>
            </form>

            {/* v0.4.12: Uninstall — completes the CRUD loop. Only shown
                when the pack is installed; uninstalling a non-installed
                pack would be a no-op and confusing. */}
            {pack.enabled && (
              <form
                action={uninstallPackForm}
                className="flex items-center gap-2 pt-3 border-t border-[var(--border)]"
              >
                <input type="hidden" name="name" value={pack.name} />
                <UninstallButton name={pack.name} />
                <span className="text-xs text-[var(--text-muted)]">
                  {renderT(locale, "packages.install.underHood.before")}
                  <code className="kbd">pilot pack uninstall {pack.name}</code>
                  {renderT(locale, "packages.install.underHood.after")}
                </span>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  );
}
