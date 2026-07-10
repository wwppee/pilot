/**
 * <NavLinks> — client-side nav with icons + tooltips + 3 groups.
 *
 * v0.5.18: complete nav redesign for beginners. Every item now
 * shows an emoji icon (decorative, aria-hidden) and a one-line
 * hover/focus tooltip explaining where the link goes. Three
 * semantic groups instead of two:
 *
 *   - **Inspect** (read-only views): Dashboard / Sessions / Usage /
 *     Tools / Context / Capabilities / Avatars / Plans / Try pi
 *   - **Manage** (write actions): Packages / Forge / Policy /
 *     Compose / Profiles
 *   - **Learn** (onboarding): Glossary / How-tos
 *
 * Group labels visible only when there's room (sm:); the bullet
 * separator stays for visual chunking. Tooltips use pure CSS
 * `:hover` / `:focus-within` so the nav stays zero-JS-state.
 */

import { useT } from "./I18n";
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

interface NavItem {
  href: string;
  labelKey: LabelKey;
  icon: string;
  hint: string;
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
        hint: "Today's stats + recent activity",
      },
      {
        href: "/try",
        labelKey: "nav.try",
        icon: "💬",
        hint: "Chat with pi from the browser",
      },
      {
        href: "/sessions",
        labelKey: "nav.sessions",
        icon: "📋",
        hint: "Browse past pi conversations",
      },
      {
        href: "/usage",
        labelKey: "nav.usage",
        icon: "📊",
        hint: "Tokens, cost, by-model breakdown",
      },
      {
        href: "/tools",
        labelKey: "nav.tools",
        icon: "🔧",
        hint: "Tools pi can call + their usage",
      },
      {
        href: "/context",
        labelKey: "nav.context",
        icon: "📄",
        hint: "Project rules pi reads on startup",
      },
      {
        href: "/capabilities",
        labelKey: "nav.capabilities",
        icon: "🧩",
        hint: "What pi is currently allowed to do",
      },
      {
        href: "/avatars",
        labelKey: "nav.avatars",
        icon: "🎭",
        hint: "Project's expected config (diff vs current)",
      },
      {
        href: "/plans",
        labelKey: "nav.plans",
        icon: "📝",
        hint: "Multi-step tasks for pi (v0.5.13+ UI)",
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
        hint: "Browse + install pi extensions",
      },
      {
        href: "/forge",
        labelKey: "nav.forge",
        icon: "🛠",
        hint: "Create / package your own extension",
      },
      {
        href: "/policy",
        labelKey: "nav.policy",
        icon: "🛡",
        hint: "Tool safety rules + confirm/block lists",
      },
      {
        href: "/compose",
        labelKey: "nav.compose",
        icon: "🧪",
        hint: "Try composable Box Garden prototypes",
      },
      {
        href: "/profiles",
        labelKey: "nav.profiles",
        icon: "👤",
        hint: "Saved capability bundles (model + tools)",
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
        hint: "Glossary + how-tos for beginners",
      },
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
              hint={item.hint}
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
