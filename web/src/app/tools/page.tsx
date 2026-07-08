/**
 * /tools — tool inventory browser.
 *
 * v0.4.2: lists 7 built-in tools + npm-installed extensions. Each tool
 * has a safety classification (read / write / exec) for v0.4.3+ HITL
 * policy UI. Source filter toggles the visible set.
 */

import { headers } from "next/headers";
import { api } from "@/lib/pilot";
export const dynamic = "force-dynamic";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { ToolInventoryItem } from "@/lib/types";

export default async function ToolsPage() {
  let tools: ToolInventoryItem[] = [];
  let error: string | null = null;
  try {
    tools = await api.tools();
  } catch (e) {
    error = (e as Error).message;
  }

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const builtIns = tools.filter((t) => t.source === "built-in");
  const ext = tools.filter((t) => t.source === "extension");
  const npm = tools.filter((t) => t.source === "npm");

  const subtitle = renderT(locale, "tools.subtitle", {
    n: tools.length,
    s: tools.length === 1 ? "" : "s",
    builtin: builtIns.length,
    npm: npm.length,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="tools.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>
      </header>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          Couldn&apos;t load tools: {error}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title={renderT(locale, "tools.empty")}
          hint={
            <>
              Run <code className="kbd">pi</code> in any project to populate its{" "}
              <code className="kbd">~/.pi/agent/</code> directory.
            </>
          }
        />
      ) : (
        <>
          {builtIns.length > 0 && (
            <ToolSection
              title={renderT(locale, "tools.section.builtin.title")}
              subtitle={renderT(locale, "tools.section.builtin.subtitle")}
              tools={builtIns}
            />
          )}
          {ext.length > 0 && (
            <ToolSection
              title={renderT(locale, "tools.section.local.title")}
              subtitle={renderT(locale, "tools.section.local.subtitle")}
              tools={ext}
            />
          )}
          {npm.length > 0 && (
            <ToolSection
              title={renderT(locale, "tools.section.npm.title")}
              subtitle={renderT(locale, "tools.section.npm.subtitle")}
              tools={npm}
            />
          )}
        </>
      )}
    </div>
  );
}

function ToolSection({
  title,
  subtitle,
  tools,
}: {
  title: string;
  subtitle: string;
  tools: ToolInventoryItem[];
}) {
  return (
    <div className="surface rounded-lg overflow-hidden">
      <div className="px-4 py-2 surface-2 text-xs uppercase tracking-wide text-[var(--text-muted)] flex items-baseline gap-3">
        <span className="font-medium text-[var(--text)]">{title}</span>
        <span>{subtitle}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="surface-2 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">
              <T k="tools.col.name" />
            </th>
            <th className="px-3 py-2 font-medium">
              <T k="tools.col.source" />
            </th>
            <th className="px-3 py-2 font-medium">
              <T k="tools.col.safety" />
            </th>
            <th className="px-3 py-2 font-medium">
              <T k="tools.col.description" />
            </th>
            <th className="px-3 py-2 font-medium text-right">
              <T k="tools.col.status" />
            </th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr
              key={`${t.source}-${t.name}`}
              className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
            >
              <td className="px-3 py-2">
                <code className="kbd">{t.name}</code>
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                {t.source === "npm" && t.packageName
                  ? `${t.source} · ${t.packageName}`
                  : t.source}
              </td>
              <td className="px-3 py-2">
                <SafetyBadge safety={t.safety} />
              </td>
              <td className="px-3 py-2 text-[var(--text-muted)] max-w-md truncate">
                {t.description}
              </td>
              <td className="px-3 py-2 text-right">
                {t.enabled ? (
                  <span className="text-xs text-[var(--accent-2)]">●</span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">○</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SafetyBadge({ safety }: { safety: ToolInventoryItem["safety"] }) {
  const colorMap: Record<string, string> = {
    read: "bg-[var(--accent-2)] bg-opacity-15 text-[var(--accent-2)]",
    write: "bg-[var(--warn)] bg-opacity-15 text-[var(--warn)]",
    exec: "bg-[var(--error)] bg-opacity-15 text-[var(--error)]",
    network: "bg-[var(--accent)] bg-opacity-15 text-[var(--accent)]",
    secret: "bg-[var(--error)] bg-opacity-25 text-[var(--error)]",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${
        colorMap[safety] ?? "bg-[var(--surface-2)]"
      }`}
    >
      {safety}
    </span>
  );
}
