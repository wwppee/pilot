/**
 * /tools — tool inventory browser.
 *
 * v0.4.2: lists 7 built-in tools + npm-installed extensions. Each tool
 * has a safety classification (read / write / exec) for v0.4.3+ HITL
 * policy UI. Source filter toggles the visible set.
 */

import { api } from "@/lib/pilot";
import type { ToolInventoryItem } from "@/lib/types";

export default async function ToolsPage() {
  let tools: ToolInventoryItem[] = [];
  let error: string | null = null;
  try {
    tools = await api.tools();
  } catch (e) {
    error = (e as Error).message;
  }

  const builtIns = tools.filter((t) => t.source === "built-in");
  const ext = tools.filter((t) => t.source === "extension");
  const npm = tools.filter((t) => t.source === "npm");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Tool inventory</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {tools.length} tool{tools.length === 1 ? "" : "s"} available to pi —
          built-in ({builtIns.length}), npm extensions ({npm.length})
          {ext.length > 0 && `, project-local extensions (${ext.length})`}
        </p>
      </header>

      {error ? (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)]">
          Couldn&apos;t load tools: {error}
        </div>
      ) : tools.length === 0 ? (
        <div className="surface rounded-lg p-8 text-sm text-[var(--text-muted)] italic text-center">
          No tools discovered. Run pi once to initialize the directory.
        </div>
      ) : (
        <>
          {builtIns.length > 0 && (
            <ToolSection
              title="Built-in"
              subtitle="Hardcoded into pi (per `pi --help`)"
              tools={builtIns}
            />
          )}
          {ext.length > 0 && (
            <ToolSection
              title="Extensions (project-local)"
              subtitle="~/.pi/agent/extensions/*.ts — AST scan pending"
              tools={ext}
            />
          )}
          {npm.length > 0 && (
            <ToolSection
              title="Extensions (npm)"
              subtitle="Installed via `pi install <pkg>`"
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
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Safety</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium text-right">Status</th>
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
