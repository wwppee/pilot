/**
 * /insight — v1.0.1: 7-module nav placeholder for the Insight module.
 *
 * Merges the 3 legacy observability surfaces: Observability (raw
 * tool-call records), Usage (today/week token + USD), Stats (top
 * tools, top models, error rates). v1.0.1 created the 7 routes;
 * v1.0.2 will collapse the 3 into one real-time dashboard.
 *
 * v1.0.2 will replace this stub with the real Insight module:
 *   - today's tokens / cost / tool calls / errors at a glance
 *   - by-model + by-tool breakdown with click-to-drill-down
 *   - alert rules ("pause session if cost > $1 / hour")
 *   - call-chain trace (session → tool → file → diff)
 */
import { T } from "@/components/I18n";
export const dynamic = "force-dynamic";

export default function InsightPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="insight.h1" />
        </h1>
        <p className="subtitle">
          <T k="insight.subtitle" />
        </p>
      </header>

      <div className="surface rounded-lg p-6 text-sm text-[var(--text-muted)]">
        <p className="mb-3">
          <strong className="text-[var(--text)]">
            <T k="insight.comingSoon.title" />
          </strong>
        </p>
        <p className="mb-4">
          <T k="insight.comingSoon.body" />
        </p>
        <p className="text-xs">
          <T k="insight.comingSoon.routes" />
          <code className="kbd ml-1">/observability</code>
          <code className="kbd ml-1">/usage</code>
        </p>
      </div>
    </div>
  );
}
