"use client";

/**
 * PolicyForm — the editable form for a ToolPolicy.
 *
 * v0.4.7: textarea-based editor. One section per field. Save button
 * calls PUT /policies/:name; success → show confirmation + link back
 * to /policy. Failure → keep edits, show error.
 *
 * State management:
 *   - Local useState per field (description + 6 arrays)
 *   - dirty flag tracked via comparing initial vs current
 *   - submit calls setPolicy; on success, refetch and show updated
 *
 * Sections:
 *   - description         single-line text
 *   - allow / deny        tool names (e.g. "bash", "write")
 *   - denyPaths           glob patterns (e.g. ".X/.env", "/etc/X")
 *   - denyCommands        regex patterns (e.g. "^rm\\s+-rf\\s+/")
 *   - sensitivePatterns   regex / substring (e.g. "sk-[A-Za-z0-9]+")
 *   - requireApproval     tool names
 *
 * Each array is edited as a textarea (one item per line). Empty
 * lines are dropped on save.
 *
 * (We use `X` instead of `*` in glob examples above because the
 *  TypeScript JSDoc parser treats `**` as a comment terminator.)
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

export default function PolicyForm({
  initialPolicy,
}: PolicyFormProps): JSX.Element {
  const router = useRouter();
  const [description, setDescription] = useState(
    initialPolicy.description ?? "",
  );
  const [allow, setAllow] = useState(initialPolicy.allow.join("\n"));
  const [deny, setDeny] = useState(initialPolicy.deny.join("\n"));
  const [denyPaths, setDenyPaths] = useState(
    initialPolicy.denyPaths.join("\n"),
  );
  const [denyCommands, setDenyCommands] = useState(
    initialPolicy.denyCommands.join("\n"),
  );
  const [sensitivePatterns, setSensitivePatterns] = useState(
    initialPolicy.sensitivePatterns.join("\n"),
  );
  const [requireApproval, setRequireApproval] = useState(
    initialPolicy.requireApproval.join("\n"),
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  // Compute total rule count for the summary chip
  const ruleCount = [
    allow,
    deny,
    denyPaths,
    denyCommands,
    sensitivePatterns,
    requireApproval,
  ]
    .map((s) => parseLines(s).length)
    .reduce((a, b) => a + b, 0);

  // Detect dirty state — any field differs from initial
  const isDirty =
    description !== (initialPolicy.description ?? "") ||
    allow !== initialPolicy.allow.join("\n") ||
    deny !== initialPolicy.deny.join("\n") ||
    denyPaths !== initialPolicy.denyPaths.join("\n") ||
    denyCommands !== initialPolicy.denyCommands.join("\n") ||
    sensitivePatterns !== initialPolicy.sensitivePatterns.join("\n") ||
    requireApproval !== initialPolicy.requireApproval.join("\n");

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });

    const input: ToolPolicyInput = {
      description: description.trim() || undefined,
      allow: parseLines(allow),
      deny: parseLines(deny),
      denyPaths: parseLines(denyPaths),
      denyCommands: parseLines(denyCommands),
      sensitivePatterns: parseLines(sensitivePatterns),
      requireApproval: parseLines(requireApproval),
    };

    try {
      await api.setPolicy(initialPolicy.name, input);
      setSaveState({ kind: "saved", at: new Date().toISOString() });
      // Refresh the server-side props so the back-link shows new state
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

  async function onDelete(): Promise<void> {
    if (
      !confirm(
        `Delete policy "${initialPolicy.name}"? This removes the TOML file. The generated extension (if applied) stays until you unapply it.`,
      )
    ) {
      return;
    }
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

  async function onApply(): Promise<void> {
    if (isDirty) {
      alert("Save changes first, then apply.");
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

  return (
    <form onSubmit={onSave} className="policy-edit-form">
      {/* ─── Status bar ─────────────────────────────────────── */}
      <div className="policy-edit-status" data-state={saveState.kind}>
        {applyMessage && (
          <span
            className={
              applyMessage.includes("failed") ? "error small" : "ok small"
            }
          >
            {applyMessage}
          </span>
        )}
        {saveState.kind === "idle" && !isDirty && !applyMessage && (
          <span className="muted small">
            {ruleCount} rule{ruleCount === 1 ? "" : "s"}
          </span>
        )}
        {saveState.kind === "idle" && isDirty && (
          <span className="warn small">Unsaved changes</span>
        )}
        {saveState.kind === "saving" && (
          <span className="muted small">Saving…</span>
        )}
        {saveState.kind === "saved" && (
          <span className="ok small">
            ✓ Saved at {new Date(saveState.at).toLocaleTimeString()}
          </span>
        )}
        {saveState.kind === "error" && (
          <span className="error small">Error: {saveState.message}</span>
        )}
      </div>

      {/* ─── Description ────────────────────────────────────── */}
      <fieldset className="policy-edit-section">
        <legend>Description</legend>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line summary of what this policy enforces"
          className="policy-edit-input"
        />
      </fieldset>

      {/* ─── Tool name arrays ───────────────────────────────── */}
      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name deny">deny</span> · tools that cannot be
          called
        </legend>
        <textarea
          value={deny}
          onChange={(e) => setDeny(e.target.value)}
          placeholder={"bash\nwrite\nedit"}
          rows={4}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          One tool name per line (e.g. <code>bash</code>, <code>write</code>).
          deny wins over allow.
        </p>
      </fieldset>

      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name allow">allow</span> · exclusive allowlist
          (only these tools may run; everything else blocked)
        </legend>
        <textarea
          value={allow}
          onChange={(e) => setAllow(e.target.value)}
          placeholder={"read\nls"}
          rows={4}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          Leave empty to allow all (modulo deny). If non-empty, only these tools
          work — everything else is blocked.
        </p>
      </fieldset>

      {/* ─── Path / command / pattern arrays ────────────────── */}
      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name paths">denyPaths</span> · glob patterns for
          read/edit/write
        </legend>
        <textarea
          value={denyPaths}
          onChange={(e) => setDenyPaths(e.target.value)}
          placeholder={"**/.env\n**/.env.*\n/etc/**\n**/secrets.json"}
          rows={4}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          Globs: <code>*</code> = any chars except <code>/</code>,{" "}
          <code>**</code> = any path segments. Examples: <code>**/.env</code>,{" "}
          <code>/etc/**</code>, <code>**/id_rsa</code>.
        </p>
      </fieldset>

      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name cmds">denyCommands</span> · regex for bash
          commands to block
        </legend>
        <textarea
          value={denyCommands}
          onChange={(e) => setDenyCommands(e.target.value)}
          placeholder={"^rm\\s+-rf\\s+/\n^mkfs\ndd\\s+if=.*of=/dev/(sd|nvme)"}
          rows={4}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          JavaScript regex syntax. Backslashes must be doubled in TOML (e.g.{" "}
          <code>^rm\\s+-rf\\s+/</code>). Invalid regexes are skipped silently.
        </p>
      </fieldset>

      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name redact">sensitivePatterns</span> · redact
          from tool results
        </legend>
        <textarea
          value={sensitivePatterns}
          onChange={(e) => setSensitivePatterns(e.target.value)}
          placeholder={
            "sk-[A-Za-z0-9]{20,}\nghp_[A-Za-z0-9]{20,}\nAKIA[0-9A-Z]{16}"
          }
          rows={4}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          Used as regex when valid; substring otherwise. Common: API keys
          (sk-/gho-/ghp-/AKIA), passwords (<code>password=\S+</code>).
        </p>
      </fieldset>

      <fieldset className="policy-edit-section">
        <legend>
          <span className="rule-name HITL">requireApproval</span> · tools that
          pause for human confirmation
        </legend>
        <textarea
          value={requireApproval}
          onChange={(e) => setRequireApproval(e.target.value)}
          placeholder={"bash\nwrite"}
          rows={3}
          className="policy-edit-textarea"
          spellCheck={false}
        />
        <p className="muted small">
          Triggers <code>ctx.ui.confirm()</code> in the generated extension
          before the tool runs. User can deny; we then block.
        </p>
      </fieldset>

      {/* ─── Actions ─────────────────────────────────────────── */}
      <div className="policy-edit-actions">
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
          Back
        </a>
        <span className="policy-edit-divider" />
        <button
          type="button"
          className="btn secondary"
          onClick={onApply}
          disabled={busy}
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
        <span className="policy-edit-divider" />
        <button
          type="button"
          className="btn danger"
          onClick={onDelete}
          aria-label="Delete policy"
        >
          Delete
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
