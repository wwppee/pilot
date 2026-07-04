/**
 * /policy — Tool policy management dashboard.
 *
 * v0.4.3: list policies, see what's applied (extension installed),
 * apply/unapply, and run a dry-run check against a tool call.
 */

import { Suspense } from "react";
import { api, PilotApiError } from "../../lib/pilot";
import type { ToolPolicy } from "../../lib/types";
import { T } from "@/components/I18n";
import { createPolicyForm } from "@/lib/actions";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

export default function PolicyPage() {
  return (
    <main>
      <h1>
        <T k="policy.h1" />
      </h1>
      <p className="subtitle">
        <T k="policy.subtitle" />
      </p>
      <Suspense fallback={<p><T k="loading.policies" /></p>}>
        <PolicyList />
      </Suspense>
      <hr />
      {/* v0.4.12: New Policy form — was CLI-only before. */}
      <NewPolicyCard />
      <hr />
      <DryRun />
    </main>
  );
}

async function PolicyList() {
  const { policies, applyState, error } = await loadPolicies();
  if (error) {
    return (
      <section className="card error">
        <h2>
          <T k="error.couldntLoad.title" />: policies
        </h2>
        <pre>{error}</pre>
        <p className="hint">
          <T k="policy.serverHint" />
        </p>
      </section>
    );
  }
  if (policies.length === 0) {
    return (
      <section className="card empty">
        <h2>
          <T k="policy.empty.title" />
        </h2>
        <p>
          <T k="policy.empty.body" />
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2>
        <T k="policy.h1" /> ({policies.length})
      </h2>
      <div className="card-grid">
        {policies.map((p) => {
          const a = applyState[p.name];
          const rules = totalRules(p);
          return (
            <article key={p.name} className="card">
              <header>
                <h3>{p.name}</h3>
                {a?.installed ? (
                  <span className="badge ok">● applied</span>
                ) : (
                  <span className="badge warn">○ not applied</span>
                )}
              </header>
              {p.description ? <p className="muted">{p.description}</p> : null}
              <div className="stats">
                <span>
                  <strong>{rules}</strong> rules
                </span>
                <span className="muted">
                  updated {new Date(p.updatedAt).toLocaleString()}
                </span>
              </div>
              <ul className="rule-list">
                {p.deny.length > 0 && (
                  <li>
                    <span className="rule-name">
                      <T k="policy.denyBadge" />
                    </span>{" "}
                    <code>{p.deny.join(", ")}</code>
                  </li>
                )}
                {p.allow.length > 0 && (
                  <li>
                    <span className="rule-name">
                      <T k="policy.allowBadge" />
                    </span>{" "}
                    <code>{p.allow.join(", ")}</code>
                  </li>
                )}
                {p.denyPaths.length > 0 && (
                  <li>
                    <span className="rule-name">paths</span>{" "}
                    <code>{p.denyPaths.join(", ")}</code>
                  </li>
                )}
                {p.denyCommands.length > 0 && (
                  <li>
                    <span className="rule-name">cmds</span>{" "}
                    <code>{p.denyCommands.join(", ")}</code>
                  </li>
                )}
                {p.sensitivePatterns.length > 0 && (
                  <li>
                    <span className="rule-name">redact</span>{" "}
                    <code>{p.sensitivePatterns.join(", ")}</code>
                  </li>
                )}
                {p.requireApproval.length > 0 && (
                  <li>
                    <span className="rule-name">
                      <T k="policy.hitlBadge" />
                    </span>{" "}
                    <code>{p.requireApproval.join(", ")}</code>
                  </li>
                )}
              </ul>
              <footer className="muted mono policy-card-footer">
                <span>ext: {a?.installed ? `${a.bytes}B` : "—"}</span>
                <a
                  href={`/policy/${encodeURIComponent(p.name)}/edit`}
                  className="policy-card-edit-link"
                  aria-label={undefined}
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

async function DryRun() {
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

  return (
    <section>
      <h2>
        <T k="policy.tryRule.h2" />
      </h2>
      <p className="subtitle">
        Run a dry-run check: which policy rule fires (if any) for a given tool
        call?
      </p>
      {error ? (
        <p className="error">{error}</p>
      ) : policies.length === 0 ? (
        <p className="muted">
          <T k="policy.tryRule.noPolicies" />
        </p>
      ) : (
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
              <option value="bash">bash</option>
              <option value="read">read</option>
              <option value="edit">edit</option>
              <option value="write">write</option>
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
      )}
    </section>
  );
}

// ─── NewPolicyCard (v0.4.12) ──────────────────────────────────

function NewPolicyCard() {
  return (
    <section className="card">
      <h2>
        <T k="policy.newCard.title" />
      </h2>
      <p className="subtitle">
        Pick a starter template, give it a kebab-case name, and you'll land
        on the edit page to refine.
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
            placeholder="safe-bash"
            required
            className="surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <fieldset className="form-row" style={{ border: 0, padding: 0 }}>
          <legend className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
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
    <label className="flex items-start gap-2 cursor-pointer surface-2 rounded px-3 py-2 hover:bg-[var(--surface)]">
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