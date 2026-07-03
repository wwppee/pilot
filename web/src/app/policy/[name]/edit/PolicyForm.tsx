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
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, PilotApiError } from "../../../../lib/pilot-browser";
import type { ToolPolicy, ToolPolicyInput } from "../../../../lib/types";

interface PolicyFormProps {
  initialPolicy: ToolPolicy;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

const SECTION_DEFS: Array<{
  field: keyof ToolPolicyInput;
  legend: string;
  hint: string;
  rows: number;
  placeholder: string;
  /** Generate a stable id for label / input / describedby. */
  id: string;
}> = [
  {
    field: "allow",
    id: "policy-allow",
    legend: "allow · exclusive allowlist (only these tools may run)",
    hint: "Leave empty to allow all (modulo deny). If non-empty, only these tools work.",
    rows: 4,
    placeholder: "read\nls",
  },
  {
    field: "deny",
    id: "policy-deny",
    legend: "deny · tools that cannot be called",
    hint: "deny wins over allow. One tool name per line.",
    rows: 4,
    placeholder: "bash\nwrite\nedit",
  },
  {
    field: "denyPaths",
    id: "policy-denyPaths",
    legend: "denyPaths · glob patterns for read / edit / write",
    hint: "Globs: * = any chars except /, ** = any path segments.",
    rows: 4,
    placeholder: "**/.env\n**/.env.*\n/etc/**",
  },
  {
    field: "denyCommands",
    id: "policy-denyCommands",
    legend: "denyCommands · regex for bash commands to block",
    hint: "JavaScript regex syntax. Backslashes must be doubled in TOML.",
    rows: 4,
    placeholder: "^rm\\s+-rf\\s+/\n^mkfs",
  },
  {
    field: "sensitivePatterns",
    id: "policy-sensitivePatterns",
    legend: "sensitivePatterns · redact from tool results",
    hint: "Used as regex when valid; substring otherwise. Common: API keys, passwords.",
    rows: 4,
    placeholder: "sk-[A-Za-z0-9]{20,}\nghp_[A-Za-z0-9]{20,}",
  },
  {
    field: "requireApproval",
    id: "policy-requireApproval",
    legend: "requireApproval · tools that pause for human confirmation",
    hint: "Triggers ctx.ui.confirm() in the generated extension before the tool runs.",
    rows: 3,
    placeholder: "bash\nwrite",
  },
];

export default function PolicyForm({
  initialPolicy,
}: PolicyFormProps) {
  const router = useRouter();
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
      setApplyMessage("Save changes first, then apply.");
      return;
    }
    setBusy(true);
    setApplyMessage(null);
    try {
      const { path } = await api.applyPolicy(initialPolicy.name);
      setApplyMessage(`Extension written to ${path}`);
    } catch (err) {
      setApplyMessage(
        `Apply failed: ${
          err instanceof PilotApiError ? err.message : (err as Error).message
        }`,
      );
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
        removed ? "Extension removed" : "Extension was not applied",
      );
    } catch (err) {
      setApplyMessage(
        `Unapply failed: ${
          err instanceof PilotApiError ? err.message : (err as Error).message
        }`,
      );
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
      aria-label={`Edit policy ${initialPolicy.name}`}
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
              {ruleCount} rule{ruleCount === 1 ? "" : "s"}
            </span>
          )}
          {!applyMessage && saveState.kind === "idle" && isDirty && (
            <span className="warn small">Unsaved changes</span>
          )}
          {!applyMessage && saveState.kind === "saving" && (
            <span className="muted small">Saving…</span>
          )}
          {!applyMessage && saveState.kind === "saved" && (
            <span className="ok small">
              ✓ Saved at {new Date(saveState.at).toLocaleTimeString()}
            </span>
          )}
          {saveState.kind === "error" && (
            <span className="error small" role="alert">
              Error: {saveState.message}
            </span>
          )}
        </p>
      </div>

      {/* ─── Description ─────────────────────────────────── */}
      <div className="policy-edit-section">
        <label htmlFor="policy-description">Description</label>
        <input
          id="policy-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line summary of what this policy enforces"
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
        return (
          <fieldset
            className="policy-edit-section"
            key={def.field}
            aria-describedby={hintId}
          >
            <legend>
              <span className={`rule-name ${ruleNameClass(def.field)}`}>
                {def.field}
              </span>{" "}
              {def.legend.split("·").slice(1).join("·").trim()}
            </legend>
            <label htmlFor={inputId} className="sr-only">
              {def.legend}
            </label>
            <textarea
              id={inputId}
              value={arrays[def.field] ?? ""}
              onChange={(e) =>
                setArrays((a) => ({ ...a, [def.field]: e.target.value }))
              }
              placeholder={def.placeholder}
              rows={def.rows}
              className="policy-edit-textarea"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={hintId}
            />
            <p id={hintId} className="muted small">
              {def.hint}
            </p>
          </fieldset>
        );
      })}

      {/* ─── Actions ─────────────────────────────────────── */}
      <div
        className="policy-edit-actions"
        role="group"
        aria-label="Form actions"
      >
        <button
          type="submit"
          className="btn"
          disabled={saveState.kind === "saving" || !isDirty}
        >
          {saveState.kind === "saving"
            ? "Saving…"
            : isDirty
              ? "Save changes"
              : "Saved"}
        </button>
        <a href="/policy" className="btn secondary">
          Back to list
        </a>
        <span className="policy-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn secondary"
          onClick={onApply}
          disabled={busy || isDirty}
          title="Generate ~/.pilot/extensions/pilot-policy-<name>.ts and have pi load it"
        >
          Apply (generate extension)
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onUnapply}
          disabled={busy}
          title="Remove the generated extension"
        >
          Unapply
        </button>
        <span className="policy-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className={`btn ${confirmingDelete ? "danger" : "secondary"}`}
          onClick={onDelete}
          disabled={busy}
          aria-label={
            confirmingDelete
              ? "Confirm delete policy (click again to delete)"
              : "Delete this policy"
          }
        >
          {confirmingDelete ? "Confirm delete?" : "Delete"}
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
