/**
 * /sessions/[id] — single session tree view + snapshot banner.
 *
 * The pilot server returns:
 *   - a recursive tree (`/sessions/:id/tree`)
 *   - a derived snapshot (`/sessions/:id/snapshot`, v0.4.13+) with
 *     model + cwd + entry count from the JSONL, plus the active
 *     profile and generated policy extensions at capture time.
 *
 * The snapshot is "best-knowledge" — see core/session-snapshot.ts.
 *
 * v0.5.8: error / no-tree / missing-tree states now render a friendly
 * surface with a Retry button and a hint about `pilot server`. The
 * previous "fetch failed" raw dump was confusing — most users hit it
 * because the Pilot server wasn't running. The hint nudges them to
 * either start the dashboard or run `pilot server` directly.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type {
  SessionInfo,
  SessionInfoSummary,
  SessionSnapshot,
  SessionTree,
} from "@/lib/types";
import { SessionTreeExplorer } from "@/components/SessionTreeExplorer";
import { RetryButton } from "@/components/RetryButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function load(id: string): Promise<{
  tree: SessionTree | null;
  session: SessionInfo | null;
  snapshot: SessionSnapshot | null;
  info: SessionInfoSummary | null;
  error: string | null;
}> {
  try {
    const [tree, sessions, snapshot, info] = await Promise.all([
      api.sessionTree(id),
      api.sessions(),
      api.sessionSnapshot(id),
      api.sessionInfo(id),
    ]);
    const session = sessions.find((s) => s.id === id) ?? null;
    return { tree, session, snapshot, info, error: null };
  } catch (e) {
    return {
      tree: null,
      session: null,
      snapshot: null,
      info: null,
      error: (e as Error).message,
    };
  }
}

export default async function SessionTreePage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const { tree, session, snapshot, info, error } = await load(decoded);

  let locale: Locale = "en";
  try {
    const acceptLanguage = (await headers()).get("accept-language");
    locale = negotiateLocale(acceptLanguage);
  } catch {
    /* static generation fallback */
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-xs text-[var(--text-muted)]">
          <Link href="/sessions">{renderT(locale, "sessions.backToList")}</Link>
        </div>
        <ErrorSurface
          error={error}
          backHref="/sessions"
          backLabel={renderT(locale, "sessions.backToList")}
          locale={locale}
        />
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="space-y-6">
        <div className="text-xs text-[var(--text-muted)]">
          <Link href="/sessions">{renderT(locale, "sessions.backToList")}</Link>
        </div>
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
          {renderT(locale, "sessions.tree.noData")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)] flex items-center justify-between">
        <Link href="/sessions">{renderT(locale, "sessions.backToList")}</Link>
        <Link
          href={`/profiles?from=${encodeURIComponent(tree.id)}`}
          className="text-[var(--accent)] hover:underline"
        >
          {renderT(locale, "sessions.createProfileCta")} →
        </Link>
      </div>

      <header className="surface rounded-lg p-4">
        <h1 className="text-lg font-bold">
          <code className="kbd">{tree.id}</code>
        </h1>
        <div className="text-xs text-[var(--text-muted)] mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label={renderT(locale, "sessions.tree.cols.cwd")}
            value={session?.cwd ?? "—"}
            mono
          />
          <Stat
            label={renderT(locale, "sessions.tree.cols.totalNodes")}
            value={String(tree.totalNodes)}
          />
          <Stat
            label={renderT(locale, "sessions.tree.cols.maxDepth")}
            value={String(tree.maxDepth)}
          />
          <Stat
            label={renderT(locale, "sessions.tree.cols.models")}
            value={tree.models.length === 0 ? "—" : tree.models.join(", ")}
            mono
          />
        </div>
      </header>

      <SnapshotBanner snapshot={snapshot} locale={locale} />

      <SessionInfoCard info={info} locale={locale} />

      <div className="surface rounded-lg p-4 overflow-x-auto">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
          {renderT(locale, "sessions.tree.h2")}
        </h2>
        <SessionTreeExplorer root={tree.root} locale={locale} />
      </div>
    </div>
  );
}

/**
 * v0.5.8+: friendly error surface. The raw fetch error stays visible
 * (it usually contains the ECONNREFUSED or DNS error), but we wrap it
 * with a title + server-start hint + Retry button. RSC — Retry uses
 * router.refresh() via a tiny client wrapper below.
 */
