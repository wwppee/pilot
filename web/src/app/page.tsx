/**
 * / — v1.0.1: 7-module nav: the root path now lives in /insight.
 *
 * Pre-v1.0.1, `/` rendered the legacy Dashboard (today's stats +
 * recent sessions + installed packs). v1.0.0 restated Pilot as
 * "AI Agent 能力管理层" with 7 core modules, and v1.0.1 made
 * /insight the canonical home for the "today's stats + recent
 * activity + tool breakdown" use case.
 *
 * Two layers of redirect:
 *  1. `next.config.ts` declares `redirects()` that 308-redirects
 *     `/` to `/insight`. Browser navigation / curl / shared links
 *     hit the redirect before any page renders.
 *  2. This page still exists as a defensive fallback so that if
 *     the redirect is somehow bypassed (e.g. local dev with
 *     `next.config.ts` partially loaded), the user lands on
 *     `/insight` rather than 404. The body never renders in
 *     normal use.
 *
 * The legacy Dashboard component (today / week cards, model +
 * tool breakdown, recent-sessions table) is preserved in git
 * history at `page.tsx@v0.9.16`; v1.0.2 will port it into
 * `/insight` as the new module's "today" view.
 */
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default function RootPage(): never {
  redirect("/insight");
}
