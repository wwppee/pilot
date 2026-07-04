/**
 * /profiles — list all named profiles + create form + active state.
 *
 * v0.4.12: each profile card now shows whether it's the active one
 * and exposes an "Activate" button. The active profile is loaded
 * server-side and passed into the card via the client island
 * <ActivateProfileButton>.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { createProfileForm, deleteProfileForm } from "@/lib/actions";
import { DeleteButton } from "@/components/Buttons";
import { T } from "@/components/I18n";
import { ActivateProfileButton } from "@/components/ActivateProfileButton";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Profile, ActiveProfile, SessionTemplate } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProfilesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // v0.4.13: when `?from=<sessionId>` is set, fetch the session
  // template and use it to pre-fill the form (model) + show a
  // banner with detected tools. Tools are informational only — see
  // createProfileForm in actions.ts for why.
  const templatePromise: Promise<SessionTemplate | null> = sp.from
    ? api.sessionTemplate(sp.from).catch(() => null)
    : Promise.resolve(null);

  // Load profiles + active + template in parallel — independent.
  const [profilesResult, active, template] = await Promise.all([
    api.profiles().catch(() => null as Profile[] | null),
    api.activeProfile().catch(() => null as ActiveProfile | null),
    templatePromise,
  ]);
  const profiles = (profilesResult ?? []) as Profile[];

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const subtitle = renderT(locale, "profiles.subtitle", {
    n: profiles.length,
    s: profiles.length === 1 ? "" : "s",
  });
  const newNameLabel = renderT(locale, "profiles.newNameLabel");
  const newNamePlaceholder = renderT(locale, "profiles.newNamePlaceholder");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="profiles.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>
      </header>

      {/* Active profile banner — visible only when one is active.
          Shows at the top so users always know which profile is in effect. */}
      {active && (
        <div
          className="surface rounded-lg p-3 flex items-center justify-between"
          style={{
            borderLeft: "4px solid var(--accent-2)",
          }}
          role="status"
          aria-live="polite"
        >
          <div className="text-sm">
            <span className="text-[var(--text-muted)]">
              <T k="profiles.active" />:
            </span>{" "}
            <code className="kbd font-semibold">{active.name}</code>{" "}
            <span className="text-xs text-[var(--text-muted)]">
              ({active.source}, {new Date(active.activatedAt).toLocaleString()})
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              <T k="profiles.activeHint" />
            </p>
          </div>
        </div>
      )}

      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
        >
          {sp.error}
        </div>
      )}

      <form
        action={createProfileForm}
        className="surface rounded-lg p-4 space-y-3"
      >
        {sp.from && template && (
          <div
            className="rounded p-3 text-xs"
            style={{
              background: "var(--surface-2)",
              borderLeft: "3px solid var(--accent)",
            }}
            role="status"
            aria-live="polite"
          >
            <div className="font-semibold mb-1">
              <T k="profiles.fromSession.banner" params={{
                sessionId: template.sessionId,
                nTool: template.tools.length,
                s: template.tools.length === 1 ? "" : "s",
              }} />
            </div>
            {template.model && (
              <div className="text-[var(--text-muted)] mt-1">
                <span className="uppercase text-[10px] tracking-wide">
                  <T k="profiles.fromSession.modelLabel" />:{" "}
                </span>
                <code className="kbd">{template.model}</code>
              </div>
            )}
            <div className="text-[var(--text-muted)] mt-1">
              <span className="uppercase text-[10px] tracking-wide">
                <T k="profiles.fromSession.toolsLabel" />:
              </span>{" "}
              {template.tools.length === 0 ? (
                <span className="italic">
                  <T k="profiles.fromSession.noTools" />
                </span>
              ) : (
                <span className="font-mono">
                  {template.tools.join(", ")}
                </span>
              )}
            </div>
          </div>
        )}
        {sp.from && !template && (
          <div
            className="rounded p-3 text-xs italic"
            style={{ background: "var(--surface-2)" }}
            role="status"
          >
            <T k="profiles.fromSession.notFound" />
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {newNameLabel}
            </span>
            <input
              name="name"
              type="text"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder={newNamePlaceholder}
              required
              className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          {/* Hidden inputs from session template pre-fill. */}
          {template?.model && (
            <input type="hidden" name="model" value={template.model} />
          )}
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded text-[var(--bg)]"
            style={{ background: "var(--accent)" }}
          >
            <T k="btn.create" />
          </button>
        </div>
      </form>

      {profiles.length === 0 ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          <T k="profiles.empty" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <div
              key={p.name}
              className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block relative"
              style={
                active?.name === p.name
                  ? { borderLeft: "4px solid var(--accent-2)" }
                  : undefined
              }
            >
              <Link href={`/profiles/${p.name}`} className="block pr-24">
                <h3 className="text-base font-semibold mb-2">{p.name}</h3>
                <div className="space-y-1 text-xs text-[var(--text-muted)]">
                  {p.model && (
                    <div>
                      model: <code className="kbd">{p.model}</code>
                    </div>
                  )}
                  {p.thinking && <div>thinking: {p.thinking}</div>}
                  {p.packages && p.packages.length > 0 && (
                    <div>{p.packages.length} package(s)</div>
                  )}
                </div>
              </Link>
              {/* Activate button (top-right) + Delete (bottom-right).
                  Both are absolute-positioned so the <Link> can cover
                  the rest of the card without click-event conflicts. */}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                <ActivateProfileButton name={p.name} active={active} />
                <DeleteButton
                  name={p.name}
                  label={renderT(locale, "btn.ariaDeleteProfile")}
                  action={deleteProfileForm}
                  confirmMessage={renderT(
                    locale,
                    "policy.confirmDeleteProfile",
                    {
                      name: p.name,
                    },
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