function ErrorSurface({
  error,
  backHref,
  backLabel,
  locale,
}: {
  error: string;
  backHref: string;
  backLabel: string;
  locale: Locale;
}) {
  return (
    <div className="surface rounded-lg p-4 space-y-3">
      <div className="text-sm font-medium">
        {renderT(locale, "sessions.error.title")}
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        {renderT(locale, "sessions.error.hint")}
      </div>
      <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2">
        {error}
      </pre>
      <div className="flex items-center gap-3 pt-1">
        <RetryButton label={renderT(locale, "sessions.error.retry")} />
        <Link
          href={backHref}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * v0.4.13: derived snapshot banner. Shows model (already in tree
 * header), active profile, generated policy extensions, and pack
 * sources — everything Pilot knows about this session right now.
 *
 * Honest about being best-knowledge: the small caption points users
 * to the note in the snapshot for caveats about historical truth.
 */
function SnapshotBanner({
  snapshot,
  locale,
}: {
  snapshot: SessionSnapshot | null;
  locale: Locale;
}) {
  if (!snapshot) {
    return (
      <div className="surface rounded-lg p-4 text-xs text-[var(--text-muted)] italic">
        {renderT(locale, "sessions.snapshot.missing")}
      </div>
    );
  }

  return (
    <section
      className="surface rounded-lg p-4"
      aria-label={renderT(locale, "sessions.snapshot.h2")}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {renderT(locale, "sessions.snapshot.h2")}
        </h2>
        <span className="text-[10px] text-[var(--text-muted)]">
          {renderT(locale, "sessions.snapshot.captured", {
            when: new Date(snapshot.capturedAt).toLocaleString(),
          })}
        </span>
      </div>
      <dl className="text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SnapshotField
          label={renderT(locale, "sessions.snapshot.profile")}
          value={
            snapshot.activeProfile ? (
              <code className="kbd">{snapshot.activeProfile}</code>
            ) : (
              <span className="italic text-[var(--text-muted)]">
                {renderT(locale, "sessions.snapshot.none")}
              </span>
            )
          }
        />
        <SnapshotField
          label={renderT(locale, "sessions.snapshot.extensions")}
          value={
            snapshot.extensions && snapshot.extensions.length > 0 ? (
              <ul className="space-y-0.5">
                {snapshot.extensions.map((ext) => (
                  <li key={ext}>
                    <code className="kbd">{ext}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="italic text-[var(--text-muted)]">
                {renderT(locale, "sessions.snapshot.none")}
              </span>
            )
          }
        />
        <SnapshotField
          label={renderT(locale, "sessions.snapshot.packs")}
          value={
            snapshot.packSources && snapshot.packSources.length > 0 ? (
              <ul className="space-y-0.5">
                {snapshot.packSources.map((src) => (
                  <li key={src}>
                    <code className="kbd">{src}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="italic text-[var(--text-muted)]">
                {renderT(locale, "sessions.snapshot.none")}
              </span>
            )
          }
        />
      </dl>
      <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">
        {snapshot.note}
      </p>
    </section>
  );
}

function SnapshotField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-sm mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * v0.5.3: per-session summary card — model + duration + tokens +
 * cost + tool usage. Sourced from the same JSONL trace but sliced
 * per-session instead of aggregated like `/usage`.
 *
 * Renders nothing when info is null (404 / pre-derive); the snapshot
 * banner above already shows the model in its own row.
 */
function SessionInfoCard({
  info,
  locale,
}: {
  info: SessionInfoSummary | null;
  locale: Locale;
}) {
  if (!info) return null;

  const duration = info.durationMs > 0 ? formatDuration(info.durationMs) : "—";
  const cost =
    info.totalCost > 0
      ? `$${info.totalCost.toFixed(4)}`
      : info.totalCost === 0
        ? "$0.0000"
        : "—";
  const tokens =
    info.totalTokens > 0
      ? info.totalTokens.toLocaleString()
      : renderT(locale, "sessions.info.noUsage");

  return (
    <section
      className="surface rounded-lg p-4"
      aria-label={renderT(locale, "sessions.info.h2")}
    >
      <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
        {renderT(locale, "sessions.info.h2")}
      </h2>
      <dl className="text-xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <InfoField
          label={renderT(locale, "sessions.info.model")}
          value={
            info.model ? (
              <code className="kbd">{info.model}</code>
            ) : (
              <span className="italic text-[var(--text-muted)]">
                {renderT(locale, "sessions.info.noModel")}
              </span>
            )
          }
        />
        <InfoField
          label={renderT(locale, "sessions.info.duration")}
          value={duration}
        />
        <InfoField
          label={renderT(locale, "sessions.info.totalTokens")}
          value={tokens}
          mono
        />
        <InfoField
          label={renderT(locale, "sessions.info.totalCost")}
          value={cost}
          mono
        />
        <InfoField
          label={renderT(locale, "sessions.info.assistantMessages")}
          value={String(info.assistantMessages)}
        />
        <InfoField
          label={renderT(locale, "sessions.info.toolsUsed")}
          value={
            info.toolsUsed.length > 0 ? (
              <ul className="space-y-0.5">
                {info.toolsUsed.map((t) => (
                  <li
                    key={t.toolName}
                    className="flex items-center justify-between gap-2"
                  >
                    <code className="kbd">{t.toolName}</code>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      ×{t.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="italic text-[var(--text-muted)]">
                {renderT(locale, "sessions.info.noTools")}
              </span>
            )
          }
        />
      </dl>
    </section>
  );
}

function InfoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-1 ${mono ? "font-mono text-xs" : "text-sm"} break-words`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Compact human-readable duration. Examples:
 *   "12s", "3m 4s", "1h 5m", "2d 3h"
 */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return `${h}h ${remM}m`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return `${d}d ${remH}h`;
}
