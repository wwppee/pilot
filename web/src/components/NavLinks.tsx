"use client";

/**
 * <NavLinks> — client-side nav rendering so the aria-label updates
 * when the user toggles language. Layout passes `currentPath` from
 * the server (Next.js sets `x-invoke-path` on the request), and the
 * nav items themselves use `<T>` so labels stay reactive.
 */

import Link from "next/link";
import { useT } from "./I18n";

interface NavItem {
  href: string;
  labelKey:
    | "nav.dashboard"
    | "nav.packages"
    | "nav.sessions"
    | "nav.usage"
    | "nav.tools"
    | "nav.context"
    | "nav.policy"
    | "nav.compose"
    | "nav.profiles"
    | "nav.capabilities";
}

export const NAV_KEYS: readonly NavItem[] = [
  { href: "/", labelKey: "nav.dashboard" },
  { href: "/packages", labelKey: "nav.packages" },
  { href: "/sessions", labelKey: "nav.sessions" },
  { href: "/usage", labelKey: "nav.usage" },
  { href: "/tools", labelKey: "nav.tools" },
  { href: "/context", labelKey: "nav.context" },
  { href: "/policy", labelKey: "nav.policy" },
  { href: "/compose", labelKey: "nav.compose" },
  { href: "/profiles", labelKey: "nav.profiles" },
  { href: "/capabilities", labelKey: "nav.capabilities" },
] as const;

export function NavLinks({ currentPath }: { currentPath: string }) {
  const t = useT();

  return (
    <nav
      className="flex gap-4 text-sm"
      role="navigation"
      aria-label={t("nav.ariaLabel")}
    >
      {NAV_KEYS.map((item) => {
        const active =
          item.href === "/"
            ? currentPath === "/"
            : currentPath === item.href ||
              currentPath.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}