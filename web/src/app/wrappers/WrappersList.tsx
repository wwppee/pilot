"use client";

/**
 * v2.0.9: Wrappers list — read-only view of every wrapper
 * with apply / unapply / delete actions.
 *
 * Pre-v2.0.9 this used the v0.9.0 `.card-grid` /
 * `.card-hover` / `.btn small secondary` legacy classes.
 * v2.0.9 re-skins the list to the same `.hub-row` /
 * `.hub-btn` / `.hub-pill` family as the rest of the
 * 7-module surface so a user moving from Hub → Wrappers
 * sees one visual language.
 *
 * Behaviour is unchanged: Apply / Unapply / Delete / Edit,
 * optimistic UI for Apply (set isApplied locally), full
 * reload on Delete (the row genuinely leaves the list).
 *
 * The "applied" pill uses `--state-success`; the "not
 * applied" pill uses `--state-warning`. Both are from the
 * strict 1-primary + 4-state palette.
 */
import { useState } from "react";
import { Edit, Power, PowerOff, Trash2 } from "lucide-react";
import { api } from "@/lib/pilot-browser";
import type { ToolWrapper } from "@/lib/types";
import { useT } from "@/components/I18n";

export function WrappersList({ wrappers }: { wrappers: ToolWrapper[] }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Track which wrapper has a generated extension on
  // disk. Optimistic — set after apply, cleared on unapply.
  const [applied, setApplied] = useState<Set<string>>(new Set());

  if (wrappers.length === 0) {
    return (
      <section className="wrappers-empty">
        <p className="font-semibold">{t("wrappers.empty.title")}</p>
        <p className="wrappers-empty-body">{t("wrappers.empty.body")}</p>
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

  const isFailed = (m: string) =>
    m.includes(t("wrappers.applyFailed")) ||
    m.includes(t("wrappers.deleteFailed")) ||
    m.includes(t("wrappers.unapplyFailed"));

  return (
    <section className="wrappers-list-section">
      <h2 className="wrappers-list-h2">
        {t("wrappers.h1")} ({wrappers.length})
      </h2>
      {message ? (
        <p
          className={`wrappers-message ${
            isFailed(message) ? "wrappers-message--error" : "wrappers-message--ok"
          }`}
        >
          {message}
        </p>
      ) : null}
      <ul className="hub-list">
        {wrappers.map((w) => {
          const isApplied = applied.has(w.name);
          const isBusy = busy === w.name;
          return (
            <li key={w.name} className="hub-list-item">
              <div
                className={`hub-row ${
                  isApplied ? "hub-row--installed" : ""
                }`}
                data-testid={`wrapper-card-${w.name}`}
              >
                <div className="hub-row-main">
                  <div className="hub-row-name">
                    {w.name}
                    {isApplied ? (
                      <span className="hub-pill hub-pill--success">
                        {t("wrappers.card.applied")}
                      </span>
                    ) : (
                      <span className="hub-pill hub-pill--warning">
                        {t("wrappers.card.notApplied")}
                      </span>
                    )}
                  </div>
                  {w.description && (
                    <div className="hub-row-desc">{w.description}</div>
                  )}
                  <div className="hub-row-meta">
                    <span className="hub-row-meta-item">
                      {t("wrappers.card.kind")}:{" "}
                      <code className="hub-row-meta-mono">{w.rule.kind}</code>
                    </span>
                    <span className="hub-row-meta-item">
                      {t("wrappers.card.tools")}:{" "}
                      <code className="hub-row-meta-mono">
                        {w.tools.join(", ")}
                      </code>
                    </span>
                  </div>
                </div>
                <div className="hub-row-actions">
                  <a
                    href={`/wrappers/${encodeURIComponent(w.name)}/edit`}
                    className="hub-btn hub-btn--ghost"
                    data-testid={`wrapper-edit-${w.name}`}
                  >
                    <Edit size={14} strokeWidth={1.75} />
                    {t("btn.edit")}
                  </a>
                  {!isApplied ? (
                    <button
                      type="button"
                      className="hub-btn hub-btn--primary"
                      onClick={() => void onApply(w.name)}
                      disabled={isBusy}
                      data-testid={`wrapper-apply-${w.name}`}
                    >
                      <Power size={14} strokeWidth={1.75} />
                      {t("wrappers.apply")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="hub-btn hub-btn--ghost"
                      onClick={() => void onUnapply(w.name)}
                      disabled={isBusy}
                      data-testid={`wrapper-unapply-${w.name}`}
                    >
                      <PowerOff size={14} strokeWidth={1.75} />
                      {t("wrappers.unapply")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="hub-btn hub-btn--danger"
                    onClick={() => void onDelete(w.name)}
                    disabled={isBusy}
                    data-testid={`wrapper-delete-${w.name}`}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                    {t("wrappers.delete")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
