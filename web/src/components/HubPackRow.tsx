/**
 * <HubPackRow> — v1.0.2: one row in the Hub pack list.
 *
 * Renders a single `Pack` (npm-shaped: name / description /
 * version / author) with a 2-action control surface:
 *   - "Install" if the row came from search hits (we know
 *     it's not yet installed by virtue of being in the
 *     search response)
 *   - "Uninstall" if the row came from the installed list
 *
 * v2.0.8: the whole row is a <Link> to /hub/[name] (the
 * pack detail page). The action button is its own <button>
 * inside the link; e.stopPropagation() keeps the row click
 * from also triggering the link navigation.
 * * The action is a plain HTML <form> POST to the matching
 * `/api/pilot/packs/install` or `/packs/uninstall` endpoint
 * via the Next.js proxy at `/api/pilot/[...path]` — same
 * server-side pattern as the legacy /packages page (v0.4.7+).
 *
 * `Pack` shape (see `web/src/lib/types.ts`):
 *   { name, version?, description?, author? }
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import { T } from "./I18n";
import { renderT, type Locale } from "@/lib/i18n";
import type { Pack } from "@/lib/types";

export function HubPackRow({
  pack,
  locale,
  query,
}: {
  pack: Pack;
  locale: Locale;
  /** The search query that produced this row, if any. When
   *  present the row gets a "search hit" treatment (highlight
   *  the matched substring); when undefined, it's an installed
   *  row and the visual is slightly calmer. */
  query?: string;
}) {
  // Local pending state so the button disables mid-request.
  // We don't optimistically remove the row — installing a
  // pack can fail (network / version conflict) and silently
  // dropping it would be confusing.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstalled = !query; // search hit ⇒ not yet installed
  const action = isInstalled ? "uninstall" : "install";
  const actionLabel = renderT(locale, `hub.action.${action}`);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const endpoint = isInstalled ? "/packs/uninstall" : "/packs/install";
      const body = isInstalled
        ? { name: pack.name }
        : { source: `npm:${pack.name}` };
      const res = await fetch(`/api/pilot${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      // Refresh the server-rendered list so installed state
      // flips. router.refresh() re-runs the server component
      // with the same search params.
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  return (
    // v2.0.8: each row is a clickable <Link> to the
    // pack detail page (/hub/[name]). The install /
    // uninstall button is its own <button> inside the
    // link; e.stopPropagation() in the click handler
    // prevents the row's click from also firing the
    // link's navigation, so the action button stays
    // self-contained.
    <Link
      href={`/hub/${encodeURIComponent(pack.name)}`}
      className={`hub-row hub-row--link ${isInstalled ? "hub-row--installed" : "hub-row--hit"}`}
    >
      <div className="hub-row-main">
        <div className="hub-row-name">
          {pack.name}
          {isInstalled && (
            <span className="hub-pill hub-pill--success">
              <T k="hub.row.installed" />
            </span>
          )}
        </div>
        {pack.description && (
          <div className="hub-row-desc">{pack.description}</div>
        )}
        <div className="hub-row-meta">
          {pack.version && (
            <span className="hub-row-meta-item">
              <T k="hub.row.version" />
              {pack.version}
            </span>
          )}
          {pack.kind && (
            <span className="hub-row-meta-item hub-row-meta-mono">
              {pack.kind}
            </span>
          )}
          {pack.homepage && (
            <a
              href={pack.homepage}
              target="_blank"
              rel="noreferrer noopener"
              className="hub-row-meta-item hub-link"
            >
              {new URL(pack.homepage).hostname}
            </a>
          )}
        </div>
        {error && <div className="hub-row-error">{error}</div>}
      </div>
      <div className="hub-row-actions">
        <button
          type="button"
          className={`hub-btn ${isInstalled ? "hub-btn--danger" : "hub-btn--primary"}`}
          onClick={(e) => {
            // v2.0.8: stop the click from bubbling up to the
            // <Link> wrapper. Without this, clicking the
            // button would also navigate to the detail page,
            // which is surprising. The button is its own
            // action; the link is the row's other affordance.
            e.stopPropagation();
            e.preventDefault();
            void handleClick();
          }}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "…" : actionLabel}
        </button>
      </div>
    </Link>
  );
}
