/**
 * <NavLinks> — v2.0.0: 7-module navigation, lucide-react icons.
 *
 * v1.0.1 collapsed 19 entries into 7 modules with emoji icons.
 * v2.0.0 replaces the emoji with `lucide-react` SVG icons —
 * the same library `pilot-webui-redesign` references. SVG
 * icons render at any size, inherit `currentColor` for theme
 * state, and align crisply on a 1px grid; emoji are
 * inconsistent across platforms and rendered as bitmap
 * glyphs that don't match the rest of the Dark Sci-Fi Tech
 * direction.
 *
 * The 7 module → icon mapping follows the
 * `pilot-webui-redesign` index page so users transitioning
 * from the design doc to the live dashboard see familiar
 * visuals. (Reference uses the CDN UMD build; we use
 * `lucide-react` because Next.js bundles it cleanly.)
 *
 * Server-rendered — same v0.5.21 caveat as before: the nav
 * doesn't re-render on client-side language toggle. The
 * LanguageSwitcher is unaffected.
 */

import { renderT, type Locale } from "@/lib/i18n";
import { NavTooltip } from "./NavTooltip";
import {
  Package,
  Workflow,
  Shield,
  Satellite,
  ScrollText,
  FileText,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

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
  /** Lucide icon component, rendered at 14×14 in the link. */
  Icon: LucideIcon;
  /** i18n key for the hover tooltip body. */
  hintKey: HintKey;
}

/**
 * The 7 core modules. Order matters: most-used first (Hub, Workflow,
 * Insight), administrative / config last (Settings). Sessions and
 * Context sit in the middle because they are 1:1 carries from the
 * old nav (no merge ambiguity).
 *
 * Icons (v2.0.0):
 *   - Hub         → Package         (npm-pack shape)
 *   - Workflow    → Workflow        (flow symbol; not Workflow from "compose" which was 🧪)
 *   - PolicySafe  → Shield          (gate / block / allow)
 *   - Insight     → Satellite       (monitoring; same as brand logo)
 *   - Sessions    → ScrollText      (history list)
 *   - Context     → FileText        (loaded file)
 *   - Settings    → Settings        (gear)
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/hub",
    labelKey: "nav.hub",
    Icon: Package,
    hintKey: "nav.hint.hub",
  },
  {
    href: "/workflow",
    labelKey: "nav.workflow",
    Icon: Workflow,
    hintKey: "nav.hint.workflow",
  },
  {
    href: "/policy",
    labelKey: "nav.policySafe",
    Icon: Shield,
    hintKey: "nav.hint.policySafe",
  },
  {
    href: "/insight",
    labelKey: "nav.insight",
    Icon: Satellite,
    hintKey: "nav.hint.insight",
  },
  {
    href: "/sessions",
    labelKey: "nav.sessions",
    Icon: ScrollText,
    hintKey: "nav.hint.sessions",
  },
  {
    href: "/context",
    labelKey: "nav.context",
    Icon: FileText,
    hintKey: "nav.hint.context",
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    Icon: SettingsIcon,
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
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <NavTooltip
            key={item.href}
            href={item.href}
            label={t(item.labelKey)}
            // v2.0.0: instantiate the lucide component as
            // an element so NavTooltip can render it inline.
            // We pass `size=14` to match the emoji visual
            // weight (14px glyph on a 14px-tall link row).
            icon={<item.Icon size={14} strokeWidth={1.75} />}
            hint={t(item.hintKey)}
            active={active}
          />
        );
      })}
    </nav>
  );
}
