/**
 * /policy — Tool policy management dashboard.
 *
 * v0.4.3: list policies, see what's applied (extension installed),
 * apply/unapply, and run a dry-run check against a tool call.
 *
 * v0.5.11: full design overhaul — replaces the orphan-CSS-class
 * pattern (`.card`, `.badge`, `.form`, etc. were never defined)
 * with Tailwind utilities + the design-token classes added in
 * v0.5.11 (`.card`, `.subtitle`, `.stats`, `.rule-list`,
 * `.section-h2`, `.pill`). Card paddings, section heading sizes,
 * and empty states now match the rest of the app.
 */
import { Suspense } from "react";
import { headers } from "next/headers";
import { api, PilotApiError } from "../../lib/pilot";
import type { ToolPolicy } from "../../lib/types";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonCard } from "@/components/Skeleton";
import { Hint } from "@/components/Hint";
import { RichT } from "@/components/RichT";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { createPolicyForm } from "@/lib/actions";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { negotiateLocale, renderT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function loadPolicies(): Promise<{
  policies: ToolPolicy[];
  applyState: Record<
    string,
    { installed: boolean; path: string; bytes: number }
  >;
  error: string | null;
}> {
  try {
    const policies = await api.policies();
    const home = process.env["HOME"] ?? homedir();
    const extDir = join(home, ".pilot", "extensions");
    const applyState: Record<
      string,
      { installed: boolean; path: string; bytes: number }
    > = {};
    for (const p of policies) {
      const extPath = join(extDir, `pilot-policy-${p.name}.ts`);
      const installed = existsSync(extPath);
      applyState[p.name] = {
        installed,
        path: extPath,
        bytes: installed ? statSync(extPath).size : 0,
      };
    }
    return { policies, applyState, error: null };
  } catch (e) {
    return {
      policies: [],
      applyState: {},
      error:
        e instanceof PilotApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
    };
  }
}

function totalRules(p: ToolPolicy): number {
  return (
    p.deny.length +
    p.allow.length +
    p.denyPaths.length +
    p.denyCommands.length +
    p.sensitivePatterns.length +
    p.requireApproval.length
  );
}

export default async function PolicyPage() {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="policy.h1" />
        </h1>
        <p className="subtitle">
          <T k="policy.subtitle" />
        </p>
      </header>

      <div className="mb-2">
        <Hint summary={<T k="policy.hint.summary" />}>
          <RichT
            locale={locale}
            k="policy.hint.body"
            values={{
              policy: (
                <GlossaryTerm term="policy" locale={locale}>
                  policy
                </GlossaryTerm>
              ),
              c1: <code className="kbd">~/.pilot/extensions/</code>,
              em1: <em>apply</em>,
              em2: <em>unapply</em>,
            }}
          />
        </Hint>
      </div>

      <Suspense
        fallback={
          <div className="space-y-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={6} />
          </div>
        }
      >
        <PolicyList locale={locale} />
      </Suspense>

      <hr className="border-[var(--border)]" />
      <NewPolicyCard locale={locale} />
      <hr className="border-[var(--border)]" />
      <DryRun locale={locale} />
    </div>
  );
}

