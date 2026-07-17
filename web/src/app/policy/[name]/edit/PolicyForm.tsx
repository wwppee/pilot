"use client";

/**
 * PolicyForm — the editable form for a ToolPolicy.
 *
 * v0.4.7: textarea-based editor.
 * v0.4.8: full accessibility pass — proper labels, aria-invalid,
 * aria-describedby for error states, aria-live status region.
 *
 * We replaced the native `confirm()` dialog with an inline two-step
 * confirm pattern (button → "Confirm delete?" → button) so the
 * deletion is accessible and doesn't trigger a system-modal dialog.
 *
 * v0.5.10+: section metadata is now i18n. SECTION_DEFS is a function
 * that resolves labels/hints/placeholders via the translator. Hint
 * is optional — fields without a hint (e.g. deny) get an empty hint.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, PilotApiError } from "../../../../lib/pilot-browser";
import type { ToolPolicy, ToolPolicyInput } from "../../../../lib/types";
import { useT } from "@/components/I18n";

interface PolicyFormProps {
  initialPolicy: ToolPolicy;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

type SectionDef = {
  field: keyof ToolPolicyInput;
  rows: number;
  /** Generate a stable id for label / input / describedby. */
  id: string;
  /** i18n key suffix for this field — keys always live under
   *  `policy.form.field.{suffix}.{legend,hint,placeholder}`. The
   *  hint key is optional (omit if the field has no hint). */
  i18nKey: string;
  /** hint present? When false, the hint JSX is skipped. */
  hasHint: boolean;
};

/**
 * Static section metadata. Localized strings live in the dict files
 * (`policy.form.field.{i18nKey}.{legend,hint,placeholder}`).
 */
const SECTION_DEFS: SectionDef[] = [
  {
    field: "allow",
    id: "policy-allow",
    i18nKey: "allow",
    hasHint: true,
    rows: 4,
  },
  { field: "deny", id: "policy-deny", i18nKey: "deny", hasHint: true, rows: 4 },
  {
    field: "denyPaths",
    id: "policy-denyPaths",
    i18nKey: "denyPaths",
    hasHint: true,
    rows: 4,
  },
  {
    field: "denyCommands",
    id: "policy-denyCommands",
    i18nKey: "denyCommands",
    hasHint: true,
    rows: 4,
  },
  {
    field: "sensitivePatterns",
    id: "policy-sensitivePatterns",
    i18nKey: "sensitivePatterns",
    hasHint: true,
    rows: 4,
  },
  {
    field: "requireApproval",
    id: "policy-requireApproval",
    i18nKey: "requireApproval",
    hasHint: true,
    rows: 3,
  },
];

