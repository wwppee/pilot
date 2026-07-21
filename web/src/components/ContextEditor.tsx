/**
 * <ContextEditor> — v1.0.3: editable textarea for one context file.
 *
 * Client component. Holds the in-flight content in local state so
 * the textarea is controlled; on Save, calls
 * `api.writeContextFile(cwd, path, content)`. Surfaces success
 * ("saved at 12:34:56") and error states inline.
 *
 * Informational files (README.md etc., `loaded: false`) are
 * displayed but the textarea + Save button are disabled —
 * Pilot surfaces them for visibility but doesn't author them.
 *
 * Visual: matches the Hub page tokens (Dark Sci-Fi Tech from
 * `pilot-webui-redesign`). The textarea gets the cyan focus
 * ring; the Save button is the primary button; the Cancel
 * button is the ghost button.
 */
"use client";

import { useState } from "react";
import { T } from "./I18n";
import { renderT, type Locale } from "@/lib/i18n";

export function ContextEditor({
  initialContent,
  path,
  cwd,
  writable,
  locale: _locale,
}: {
  initialContent: string;
  path: string;
  cwd: string;
  /** True for loaded files (AGENTS.md / CLAUDE.md family).
   *  False for informational files — read-only. */
  writable: boolean;
  locale: Locale;
}) {
  const [content, setContent] = useState(initialContent);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== initialContent;

  async function handleSave() {
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/pilot/context/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cwd, path, content }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      // On success, lock the dirty state so the user has to
      // type again to re-enable Save.
      setSavedAt(new Date().toLocaleTimeString());
      setPending(false);
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  function handleRevert() {
    setContent(initialContent);
    setError(null);
    setSavedAt(null);
  }

  return (
    <div className="context-editor">
      {!writable && (
        <div className="context-editor-banner">
          <T k="context.edit.readonly" />
        </div>
      )}

      <textarea
        className="context-editor-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={!writable || pending}
        spellCheck={false}
        rows={20}
        aria-label="context file content"
      />

      <div className="context-editor-footer">
        <div className="context-editor-status">
          {pending && <span className="hub-link"><T k="context.edit.saving" /></span>}
          {!pending && savedAt && (
            <span className="hub-link context-editor-saved">
              <T k="context.edit.savedAt" /> {savedAt}
            </span>
          )}
          {error && (
            <span className="context-editor-error">{error}</span>
          )}
          {!pending && !savedAt && !error && dirty && (
            <span className="context-editor-dirty">
              <T k="context.edit.unsaved" />
            </span>
          )}
        </div>
        <div className="context-editor-actions">
          {dirty && writable && (
            <button
              type="button"
              className="hub-btn hub-btn--ghost"
              onClick={handleRevert}
              disabled={pending}
            >
              {renderT(_locale, "context.edit.revert")}
            </button>
          )}
          <button
            type="button"
            className="hub-btn hub-btn--primary"
            onClick={handleSave}
            disabled={!writable || !dirty || pending}
          >
            {pending ? "…" : renderT(_locale, "context.edit.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
