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
 */
import Link from "next/link";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale, renderT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import type {
  SessionInfo,
  SessionSnapshot,
  SessionTree,
} from "@/lib/types";
import { SessionTreeExplorer } from "@/components/SessionTreeExplorer";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function load(id: string): Promise<{
  tree: SessionTree | null;
  session: SessionInfo | null;
  snapshot: SessionSnapshot | null;
  error: string | null;
}> {
  try {
    const [tree, sessions, snapshot] = await Promise.all([
      api.sessionTree(id),
      api.sessions(),
      api.sessionSnapshot(id),
    ]);
    const session = sessions.find((s) => s.id === id) ?? null;
    return { tree, session, snapshot, error: null };
  } catch (e) {
    return {
      tree: null,
      session: null,
      snapshot: null,
      error: (e as Error).message,
    };
  }
}

export default async function SessionTreePage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const { tree, session, snapshot, error } = await load(decoded);

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
          <Link href="/sessions">← back to sessions</Link>
        </div>
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
        No tree data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)] flex items-center justify-between">
        <Link href="/sessions">← back to sessions</Link>
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
          <Stat label="cwd" value={session?.cwd ?? "—"} mono />
          <Stat label="total nodes" value={String(tree.totalNodes)} />
          <Stat label="max depth" value={String(tree.maxDepth)} />
          <Stat
            label="models"
            value={tree.models.length === 0 ? "—" : tree.models.join(", ")}
            mono
          />
        </div>
      </header>

      <SnapshotBanner snapshot={snapshot} locale={locale} />

      <div className="surface rounded-lg p-4 overflow-x-auto">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
          Tree
        </h2>
        <SessionTreeExplorer root={tree.root} t={(k, params) => renderT(locale, k, params)} />
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