export default function PolicyForm({ initialPolicy }: PolicyFormProps) {
  const router = useRouter();
  const t = useT();
  const [description, setDescription] = useState(
    initialPolicy.description ?? "",
  );
  // Map from field name → textarea value (one item per line)
  const [arrays, setArrays] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const def of SECTION_DEFS) {
      out[def.field] = (initialPolicy[def.field] as string[]).join("\n");
    }
    return out;
  });
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  // Two-step delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ruleCount = SECTION_DEFS.reduce(
    (sum, def) => sum + parseLines(arrays[def.field] ?? "").length,
    0,
  );

  const isDirty =
    description !== (initialPolicy.description ?? "") ||
    SECTION_DEFS.some(
      (def) =>
        arrays[def.field] !== (initialPolicy[def.field] as string[]).join("\n"),
    );

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });

    const input: ToolPolicyInput = {
      description: description.trim() || undefined,
      allow: parseLines(arrays.allow ?? ""),
      deny: parseLines(arrays.deny ?? ""),
      denyPaths: parseLines(arrays.denyPaths ?? ""),
      // v0.8.4: per-tool rules. The edit form doesn't
      // surface this yet (a future v0.8.5+ adds a
      // per-tool editor); we always send {} today.
      // Including the field keeps the type happy
      // until the editor grows.
      toolRules: {},
      denyCommands: parseLines(arrays.denyCommands ?? ""),
      sensitivePatterns: parseLines(arrays.sensitivePatterns ?? ""),
      requireApproval: parseLines(arrays.requireApproval ?? ""),
    };

    try {
      await api.setPolicy(initialPolicy.name, input);
      setSaveState({ kind: "saved", at: new Date().toISOString() });
      router.refresh();
    } catch (err) {
      setSaveState({
        kind: "error",
        message:
          err instanceof PilotApiError
            ? `${err.status}: ${err.message}`
            : (err as Error).message,
      });
    }
  }

  async function onApply(): Promise<void> {
    if (isDirty) {
      setApplyMessage(t("policy.form.saveFirstApply"));
      return;
    }
    setBusy(true);
    setApplyMessage(null);
    try {
      const { path } = await api.applyPolicy(initialPolicy.name);
      setApplyMessage(t("policy.form.extensionWrittenTo", { path }));
    } catch (err) {
      const msg =
        err instanceof PilotApiError ? err.message : (err as Error).message;
      setApplyMessage(t("policy.applyFailed", { msg }));
    } finally {
      setBusy(false);
    }
  }

  async function onUnapply(): Promise<void> {
    setBusy(true);
    setApplyMessage(null);
    try {
      const { removed } = await api.unapplyPolicy(initialPolicy.name);
      setApplyMessage(
        removed
          ? t("policy.form.extensionRemoved")
          : t("policy.form.extensionNotApplied"),
      );
    } catch (err) {
      const msg =
        err instanceof PilotApiError ? err.message : (err as Error).message;
      setApplyMessage(t("policy.unapplyFailed", { msg }));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(): Promise<void> {
    // Step 1 of 2-step confirm — the button toggles to "Confirm?"
    // Step 2 actually deletes
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      // Auto-revert after 5s if the user doesn't confirm
      setTimeout(() => setConfirmingDelete(false), 5000);
      return;
    }
    setConfirmingDelete(false);
    try {
      await api.deletePolicy(initialPolicy.name);
      router.push("/policy");
    } catch (err) {
      setSaveState({
        kind: "error",
        message:
          err instanceof PilotApiError
            ? `${err.status}: ${err.message}`
            : (err as Error).message,
      });
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="policy-edit-form"
      aria-label={t("policy.edit.ariaEdit", { name: initialPolicy.name })}
    >
      {/* ─── Status bar (live region) ────────────────────── */}
      <div className="policy-edit-status" data-state={saveState.kind}>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="policy-edit-status-msg"
        >
          {applyMessage && (
            <span
              className={
                applyMessage.includes("failed") ? "error small" : "ok small"
              }
            >
              {applyMessage}
            </span>
          )}
          {!applyMessage && saveState.kind === "idle" && !isDirty && (
            <span className="muted small">
              {t(
                ruleCount === 1
                  ? "policy.form.ruleCount.one"
                  : "policy.form.ruleCount.many",
                { n: ruleCount },
              )}
            </span>
          )}
          {!applyMessage && saveState.kind === "idle" && isDirty && (
            <span className="warn small">{t("status.unsaved")}</span>
          )}
          {!applyMessage && saveState.kind === "saving" && (
            <span className="muted small">{t("status.saving")}</span>
          )}
          {!applyMessage && saveState.kind === "saved" && (
            <span className="ok small">
              {t("policy.form.savedAt", {
                time: new Date(saveState.at).toLocaleTimeString(),
              })}
            </span>
          )}
          {saveState.kind === "error" && (
            <span className="error small" role="alert">
              {t("policy.form.errorPrefix", { msg: saveState.message })}
            </span>
          )}
        </p>
      </div>

      {/* ─── Description ─────────────────────────────────── */}
      <div className="policy-edit-section">
        <label htmlFor="policy-description">
          {t("policy.descriptionLabel")}
        </label>
        <input
          id="policy-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("policy.form.descriptionPlaceholder")}
          className="policy-edit-input"
        />
      </div>

      {/* ─── Rule array sections ─────────────────────────── */}
      {SECTION_DEFS.map((def) => {
        const inputId = `${def.id}-input`;
        const hintId = `${def.id}-hint`;
        const error =
          saveState.kind === "error" &&
          arrays[def.field] !==
            (initialPolicy[def.field] as string[]).join("\n");
        const fullLegend = t(`policy.form.field.${def.i18nKey}.legend`);
        // Strip the "{name} · " prefix from the legend — the
        // field-name badge renders that part separately as a colored
        // pill. We display only the descriptive suffix.
        const legendSuffix = fullLegend.includes("·")
          ? fullLegend.split("·").slice(1).join("·").trim()
          : fullLegend;
        const hint = t(`policy.form.field.${def.i18nKey}.hint`);
        const placeholder = t(`policy.form.field.${def.i18nKey}.placeholder`);
        return (
          <fieldset
            className="policy-edit-section"
            key={def.field}
            aria-describedby={hintId}
          >
            <legend>
              <span className={`rule-name ${ruleNameClass(def.field)}`}>
                {t(`policy.form.label.${ruleNameClass(def.field)}`)}
              </span>{" "}
              {legendSuffix}
            </legend>
            <label htmlFor={inputId} className="sr-only">
              {fullLegend}
            </label>
            <textarea
              id={inputId}
              value={arrays[def.field] ?? ""}
              onChange={(e) =>
                setArrays((a) => ({ ...a, [def.field]: e.target.value }))
              }
              placeholder={placeholder}
              rows={def.rows}
              className="policy-edit-textarea"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={hintId}
            />
            <p id={hintId} className="muted small">
              {hint}
            </p>
          </fieldset>
        );
      })}

      {/* ─── Actions ─────────────────────────────────────── */}
      <div
        className="policy-edit-actions"
        role="group"
        aria-label={t("btn.ariaFormActions")}
      >
        <button
          type="submit"
          className="btn"
          disabled={saveState.kind === "saving" || !isDirty}
        >
          {saveState.kind === "saving"
            ? t("btn.saving")
            : isDirty
              ? t("btn.save")
              : t("btn.saved")}
        </button>
        <a href="/policy" className="btn secondary">
          {t("btn.backToList")}
        </a>
        <span className="policy-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn secondary"
          onClick={onApply}
          disabled={busy || isDirty}
          title={t("btn.ariaApplyTitle")}
        >
          {t("btn.applyGenerate")}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onUnapply}
          disabled={busy}
          title={t("btn.ariaUnapplyTitle")}
        >
          {t("btn.unapply")}
        </button>
        <span className="policy-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className={`btn ${confirmingDelete ? "danger" : "secondary"}`}
          onClick={onDelete}
          disabled={busy}
          aria-label={
            confirmingDelete ? t("btn.ariaConfirmDelete") : t("btn.ariaDelete")
          }
        >
          {confirmingDelete ? t("btn.confirmDelete") : t("btn.delete")}
        </button>
      </div>
    </form>
  );
}

/**
 * Parse a textarea's value into an array of strings.
 * Empty lines and surrounding whitespace are dropped.
 */
function parseLines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Map a field name to its visual rule-name class. */
function ruleNameClass(field: string): string {
  switch (field) {
    case "deny":
      return "deny";
    case "allow":
      return "allow";
    case "denyPaths":
      return "paths";
    case "denyCommands":
      return "cmds";
    case "sensitivePatterns":
      return "redact";
    case "requireApproval":
      return "HITL";
    default:
      return "deny";
  }
}
