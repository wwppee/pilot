/**
 * <HubSearchBar> — v1.0.2: Hub search input.
 *
 * Plain <form method="get" action="/hub"> round-trip. No
 * client-side state, no debouncing, no autocomplete — search
 * hits the server which calls /packs/search. The form
 * auto-submits to /hub?q=… so the URL is shareable and the
 * browser back/forward works.
 *
 * Visual: cyan border + glow on focus (the "Dark Sci-Fi Tech"
 * direction from `pilot-webui-redesign`). See globals.css
 * `.hub-search` for the tokens.
 */
"use client";

import { useState } from "react";
import { T } from "./I18n";
import { renderT, type Locale } from "@/lib/i18n";

export function HubSearchBar({
  initialQuery,
  locale: _locale,
}: {
  initialQuery: string;
  locale: Locale;
}) {
  // Keep the form controlled so the user can clear / edit after
  // navigation. Server-rendered page passes `initialQuery` from
  // `?q=`; we hydrate with that.
  const [q, setQ] = useState(initialQuery);
  const placeholder = renderT(_locale, "hub.search.placeholder");

  return (
    <form className="hub-search" method="get" action="/hub">
      <span className="hub-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="hub-search-input"
        autoComplete="off"
        spellCheck={false}
        aria-label={placeholder}
      />
      <button type="submit" className="hub-search-submit">
        <T k="hub.search.submit" />
      </button>
    </form>
  );
}
