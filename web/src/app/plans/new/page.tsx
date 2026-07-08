/**
 * /plans/new — single-field plan creation form.
 *
 * v0.5.7: takes just a goal. The server (core/plan.ts `writePlan`)
 * derives a short title (auto-strips common prefixes, truncates to
 * 60 chars), defaults strategy to "sequential", and creates a draft.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { T } from "@/components/I18n";
import { SubmitButton } from "@/components/Buttons";
import { createPlanForm } from "@/lib/actions";
import { negotiateLocale, renderT } from "@/lib/i18n";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
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
  const locale = negotiateLocale(acceptLanguage);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/plans">
          ← <T k="plans.h1" />
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="plans.new.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          <T k="plans.new.subtitle" />
        </p>
      </header>

      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {sp.error}
        </div>
      )}

      <form
        action={createPlanForm}
        className="surface rounded-lg p-4 space-y-3"
      >
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            <T k="plans.new.goalLabel" />
          </span>
          <textarea
            name="goal"
            required
            minLength={1}
            placeholder={renderT(locale, "plans.new.goalPlaceholder")}
            rows={3}
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)] font-sans"
            aria-describedby="plans-new-hint"
          />
        </label>
        <p
          id="plans-new-hint"
          className="text-xs text-[var(--text-muted)] leading-relaxed"
        >
          {renderT(locale, "plans.new.subtitle")}
        </p>
        <div className="flex gap-2 pt-2">
          <SubmitButton pendingLabel="…">
            + <T k="plans.new.submit" />
          </SubmitButton>
          <Link href="/plans" className="btn secondary">
            <T k="plans.new.cancel" />
          </Link>
        </div>
      </form>
    </div>
  );
}
