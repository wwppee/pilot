/**
 * EmptyState — consistent "this list is empty" pattern across Pilot.
 *
 * Two-part message:
 *   1. **title** — what this list IS (so users know they're not lost)
 *   2. **hint**  — concrete next step (a command or link)
 *
 * Without these two, users hitting an empty page have no signal for
 * "am I in the wrong place" vs "what do I do now". This was the
 * v0.5.6 Web UI comprehension gap.
 *
 * Server-component safe (no "use client"). Pure JSX.
 */
import Link from "next/link";

interface Props {
  /** Short title — what this page would show. e.g. "No profiles yet." */
  title: string;
  /** Concrete next-step hint. May include a command name rendered as `<code>`. */
  hint: React.ReactNode;
  /** Optional secondary action — link to docs or related page. */
  actionHref?: string;
  actionLabel?: string;
}

export function EmptyState({ title, hint, actionHref, actionLabel }: Props) {
  return (
    <div className="surface rounded-lg p-6 text-sm space-y-3">
      <p className="font-semibold">{title}</p>
      <p className="text-[var(--text-muted)] leading-relaxed">{hint}</p>
      {actionHref && actionLabel && (
        <p>
          <Link
            href={actionHref}
            className="text-[var(--accent)] hover:underline"
          >
            {actionLabel} →
          </Link>
        </p>
      )}
    </div>
  );
}
