/**
 * v0.9.0: /wrappers — tool wrapper dashboard.
 *
 * v0.8.x's policy dashboard is a gate ("should this
 * tool call run?"). v0.9.0's wrapper dashboard is a
 * transform ("given this tool call, change it before
 * the tool runs"). The two surfaces are parallel
 * but inverted: policy checks → block/allow;
 * wrappers check → transform/augment.
 *
 * The dashboard lists every wrapper in
 * `~/.pilot/wrappers/`, lets the user create a new
 * one (template-driven: pick a kind, fill in
 * tools + rule), delete, and apply / unapply (which
 * generates the no-op stub extension today; the
 * real pi-side hook lands in a future v0.9.x
 * release).
 *
 * A full edit form is a v0.9.x followup; v0.9.0
 * ships the CRUD + apply surface that the contract
 * requires. The MVP UX: 1 click to create, 1 click
 * to apply.
 */
import { Suspense } from "react";
import { api, PilotApiError } from "../../lib/pilot";
import { T } from "@/components/I18n";
import { SkeletonCard } from "@/components/Skeleton";
import { WrappersList } from "./WrappersList";
import { NewWrapperCard } from "./NewWrapperCard";

export const dynamic = "force-dynamic";

async function loadWrappers() {
  try {
    return { wrappers: await api.listWrappers(), error: null };
  } catch (e) {
    return {
      wrappers: [],
      error:
        e instanceof PilotApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
    };
  }
}

export default async function WrappersPage() {
  return (
    <div className="space-y-6">
      <header>
        {/* v1.1.2: switch to the reference Dark Sci-Fi Tech
            header (.hub-h1 + .hub-subtitle) so the legacy
            /wrappers surface matches /hub /insight /workflow.
            /wrappers is preserved as a deep-link target —
            next.config.ts redirects /wrappers to /policy, but
            the in-place page still renders when a user lands
            here directly from an old bookmark. */}
        <h1 className="hub-h1">
          <T k="wrappers.h1" />
        </h1>
        <p className="hub-subtitle">
          <T k="wrappers.subtitle" />
        </p>
      </header>
      <Suspense
        fallback={
          <div className="space-y-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
          </div>
        }
      >
        <WrappersPageInner />
      </Suspense>
    </div>
  );
}

async function WrappersPageInner() {
  const { wrappers, error } = await loadWrappers();
  if (error) {
    return (
      <section className="surface rounded-lg p-4 card error">
        <h2 className="text-lg font-semibold mb-2">
          <T k="wrappers.loadErrorTitle" />
        </h2>
        <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2">
          {error}
        </pre>
      </section>
    );
  }
  return (
    <>
      <WrappersList wrappers={wrappers} />
      <hr className="border-[var(--border)]" />
      <NewWrapperCard />
    </>
  );
}
