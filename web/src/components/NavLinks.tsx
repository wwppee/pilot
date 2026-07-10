/**
 * <NavLinks> — server-rendered nav with icons + tooltips + 3 groups.
 *
 * v0.5.21: rewrote as a Server Component. The v0.5.18 version called
 * `useT()` (a client hook) without `"use client"` — that compiled
 * fine but crashed `next build` at static-generation time with
 * "useT() from the server but useT is on the client". The fix:
 * take `locale` as a prop, use the pure server `renderT(locale, key)`.
 *
 * Trade-off: the nav no longer re-renders on client-side language
 * toggle. The LanguageSwitcher is unaffected (it reads from the
 * I18nProvider context directly). To make the nav re-render on
 * language change we'd need a full page refresh — out of scope
 * for this fix.
 *
 * Three semantic groups:
 *
 *   - **Inspect** (read-only views): Dashboard / Try / Sessions /
 *     Usage / Tools / Context / Capabilities / Avatars / Plans
 *   - **Manage** (write actions): Packages / Forge / Policy /
 *     Compose / Profiles
 *   - **Learn** (onboarding): Help
 *
 * Group labels visible only when there's room (sm:); the bullet
 * separator stays for visual chunking. Tooltips use pure CSS
 * `:hover` / `:focus-within` so the nav stays zero-JS-state.
 */

import { renderT, type Locale } from "@/lib/i18n";
import { NavTooltip } from "./NavTooltip";

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
  | "nav.try"
  | "nav.help";

type HintKey =
  | "nav.hint.dashboard"
  | "nav.hint.try"
  | "nav.hint.sessions"
  | "nav.hint.usage"
  | "nav.hint.tools"
  | "nav.hint.context"
  | "nav.hint.capabilities"
  | "nav.hint.avatars"
  | "nav.hint.plans"
  | "nav.hint.packages"
  | "nav.hint.forge"
  | "nav.hint.policy"
  | "nav.hint.compose"
  | "nav.hint.profiles"
  | "nav.hint.help";

interface NavItem {
  href: string;
  labelKey: LabelKey;
  icon: string;
  /** i18n key for the hover tooltip body. */
  hintKey: HintKey;
}

interface NavGroup {
  labelKey: "nav.groupInspect" | "nav.groupManage" | "nav.groupLearn";
  items: readonly NavItem[];
}

/**
 * Three semantic groups. "Inspect" leads with the Dashboard
 * (default landing) and follows the read order. "Manage" leads
 * with Packages (most common write). "Learn" hosts onboarding.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelKey: "nav.groupInspect",
    items: [
      {
        href: "/",
        labelKey: "nav.dashboard",
        icon: "🏠",
        hintKey: "nav.hint.dashboard",
      },
      {
        href: "/try",
        labelKey: "nav.try",
        icon: "💬",
        hintKey: "nav.hint.try",
      },
      {
        href: "/sessions",
        labelKey: "nav.sessions",
        icon: "📋",
        hintKey: "nav.hint.sessions",
      },
      {
        href: "/usage",
        labelKey: "nav.usage",
        icon: "📊",
        hintKey: "nav.hint.usage",
      },
      {
        href: "/tools",
        labelKey: "nav.tools",
        icon: "🔧",
        hintKey: "nav.hint.tools",
      },
      {
        href: "/context",
        labelKey: "nav.context",
        icon: "📄",
        hintKey: "nav.hint.context",
      },
      {
        href: "/capabilities",
        labelKey: "nav.capabilities",
        icon: "🧩",
        hintKey: "nav.hint.capabilities",
      },
      {
        href: "/avatars",
        labelKey: "nav.avatars",
        icon: "🎭",
        hintKey: "nav.hint.avatars",
      },
      {
        href: "/plans",
        labelKey: "nav.plans",
        icon: "📝",
        hintKey: "nav.hint.plans",
      },
    ],
  },
  {
    labelKey: "nav.groupManage",
    items: [
      {
        href: "/packages",
        labelKey: "nav.packages",
        icon: "📦",
        hintKey: "nav.hint.packages",
      },
      {
        href: "/forge",
        labelKey: "nav.forge",
        icon: "🛠",
        hintKey: "nav.hint.forge",
      },
      {
        href: "/policy",
        labelKey: "nav.policy",
        icon: "🛡",
        hintKey: "nav.hint.policy",
      },
      {
        href: "/compose",
        labelKey: "nav.compose",
        icon: "🧪",
        hintKey: "nav.hint.compose",
      },
      {
        href: "/profiles",
        labelKey: "nav.profiles",
        icon: "👤",
        hintKey: "nav.hint.profiles",
      },
    ],
  },
  {
    labelKey: "nav.groupLearn",
    items: [
      {
        href: "/help",
        labelKey: "nav.help",
        icon: "❓",
        hintKey: "nav.hint.help",
      },
    ],
  },
] as const;

export function NavLinks({
  currentPath,
  locale,
}: {
  currentPath: string;
  locale: Locale;
}) {
  const t = (k: string): string => renderT(locale, k);

  const isActive = (href: string): boolean =>
    href === "/"
      ? currentPath === "/"
      : currentPath === href || currentPath.startsWith(href + "/");

  return (
    <nav
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
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
          <span
            aria-hidden="true"
            className="hidden sm:inline text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
          >
            {t(group.labelKey)}
          </span>
          {group.items.map((item) => (
            <NavTooltip
              key={item.href}
              href={item.href}
              label={t(item.labelKey)}
              icon={item.icon}
              hint={t(item.hintKey)}
              active={isActive(item.href)}
            />
          ))}
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
