/**
 * OverflowMenu — collapsible menu triggered by a "⋯" button.
 *
 * v0.5.17: /try gets crowded on mobile (status pill + 4 buttons +
 * session name + clone button). We collapse the less-frequent
 * actions behind this menu on small viewports.
 *
 * Uses native `<details>` so we get free click-outside-to-close
 * + keyboard navigation without a single line of JS.
 */
"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useT } from "./I18n";

interface OverflowMenuProps {
  /** Trigger label / icon shown when closed. Default: "⋯". */
  trigger?: ReactNode;
  /** Items rendered inside the menu. */
  children: ReactNode;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
  /** Extra class names for the trigger button (size etc.). */
  triggerClassName?: string;
}

/**
 * A native-details-based overflow menu. Closes itself when an item
 * is clicked (so navigation-style actions don't leave a stale
 * open menu).
 */
export function OverflowMenu({
  trigger = "⋯",
  children,
  ariaLabel,
  triggerClassName = "btn secondary",
}: OverflowMenuProps) {
  // v0.6.11: pull the default aria-label from i18n so /try
  // (and any future caller) gets the localised string for
  // free. Callers can still override explicitly.
  const t = useT();
  const resolvedAriaLabel = ariaLabel ?? t("aria.moreActions");
  const ref = useRef<HTMLDetailsElement>(null);

  // Close on item click — we listen for any <button> child with
  // data-close-on-click. This is simpler than wiring each item.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button[data-close-on-click]")) {
        el.removeAttribute("open");
      }
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        className={`${triggerClassName} list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden`}
        aria-label={resolvedAriaLabel}
      >
        {trigger}
      </summary>
      <div className="absolute right-0 top-full mt-1 z-10 surface rounded-lg shadow-lg p-1 min-w-[180px] flex flex-col gap-1 text-sm">
        {children}
      </div>
    </details>
  );
}

/** Menu item — a button that auto-closes its parent menu on click. */
export function OverflowMenuItem({
  onClick,
  disabled,
  children,
  className = "text-left px-3 py-2 rounded hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:hover:bg-transparent",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-close-on-click
      className={className}
    >
      {children}
    </button>
  );
}
