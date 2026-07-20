/**
 * v0.7.0: /workflows/[id] — workflow editor page.
 *
 * Server component shell (static title + id URL extraction)
 * + a large client island (`WorkflowEditor`) for the
 * interactive parts (load / save / add node / remove node /
 * add edge / remove edge / preview). The editor is a
 * single self-contained client component because every
 * mutation triggers a state re-render, and prop-drilling
 * a 200-line state object from a server component to a
 * client island would just be ceremony.
 *
 * v0.9.15: notFound() in the server component so a missing
 * id routes to the app's not-found.tsx (was returning 200
 * with the editor's "not found" inline state, breaking
 * SEO + refresh state + error monitoring). The client-side
 * `notFound` state inside WorkflowEditor stays as a defensive
 * fallback for the "workflow existed on initial load but
 * was deleted while the user was editing" race condition.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { negotiateLocale } from "@/lib/i18n";
import { api } from "@/lib/pilot";
import { WorkflowEditor } from "./WorkflowEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static fallback */
  }
  const locale = negotiateLocale(acceptLanguage);
  const decoded = decodeURIComponent(id);
  return {
    title:
      locale === "zh"
        ? `${decoded} — 工作流 — Pilot`
        : `${decoded} — Workflow — Pilot`,
  };
}

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  // v0.9.15: server-side existence check. The editor's
  // useEffect also calls api.workflow() and renders an
  // inline "not found" surface if it returns null — that
  // path is now defensive (race condition: workflow gets
  // deleted between this check and the client mount).
  const wf = await api.workflow(decoded);
  if (!wf) notFound();
  return <WorkflowEditor workflowId={decoded} />;
}
