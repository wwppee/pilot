"use client";

/**
 * v0.9.0: NewWrapperCard — minimal form to create
 * a tool wrapper. The MVP scope is a 3-field form
 * (name + kind + tools + 1 rule-specific input);
 * the full edit form (with all rule fields per
 * kind, plus description, plus delete) is a
 * v0.9.x followup.
 *
 * Why MVP-only? The contract is what v0.9.0 needs
 * to ship (the data model + REST + apply flow).
 * The full form is a UI surface; the user can
 * always edit the TOML directly under
 * `~/.pilot/wrappers/<name>.toml` to refine the
 * rule. The dashboard edit form lands when the
 * pi-side runtime hook is in (so the form's
 * preview button can show a real "this would
 * transform a tool call" result).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/I18n";

export function NewWrapperCard() {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"retry" | "log" | "transform">("retry");
  const [tools, setTools] = useState("bash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("wrappers.newCard.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const toolsList = tools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // v0.9.0: only the rule's *kind-specific required
      // fields* ship in the form. Defaults fill in the
      // rest; the user can refine via the TOML or the
      // v0.9.x edit form.
      const rule =
        kind === "retry"
          ? { kind: "retry", maxRetries: 3, initialBackoffMs: 1000 }
          : kind === "log"
            ? {
                kind: "log",
                logPath: "observability/tool-calls-wrapper.jsonl",
              }
            : {
                kind: "transform",
                transform: "rewrite-path-redact",
                patterns: [],
              };
      const res = await fetch("/wrappers/" + encodeURIComponent(name), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tools: toolsList, rule }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      router.refresh();
      setName("");
      setTools("bash");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <h2 className="section-h2">
        {t("wrappers.newCard.title")}
      </h2>
      <p className="subtitle">
        {t("wrappers.newCard.subtitle")}
      </p>
      {error ? (
        <p className="text-xs text-[var(--error)] mb-2">{error}</p>
      ) : null}
      <form onSubmit={(e) => void onCreate(e)} className="form">
        <div className="form-row">
          <label htmlFor="new-wrapper-name">
            {t("wrappers.newCard.nameLabel")}
          </label>
          <input
            id="new-wrapper-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder={t("wrappers.newCard.namePlaceholder")}
            required
            className="policy-edit-input"
          />
        </div>
        <div className="form-row">
          <label htmlFor="new-wrapper-kind">
            {t("wrappers.newCard.kindLabel")}
          </label>
          <select
            id="new-wrapper-kind"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "retry" | "log" | "transform")
            }
            className="policy-edit-input"
          >
            <option value="retry">
              {t("wrappers.newCard.kindRetry")}
            </option>
            <option value="log">{t("wrappers.newCard.kindLog")}</option>
            <option value="transform">
              {t("wrappers.newCard.kindTransform")}
            </option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-wrapper-tools">
            {t("wrappers.newCard.toolsLabel")}
          </label>
          <input
            id="new-wrapper-tools"
            type="text"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            placeholder="bash, write"
            className="policy-edit-input"
          />
        </div>
        <button
          type="submit"
          className="btn"
          disabled={busy}
          data-testid="wrapper-create"
        >
          {busy ? t("btn.saving") : t("wrappers.newCard.submit")}
        </button>
      </form>
    </section>
  );
}
