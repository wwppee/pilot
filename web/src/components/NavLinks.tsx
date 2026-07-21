/**
 * <NavLinks> — v1.0.1: 7-module navigation.
 *
 * v0.5.x → v0.9.x used a 3-group layout (Inspect / Manage / Learn) with
 * 17 entries inherited from the pre-Phase-1 product surface. The legacy
 * 19-entry nav was the thing user flagged in the 2026-07-21 product
 * pivot ("19 入口臃肿"), so v1.0.1 collapses it to 7 modules.
 *
 * Why 7: the v1.0.0 README restated the product as
 * "AI Agent 能力管理层 (Agent Capability Management Layer)" with 7
 * core modules — Hub / Workflow / Policy & Security / Insight /
 * Sessions / Context / Settings. This component is the in-browser
 * mirror of that 7-module model. The 3-group split (Inspect/Manage/
 * Learn) is gone: with only 7 items, group labels are visual noise.
 *
 * Why server-rendered: v0.5.21 moved this to a Server Component and
 * takes `locale` as a prop (so we can use the pure `renderT(locale, k)`
 * without pulling `useT()` into a server context). Trade-off documented
 * inline below — nav doesn't re-render on client-side language toggle,
 * which matches v0.5.21 behaviour and is fine for now.
 *
 * The "active" highlight compares against `currentPath` with prefix
 * matching so `/hub/some-package` still highlights the Hub link.
 * Special case: `href === "/"` only matches the literal "/" path,
 * never a prefix.
 */

import { renderT, type Locale } from "@/lib/i18n";
import { NavTooltip } from "./NavTooltip";

type LabelKey =
  | "nav.hub"
  | "nav.workflow"
  | "nav.policySafe"
  | "nav.insight"
  | "nav.sessions"
  | "nav.context"
  | "nav.settings";

type HintKey =
  | "nav.hint.hub"
  | "nav.hint.workflow"
  | "nav.hint.policySafe"
  | "nav.hint.insight"
  | "nav.hint.sessions"
  | "nav.hint.context"
  | "nav.hint.settings";

interface NavItem {
  href: string;
  labelKey: LabelKey;
  icon: string;
  /** i18n key for the hover tooltip body. */
  hintKey: HintKey;
}

/**
 * The 7 core modules. Order matters: most-used first (Hub, Workflow,
 * Insight), administrative / config last (Settings). Sessions and
 * Context sit in the middle because they are 1:1 carries from the
 * old nav (no merge ambiguity).
 *
 * The icons are emoji placeholders — the visual refresh (which
 * uses the Dark Sci-Fi Tech tokens in `colors_and_type.css`) is
 * scoped to a later release; v1.0.1 is code-structure-only.
 *
 * Exported (not just module-private) so the nav-links test can
 * pin the order. The pre-v1.0.1 test exported `NAV_GROUPS` for
 * the same reason; v1.0.1 just renames it to the flat shape
 * the new nav actually has.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/hub",
    labelKey: "nav.hub",
    icon: "📦",
    hintKey: "nav.hint.hub",
  },
  {
    href: "/workflow",
    labelKey: "nav.workflow",
    icon: "🌀",
    hintKey: "nav.hint.workflow",
  },
  {
    href: "/policy",
    labelKey: "nav.policySafe",
    icon: "🛡",
    hintKey: "nav.hint.policySafe",
  },
  {
    href: "/insight",
    labelKey: "nav.insight",
    icon: "🛰️",
    hintKey: "nav.hint.insight",
  },
  {
    href: "/sessions",
    labelKey: "nav.sessions",
    icon: "📋",
    hintKey: "nav.hint.sessions",
  },
  {
    href: "/context",
    labelKey: "nav.context",
    icon: "📄",
    hintKey: "nav.hint.context",
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    icon: "⚙️",
    hintKey: "nav.hint.settings",
  },
];

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
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"
      role="navigation"
      aria-label={t("nav.ariaLabel")}
    >
      {NAV_ITEMS.map((item) => (
        <NavTooltip
          key={item.href}
          href={item.href}
          label={t(item.labelKey)}
          icon={item.icon}
          hint={t(item.hintKey)}
          active={isActive(item.href)}
        />
      ))}
    </nav>
  );
}
