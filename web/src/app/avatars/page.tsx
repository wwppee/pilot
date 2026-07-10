/**
 * /avatars — list captured Avatars + capture form.
 *
 * v0.5.0: each Avatar is one project's "expected config". The page
 * shows them in a grid; click "view diff" to compare against current
 * state.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { Avatar } from "@/lib/types";
import { captureAvatarForm, deleteAvatarForm } from "@/lib/actions";
import { DeleteButton } from "@/components/Buttons";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";

interface PageProps {
  searchParams: Promise<{
    captured?: string;
    deleted?: string;
    error?: string;
    cwd?: string;
  }>;
}

export const dynamic = "force-dynamic";

function decodeCwd(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return `<encoded:${encoded.slice(0, 12)}…>`;
  }
}

export default async function AvatarsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const avatars = await api.avatars().catch(() => [] as Avatar[]);

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  const subtitle = renderT(locale, "avatars.subtitle");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          {renderT(locale, "avatars.h1")}
        </h1>
        <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>
      </header>

      <div className="mb-2">
        <Hint summary="What is an avatar?">
          An <GlossaryTerm term="avatar">avatar</GlossaryTerm> is a snapshot of
          "what this project is supposed to look like" — which profile, model,
          packages, and extensions should be active. Capture one for each
          project so you can see at a glance when something has drifted. The
          diff page highlights the difference between the avatar and the current
          state. Don't confuse avatars with{" "}
          <GlossaryTerm term="profile">profiles</GlossaryTerm>: a profile is
          something you actively switch between; an avatar is a baseline you
          compare against.
        </Hint>
      </div>

      {sp.captured && sp.cwd && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{
            color: "var(--accent-2)",
            borderLeft: "3px solid var(--accent-2)",
          }}
          role="status"
          aria-live="polite"
        >
          {renderT(locale, "avatars.capturedToast", { cwd: sp.cwd })}
        </div>
      )}
      {sp.deleted && sp.cwd && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{
            color: "var(--accent-2)",
            borderLeft: "3px solid var(--accent-2)",
          }}
          role="status"
          aria-live="polite"
        >
          {renderT(locale, "avatars.deletedToast", { cwd: sp.cwd })}
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
          {sp.error}
        </div>
      )}

      <form
        action={captureAvatarForm}
        className="surface rounded-lg p-4 flex items-end gap-2"
      >
        <label className="flex-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {renderT(locale, "avatars.cwdLabel")}
          </span>
          <input
            name="cwd"
            type="text"
            required
            pattern="[A-Za-z0-9_=\-]+"
            placeholder={renderT(locale, "avatars.cwdPlaceholder")}
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button type="submit" className="btn">
          {renderT(locale, "avatars.captureCta")}
        </button>
      </form>

      {avatars.length === 0 ? (
        <EmptyState
          title={renderT(locale, "avatars.empty")}
          hint={<>{renderT(locale, "avatars.empty.hint")}</>}
          actionHref="/avatars"
          actionLabel={renderT(locale, "avatars.captureFirst")}
        />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {avatars.map((a) => (
            <li key={a.encodedCwd} className="surface rounded-lg p-4 relative">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-mono font-semibold text-sm break-all">
                  {a.encodedCwd}
                </h3>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(a.capturedAt).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] italic mb-2">
                {decodeCwd(a.encodedCwd)}
              </p>
              <dl className="text-xs space-y-0.5 text-[var(--text-muted)]">
                {a.profile && (
                  <div>
                    <span className="uppercase text-[10px] tracking-wide">
                      {renderT(locale, "avatars.profile")}:{" "}
                    </span>
                    <code className="kbd">{a.profile}</code>
                  </div>
                )}
                {a.model && (
                  <div>
                    <span className="uppercase text-[10px] tracking-wide">
                      {renderT(locale, "avatars.model")}:{" "}
                    </span>
                    <code className="kbd">{a.model}</code>
                  </div>
                )}
                {a.packSources.length > 0 && (
                  <div>
                    {a.packSources.length}{" "}
                    {renderT(locale, "avatars.packSources")}
                  </div>
                )}
                {a.extensions.length > 0 && (
                  <div>
                    {a.extensions.length}{" "}
                    {renderT(locale, "avatars.extensions")}
                  </div>
                )}
              </dl>
              <div className="flex items-center gap-2 mt-3">
                <Link
                  href={`/avatars/${encodeURIComponent(a.encodedCwd)}`}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {renderT(locale, "avatars.diffLink")} →
                </Link>
                <DeleteButton
                  name={a.encodedCwd}
                  label={renderT(locale, "avatars.delete")}
                  action={deleteAvatarForm}
                  confirmMessage={renderT(locale, "avatars.confirmDelete", {
                    cwd: a.encodedCwd,
                  })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
