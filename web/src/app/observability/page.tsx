/**
 * v0.7.3 (B2): /observability — a dashboard page that surfaces
 * tool-call outcomes recorded by the policy engine. The page is
 * a thin server-component shell; the actual fetch + render lives
 * in the client island below.
 *
 * Per user memory §Engineering Philosophy ("storage is a blind
 * box"), the page never mentions file paths, JSONL, Zod field
 * names, or any other implementation detail. The user just sees
 * "tool calls" and "policy blocks".
 */

import { negotiateLocale } from "@/lib/i18n";
import { ObservabilityView } from "./ObservabilityView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Observability — Pilot",
};

export default async function ObservabilityPage() {
  const locale = negotiateLocale(null);
  return <ObservabilityView locale={locale} />;
}
