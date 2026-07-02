/**
 * /policy — Tool policy management dashboard.
 *
 * v0.4.3: list policies, see what's applied (extension installed),
 * apply/unapply, and run a dry-run check against a tool call.
 */

import { Suspense } from "react";
import { api, PilotApiError } from "../../lib/pilot";
import type { ToolPolicy, PolicyDecision } from "../../lib/types";
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

export default function PolicyPage(): JSX.Element {
  return (
    <main>
      <h1>Tool Policies</h1>
      <p className="subtitle">
        ToolPolicy bundles control what pi can do. Each policy is a TOML file in{" "}
        <code>~/.pilot/policy/</code>. Apply one to install a generated{" "}
        <code>pilot-policy-&lt;name&gt;.ts</code> extension into
        <code>~/.pilot/extensions/</code> — pi auto-loads it on every session.
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <PolicyList />
      </Suspense>
      <hr />
      <DryRun />
    </main>
  );
}

async function PolicyList(): Promise<JSX.Element> {
  const { policies, applyState, error } = await loadPolicies();
  if (error) {
    return (
      <section className="card error">
        <h2>Couldn&apos;t load policies</h2>
        <pre>{error}</pre>
        <p className="hint">
          Is <code>pilot server</code> running? Try{" "}
          <code>pilot server start</code>.
        </p>
      </section>
    );
  }
  if (policies.length === 0) {
    return (
      <section className="card empty">
        <h2>No policies yet</h2>
        <p>
          Create one with <code>pilot policy new &lt;name&gt;</code>, then{" "}
          <code>pilot policy apply &lt;name&gt;</code> to install it.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2>Installed policies ({policies.length})</h2>
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
                    <span className="rule-name">deny</span>{" "}
                    <code>{p.deny.join(", ")}</code>
                  </li>
                )}
                {p.allow.length > 0 && (
                  <li>
                    <span className="rule-name">allow</span>{" "}
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
                    <span className="rule-name">HITL</span>{" "}
                    <code>{p.requireApproval.join(", ")}</code>
                  </li>
                )}
              </ul>
              <footer className="muted mono">
                ext: {a?.installed ? `${a.bytes}B` : "—"}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

async function DryRun(): Promise<JSX.Element> {
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
      <h2>Try a rule</h2>
      <p className="subtitle">
        Run a dry-run check: which policy rule fires (if any) for a given tool
        call?
      </p>
      {error ? (
        <p className="error">{error}</p>
      ) : policies.length === 0 ? (
        <p className="muted">No policies to test against.</p>
      ) : (
        <form action="/api/policy-check" method="post" className="form">
          <div className="form-row">
            <label htmlFor="policy">Policy</label>
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
            <label htmlFor="tool">Tool</label>
            <select id="tool" name="tool" defaultValue="bash">
              <option value="bash">bash</option>
              <option value="read">read</option>
              <option value="edit">edit</option>
              <option value="write">write</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="args">Args (JSON)</label>
            <input
              id="args"
              name="args"
              type="text"
              defaultValue='{"command":"ls -la"}'
              placeholder='{"command":"rm -rf /"}'
            />
          </div>
          <button type="submit" className="btn">
            Run check
          </button>
        </form>
      )}
    </section>
  );
}
