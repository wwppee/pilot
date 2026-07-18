"use client";

/**
 * v0.9.3: <WrapperForm> — the editable form for a
 * ToolWrapper. Mirrors PolicyForm's structure
 * (state-managed in the wrapper, dirty + save +
 * apply actions at the bottom).
 *
 * The form has 3 sections:
 *   1. **Meta**: description (optional text)
 *   2. **Tools**: comma-separated list of tool
 *      names (e.g. `bash, write`)
 *   3. **Rule**: kind-specific fields, switched
 *      on `rule.kind`:
 *      - `retry`: maxRetries + initialBackoffMs
 *      - `log`: logPath
 *      - `transform`: transform + patterns
 *
 * The kind is a `<select>` — switching kinds
 * resets the rule's other fields to defaults.
 * We don't try to preserve the previous kind's
 * data when switching (the new kind may not
 * have the same fields, and a clean reset is
 * less surprising than a silent partial).
 *
 * v0.9.3: the form is full — every field the
 * Zod schema accepts is surfaced. The
 * NewWrapperCard (v0.9.0) used defaults; this
 * form is for refining them.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, PilotApiError } from "../../../../lib/pilot-browser";
import type { ToolWrapper, ToolWrapperInput } from "../../../../lib/types";
import { useT } from "@/components/I18n";
import { ConfirmDialog } from "../../../workflows/ConfirmDialog";

export interface WrapperFormProps {
  initialWrapper: ToolWrapper;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export default function WrapperForm({ initialWrapper }: WrapperFormProps) {
  const router = useRouter();
  const t = useT();
  const [description, setDescription] = useState(
    initialWrapper.description ?? "",
  );
  const [toolsText, setToolsText] = useState(
    initialWrapper.tools.join(", "),
  );
  // v0.9.3: rule-specific fields keyed by kind.
  // Each kind's fields are kept as separate
  // state (not a single object) so switching
  // kinds doesn't have to migrate stale data.
  const [kind, setKind] = useState<ToolWrapper["rule"]["kind"]>(
    initialWrapper.rule.kind,
  );
  // retry fields
  const [maxRetries, setMaxRetries] = useState(
    initialWrapper.rule.kind === "retry" ? initialWrapper.rule.maxRetries : 3,
  );
  const [initialBackoffMs, setInitialBackoffMs] = useState(
    initialWrapper.rule.kind === "retry"
      ? initialWrapper.rule.initialBackoffMs
      : 1000,
  );
  // log field
  const [logPath, setLogPath] = useState(
    initialWrapper.rule.kind === "log"
      ? initialWrapper.rule.logPath
      : "observability/tool-calls-wrapper.jsonl",
  );
  // transform fields
  const [transform, setTransform] = useState<
    "rewrite-path-redact" | "rewrite-content-redact"
  >(
    initialWrapper.rule.kind === "transform"
      ? initialWrapper.rule.transform
      : "rewrite-path-redact",
  );
  const [patternsText, setPatternsText] = useState(
    initialWrapper.rule.kind === "transform"
      ? initialWrapper.rule.patterns.join("\n")
      : "",
  );

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // v0.9.3: rule input is computed from the
  // current kind + the per-kind fields. We
  // compute this every render so the save
  // handler always sees the freshest values.
  function buildRule(): ToolWrapper["rule"] {
    if (kind === "retry") {
      return {
        kind: "retry",
        maxRetries,
        initialBackoffMs,
      };
    }
    if (kind === "log") {
      return {
        kind: "log",
        logPath: logPath.trim() || "observability/tool-calls-wrapper.jsonl",
      };
    }
    return {
      kind: "transform",
      transform,
      patterns: patternsText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    };
  }

  const initialRule = initialWrapper.rule;
  const isDirty =
    description !== (initialWrapper.description ?? "") ||
    toolsText !== initialWrapper.tools.join(", ") ||
    kind !== initialRule.kind ||
    (kind === "retry" &&
      (initialRule.kind !== "retry" ||
        maxRetries !== initialRule.maxRetries ||
        initialBackoffMs !== initialRule.initialBackoffMs)) ||
    (kind === "log" &&
      (initialRule.kind !== "log" || logPath !== initialRule.logPath)) ||
    (kind === "transform" &&
      (initialRule.kind !== "transform" ||
        transform !== initialRule.transform ||
        patternsText !== initialRule.patterns.join("\n")));

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });

    const input: ToolWrapperInput = {
      description: description.trim() || undefined,
      tools: toolsText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      rule: buildRule(),
    };
    try {
      await api.setWrapper(initialWrapper.name, input);
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
      setApplyMessage(t("wrappers.form.saveFirstApply"));
      return;
    }
    setBusy(true);
    setApplyMessage(null);
    try {
      const { path, bytes } = await api.applyWrapper(initialWrapper.name);
      setApplyMessage(t("wrappers.applyOk", { path, bytes }));
    } catch (err) {
      const msg =
        err instanceof PilotApiError ? err.message : (err as Error).message;
      setApplyMessage(`${t("wrappers.applyFailed")}: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function onUnapply(): Promise<void> {
    setBusy(true);
    setApplyMessage(null);
    try {
      const { removed } = await api.unapplyWrapper(initialWrapper.name);
      setApplyMessage(
        removed ? t("wrappers.unapplyOk") : t("wrappers.unapplyNotApplied"),
      );
    } catch (err) {
      const msg =
        err instanceof PilotApiError ? err.message : (err as Error).message;
      setApplyMessage(`${t("wrappers.unapplyFailed")}: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    try {
      await api.deleteWrapper(initialWrapper.name);
      router.push("/wrappers");
    } catch (err) {
      setSaveState({
        kind: "error",
        message:
          err instanceof PilotApiError
            ? `${err.status}: ${err.message}`
            : (err as Error).message,
      });
      setConfirmingDelete(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="wrapper-edit-form"
      aria-label={t("wrappers.form.ariaEdit", { name: initialWrapper.name })}
    >
      <div className="wrapper-edit-status" data-state={saveState.kind}>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="wrapper-edit-status-msg"
        >
          {applyMessage && (
            <span
              className={
                applyMessage.includes(t("wrappers.applyFailed")) ||
                applyMessage.includes(t("wrappers.unapplyFailed"))
                  ? "error small"
                  : "ok small"
              }
            >
              {applyMessage}
            </span>
          )}
          {!applyMessage && saveState.kind === "idle" && !isDirty && (
            <span className="muted small">
              {t("wrappers.form.savedClean")}
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
              {t("wrappers.form.savedAt", {
                time: new Date(saveState.at).toLocaleTimeString(),
              })}
            </span>
          )}
          {saveState.kind === "error" && (
            <span className="error small" role="alert">
              {t("wrappers.form.errorPrefix", { msg: saveState.message })}
            </span>
          )}
        </p>
      </div>

      {/* Meta */}
      <div className="wrapper-edit-section">
        <label htmlFor="wrapper-description">
          {t("wrappers.form.descriptionLabel")}
        </label>
        <input
          id="wrapper-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("wrappers.form.descriptionPlaceholder")}
          className="wrapper-edit-input"
        />
      </div>

      {/* Tools */}
      <div className="wrapper-edit-section">
        <label htmlFor="wrapper-tools">
          {t("wrappers.form.toolsLabel")}
        </label>
        <input
          id="wrapper-tools"
          type="text"
          value={toolsText}
          onChange={(e) => setToolsText(e.target.value)}
          placeholder="bash, write"
          className="wrapper-edit-input"
          data-testid="wrapper-tools"
        />
        <p className="muted small">{t("wrappers.form.toolsHint")}</p>
      </div>

      {/* Rule kind picker */}
      <div className="wrapper-edit-section">
        <label htmlFor="wrapper-kind">
          {t("wrappers.form.kindLabel")}
        </label>
        <select
          id="wrapper-kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as ToolWrapper["rule"]["kind"];
            setKind(next);
            // Reset kind-specific fields to
            // their defaults so a save after
            // switching kind doesn't carry
            // stale data.
            if (next === "retry") {
              setMaxRetries(3);
              setInitialBackoffMs(1000);
            } else if (next === "log") {
              setLogPath("observability/tool-calls-wrapper.jsonl");
            } else {
              setTransform("rewrite-path-redact");
              setPatternsText("");
            }
          }}
          className="wrapper-edit-input"
          data-testid="wrapper-kind"
        >
          <option value="retry">{t("wrappers.newCard.kindRetry")}</option>
          <option value="log">{t("wrappers.newCard.kindLog")}</option>
          <option value="transform">
            {t("wrappers.newCard.kindTransform")}
          </option>
        </select>
      </div>

      {/* Kind-specific fields */}
      {kind === "retry" ? (
        <>
          <div className="wrapper-edit-section">
            <label htmlFor="wrapper-retry-max">
              {t("wrappers.form.maxRetriesLabel")}
            </label>
            <input
              id="wrapper-retry-max"
              type="number"
              min={1}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className="wrapper-edit-input"
              data-testid="wrapper-retry-max"
            />
          </div>
          <div className="wrapper-edit-section">
            <label htmlFor="wrapper-retry-backoff">
              {t("wrappers.form.initialBackoffLabel")}
            </label>
            <input
              id="wrapper-retry-backoff"
              type="number"
              min={10}
              max={60000}
              value={initialBackoffMs}
              onChange={(e) => setInitialBackoffMs(Number(e.target.value))}
              className="wrapper-edit-input"
              data-testid="wrapper-retry-backoff"
            />
            <p className="muted small">
              {t("wrappers.form.initialBackoffHint")}
            </p>
          </div>
        </>
      ) : null}
      {kind === "log" ? (
        <div className="wrapper-edit-section">
          <label htmlFor="wrapper-log-path">
            {t("wrappers.form.logPathLabel")}
          </label>
          <input
            id="wrapper-log-path"
            type="text"
            value={logPath}
            onChange={(e) => setLogPath(e.target.value)}
            className="wrapper-edit-input"
            data-testid="wrapper-log-path"
          />
          <p className="muted small">{t("wrappers.form.logPathHint")}</p>
        </div>
      ) : null}
      {kind === "transform" ? (
        <>
          <div className="wrapper-edit-section">
            <label htmlFor="wrapper-transform-mode">
              {t("wrappers.form.transformLabel")}
            </label>
            <select
              id="wrapper-transform-mode"
              value={transform}
              onChange={(e) =>
                setTransform(
                  e.target.value as
                    | "rewrite-path-redact"
                    | "rewrite-content-redact",
                )
              }
              className="wrapper-edit-input"
              data-testid="wrapper-transform-mode"
            >
              <option value="rewrite-path-redact">
                {t("wrappers.form.transformPathRedact")}
              </option>
              <option value="rewrite-content-redact">
                {t("wrappers.form.transformContentRedact")}
              </option>
            </select>
          </div>
          <div className="wrapper-edit-section">
            <label htmlFor="wrapper-transform-patterns">
              {t("wrappers.form.patternsLabel")}
            </label>
            <textarea
              id="wrapper-transform-patterns"
              value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
              rows={4}
              className="wrapper-edit-textarea"
              spellCheck={false}
              placeholder="**/.env\n**/.env.*"
              data-testid="wrapper-transform-patterns"
            />
            <p className="muted small">{t("wrappers.form.patternsHint")}</p>
          </div>
        </>
      ) : null}

      {/* Actions */}
      <div className="wrapper-edit-actions" role="group" aria-label={t("btn.ariaFormActions")}>
        <button
          type="submit"
          className="btn"
          disabled={saveState.kind === "saving" || !isDirty}
          data-testid="wrapper-save"
        >
          {saveState.kind === "saving"
            ? t("btn.saving")
            : isDirty
              ? t("btn.save")
              : t("btn.saved")}
        </button>
        <a href="/wrappers" className="btn secondary">
          {t("btn.backToList")}
        </a>
        <span className="wrapper-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn secondary"
          onClick={() => void onApply()}
          disabled={busy || isDirty}
          data-testid="wrapper-apply"
        >
          {t("wrappers.apply")}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void onUnapply()}
          disabled={busy}
          data-testid="wrapper-unapply"
        >
          {t("wrappers.unapply")}
        </button>
        <span className="wrapper-edit-divider" aria-hidden="true" />
        <button
          type="button"
          className={`btn ${confirmingDelete ? "danger" : "secondary"}`}
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          data-testid="wrapper-delete"
          aria-label={t("btn.ariaDelete")}
        >
          {confirmingDelete ? t("btn.confirmDelete") : t("btn.delete")}
        </button>
      </div>

      {confirmingDelete ? (
        <ConfirmDialog
          open={confirmingDelete}
          busy={busy}
          title={t("wrappers.edit.deleteTitle")}
          description={t("wrappers.confirmDelete", { name: initialWrapper.name })}
          confirmLabel={t("btn.delete")}
          cancelLabel={t("wrappers.editor.cancel")}
          destructive
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </form>
  );
}
