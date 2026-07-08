import Link from "next/link";
import { T } from "@/components/I18n";

/**
 * Root 404 page (Next.js App Router convention). Catches every
 * unmatched path under the app root that doesn't have its own
 * `not-found.tsx`. Renders a friendly surface + nav back.
 *
 * v0.5.10+: i18n title + helpful next-step links (top-level pages
 * the user might have meant instead).
 */
export default function NotFound() {
  return (
    <div className="surface rounded-lg p-6 max-w-xl">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
        <T k="error.notFound.code" />
      </p>
      <h1 className="text-xl font-bold mb-2">
        <T k="error.notFound.title" />
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        <T k="error.notFound.body" />
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/"
          className="px-3 py-1.5 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          <T k="nav.dashboard" />
        </Link>
        <Link
          href="/sessions"
          className="px-3 py-1.5 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          <T k="nav.sessions" />
        </Link>
        <Link
          href="/plans"
          className="px-3 py-1.5 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          <T k="nav.plans" />
        </Link>
        <Link
          href="/profiles"
          className="px-3 py-1.5 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          <T k="nav.profiles" />
        </Link>
      </div>
    </div>
  );
}