async function PolicyList({
  locale,
}: {
  locale: ReturnType<typeof negotiateLocale>;
}) {
  const { policies, applyState, error } = await loadPolicies();
  if (error) {
    return (
      <section className="surface rounded-lg p-4 card error">
        <h2 className="text-lg font-semibold mb-2">
          <T k="error.couldntLoad.title" />: policies
        </h2>
        <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2 mb-3">
          {error}
        </pre>
        <p className="hint">
          <T k="policy.serverHint" />
        </p>
      </section>
    );
  }
  if (policies.length === 0) {
    return (
      <EmptyState
        title={renderT(locale, "policy.empty.title")}
        hint={<>{renderT(locale, "policy.empty.body")}</>}
      />
    );
  }
  return (
    <section>
      <h2 className="section-h2">
        <T k="policy.h1" /> ({policies.length})
      </h2>
      <div className="card-grid">
        {policies.map((p) => {
          const a = applyState[p.name];
          const rules = totalRules(p);
          return (
            <article
              key={p.name}
              className="surface rounded-lg p-4 space-y-2 card-hover"
            >
              <header className="flex items-baseline justify-between">
                <h3 className="font-semibold font-mono">{p.name}</h3>
                {a?.installed ? (
                  <span className="pill ok">
                    {renderT(locale, "policy.card.applied")}
                  </span>
                ) : (
                  <span className="pill warn">
                    {renderT(locale, "policy.card.notApplied")}
                  </span>
                )}
              </header>
              {p.description ? <p className="hint">{p.description}</p> : null}
              <div className="stats">
                <span>
                  <strong>
                    {renderT(locale, "policy.card.rulesCount", { n: rules })}
                  </strong>
                </span>
                <span className="hint">
                  {renderT(locale, "policy.card.updatedAt", {
                    when: new Date(p.updatedAt).toLocaleString(),
                  })}
                </span>
              </div>
              <ul className="rule-list">
                {p.deny.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.denyBadge")}
                    </span>{" "}
                    <code>{p.deny.join(", ")}</code>
                  </li>
                )}
                {p.allow.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.allowBadge")}
                    </span>{" "}
                    <code>{p.allow.join(", ")}</code>
                  </li>
                )}
                {p.denyPaths.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.fieldLabel.paths")}
                    </span>{" "}
                    <code>{p.denyPaths.join(", ")}</code>
                  </li>
                )}
                {p.denyCommands.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.fieldLabel.cmds")}
                    </span>{" "}
                    <code>{p.denyCommands.join(", ")}</code>
                  </li>
                )}
                {p.sensitivePatterns.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.fieldLabel.redact")}
                    </span>{" "}
                    <code>{p.sensitivePatterns.join(", ")}</code>
                  </li>
                )}
                {p.requireApproval.length > 0 && (
                  <li>
                    <span className="rule-name">
                      {renderT(locale, "policy.hitlBadge")}
                    </span>{" "}
                    <code>{p.requireApproval.join(", ")}</code>
                  </li>
                )}
              </ul>
              <footer className="policy-card-footer text-xs text-[var(--text-muted)] font-mono">
                <span>
                  {a?.installed
                    ? renderT(locale, "policy.card.extSize", { bytes: a.bytes })
                    : renderT(locale, "policy.card.extMissing")}
                </span>
                <a
                  href={`/policy/${encodeURIComponent(p.name)}/edit`}
                  className="policy-card-edit-link"
                >
                  <T k="btn.edit" /> →
                </a>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DryRun({ locale }: { locale: ReturnType<typeof negotiateLocale> }) {
  return (
    <section className="surface rounded-lg p-4">
      <h2 className="section-h2">
        <T k="policy.tryRule.h2" />
      </h2>
      <p className="subtitle">
        <T k="policy.dryRun.subtitle" />
      </p>
      <DryRunForm locale={locale} />
    </section>
  );
}

async function DryRunForm({
  locale,
}: {
  locale: ReturnType<typeof negotiateLocale>;
}) {
  let policies: ToolPolicy[] = [];
  let error: string | null = null;
  try {
    policies = await api.policies();
  } catch (e) {
    error =
      e instanceof PilotApiError
        ? `${e.status}: ${e.message}`
        : (e as Error).message;
  }

  if (error) {
    return <p className="error text-sm">{error}</p>;
  }
  if (policies.length === 0) {
    return (
      <p className="hint">
        <T k="policy.tryRule.noPolicies" />
      </p>
    );
  }
  return (
    <form action="/api/policy-check" method="post" className="form">
      <div className="form-row">
        <label htmlFor="policy">
          <T k="policy.tryRule.policyLabel" />
        </label>
        <select
          id="policy"
          name="name"
          required
          defaultValue={policies[0]?.name ?? ""}
        >
          {policies.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="tool">
          <T k="policy.tryRule.toolLabel" />
        </label>
        <select id="tool" name="tool" defaultValue="bash">
          {/* v0.6.14: option labels wrapped through i18n keys
              so future locales (fr / ru / ar) translate the
              tool names. The values are still the raw tool
              names (bash / read / edit / write) because the
              /api/policy-check endpoint expects those exact
              strings, but the visible label can be translated. */}
          <option value="bash">
            {renderT(locale, "policy.tryRule.toolBash")}
          </option>
          <option value="read">
            {renderT(locale, "policy.tryRule.toolRead")}
          </option>
          <option value="edit">
            {renderT(locale, "policy.tryRule.toolEdit")}
          </option>
          <option value="write">
            {renderT(locale, "policy.tryRule.toolWrite")}
          </option>
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="args">
          <T k="policy.tryRule.argsLabel" />
        </label>
        <input
          id="args"
          name="args"
          type="text"
          defaultValue='{"command":"ls -la"}'
          placeholder='{"command":"rm -rf /"}'
        />
      </div>
      <button type="submit" className="btn">
        <T k="policy.tryRule.runCheck" />
      </button>
    </form>
  );
}

// ─── NewPolicyCard (v0.4.12) ──────────────────────────────────

function NewPolicyCard({
  locale,
}: {
  locale: ReturnType<typeof negotiateLocale>;
}) {
  return (
    <section className="surface rounded-lg p-4">
      <h2 className="section-h2">
        <T k="policy.newCard.title" />
      </h2>
      <p className="subtitle">
        <T k="policy.newCard.subtitle" />
      </p>
      <form action={createPolicyForm} className="form">
        <div className="form-row">
          <label htmlFor="new-policy-name">
            <T k="policy.newCard.nameLabel" />
          </label>
          <input
            id="new-policy-name"
            name="name"
            type="text"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder={renderT(locale, "policy.newCard.namePlaceholder")}
            required
          />
        </div>

        <fieldset className="form-row" style={{ border: 0, padding: 0 }}>
          <legend>
            <T k="policy.newCard.templateLabel" />
          </legend>
          <div className="space-y-2">
            <TemplateOption
              value="safe-bash"
              labelKey="policy.newCard.templateSafeBash"
              descKey="policy.newCard.templateSafeBashDesc"
            />
            <TemplateOption
              value="readonly"
              labelKey="policy.newCard.templateReadonly"
              descKey="policy.newCard.templateReadonlyDesc"
            />
            <TemplateOption
              value="empty"
              labelKey="policy.newCard.templateEmpty"
              descKey="policy.newCard.templateEmptyDesc"
            />
          </div>
        </fieldset>

        <button type="submit" className="btn">
          <T k="policy.newCard.submit" />
        </button>
      </form>
    </section>
  );
}

function TemplateOption({
  value,
  labelKey,
  descKey,
}: {
  value: string;
  labelKey:
    | "policy.newCard.templateSafeBash"
    | "policy.newCard.templateReadonly"
    | "policy.newCard.templateEmpty";
  descKey:
    | "policy.newCard.templateSafeBashDesc"
    | "policy.newCard.templateReadonlyDesc"
    | "policy.newCard.templateEmptyDesc";
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer surface-2 rounded px-3 py-2 hover:bg-[var(--surface)] card-hover">
      <input
        type="radio"
        name="template"
        value={value}
        defaultChecked={value === "safe-bash"}
        className="mt-0.5"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium">
          <T k={labelKey} />
        </span>
        <span className="block text-xs text-[var(--text-muted)] mt-0.5">
          <T k={descKey} />
        </span>
      </span>
    </label>
  );
}
