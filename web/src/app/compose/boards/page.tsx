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
 */

import { T } from "@/components/I18n";
import { BoardListView } from "./BoardListView";

export const metadata = {
  title: "Boards — Pilot",
};

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
