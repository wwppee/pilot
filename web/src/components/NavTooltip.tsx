/**
 * NavTooltip — small hover/focus popover explaining a nav item.
 *
 * v0.5.18: every nav item gets a one-line description so beginners
 * can preview where a link goes without clicking. Pure CSS using
 * `:hover` + `:focus-within` so no JS state needed.
 *
 * v0.5.21: removed `"use client"` — the component is pure JSX
 * (no hooks, no event handlers besides the implicit Link click)
 * so it renders fine from a Server Component parent. The parent
 * (`NavLinks`) now passes pre-translated `label` + `hint` strings
 * so no client-side translation context is required.
 */

import Link from "next/link";
import type { ReactNode } from "react";

interface NavTooltipProps {
  href: string;
  /** Short label (already on the link). */
  label: string;
  /** Icon (emoji or short unicode). */
  icon?: ReactNode;
  /** One-line description for the tooltip. */
  hint: string;
  /** Active route styling. */
  active?: boolean;
}

export function NavTooltip({
  href,
  label,
  icon,
  hint,
  active,
}: NavTooltipProps) {
  return (
    <span className="relative inline-flex group">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : undefined}
        className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)] focus:text-[var(--text)] focus:outline-none"
        style={active ? { color: "var(--accent)", fontWeight: 600 } : undefined}
      >
        {icon && (
          <span aria-hidden="true" className="text-base">
            {icon}
          </span>
        )}
        <span>{label}</span>
      </Link>
      {/* Tooltip — visible on hover (mouse) or keyboard focus. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 hidden group-hover:block group-focus-within:block whitespace-nowrap surface rounded px-2 py-1 text-[11px] shadow-lg text-[var(--text)]"
      >
        {hint}
      </span>
    </span>
  );
}
