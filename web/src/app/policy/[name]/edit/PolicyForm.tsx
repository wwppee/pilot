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
 *
 * v0.8.6: per-tool rules editor. v0.8.0 added the
 * `toolRules` schema, v0.8.4 added the read-only viewer
 * on the policy list — this release finishes the loop by
 * making per-tool rules editable from the same form. The
 * dashboard can now be the single source of truth for both
 * global and per-tool rules.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, PilotApiError } from "../../../../lib/pilot-browser";
import type {
  PerToolRule,
  ToolPolicy,
  ToolPolicyInput,
} from "../../../../lib/types";
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
  // v0.8.6: per-tool rules as a list of rows (one row = one
  // tool). Each row carries 4 textarea values keyed by the
  // PerToolRule sub-field. We render as a list (rather than a
  // nested record) because the user needs to add/remove whole
  // tool rows, and a flat list is the natural form for that.
  // On save we collapse it back into `Record<tool, PerToolRule>`.
  const [toolRuleRows, setToolRuleRows] = useState<
    { tool: string; values: Record<keyof PerToolRule, string> }[]
  >(() => {
    return Object.entries(initialPolicy.toolRules).map(([tool, rule]) => ({
      tool,
      values: {
        deny: rule.deny.join("\n"),
        requireApproval: rule.requireApproval.join("\n"),
        denyPaths: rule.denyPaths.join("\n"),
        denyCommands: rule.denyCommands.join("\n"),
      },
    }));
  });
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  // Two-step delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ruleCount = SECTION_DEFS.reduce(
    (sum, def) => sum + parseLines(arrays[def.field] ?? "").length,
    0,
  ) + toolRuleRows.length;

  // v0.8.6: dirty check must also catch per-tool rule
  // edits. The comparison serializes each row into the
  // same shape we'll send on save, then string-compares
  // against the serialized initial policy.
  const initialToolRulesSerialized = JSON.stringify(
    Object.entries(initialPolicy.toolRules)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tool, rule]) => [tool, rule.deny, rule.requireApproval, rule.denyPaths, rule.denyCommands]),
  );
  const currentToolRulesSerialized = JSON.stringify(
    toolRuleRows
      .map((row) => [
        row.tool,
        parseLines(row.values.deny),
        parseLines(row.values.requireApproval),
        parseLines(row.values.denyPaths),
        parseLines(row.values.denyCommands),
      ])
      // v0.8.6: rows with empty tool name AND empty
      // sub-fields are silently dropped (the user hasn't
      // committed to anything yet). We exclude them from
      // the dirty comparison so adding a row and then
      // removing it doesn't leave a phantom dirty state.
      .filter(
        ([tool, deny, ra, dp, dc]) =>
          (tool as string).length > 0 ||
          (deny as string[]).length > 0 ||
          (ra as string[]).length > 0 ||
          (dp as string[]).length > 0 ||
          (dc as string[]).length > 0,
      )
      .sort(([a], [b]) => (a as string).localeCompare(b as string)),
  );

  const isDirty =
    description !== (initialPolicy.description ?? "") ||
    SECTION_DEFS.some(
      (def) =>
        arrays[def.field] !== (initialPolicy[def.field] as string[]).join("\n"),
    ) ||
    currentToolRulesSerialized !== initialToolRulesSerialized;

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });

    const input: ToolPolicyInput = {
      description: description.trim() || undefined,
      allow: parseLines(arrays.allow ?? ""),
      deny: parseLines(arrays.deny ?? ""),
      denyPaths: parseLines(arrays.denyPaths ?? ""),
      // v0.8.6: per-tool rules now editable. We collapse
      // the list-of-rows state into `Record<tool, PerToolRule>`,
      // dropping rows with empty tool names (no commit yet)
      // and any tool whose 4 sub-fields are all empty (no
      // override to apply — the global rules still govern it).
      toolRules: toolRuleRows.reduce<Record<string, PerToolRule>>(
        (acc, row) => {
          const tool = row.tool.trim();
          if (tool.length === 0) return acc;
          const rule: PerToolRule = {
            deny: parseLines(row.values.deny),
            requireApproval: parseLines(row.values.requireApproval),
            denyPaths: parseLines(row.values.denyPaths),
            denyCommands: parseLines(row.values.denyCommands),
          };
          // Skip empty overrides — global rules cover that case
          // and persisting { deny: [], requireApproval: [], ... }
          // adds noise to the TOML.
          if (
            rule.deny.length === 0 &&
            rule.requireApproval.length === 0 &&
            rule.denyPaths.length === 0 &&
            rule.denyCommands.length === 0
          ) {
            return acc;
          }
          acc[tool] = rule;
          return acc;
        },
        {},
      ),
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

      {/* ─── Per-tool rules (v0.8.6) ──────────────────────── */}
      <PerToolRulesEditor
        rows={toolRuleRows}
        onChange={setToolRuleRows}
        t={t}
      />

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

// ─── PerToolRulesEditor (v0.8.6) ──────────────────────────────

/**
 * Editor for the per-tool rule overrides. Each row = one tool
 * name + four textareas (deny / requireApproval / denyPaths /
 * denyCommands). The user can add new rows (with an inline
 * tool-name input) or remove existing ones. State stays as a
 * flat list of `{tool, values}` — the parent collapses it into
 * `Record<tool, PerToolRule>` on save.
 *
 * Why a flat list and not a record directly? The user needs to
 * (a) add a new row without picking a tool name up front (they
 * might want to fill in the rules first), and (b) reorder /
 * remove rows. A record forces a fixed key set; a list lets
 * the user stage changes.
 *
 * a11y: each row's tool-name input has a stable id derived
 * from its index. The "remove" button uses the row's tool
 * name in its aria-label so screen readers can announce
 * which row is being removed.
 */
type ToolRuleRow = {
  tool: string;
  values: Record<keyof PerToolRule, string>;
};

function PerToolRulesEditor({
  rows,
  onChange,
  t,
}: {
  rows: ToolRuleRow[];
  onChange: (rows: ToolRuleRow[]) => void;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  function addRow(): void {
    onChange([...rows, { tool: "", values: emptyRowValues() }]);
  }
  function removeRow(index: number): void {
    onChange(rows.filter((_, i) => i !== index));
  }
  function updateRow(
    index: number,
    patch: Partial<{ tool: string; values: Partial<ToolRuleRow["values"]> }>,
  ): void {
    onChange(
      rows.map((row, i) => {
        if (i !== index) return row;
        return {
          tool: patch.tool ?? row.tool,
          values: { ...row.values, ...(patch.values ?? {}) },
        };
      }),
    );
  }

  return (
    <fieldset
      className="policy-edit-section"
      data-testid="policy-tool-rules-section"
    >
      <legend>{t("policy.form.toolRules.legend")}</legend>
      <p className="muted small">{t("policy.form.toolRules.hint")}</p>
      {rows.length === 0 ? (
        <p className="hint small" data-testid="policy-tool-rules-empty">
          {t("policy.form.toolRules.empty")}
        </p>
      ) : (
        <ul
          className="policy-tool-rule-rows"
          data-testid="policy-tool-rule-rows"
        >
          {rows.map((row, index) => {
            const toolInputId = `tool-rule-tool-${index}`;
            return (
              <li
                key={index}
                className="policy-tool-rule-row"
                data-testid={`policy-tool-rule-row-${index}`}
              >
                <div className="policy-tool-rule-row-header">
                  <label htmlFor={toolInputId} className="policy-tool-rule-tool-label">
                    {t("policy.form.toolRules.toolNameLabel")}
                  </label>
                  <input
                    id={toolInputId}
                    type="text"
                    value={row.tool}
                    onChange={(e) =>
                      updateRow(index, { tool: e.target.value })
                    }
                    placeholder={t(
                      "policy.form.toolRules.toolNamePlaceholder",
                    )}
                    aria-label={t(
                      "policy.form.toolRules.toolNameAriaLabel",
                      { n: index + 1 },
                    )}
                    className="policy-edit-input"
                    data-testid={`policy-tool-rule-tool-${index}`}
                  />
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => removeRow(index)}
                    aria-label={
                      row.tool
                        ? `${t("policy.form.toolRules.removeTool")} ${row.tool}`
                        : t("policy.form.toolRules.removeTool")
                    }
                    data-testid={`policy-tool-rule-remove-${index}`}
                  >
                    {t("policy.form.toolRules.removeTool")}
                  </button>
                </div>
                <div className="policy-tool-rule-row-fields">
                  <ToolRuleSubField
                    index={index}
                    field="deny"
                    labelKey="policy.form.toolRules.field.deny.label"
                    value={row.values.deny}
                    onChange={(v) => updateRow(index, { values: { deny: v } })}
                    t={t}
                  />
                  <ToolRuleSubField
                    index={index}
                    field="requireApproval"
                    labelKey="policy.form.toolRules.field.requireApproval.label"
                    value={row.values.requireApproval}
                    onChange={(v) =>
                      updateRow(index, { values: { requireApproval: v } })
                    }
                    t={t}
                  />
                  <ToolRuleSubField
                    index={index}
                    field="denyPaths"
                    labelKey="policy.form.toolRules.field.denyPaths.label"
                    value={row.values.denyPaths}
                    onChange={(v) =>
                      updateRow(index, { values: { denyPaths: v } })
                    }
                    t={t}
                  />
                  <ToolRuleSubField
                    index={index}
                    field="denyCommands"
                    labelKey="policy.form.toolRules.field.denyCommands.label"
                    value={row.values.denyCommands}
                    onChange={(v) =>
                      updateRow(index, { values: { denyCommands: v } })
                    }
                    t={t}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="btn secondary small"
        onClick={addRow}
        data-testid="policy-tool-rule-add"
      >
        {t("policy.form.toolRules.addTool")}
      </button>
    </fieldset>
  );
}

/** One sub-field (deny / requireApproval / …) inside a tool rule row. */
function ToolRuleSubField({
  index,
  field,
  labelKey,
  value,
  onChange,
  t,
}: {
  index: number;
  field: keyof PerToolRule;
  labelKey: string;
  value: string;
  onChange: (next: string) => void;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  const id = `tool-rule-${field}-${index}`;
  return (
    <div className="policy-tool-rule-subfield">
      <label htmlFor={id} className="muted small">
        {t(labelKey)}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="policy-edit-textarea"
        data-testid={`policy-tool-rule-${field}-${index}`}
      />
    </div>
  );
}

function emptyRowValues(): Record<keyof PerToolRule, string> {
  return {
    deny: "",
    requireApproval: "",
    denyPaths: "",
    denyCommands: "",
  };
}
