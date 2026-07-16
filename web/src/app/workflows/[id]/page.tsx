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
 * The page is route-protected by the server: if the
 * workflow id doesn't exist or the file is corrupt, the
 * server's GET /workflows/:id returns 404 / 500 and this
 * page renders an error state. We don't catch the error
 * here because the user can still navigate to /workflows
 * and start over.
 */

import { headers } from "next/headers";
import type { Metadata } from "next";
import { negotiateLocale } from "@/lib/i18n";
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
  return <WorkflowEditor workflowId={decoded} />;
}
