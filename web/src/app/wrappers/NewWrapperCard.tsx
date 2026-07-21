"use client";

/**
 * v2.0.9 (= v1.1.10): NewWrapperCard — minimal form to
 * create a tool wrapper.
 *
 * Re-skin from v0.9.0 visual (.section-h2 / .subtitle /
 * .form-row / .btn / .policy-edit-input) to the v1.0.2
 * reference family (.hub-* / .hub-btn / .context-editor-
 * textarea). Form logic is unchanged: same 3 fields
 * (name + kind + tools), same onCreate() body that PUTs
 * to /wrappers/:name with a kind-specific default rule.
 *
 * v0.9.0 originally scoped this as "MVP-only" so the
 * dashboard surface landed fast and users could refine
 * the rule via TOML. v1.1.10 keeps the same MVP scope
 * (full edit form is the existing /wrappers/[name]/edit
 * route).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle } from "lucide-react";
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hub-detail-card">
      <h2 className="hub-detail-section-h2">
        <Plus size={14} strokeWidth={1.75} />
        {t("wrappers.newCard.title")}
      </h2>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        {t("wrappers.newCard.subtitle")}
      </p>
      {error && (
        <div className="wrappers-message wrappers-message--error">
          <AlertCircle size={14} strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}
      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-3"
      >
        <Field
          label={t("wrappers.newCard.nameLabel")}
          id="new-wrapper-name"
        >
          <input
            id="new-wrapper-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder={t("wrappers.newCard.namePlaceholder")}
            required
            className="hub-search-input"
          />
        </Field>
        <Field
          label={t("wrappers.newCard.kindLabel")}
          id="new-wrapper-kind"
        >
          <select
            id="new-wrapper-kind"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "retry" | "log" | "transform")
            }
            className="hub-search-input"
          >
            <option value="retry">
              {t("wrappers.newCard.kindRetry")}
            </option>
            <option value="log">{t("wrappers.newCard.kindLog")}</option>
            <option value="transform">
              {t("wrappers.newCard.kindTransform")}
            </option>
          </select>
        </Field>
        <Field
          label={t("wrappers.newCard.toolsLabel")}
          id="new-wrapper-tools"
        >
          <input
            id="new-wrapper-tools"
            type="text"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            placeholder="bash, write"
            className="hub-search-input"
          />
        </Field>
        <button
          type="submit"
          className="hub-btn hub-btn--primary"
          disabled={busy}
          data-testid="wrapper-create"
        >
          <Plus size={14} strokeWidth={1.75} />
          {busy ? t("btn.saving") : t("wrappers.newCard.submit")}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
