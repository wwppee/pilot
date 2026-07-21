/**
 * <ContextRulesEditor> — v1.1.1: client form for editing
 * the context discovery rules. Three textareas (filenames
 * / searchPaths / infoFiles), each parsed as a JSON string[].
 * On Save, POSTs to /context-rules; on revert, restores
 * the pre-mount values.
 *
 * Field-level validation runs in real time: the Save button
 * is disabled if any textarea doesn't parse. Inline error
 * rows surface the per-field message.
 */
"use client";

import { useState } from "react";
import { T } from "./I18n";
import { renderT, type Locale } from "@/lib/i18n";

interface ContextRules {
  filenames: string[];
  searchPaths: string[];
  infoFiles: string[];
}

export function ContextRulesEditor({
  initial,
  locale: _locale,
}: {
  initial: ContextRules;
  locale: Locale;
}) {
  const [filenames, setFilenames] = useState(
    JSON.stringify(initial.filenames, null, 2),
  );
  const [searchPaths, setSearchPaths] = useState(
    JSON.stringify(initial.searchPaths, null, 2),
  );
  const [infoFiles, setInfoFiles] = useState(
    JSON.stringify(initial.infoFiles, null, 2),
  );
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    filenames !== JSON.stringify(initial.filenames, null, 2) ||
    searchPaths !== JSON.stringify(initial.searchPaths, null, 2) ||
    infoFiles !== JSON.stringify(initial.infoFiles, null, 2);

  function parseOrNull(text: string): string[] | null {
    try {
      const v = JSON.parse(text);
      if (!Array.isArray(v)) return null;
      if (v.length === 0) return null;
      if (v.some((s) => typeof s !== "string" || s.length === 0)) return null;
      return v as string[];
    } catch {
      return null;
    }
  }

  const filenamesValid = parseOrNull(filenames) !== null;
  const searchPathsValid = parseOrNull(searchPaths) !== null;
  const infoFilesValid = parseOrNull(infoFiles) !== null;
  const allValid = filenamesValid && searchPathsValid && infoFilesValid;

  async function handleSave() {
    if (!allValid) {
      setError("All three fields must be non-empty string arrays.");
      return;
    }
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/pilot/context-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filenames: parseOrNull(filenames),
          searchPaths: parseOrNull(searchPaths),
          infoFiles: parseOrNull(infoFiles),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setSavedAt(new Date().toLocaleTimeString());
      setPending(false);
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  function handleRevert() {
    setFilenames(JSON.stringify(initial.filenames, null, 2));
    setSearchPaths(JSON.stringify(initial.searchPaths, null, 2));
    setInfoFiles(JSON.stringify(initial.infoFiles, null, 2));
    setError(null);
    setSavedAt(null);
  }

  return (
    <div className="space-y-6 context-page">
      <header>
        <h1 className="hub-h1">
          <T k="context.editRules.h1" />
        </h1>
        <p className="hub-subtitle">
          <T k="context.editRules.subtitle" />
        </p>
      </header>

      <div className="context-editor">
        <Field
          label={renderT(_locale, "context.editRules.filenames.label")}
          hint={renderT(_locale, "context.editRules.filenames.hint")}
          value={filenames}
          onChange={setFilenames}
          valid={filenamesValid}
        />
        <Field
          label={renderT(_locale, "context.editRules.searchPaths.label")}
          hint={renderT(_locale, "context.editRules.searchPaths.hint")}
          value={searchPaths}
          onChange={setSearchPaths}
          valid={searchPathsValid}
        />
        <Field
          label={renderT(_locale, "context.editRules.infoFiles.label")}
          hint={renderT(_locale, "context.editRules.infoFiles.hint")}
          value={infoFiles}
          onChange={setInfoFiles}
          valid={infoFilesValid}
        />
      </div>

      <div className="context-editor-footer">
        <div className="context-editor-status">
          {pending && (
            <span className="hub-link">
              <T k="context.edit.saving" />
            </span>
          )}
          {!pending && savedAt && (
            <span className="context-editor-saved">
              <T k="context.edit.savedAt" /> {savedAt}
            </span>
          )}
          {error && <span className="context-editor-error">{error}</span>}
          {!pending && !savedAt && !error && dirty && (
            <span className="context-editor-dirty">
              <T k="context.edit.unsaved" />
            </span>
          )}
        </div>
        <div className="context-editor-actions">
          {dirty && (
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
            disabled={!dirty || !allValid || pending}
          >
            {pending ? "…" : renderT(_locale, "context.edit.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  valid,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
        {label}
      </label>
      <p className="text-xs text-[var(--color-muted)] mb-2">{hint}</p>
      <textarea
        className="context-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        spellCheck={false}
        style={valid ? undefined : { borderColor: "var(--state-error)" }}
      />
      {!valid && (
        <p className="text-xs text-[var(--state-error)] mt-1">
          Must be a non-empty JSON array of strings.
        </p>
      )}
    </div>
  );
}
