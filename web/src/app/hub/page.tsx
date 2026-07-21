/**
 * /hub — v1.0.1: 7-module nav placeholder for the Capability Hub.
 *
 * v1.0.0 README restated Pilot as "AI Agent 能力管理层" with
 * Hub / Workflow / Policy & Security / Insight / Sessions /
 * Context / Settings as the 7 core modules. v1.0.1 created the
 * 7 routes; this page is a placeholder until v1.0.2 collapses
 * the 4 legacy surfaces (Packages / Forge / Capabilities / Tools)
 * into one search-driven Hub.
 *
 * v1.0.2 will replace this stub with the real Hub:
 *   - search across npm / local / built-in
 *   - one list of installed capabilities
 *   - detail page (security classification + usage history)
 *   - one install / uninstall / enable / disable control
 *
 * The "old routes" list below is the user-facing breadcrumb: it
 * tells existing users "your old bookmarks still work — they'll
 * land here, and we'll fill in the merged view in v1.0.2".
 */
import { T } from "@/components/I18n";
export const dynamic = "force-dynamic";

export default function HubPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="hub.h1" />
        </h1>
        <p className="subtitle">
          <T k="hub.subtitle" />
        </p>
      </header>

      <div className="surface rounded-lg p-6 text-sm text-[var(--text-muted)]">
        <p className="mb-3">
          <strong className="text-[var(--text)]">
            <T k="hub.comingSoon.title" />
          </strong>
        </p>
        <p className="mb-4">
          <T k="hub.comingSoon.body" />
        </p>
        <p className="text-xs">
          <T k="hub.comingSoon.routes" />
          <code className="kbd ml-1">/packages</code>
          <code className="kbd ml-1">/forge</code>
          <code className="kbd ml-1">/capabilities</code>
          <code className="kbd ml-1">/tools</code>
        </p>
      </div>
    </div>
  );
}
