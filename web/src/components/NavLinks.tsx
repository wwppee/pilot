"use client";

/**
 * <NavLinks> — client-side nav rendering so the aria-label updates
 * when the user toggles language. Layout passes `currentPath` from
 * the server (Next.js sets `x-invoke-path` on the request), and the
 * nav items themselves use `<T>` so labels stay reactive.
 *
 * v0.4.14: nav is now grouped into two semantic buckets —
 *
 *   - **Inspect** (read-only views): Dashboard / Sessions / Usage /
 *     Tools / Context / Capabilities
 *   - **Manage** (action surfaces): Packages / Forge / Policy /
 *     Compose / Profiles
 *
 * Visual separators (`•`) keep the buckets distinguishable without
 * consuming vertical space; group labels stay hidden from sighted
 * users but exposed to screen readers via `<span class="sr-only">`
 * so the structure is communicated through assistive tech too.
 */

import Link from "next/link";
import { useT } from "./I18n";

type LabelKey =
  | "nav.dashboard"
  | "nav.packages"
  | "nav.sessions"
  | "nav.usage"
  | "nav.tools"
  | "nav.context"
  | "nav.policy"
  | "nav.compose"
  | "nav.profiles"
  | "nav.capabilities"
  | "nav.forge"
  | "nav.avatars"
  | "nav.plans"
  | "nav.try";

interface NavItem {
  href: string;
  labelKey: LabelKey;
}

interface NavGroup {
  /** sr-only label for screen readers; also shown visually when there's room. */
  labelKey: "nav.groupInspect" | "nav.groupManage";
  items: readonly NavItem[];
}

/**
 * Two semantic groups. The order within each group is intentional:
 * "Inspect" leads with the Dashboard (default landing page) and
 * follows the lifecycle read order; "Manage" leads with Packages
 * (most common action) and ends with Profiles (most opinionated).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelKey: "nav.groupInspect",
    items: [
      { href: "/", labelKey: "nav.dashboard" },
      { href: "/sessions", labelKey: "nav.sessions" },
      { href: "/usage", labelKey: "nav.usage" },
      { href: "/tools", labelKey: "nav.tools" },
      { href: "/context", labelKey: "nav.context" },
      { href: "/capabilities", labelKey: "nav.capabilities" },
      { href: "/avatars", labelKey: "nav.avatars" },
      { href: "/plans", labelKey: "nav.plans" },
      { href: "/try", labelKey: "nav.try" },
    ],
  },
  {
    labelKey: "nav.groupManage",
    items: [
      { href: "/packages", labelKey: "nav.packages" },
      { href: "/forge", labelKey: "nav.forge" },
      { href: "/policy", labelKey: "nav.policy" },
      { href: "/compose", labelKey: "nav.compose" },
      { href: "/profiles", labelKey: "nav.profiles" },
    ],
  },
] as const;

export function NavLinks({ currentPath }: { currentPath: string }) {
  const t = useT();

  const isActive = (href: string): boolean =>
    href === "/"
      ? currentPath === "/"
      : currentPath === href || currentPath.startsWith(href + "/");

  return (
    <nav
      className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm"
      role="navigation"
      aria-label={t("nav.ariaLabel")}
    >
      {NAV_GROUPS.map((group, gi) => (
        <div
          key={group.labelKey}
          className="flex flex-wrap items-baseline gap-x-3"
          role="group"
          aria-label={t(group.labelKey)}
        >
          <span className="sr-only">{t(group.labelKey)}</span>
          {/* Visible group label: small caps, faint — or hide on
              narrow screens. Stays a real DOM node so a sighted
              keyboard user can skip past via Tab order. */}
          <span
            aria-hidden="true"
            className="hidden sm:inline text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
          >
            {t(group.labelKey)}
          </span>
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : undefined}
                style={
                  active
                    ? { color: "var(--accent)", fontWeight: 600 }
                    : undefined
                }
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
          {gi < NAV_GROUPS.length - 1 && (
            <span
              aria-hidden="true"
              className="hidden sm:inline text-[var(--text-muted)] opacity-40 select-none"
            >
              •
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
