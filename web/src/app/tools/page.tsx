/**
 * /tools — tool inventory browser.
 *
 * v0.4.2: lists 7 built-in tools + npm-installed extensions. Each tool
 * has a safety classification (read / write / exec) for v0.4.3+ HITL
 * policy UI. Source filter toggles the visible set.
 */

import { headers } from "next/headers";
import { Wrench } from "lucide-react";
import { api } from "@/lib/pilot";
export const dynamic = "force-dynamic";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { RichT } from "@/components/RichT";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        icon={<Wrench size={20} strokeWidth={1.75} />}
        title={<T k="tools.h1" />}
        subtitle={subtitle}
      />

      <div className="mb-2">
        <Hint summary={<T k="tools.hint.summary" />}>
          <RichT
            locale={locale}
            k="tools.hint.body"
            values={{
              s1: <strong>built-in</strong>,
              s2: <strong>local</strong>,
              s3: <strong>npm</strong>,
              c1: <code className="kbd">~/.pi/agent/</code>,
              c2: <code className="kbd">read</code>,
              c3: <code className="kbd">write</code>,
              c4: <code className="kbd">exec</code>,
              c5: <code className="kbd">network</code>,
              c6: <code className="kbd">secret</code>,
              policy: (
                <GlossaryTerm term="policy" locale={locale}>
                  policy
                </GlossaryTerm>
              ),
            }}
          />
        </Hint>
      </div>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {renderT(locale, "tools.loadError", { message: error })}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title={renderT(locale, "tools.empty")}
          hint={
            <RichT
              locale={locale}
              k="tools.empty.hint"
              values={{
                cmd: <code className="kbd">pi</code>,
                dir: <code className="kbd">~/.pi/agent/</code>,
              }}
            />
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
      <div className="px-4 py-2 surface-2 section-h2 flex items-baseline gap-3">
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
