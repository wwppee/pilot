/**
 * /forge/[name] — Web inspect page (v0.4.14+).
 *
 * Shows the parsed `pi` manifest + the absorb form (optional id
 * override). On submit, `forgeAbsorbForm` server action posts to
 * `/forge/absorb` and redirects either to the new capability or
 * back here with `?error=…&code=…`.
 *
 * Pre-existing CLI: `pilot forge inspect <name>` shows the same data.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { ForgeInspectResult } from "@/lib/types";
import { forgeAbsorbForm } from "@/lib/actions";

interface PageProps {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ error?: string; code?: string }>;
}

export const dynamic = "force-dynamic";

function errorKeyFor(code: string | undefined): string {
  switch (code) {
    case "not-found":
      return "forge.inspect.errorNotFound";
    case "invalid-id":
      return "forge.inspect.errorInvalidId";
    case "schema-validation":
      return "forge.inspect.errorSchema";
    default:
      return "forge.inspect.error";
  }
}

export default async function ForgeInspectPage({
  params,
  searchParams,
}: PageProps) {
  const { name: rawName } = await params;
  const sp = await searchParams;
  const name = decodeURIComponent(rawName);

  let result: ForgeInspectResult | null = null;
  let fetchError: string | null = null;
  try {
    result = await api.forgeInspect(name);
  } catch (e) {
    fetchError = (e as Error).message;
  }

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  // Derived id (matches core/forge.deriveCapabilityId): strip scope + lowercase.
  const derivedId = name.replace(/^@[^/]+\//, "").toLowerCase();

  if (!result) {
    return (
      <div className="space-y-6">
        <div className="text-xs text-[var(--text-muted)]">
          <Link href="/forge">← back to forge</Link>
        </div>
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
          {renderT(locale, "forge.inspect.notFound")}
        </div>
        {fetchError && (
          <div className="surface rounded-lg p-3 text-xs text-[var(--error)]">
            {fetchError}
          </div>
        )}
      </div>
    );
  }

  const { pack, manifest } = result;
  const pi = manifest.pi;
  const absorbMode =
    pi?.extension !== undefined ? "L2-wrapped" : "L1-referenced";

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/forge">← back to forge</Link>
      </div>

      <header className="surface rounded-lg p-4">
        <h1 className="text-lg font-bold">
          <code className="kbd">{pack.name}</code>{" "}
          <span className="text-sm font-normal text-[var(--text-muted)]">
            v{pack.version}
          </span>
        </h1>
        {pack.description && (
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {pack.description}
          </p>
        )}
        <div className="text-xs text-[var(--text-muted)] mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={renderT(locale, "forge.inspect.version")} value={`v${pack.version}`} mono />
          {pi?.kind && (
            <Stat
              label={renderT(locale, "forge.inspect.kind")}
              value={pi.kind}
              mono
            />
          )}
          {pi?.extension && (
            <Stat
              label={renderT(locale, "forge.inspect.extension")}
              value={pi.extension}
              mono
            />
          )}
          <Stat
            label={renderT(locale, "forge.inspect.absorbMode")}
            value={absorbMode}
            mono
          />
        </div>
      </header>

      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {renderT(locale, errorKeyFor(sp.code), { error: sp.error })}
        </div>
      )}

      {!pi && (
        <div className="surface rounded-lg p-3 text-xs text-[var(--text-muted)] italic">
          {renderT(locale, "forge.noManifest")}
        </div>
      )}

      {pi && (
        <section className="surface rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Manifest (`pi` field)
          </h2>
          <ul className="space-y-1.5 text-xs">
            {pi.skills && pi.skills.length > 0 && (
              <PillRow label={renderT(locale, "forge.inspect.skills")} items={pi.skills} />
            )}
            {pi.themes && pi.themes.length > 0 && (
              <PillRow label={renderT(locale, "forge.inspect.themes")} items={pi.themes} />
            )}
            {pi.prompts && pi.prompts.length > 0 && (
              <PillRow label={renderT(locale, "forge.inspect.prompts")} items={pi.prompts} />
            )}
            {pi.commands && pi.commands.length > 0 && (
              <PillRow label={renderT(locale, "forge.inspect.commands")} items={pi.commands} />
            )}
            {pi.keybindings && pi.keybindings.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {renderT(locale, "forge.inspect.keybindings")}
                </span>
                <span className="ml-2 font-mono">{pi.keybindings.length}</span>
              </div>
            )}
          </ul>
        </section>
      )}

      <form
        action={forgeAbsorbForm}
        className="surface rounded-lg p-4 space-y-3"
      >
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {renderT(locale, "forge.inspect.absorbCta")}
        </h2>
        <input type="hidden" name="name" value={pack.name} />
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {renderT(locale, "forge.inspect.asIdLabel")}
          </span>
          <input
            name="asId"
            type="text"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={derivedId}
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
            aria-describedby="asId-hint"
          />
          <span id="asId-hint" className="block text-[10px] text-[var(--text-muted)] mt-1">
            {renderT(locale, "forge.inspect.asIdHint")}
          </span>
        </label>
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded text-[var(--bg)]"
          style={{ background: "var(--accent)" }}
        >
          {renderT(locale, "forge.inspect.absorbCta")}
        </button>
      </form>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-sm mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function PillRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>{" "}
      <span className="font-mono">
        {items.map((it, i) => (
          <span key={it}>
            <code className="kbd">{it}</code>
            {i < items.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </div>
  );
}