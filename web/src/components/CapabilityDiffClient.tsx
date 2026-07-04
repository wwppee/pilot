"use client";

/**
 * CapabilityDiffClient — interactive picker + diff render.
 *
 * Two `<select>` dropdowns for A and B + a swap button. Changing
 * either picker pushes the new URL via Next.js router so the page
 * state is shareable / refreshable.
 *
 * Receives the full list of installed capabilities as a prop, so
 * the server can pre-render the initial state and we don't have to
 * re-fetch on every keystroke.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { CapabilityDiff, Capability } from "@/lib/types";

interface Props {
  /** All installed capabilities. */
  capabilities: Capability[];
  /** Pre-fetched diff for ?a=&b= (null when no pair picked yet). */
  initialDiff: CapabilityDiff | null;
  /** i18n — pass a renderT-like function from the parent. */
  t: (k: string, params?: Record<string, string | number>) => string;
}

const STATUS_COLOR: Record<string, string> = {
  match: "var(--accent-2)",
  drift: "var(--warn)",
  missing: "var(--error)",
  extra: "var(--accent)",
};

export function CapabilityDiffClient({ capabilities, initialDiff, t }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const a = sp.get("a") ?? "";
  const b = sp.get("b") ?? "";

  const updateUrl = (next: { a?: string; b?: string }) => {
    const params = new URLSearchParams(sp.toString());
    if (next.a !== undefined) {
      if (next.a) params.set("a", next.a);
      else params.delete("a");
    }
    if (next.b !== undefined) {
      if (next.b) params.set("b", next.b);
      else params.delete("b");
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  };

  const swap = () => {
    updateUrl({ a: b, b: a });
  };

  if (capabilities.length < 2) {
    return (
      <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
        {t("capdiff.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="surface rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Picker
          label={t("capdiff.pickerA")}
          value={a}
          capabilities={capabilities}
          onChange={(v) => updateUrl({ a: v })}
          t={t}
        />
        <Picker
          label={t("capdiff.pickerB")}
          value={b}
          capabilities={capabilities}
          onChange={(v) => updateUrl({ b: v })}
          t={t}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={swap}
          disabled={!a || !b}
          className="text-xs px-3 py-1 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("capdiff.swapCta")} ⇄
        </button>
        {isPending && (
          <span className="text-[10px] text-[var(--text-muted)] italic">…</span>
        )}
      </div>

      {!a || !b ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          {t("capdiff.subtitle")}
        </div>
      ) : !initialDiff ? (
        <div
          className="surface rounded-lg p-4 text-sm"
          style={{
            color: "var(--error)",
            borderLeft: "3px solid var(--error)",
          }}
          role="alert"
        >
          {t("capdiff.notFound")}
        </div>
      ) : (
        <DiffRender diff={initialDiff} t={t} />
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  capabilities,
  onChange,
  t,
}: {
  label: string;
  value: string;
  capabilities: Capability[];
  onChange: (v: string) => void;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full surface-2 rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-[var(--accent)]"
      >
        <option value="">{t("capdiff.pickerPlaceholder")}</option>
        {capabilities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function DiffRender({
  diff,
  t,
}: {
  diff: CapabilityDiff;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  const equalLabel = t(diff.equal ? "capdiff.equal" : "capdiff.unequal");

  // Build a flat ordered list of (labelKey, status) so the table
  // layout is stable regardless of which fields happen to differ.
  const rows: Array<{ key: string; fieldKey: string; status: string }> = [
    {
      key: "title",
      fieldKey: "capdiff.field.title",
      status: diff.title.status,
    },
    { key: "type", fieldKey: "capdiff.field.type", status: diff.type.status },
    {
      key: "description",
      fieldKey: "capdiff.field.description",
      status: diff.description.status,
    },
    {
      key: "sources",
      fieldKey: "capdiff.field.sources",
      status: diff.sources.status,
    },
    {
      key: "extensions",
      fieldKey: "capdiff.field.extensions",
      status: diff.artifacts.extensions.status,
    },
    {
      key: "skills",
      fieldKey: "capdiff.field.skills",
      status: diff.artifacts.skills.status,
    },
    {
      key: "prompts",
      fieldKey: "capdiff.field.prompts",
      status: diff.artifacts.prompts.status,
    },
    {
      key: "themes",
      fieldKey: "capdiff.field.themes",
      status: diff.artifacts.themes.status,
    },
    { key: "eval", fieldKey: "capdiff.field.eval", status: diff.eval.status },
    {
      key: "conflicts",
      fieldKey: "capdiff.field.conflicts",
      status: diff.compatibility.conflicts.status,
    },
    {
      key: "requires",
      fieldKey: "capdiff.field.requires",
      status: diff.compatibility.requires.status,
    },
    {
      key: "inspiredBy",
      fieldKey: "capdiff.field.inspiredBy",
      status: diff.metadata.inspiredBy.status,
    },
    {
      key: "tags",
      fieldKey: "capdiff.field.tags",
      status: diff.metadata.tags.status,
    },
    {
      key: "createdAt",
      fieldKey: "capdiff.field.createdAt",
      status: diff.metadata.createdAt.status,
    },
    {
      key: "updatedAt",
      fieldKey: "capdiff.field.updatedAt",
      status: diff.metadata.updatedAt.status,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="surface rounded-lg p-3 flex items-center justify-between">
        <div className="text-sm font-mono">
          <code className="kbd">{diff.aId}</code>
          <span className="mx-2 text-[var(--text-muted)]">↔</span>
          <code className="kbd">{diff.bId}</code>
        </div>
        <span
          className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
          style={{
            color: diff.equal ? "var(--accent-2)" : "var(--warn)",
            background: "var(--surface-2)",
          }}
        >
          {equalLabel}
        </span>
      </div>

      <div className="surface rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--surface-2)]">
              <th className="text-left px-3 py-2 w-32">field</th>
              <th className="text-left px-3 py-2 w-24">status</th>
              <th className="text-left px-3 py-2">{t("capdiff.pickerA")}</th>
              <th className="text-left px-3 py-2">{t("capdiff.pickerB")}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-[var(--surface-2)] last:border-b-0"
                style={{
                  borderLeft: `3px solid ${STATUS_COLOR[row.status] ?? "var(--surface-2)"}`,
                }}
              >
                <td className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {t(row.fieldKey)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{
                      color: STATUS_COLOR[row.status] ?? "var(--text-muted)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 break-words align-top">
                  {renderCell(row.key, "a", diff, t)}
                </td>
                <td className="px-3 py-2 break-words align-top">
                  {renderCell(row.key, "b", diff, t)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(
  fieldKey: string,
  side: "a" | "b",
  diff: CapabilityDiff,
  t: (k: string, params?: Record<string, string | number>) => string,
): React.ReactNode {
  const fmt = (v: unknown): React.ReactNode => {
    if (v === undefined) {
      return <span className="italic text-[var(--text-muted)]">—</span>;
    }
    if (Array.isArray(v)) {
      if (v.length === 0)
        return <span className="italic text-[var(--text-muted)]">[]</span>;
      return (
        <ul className="space-y-0.5">
          {v.map((x, i) => (
            <li key={i}>
              <code className="kbd">{String(x)}</code>
            </li>
          ))}
        </ul>
      );
    }
    return <code className="kbd">{String(v)}</code>;
  };

  switch (fieldKey) {
    case "title":
      return fmt(diff.title[side]);
    case "type":
      return fmt(diff.type[side]);
    case "description":
      return fmt(diff.description[side]);
    case "sources":
      return fmt(side === "a" ? diff.sources.a : diff.sources.b);
    case "extensions":
      return fmt(
        side === "a"
          ? diff.artifacts.extensions.a
          : diff.artifacts.extensions.b,
      );
    case "skills":
      return fmt(
        side === "a" ? diff.artifacts.skills.a : diff.artifacts.skills.b,
      );
    case "prompts":
      return fmt(
        side === "a" ? diff.artifacts.prompts.a : diff.artifacts.prompts.b,
      );
    case "themes":
      return fmt(
        side === "a" ? diff.artifacts.themes.a : diff.artifacts.themes.b,
      );
    case "eval": {
      // Special: 4 variants — present both sides or show note.
      if (diff.eval.status === "match" && "note" in diff.eval) {
        return (
          <span className="italic text-[var(--text-muted)]">
            {t("capdiff.evalAbsent")}
          </span>
        );
      }
      if (diff.eval.status === "missing") {
        return side === "a" ? (
          fmt(diff.eval.a)
        ) : (
          <span className="italic text-[var(--text-muted)]">—</span>
        );
      }
      if (diff.eval.status === "extra") {
        return side === "b" ? (
          fmt(diff.eval.b)
        ) : (
          <span className="italic text-[var(--text-muted)]">—</span>
        );
      }
      // match | drift
      return fmt(side === "a" ? diff.eval.a : diff.eval.b);
    }
    case "conflicts":
      return fmt(
        side === "a"
          ? diff.compatibility.conflicts.a
          : diff.compatibility.conflicts.b,
      );
    case "requires":
      return fmt(
        side === "a"
          ? diff.compatibility.requires.a
          : diff.compatibility.requires.b,
      );
    case "inspiredBy":
      return fmt(
        side === "a" ? diff.metadata.inspiredBy.a : diff.metadata.inspiredBy.b,
      );
    case "tags":
      return fmt(side === "a" ? diff.metadata.tags.a : diff.metadata.tags.b);
    case "createdAt":
      return fmt(diff.metadata.createdAt[side]);
    case "updatedAt":
      return fmt(diff.metadata.updatedAt[side]);
    default:
      return null;
  }
}
