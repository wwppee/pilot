/**
 * v0.7.0: /workflows — list of saved agent workflow templates.
 *
 * Server component shell (static title + subtitle) + a small
 * client island (`WorkflowListView`) for the interactive parts
 * (data fetch, new / duplicate / delete). Same split as
 * `/compose/boards` — the static parts render before JS, the
 * interactive part is the only client component.
 *
 * v0.7.0 scope is "draw + save". The "Run workflow" button is
 * disabled with a "coming soon" tooltip so the user sees it's
 * planned but not yet wired. A future release will move the
 * runtime from "disabled button" to an actual execution path
 * that drives a pi session through the node sequence.
 */

import { headers } from "next/headers";
import type { Metadata } from "next";
import { T } from "@/components/I18n";
import { negotiateLocale } from "@/lib/i18n";
import { WorkflowListView } from "./WorkflowListView";
import "./workflow.css";

export async function generateMetadata(): Promise<Metadata> {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation fallback */
  }
  const locale = negotiateLocale(acceptLanguage);
  return {
    title: locale === "zh" ? "工作流 — Pilot" : "Workflows — Pilot",
  };
}

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="hub-h1">
          <T k="workflows.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          <T k="workflows.subtitle" />
        </p>
      </header>
      <WorkflowListView />
    </div>
  );
}
