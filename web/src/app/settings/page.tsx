/**
 * /settings — v2.0.6: real Settings module.
 *
 * v1.0.1 was a placeholder; v2.0.6 turns it into a 3-card
 * gateway into the three legacy sub-surfaces (Profiles /
 * Avatars / Help). Each card is a plain <Link> to the
 * legacy route.
 *
 * Same trade-off as /workflow: merging these three pages
 * into a single tabbed view is Phase 4+ work. For v2.0.6
 * the user gets a single menu entry that lands somewhere
 * useful, with a hint about the future tabbed layout.
 */
import Link from "next/link";
import { Settings as SettingsIcon, User, Image, HelpCircle, ArrowRight } from "lucide-react";
import { T } from "@/components/I18n";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface SubModule {
  href: string;
  titleKey: string;
  descKey: string;
  Icon: typeof SettingsIcon;
  accent: "primary" | "info" | "warning";
}

const SUB_MODULES: readonly SubModule[] = [
  {
    href: "/profiles",
    titleKey: "settings.sub.profiles.title",
    descKey: "settings.sub.profiles.desc",
    Icon: User,
    accent: "primary",
  },
  {
    href: "/avatars",
    titleKey: "settings.sub.avatars.title",
    descKey: "settings.sub.avatars.desc",
    Icon: Image,
    accent: "info",
  },
  {
    href: "/help",
    titleKey: "settings.sub.help.title",
    descKey: "settings.sub.help.desc",
    Icon: HelpCircle,
    accent: "warning",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 settings-page">
      <PageHeader
        icon={<SettingsIcon size={20} strokeWidth={1.75} />}
        title={<T k="settings.h1" />}
        subtitle={<T k="settings.subtitle" />}
      />

      <div className="settings-grid" aria-label="Settings sub-modules">
        {SUB_MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`settings-card settings-card--${m.accent}`}
          >
            <div className="settings-card-icon" aria-hidden="true">
              <m.Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="settings-card-main">
              <div className="settings-card-title">
                <T k={m.titleKey} />
              </div>
              <div className="settings-card-desc">
                <T k={m.descKey} />
              </div>
            </div>
            <div className="settings-card-arrow" aria-hidden="true">
              <ArrowRight size={18} strokeWidth={1.75} />
            </div>
          </Link>
        ))}
      </div>

      <EmptyState
        title="Coming soon"
        hint="Phase 4 will collect these three pages into a single tabbed settings view."
      />
    </div>
  );
}
