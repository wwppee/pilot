/**
 * /policy/[name]/edit — edit a ToolPolicy in the browser.
 *
 * v0.4.7: completes the policy management loop.
 * v0.5.11: rewrote wrapping layout to match the design system
 * (standard `surface rounded-lg p-4`, `section-h2`, error/empty
 * patterns, etc). The form itself stays in policy-form.module.css
 * because it owns textarea + form layout that doesn't belong in
 * the shared design tokens.
 */

import { Suspense } from "react";
import { api, PilotApiError } from "../../../../lib/pilot";
import type { ToolPolicy } from "../../../../lib/types";
import { T } from "@/components/I18n";
import PolicyForm from "./PolicyForm";
import "./policy-form.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

async function loadPolicy(name: string): Promise<{
  policy: ToolPolicy | null;
  error: string | null;
}> {
  try {
    const policy = await api.policy(name);
    return { policy, error: null };
  } catch (e) {
    return {
      policy: null,
      error:
        e instanceof PilotApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
    };
  }
}

export default async function EditPolicyPage({ params }: PageProps) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const { policy, error } = await loadPolicy(decoded);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">
          <T k="policy.edit.h1" /> <code className="kbd">{decoded}</code>
        </h1>
        <a
          href="/policy"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <T k="policy.edit.backToList" />
        </a>
      </header>

      {error ? (
        <section className="surface rounded-lg p-4 card error">
          <h2 className="text-lg font-semibold mb-2">
            <T k="error.couldntLoad.title" />: policy
          </h2>
          <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2">
            {error}
          </pre>
        </section>
      ) : !policy ? (
        <section className="surface rounded-lg p-4 card empty">
          <p>
            <T k="policy.error.notFound" />
            <code className="kbd ml-2">{decoded}</code>
          </p>
          <p className="mt-3">
            <a
              href="/policy"
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
              <T k="loading.policyForm" />
            </p>
          }
        >
          <PolicyForm initialPolicy={policy} />
        </Suspense>
      )}
    </div>
  );
}
