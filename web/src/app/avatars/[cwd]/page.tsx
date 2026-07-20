/**
 * /avatars/[cwd] — per-Avatar diff view + apply button (v0.5.2).
 *
 * Shows expected vs actual side-by-side for every field, color-coded
 * by status (match / drift / missing / extra). When the Avatar
 * isn't clean, the user gets an "Apply" button that runs
 * install-missing-packs + activate-profile and renders the report.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { api, PilotApiError } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { AvatarApplyReport, AvatarDiff, DiffStatus } from "@/lib/types";
import { applyAvatarForm, dryRunAvatarForm } from "@/lib/actions";

interface PageProps {
  params: Promise<{ cwd: string }>;
  searchParams: Promise<{
    applied?: string;
    dry?: string;
    report?: string;
    error?: string;
  }>;
}

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<DiffStatus, string> = {
  match: "var(--accent-2)",
  drift: "var(--warn)",
  missing: "var(--error)",
  extra: "var(--accent)",
};

export default async function AvatarDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { cwd: rawCwd } = await params;
  const sp = await searchParams;
  const cwd = decodeURIComponent(rawCwd);

  let diff: AvatarDiff | null = null;
  try {
    diff = await api.avatarDiff(cwd);
  } catch (e) {
    // v0.9.15: bail to the app's not-found.tsx on 404. Without
    // this, the page rendered an inline "Avatar not found" with
    // HTTP 200, breaking SEO + refresh state + error monitoring.
    if (e instanceof PilotApiError && e.status === 404) {
      notFound();
    }
    diff = null;
  }

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  if (!diff) {
    // v0.9.15: avatarDiff returns null on 404 (caught in the
    // try above, but the inner pilot() helper can also throw
    // PilotApiError(status=404) for some malformed 404 responses;
    // either way the page should return 404).
    notFound();
  }

  // Parse the apply report from the URL (set by applyAvatarForm).
  let report: AvatarApplyReport | null = null;
  if (sp.applied && sp.report) {
    try {
      report = JSON.parse(sp.report) as AvatarApplyReport;
    } catch {
      report = null;
    }
  }

  const statusKey = (s: DiffStatus): string =>
    renderT(locale, `avatars.status.${s}`);

  const Field = ({
    title,
    status,
    expected,
    actual,
  }: {
    title: string;
    status: DiffStatus;
    expected: React.ReactNode;
    actual: React.ReactNode;
  }) => (
    <div
      className="surface rounded-lg p-3"
      style={{ borderLeft: `3px solid ${STATUS_COLOR[status]}` }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{
            color: STATUS_COLOR[status],
            background: "var(--surface-2)",
          }}
        >
          {statusKey(status)}
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {renderT(locale, "avatars.detail.expected")}
          </dt>
          <dd className="font-mono mt-0.5 break-words">{expected}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {renderT(locale, "avatars.detail.actual")}
          </dt>
          <dd className="font-mono mt-0.5 break-words">{actual}</dd>
        </div>
      </dl>
    </div>
  );

  const fmtList = (xs: string[]): React.ReactNode =>
    xs.length === 0 ? (
      <span className="italic text-[var(--text-muted)]">—</span>
    ) : (
      <ul className="space-y-0.5">
        {xs.map((x) => (
          <li key={x}>
            <code className="kbd">{x}</code>
          </li>
        ))}
      </ul>
    );

  const fmtScalar = (x: string | undefined): React.ReactNode =>
    x === undefined ? (
      <span className="italic text-[var(--text-muted)]">—</span>
    ) : (
      <code className="kbd">{x}</code>
    );

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/avatars">← back to avatars</Link>
      </div>

      <header className="surface rounded-lg p-4">
        <h1 className="text-lg font-bold font-mono break-all">
          {renderT(locale, "avatars.detail.h1", { cwd: diff.encodedCwd })}
        </h1>
        <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center justify-between">
          <span>
            {renderT(locale, "avatars.detail.capturedAt", {
              when: new Date(diff.capturedAt).toLocaleString(),
            })}
          </span>
          <span
            className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{
              color: diff.clean ? "var(--accent-2)" : "var(--warn)",
              background: "var(--surface-2)",
            }}
          >
            {diff.clean
              ? renderT(locale, "avatars.clean")
              : renderT(locale, "avatars.dirty")}
          </span>
        </div>
      </header>

      {/* v0.5.2: apply report banner — shown after the user clicks
          "Apply Avatar". Counts installed / activated / failed so
          the user sees the exact effect. */}
      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{
            color: "var(--error)",
            borderLeft: "3px solid var(--error)",
          }}
          role="alert"
        >
          {sp.error}
        </div>
      )}
      {report && <ApplyReportBanner report={report} locale={locale} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          title={renderT(locale, "avatars.profile")}
          status={diff.profile.status}
          expected={fmtScalar(diff.profile.expected)}
          actual={fmtScalar(diff.profile.actual)}
        />
        <Field
          title={renderT(locale, "avatars.model")}
          status={diff.model.status}
          expected={fmtScalar(diff.model.expected)}
          actual={fmtScalar(diff.model.actual)}
        />
        <Field
          title={renderT(locale, "avatars.packSources")}
          status={diff.packSources.status}
          expected={fmtList(diff.packSources.expected)}
          actual={fmtList(diff.packSources.actual)}
        />
        <Field
          title={renderT(locale, "avatars.extensions")}
          status={diff.extensions.status}
          expected={fmtList(diff.extensions.expected)}
          actual={fmtList(diff.extensions.actual)}
        />
      </div>

      {/* v0.5.2: apply CTA. Hidden when the diff is already clean
          AND the user has no opinion about extensions (extensions
          drift alone doesn't trigger this — extensions are managed
          separately by policy apply). The "needs attention" text is
          kept for partial-drift cases (e.g. only `model` drifted).

          v0.5.3: pair the real Apply button with a Dry-run button
          that posts to the same route with `?dry=1`. The banner above
          detects `dry` in the report and reframes itself. */}
      <form
        action={applyAvatarForm}
        className="surface rounded-lg p-4 space-y-3"
      >
        <p className="text-xs text-[var(--text-muted)]">
          {renderT(locale, "avatars.apply.caption")}
        </p>
        <input type="hidden" name="cwd" value={diff.encodedCwd} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            // Inline confirm keeps the click honest without forcing
            // a separate modal for what's usually a quick action.
            onClick={(e) => {
              if (!window.confirm(renderT(locale, "avatars.apply.confirm"))) {
                e.preventDefault();
              }
            }}
            className="px-4 py-2 text-sm rounded text-[var(--bg)]"
            style={{ background: "var(--accent)" }}
          >
            {renderT(locale, "avatars.apply.cta")}
          </button>
        </div>
      </form>

      {/* v0.5.3: separate Dry-run form — posts to the same endpoint
          but with `?dry=1`, so the server skips every side-effect.
          No confirm dialog needed; dry-run is reversible by definition. */}
      <form
        action={dryRunAvatarForm}
        className="surface rounded-lg p-4 space-y-3"
      >
        <p className="text-xs text-[var(--text-muted)]">
          {renderT(locale, "avatars.apply.dryCaption")}
        </p>
        <input type="hidden" name="cwd" value={diff.encodedCwd} />
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded border"
          style={{
            background: "var(--surface-2)",
            color: "var(--text)",
            borderColor: "var(--accent)",
          }}
        >
          {renderT(locale, "avatars.apply.dryCta")}
        </button>
      </form>
    </div>
  );
}

