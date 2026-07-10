/**
 * /plans — list all plans.
 *
 * v0.5.7: Plan data model + CRUD baseline. The list shows status
 * (draft / running / paused / completed / failed / cancelled),
 * strategy, task count, and last-update timestamp. Click into a
 * row for Tasks + Steps + lifecycle controls.
 */
import Link from "next/link";
export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import type { Plan, PlanStatus, PlanStrategy } from "@/lib/types";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { RichT } from "@/components/RichT";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { negotiateLocale, renderT } from "@/lib/i18n";

interface PageProps {
  searchParams: Promise<{ deleted?: string; id?: string; error?: string }>;
}

export default async function PlansPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const result = await api.plans().catch(() => null as Plan[] | null);
  const plans = (result ?? []) as Plan[];

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const statusLabel = (s: PlanStatus): string =>
    renderT(locale, `plans.status.${s}`);
  const strategyLabel = (s: PlanStrategy): string =>
    renderT(locale, `plans.strategy.${s}`);
  const statusColor = (s: PlanStatus): string => {
    switch (s) {
      case "draft":
        return "var(--text-muted)";
      case "running":
        return "var(--accent)";
      case "paused":
        return "var(--accent-2)";
      case "completed":
        return "var(--accent-2)";
      case "failed":
        return "var(--error)";
      case "cancelled":
        return "var(--text-muted)";
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            <T k="plans.h1" />
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            <T k="plans.subtitle" />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/plans/suggest-tools" className="btn secondary">
            <T k="plans.suggest.button" /> →
          </Link>
          <Link href="/plans/new" className="btn">
            + <T k="plans.empty.cta" />
          </Link>
        </div>
      </header>

      <div className="mb-2">
        <Hint summary={<T k="plans.hint.summary" />}>
          <RichT
            locale={locale}
            k="plans.hint.body"
            values={{
              plan: (
                <GlossaryTerm term="plan" locale={locale}>
                  plan
                </GlossaryTerm>
              ),
              s1: <strong>goal</strong>,
              s2: <strong>tasks</strong>,
              s3: <strong>steps</strong>,
              em1: <em>v0.6.0</em>,
            }}
          />
        </Hint>
      </div>

      {sp.deleted && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--accent-2)" }}
        >
          ✓ <T k="plans.action.deleted" />{" "}
          <code className="kbd">{sp.id ?? ""}</code>
        </div>
      )}
      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
        >
          {sp.error}
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState
          title={renderT(locale, "plans.empty.title")}
          hint={renderT(locale, "plans.empty.hint")}
          actionHref="/plans/new"
          actionLabel={renderT(locale, "plans.empty.cta")}
        />
      ) : (
        <div className="surface rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="surface-2 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">
                  <T k="plans.col.id" />
                </th>
                <th className="px-3 py-2 font-medium">
                  <T k="plans.col.goal" />
                </th>
                <th className="px-3 py-2 font-medium">
                  <T k="plans.col.status" />
                </th>
                <th className="px-3 py-2 font-medium">
                  <T k="plans.col.strategy" />
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  <T k="plans.col.tasks" />
                </th>
                <th className="px-3 py-2 font-medium">
                  <T k="plans.col.updated" />
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const completed = p.tasks.filter(
                  (t) => t.status === "completed",
                ).length;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-3 py-2">
                      <Link href={`/plans/${p.id}`} className="kbd">
                        {p.id.length > 20 ? `${p.id.slice(0, 18)}…` : p.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate">
                      {p.title ?? p.goal}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="text-xs font-medium"
                        style={{ color: statusColor(p.status) }}
                      >
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {strategyLabel(p.strategy)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {completed}/{p.tasks.length}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {p.updatedAt}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
