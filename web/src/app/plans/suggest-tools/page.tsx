"use client";

/**
 * /plans/suggest-tools — type a goal, see matched tools + profiles.
 *
 * v0.5.7: v0.5.7 ships keyword-based matching (core/plan.ts
 * `suggestTools`). LLM-based matching lands with the v0.6.0
 * executor — this UI is ready for either via the same shape.
 *
 * Why client component: the result is POST-only and we want
 * incremental results without a server round-trip on each
 * keystroke (we debounce one click instead).
 */
import { useState } from "react";
import Link from "next/link";
import { browserApi } from "@/lib/pilot-browser";
import type { PlanToolSuggestion } from "@/lib/types";
import { useT } from "@/components/I18n";

export default function SuggestToolsPage() {
  const t = useT();
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<PlanToolSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await browserApi.suggestTools(trimmed);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/plans">← {t("plans.h1")}</Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold mb-1">{t("plans.suggest.title")}</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {t("plans.suggest.subtitle")}
        </p>
      </header>

      <form onSubmit={onSubmit} className="surface rounded-lg p-4 space-y-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {t("plans.suggest.label")}
          </span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t("plans.suggest.placeholder")}
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            aria-label={t("plans.suggest.label")}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || goal.trim().length === 0}
            className="px-4 py-2 text-sm rounded text-[var(--bg)] disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {loading ? "…" : t("plans.suggest.button")}
          </button>
          <Link
            href="/plans"
            className="px-4 py-2 text-sm rounded surface-2 text-[var(--text-muted)]"
          >
            {t("plans.new.cancel")}
          </Link>
        </div>
      </form>

      {error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.matchedTools.length > 0 ? (
            <section className="surface rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
                {t("plans.suggest.matchedTools")} ({result.matchedTools.length})
              </h2>
              <ul className="space-y-1 list-none">
                {result.matchedTools.map((m) => (
                  <li key={m.name} className="text-sm">
                    <code className="kbd">{m.name}</code>{" "}
                    <span className="text-xs text-[var(--text-muted)]">
                      ({m.source}/{m.safety})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {t("plans.suggest.noneTools")}
            </p>
          )}

          {result.matchedProfiles.length > 0 ? (
            <section className="surface rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
                {t("plans.suggest.matchedProfiles")} (
                {result.matchedProfiles.length})
              </h2>
              <ul className="space-y-1 list-none">
                {result.matchedProfiles.map((p) => (
                  <li key={p.name} className="text-sm">
                    <code className="kbd">{p.name}</code>
                    {p.model && (
                      <span className="text-xs text-[var(--text-muted)] ml-2">
                        model: <code className="kbd">{p.model}</code>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {t("plans.suggest.noneProfiles")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