/**
 * Render the report from the previous apply. Shows counts at the top
 * and a per-step detail list at the bottom. Lives inside the server
 * component (not "use client") because the report is passed via URL
 * query params — no interactive state needed.
 */
function ApplyReportBanner({
  report,
  locale,
}: {
  report: AvatarApplyReport;
  locale: Locale;
}) {
  const totalCount =
    report.installed.length + (report.activated ? 1 : 0) + report.failed.length;
  const isNoOp = totalCount === 0;
  const isDry = report.dry === true;
  return (
    <section
      className="surface rounded-lg p-4 space-y-3"
      style={{
        borderLeft: `3px solid ${
          report.failed.length > 0
            ? "var(--error)"
            : isNoOp
              ? "var(--text-muted)"
              : "var(--accent-2)"
        }`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {isNoOp
            ? renderT(locale, "avatars.apply.noOp")
            : renderT(locale, "avatars.apply.done")}
        </h2>
        {isDry && (
          <span
            className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{
              color: "var(--accent)",
              background: "var(--surface-2)",
            }}
          >
            {renderT(locale, "avatars.apply.dryBadge")}
          </span>
        )}
      </div>
      {isDry && (
        <p className="text-xs text-[var(--text-muted)] italic">
          {renderT(locale, "avatars.apply.dryNote")}
        </p>
      )}
      <div className="text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Count
          label={renderT(locale, "avatars.apply.installed")}
          value={report.installed.length}
          color="var(--accent-2)"
        />
        <Count
          label={renderT(locale, "avatars.apply.activated")}
          value={report.activated ? 1 : 0}
          color="var(--accent-2)"
        />
        <Count
          label={renderT(locale, "avatars.apply.skipped")}
          value={report.skipped.length}
          color="var(--text-muted)"
        />
        <Count
          label={renderT(locale, "avatars.apply.failed")}
          value={report.failed.length}
          color={
            report.failed.length > 0 ? "var(--error)" : "var(--text-muted)"
          }
        />
      </div>
      {report.steps.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]">
            {renderT(locale, "avatars.apply.steps")} ({report.steps.length})
          </summary>
          <ul className="mt-2 space-y-0.5 font-mono text-[10px]">
            {report.steps.map((s, i) => (
              <li
                key={i}
                style={{
                  color:
                    s.status === "failed"
                      ? "var(--error)"
                      : s.status === "ok"
                        ? "var(--accent-2)"
                        : "var(--text-muted)",
                }}
              >
                [{s.status}]{s.dry ? " (dry)" : ""} {s.action}:{" "}
                <code className="kbd">{s.target}</code>
                {s.message && <span className="italic"> — {s.message}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Count({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="surface-2 rounded px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-base font-mono font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
