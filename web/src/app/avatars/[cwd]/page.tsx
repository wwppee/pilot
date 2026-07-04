/**
 * /avatars/[cwd] — per-Avatar diff view.
 *
 * Shows expected vs actual side-by-side for every field, color-coded
 * by status (match / drift / missing / extra).
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type { AvatarDiff, DiffStatus } from "@/lib/types";

interface PageProps {
  params: Promise<{ cwd: string }>;
}

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<DiffStatus, string> = {
  match: "var(--accent-2)",
  drift: "var(--warn)",
  missing: "var(--error)",
  extra: "var(--accent)",
};

export default async function AvatarDetailPage({ params }: PageProps) {
  const { cwd: rawCwd } = await params;
  const cwd = decodeURIComponent(rawCwd);

  let diff: AvatarDiff | null = null;
  try {
    diff = await api.avatarDiff(cwd);
  } catch {
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
    return (
      <div className="space-y-6">
        <div className="text-xs text-[var(--text-muted)]">
          <Link href="/avatars">← back to avatars</Link>
        </div>
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
          Avatar not found.
        </div>
      </div>
    );
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
    </div>
  );
}