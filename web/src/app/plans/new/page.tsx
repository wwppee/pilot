/**
 * /plans/new — visual plan builder.
 *
 * v0.6.1: replaced the goal-only form with `PlanEditor`,
 * a client-side React component that lets users add
 * tasks + steps with per-action-type fields before submitting.
 * Goal can be pre-filled from `?goal=...` so the editor
 * composes naturally with the suggest-tools flow.
 *
 * Server-rendered wrapper just negotiates the locale and
 * fetches the list of profiles + policies so the editor
 * can render dropdowns with real names. If the lists fail
 * to load (server down, transient), the editor falls back
 * to free-text input — the API endpoint will still validate.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { ListChecks } from "lucide-react";
import { T } from "@/components/I18n";
import { PageHeader } from "@/components/PageHeader";
import { PlanEditor } from "@/components/PlanEditor";
import { api } from "@/lib/pilot";
import { negotiateLocale } from "@/lib/i18n";

interface PageProps {
  searchParams: Promise<{ error?: string; goal?: string }>;
}

export const dynamic = "force-dynamic";

export default async function NewPlanPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  // The PlanEditor is a client component that does its own
  // i18n via useI18n() — the negotiated locale is informational
  // here (used to pre-populate from `?goal=...` only).
  negotiateLocale(acceptLanguage);

  // Best-effort: pull profile + policy names for the editor's
  // dropdowns. If either fails, the editor falls back to
  // free-text input.
  let profiles: string[] = [];
  let policies: string[] = [];
  try {
    const [profileList, policyList] = await Promise.all([
      api.profiles().catch(() => []),
      api.policies().catch(() => []),
    ]);
    profiles = (profileList as Array<{ name: string }>).map((p) => p.name);
    policies = (policyList as Array<{ name: string }>).map((p) => p.name);
  } catch {
    /* keep empty */
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/plans">
          ← <T k="plans.h1" />
        </Link>
      </div>

      <PageHeader
        icon={<ListChecks size={20} strokeWidth={1.75} />}
        title={<T k="plans.new.h1" />}
        subtitle={<T k="plans.new.subtitle" />}
      />

      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {sp.error}
        </div>
      )}

      <PlanEditor
        initialGoal={sp.goal ?? ""}
        availableProfiles={profiles}
        availablePolicies={policies}
      />
    </div>
  );
}
