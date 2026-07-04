/**
 * /policy/[name]/edit — edit a ToolPolicy in the browser.
 *
 * v0.4.7: completes the policy management loop. Before this, you
 * could view policies at /policy but couldn't edit them — you'd have
 * to drop to CLI or hand-edit the TOML file. This page lets you
 * edit all 7 fields (description + 6 rule arrays) and save.
 *
 * Architecture:
 *   - Server component: fetch the policy from the pilot server
 *   - Client component: the form (textarea-based editor for simplicity)
 *   - Save: PUT /policies/:name (already wired in lib/pilot.ts)
 *
 * Why textarea (not fancy tag-list editor)?
 *   - TOML arrays are line-separated; textarea 1-line-1-rule is
 *     familiar from .gitignore / .dockerignore
 *   - 70 lines of code instead of 200
 *   - Easy to paste from anywhere (CLI output, docs, chat)
 *   - Can upgrade to tag-editor later without breaking the contract
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
    <main>
      <header className="policy-edit-header">
        <h1>
          <T k="policy.edit.h1" /> <code>{decoded}</code>
        </h1>
        <a href="/policy" className="muted small">
          <T k="policy.edit.backToList" />
        </a>
      </header>

      {error ? (
        <section className="card error">
          <h2>
            <T k="error.couldntLoad.title" />: policy
          </h2>
          <pre>{error}</pre>
        </section>
      ) : !policy ? (
        <section className="card empty">
          <p>
            Policy <code>{decoded}</code> not found.{" "}
            <a href="/policy">
              <T k="btn.backToList" />
            </a>
          </p>
        </section>
      ) : (
        <Suspense
          fallback={
            <p>
              <T k="loading.policyForm" />
            </p>
          }
        >
          <PolicyForm initialPolicy={policy} />
        </Suspense>
      )}
    </main>
  );
}
