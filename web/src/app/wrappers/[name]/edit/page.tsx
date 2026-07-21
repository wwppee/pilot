/**
 * /wrappers/[name]/edit — edit a ToolWrapper in the
 * browser.
 *
 * v0.9.3: completes the wrapper management loop.
 * Mirrors /policy/[name]/edit (server-component
 * shell + client form). The form renders the
 * rule-specific fields based on the wrapper's
 * `rule.kind` (retry / log / transform) — same
 * pattern as the policy form's SECTION_DEFS
 * but keyed on the wrapper's discriminated
 * union.
 *
 * "use server" actions live in /actions.ts; the
 * form is a client island that calls
 * api.setWrapper directly.
 *
 * v0.9.15: 404s now route to the app's not-found.tsx
 * (was rendering inline "not found" with HTTP 200).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { api, PilotApiError } from "../../../../lib/pilot";
import type { ToolWrapper } from "../../../../lib/types";
import { T } from "@/components/I18n";
import WrapperForm from "./WrapperForm";
import "./wrapper-form.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

async function loadWrapper(name: string): Promise<{
  wrapper: ToolWrapper | null;
  error: string | null;
}> {
  try {
    const wrapper = await api.getWrapper(name);
    return { wrapper, error: null };
  } catch (e) {
    if (e instanceof PilotApiError && e.status === 404) {
      // v0.9.15: bail to app's not-found.tsx.
      notFound();
    }
    return {
      wrapper: null,
      error:
        e instanceof PilotApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
    };
  }
}

export default async function EditWrapperPage({ params }: PageProps) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const { wrapper, error } = await loadWrapper(decoded);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        {/* v1.1.2: switch to reference Dark Sci-Fi Tech header
            (.hub-h1). Same as /hub /insight /workflow. The
            <code> chip below the title keeps the wrapper
            name in mono so the visual hierarchy reads
            "title + named resource". */}
        <h1 className="hub-h1">
          <T k="wrappers.edit.h1" /> <code className="kbd">{decoded}</code>
        </h1>
        <a
          href="/wrappers"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <T k="wrappers.edit.backToList" />
        </a>
      </header>

      {error ? (
        <section className="surface rounded-lg p-4 card error">
          <h2 className="text-lg font-semibold mb-2">
            <T k="wrappers.loadErrorTitle" />
          </h2>
          <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2">
            {error}
          </pre>
        </section>
      ) : !wrapper ? (
        // v0.9.15: loadWrapper's 404 branch already calls
        // notFound(). This is the defensive fallback for the
        // "API returned 200 with wrapper=null" edge case.
        <section className="surface rounded-lg p-4 card empty">
          <p>
            <T k="wrappers.error.notFound" />
            <code className="kbd ml-2">{decoded}</code>
          </p>
          <p className="mt-3">
            <a
              href="/wrappers"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              <T k="btn.backToList" />
            </a>
          </p>
        </section>
      ) : (
        <Suspense
          fallback={
            <p className="hint">
              <T k="loading.wrapperForm" />
            </p>
          }
        >
          <WrapperForm initialWrapper={wrapper} />
        </Suspense>
      )}
    </div>
  );
}
