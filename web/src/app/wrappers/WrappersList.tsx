"use client";

/**
 * v0.9.0: Wrappers list — read-only view of every
 * wrapper, with apply / unapply / delete actions.
 * Mirrors PolicyList's structure (same CRUD
 * surface, different resource) so the two
 * dashboards feel symmetric.
 */
import { useState } from "react";
import { api } from "@/lib/pilot-browser";
import type { ToolWrapper } from "@/lib/types";
import { useT } from "@/components/I18n";

export function WrappersList({ wrappers }: { wrappers: ToolWrapper[] }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Track which wrapper has a generated extension
  // on disk. We optimistically mark it as "applied"
  // after a successful applyWrapper call, and clear
  // it on unapply.
  const [applied, setApplied] = useState<Set<string>>(new Set());

  if (wrappers.length === 0) {
    return (
      <section className="surface rounded-lg p-4 card empty">
        <p className="font-semibold">
          {t("wrappers.empty.title")}
        </p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {t("wrappers.empty.body")}
        </p>
      </section>
    );
  }

  async function onApply(name: string) {
    setBusy(name);
    setMessage(null);
    try {
      const { path, bytes } = await api.applyWrapper(name);
      setApplied((s) => new Set(s).add(name));
      setMessage(t("wrappers.applyOk", { path, bytes }));
    } catch (e) {
      setMessage(
        `${t("wrappers.applyFailed")}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function onUnapply(name: string) {
    setBusy(name);
    setMessage(null);
    try {
      const { removed } = await api.unapplyWrapper(name);
      if (removed) {
        setApplied((s) => {
          const next = new Set(s);
          next.delete(name);
          return next;
        });
        setMessage(t("wrappers.unapplyOk"));
      } else {
        setMessage(t("wrappers.unapplyNotApplied"));
      }
    } catch (e) {
      setMessage(
        `${t("wrappers.unapplyFailed")}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(name: string) {
    if (!window.confirm(t("wrappers.confirmDelete", { name }))) return;
    setBusy(name);
    setMessage(null);
    try {
      await api.deleteWrapper(name);
      // Reload by triggering a full-page refresh —
      // simplest path for a delete op that removes
      // the row from the list.
      window.location.reload();
    } catch (e) {
      setMessage(
        `${t("wrappers.deleteFailed")}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="section-h2">
        {t("wrappers.h1")} ({wrappers.length})
      </h2>
      {message ? (
        <p
          className={`text-xs mb-2 ${
            message.includes(t("wrappers.applyFailed")) ||
            message.includes(t("wrappers.deleteFailed")) ||
            message.includes(t("wrappers.unapplyFailed"))
              ? "text-[var(--error)]"
              : "text-[var(--accent-2)]"
          }`}
        >
          {message}
        </p>
      ) : null}
      <div className="card-grid">
        {wrappers.map((w) => {
          const isApplied = applied.has(w.name);
          const isBusy = busy === w.name;
          return (
            <article
              key={w.name}
              className="surface rounded-lg p-4 space-y-2 card-hover"
              data-testid={`wrapper-card-${w.name}`}
            >
              <header className="flex items-baseline justify-between">
                <h3 className="font-semibold font-mono">{w.name}</h3>
                {isApplied ? (
                  <span className="pill ok">
                    {t("wrappers.card.applied")}
                  </span>
                ) : (
                  <span className="pill warn">
                    {t("wrappers.card.notApplied")}
                  </span>
                )}
              </header>
              {w.description ? (
                <p className="hint">{w.description}</p>
              ) : null}
              <p className="text-xs">
                <span className="text-[var(--text-muted)]">
                  {t("wrappers.card.kind")}
                </span>{" "}
                <code className="font-mono">{w.rule.kind}</code>
              </p>
              <p className="text-xs">
                <span className="text-[var(--text-muted)]">
                  {t("wrappers.card.tools")}
                </span>{" "}
                <code className="font-mono">{w.tools.join(", ")}</code>
              </p>
              <footer className="text-xs text-[var(--text-muted)] font-mono flex items-center gap-2 flex-wrap">
                <a
                  href={`/wrappers/${encodeURIComponent(w.name)}/edit`}
                  className="btn small secondary"
                  data-testid={`wrapper-edit-${w.name}`}
                >
                  {t("btn.edit")}
                </a>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => void onApply(w.name)}
                  disabled={isBusy}
                  data-testid={`wrapper-apply-${w.name}`}
                >
                  {t("wrappers.apply")}
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => void onUnapply(w.name)}
                  disabled={isBusy}
                  data-testid={`wrapper-unapply-${w.name}`}
                >
                  {t("wrappers.unapply")}
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => void onDelete(w.name)}
                  disabled={isBusy}
                  data-testid={`wrapper-delete-${w.name}`}
                >
                  {t("wrappers.delete")}
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
