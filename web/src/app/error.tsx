"use client";

/**
 * Top-level error boundary (Next.js App Router convention).
 *
 * Renders when any server component throws an unhandled exception
 * inside the root layout. Lives at `app/error.tsx` so Next.js picks
 * it up automatically — no need to import anywhere.
 *
 * v0.5.10+: friendly recovery surface (title + nav back + retry).
 * Without this, Next.js shows an inline dev overlay in dev or a
 * blank Vercel error page in prod — both terrible.
 *
 * `reset()` re-renders the segment; the user keeps their current
 * URL and gets another chance to load.
 */
import Link from "next/link";
import { useEffect } from "react";
import { T } from "@/components/I18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console so devs can find it. Production telemetry
    // would go here (e.g. Sentry) but Pilot is local-first.
    console.error("Unhandled error in app root:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="surface rounded-lg p-6 border-l-4 border-l-[var(--error)]">
        <h1 className="text-lg font-semibold mb-2">
          <T k="error.boundary.title" />
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          <T k="error.boundary.body" />
        </p>
        {error.message && (
          <pre className="text-xs text-[var(--error)] whitespace-pre-wrap break-words surface-2 rounded p-2 mb-4">
            {error.message}
          </pre>
        )}
        {error.digest && (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            <T k="error.boundary.digest" />
            <code className="kbd ml-2">{error.digest}</code>
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
          >
            <T k="error.boundary.retry" />
          </button>
          <Link
            href="/"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            <T k="error.boundary.backHome" />
          </Link>
        </div>
      </div>
    </div>
  );
}
