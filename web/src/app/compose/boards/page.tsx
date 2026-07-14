/**
 * v0.6.12: /compose/boards list page.
 *
 * Server component shell — the page title + subtitle are
 * static, so we render them here without a client island. The
 * interactive list lives in `<BoardListView />` (client).
 *
 * Why split this way: the list view does its own client-side
 * data fetch (it's the only interactive part), so it has to be
 * a client component anyway. By keeping the page shell as a
 * server component, the title and subtitle render in HTML
 * before JS even loads — so the user sees something useful
 * during the brief loading state.
 *
 * v0.6.13: the browser-tab title (`<title>`) is now derived
 * from the negotiated locale via `generateMetadata` so a zh
 * user's tab reads "画板 — Pilot" instead of the English
 * "Boards — Pilot". (The static `export const metadata` was
 * always English; v0.6.12 accidentally shipped that way.)
 */

import { headers } from "next/headers";
import type { Metadata } from "next";
import { T } from "@/components/I18n";
import { negotiateLocale } from "@/lib/i18n";
import { BoardListView } from "./BoardListView";

export async function generateMetadata(): Promise<Metadata> {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  // The "— Pilot" suffix matches the rest of the app's
  // <title> tags. We don't go through an i18n key here
  // because <title> is metadata, not content — and there are
  // only ever two values (en / zh). Adding a key would be
  // ceremony without payoff.
  const title = locale === "zh" ? "画板 — Pilot" : "Boards — Pilot";
  return { title };
}

export default function BoardsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="compose.boards.title" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          <T k="compose.boards.subtitle" />
        </p>
      </header>
      <BoardListView />
    </div>
  );
}
