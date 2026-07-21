/**
 * <PageHeader> — v2.0.3: shared page header for the 7 modules.
 *
 * Renders the icon + title + subtitle triple that every
 * 7-module page uses. The icon is a `ReactNode` (so callers
 * can pass `<Satellite size={24} />` directly without
 * re-importing the icon library here), the title is
 * typically `<T k="..." />`, and subtitle is either a
 * pre-translated string or `<T k="..." />`.
 *
 * Visual: matches `.hub-h1` / `.hub-subtitle` so swapping
 * this in place of the old `<h1> + <p>` pair is a no-op
 * for layout. The icon adds the v2.0.0 visual touch (matches
 * the nav-link icon for the same module).
 */
import type { ReactNode } from "react";

export function PageHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="space-y-1.5">
      <h1 className="hub-h1 flex items-center gap-3">
        <span
          className="page-header-icon"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span>{title}</span>
      </h1>
      {subtitle && <p className="hub-subtitle">{subtitle}</p>}
    </header>
  );
}
