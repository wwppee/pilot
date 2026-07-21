/**
 * <HubToolRow> — v1.0.4: one tool in the Hub Tools section.
 *
 * Renders a `ToolInventoryItem` (built-in / npm / extension)
 * with a toggle on the right. The toggle calls
 * `api.toggleTool(name, enabled)` which writes
 * `~/.pilot/tools-state.json` (server side).
 *
 * Visual: matches the other Hub rows — dark surface, cyan
 * left accent when enabled, dim border when disabled.
 * The toggle itself is a CSS-only switch (no JS state
 * library) to keep the surface self-contained.
 */
"use client";

import { useState } from "react";
import { T } from "./I18n";
import { renderT, type Locale } from "@/lib/i18n";
import type { ToolInventoryItem } from "@/lib/types";

const SAFETY_LABEL_KEY: Record<ToolInventoryItem["safety"], string> = {
  read: "hub.tool.safety.read",
  write: "hub.tool.safety.write",
  exec: "hub.tool.safety.exec",
  network: "hub.tool.safety.network",
  secret: "hub.tool.safety.secret",
};

const SOURCE_LABEL_KEY: Record<ToolInventoryItem["source"], string> = {
  "built-in": "hub.tool.source.built-in",
  npm: "hub.tool.source.npm",
  extension: "hub.tool.source.extension",
};

export function HubToolRow({
  tool,
  locale,
}: {
  tool: ToolInventoryItem;
  locale: Locale;
}) {
  const [enabled, setEnabled] = useState(tool.enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !enabled;
    setPending(true);
    setError(null);
    // Optimistic update — flip the visual immediately, roll
    // back on failure. Tool toggles are user-initiated and
    // low-stakes so optimistic UI is safe here.
    setEnabled(next);
    try {
      const res = await fetch(
        `/api/pilot/tools/${encodeURIComponent(tool.name)}/toggle`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setEnabled(!next); // rollback
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`hub-row ${enabled ? "hub-row--enabled" : "hub-row--disabled"}`}
    >
      <div className="hub-row-main">
        <div className="hub-row-name">
          {tool.name}
          <span className="hub-pill hub-pill--info">
            {renderT(locale, SOURCE_LABEL_KEY[tool.source])}
          </span>
          <span className="hub-pill hub-pill--warning">
            {renderT(locale, SAFETY_LABEL_KEY[tool.safety])}
          </span>
        </div>
        <div className="hub-row-desc">{tool.description}</div>
        {tool.packageName && tool.packageName !== tool.name && (
          <div className="hub-row-meta">
            <span className="hub-row-meta-item hub-row-meta-mono">
              {tool.packageName}
            </span>
          </div>
        )}
        {error && <div className="hub-row-error">{error}</div>}
      </div>
      <div className="hub-row-actions">
        <label className="hub-toggle" aria-label={tool.name}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={handleToggle}
            aria-busy={pending}
          />
          <span className="hub-toggle-track">
            <span className="hub-toggle-thumb" />
          </span>
        </label>
        {/* v1.0.4: a11y — the toggle's *meaning* isn't
            obvious without a label, so the visible state is
            repeated next to it for screen readers (sr-only)
            and for sighted users in case the toggle is
            ambiguous. */}
        <span className="hub-toggle-label">
          {enabled ? (
            <T k="hub.tool.enabled" />
          ) : (
            <T k="hub.tool.disabled" />
          )}
        </span>
      </div>
    </div>
  );
}
