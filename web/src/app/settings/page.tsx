/**
 * /settings — v1.0.1: 7-module nav placeholder for the Settings module.
 *
 * Merges the 3 legacy surfaces: Profiles (model + tools + thinking
 * preset), Avatars (project snapshot + diff + apply), Help (glossary
 * + how-tos). The merge is administrative: nothing about how the
 * data is stored changes, just that one menu entry replaces three.
 *
 * v1.0.2 will replace this stub with the real Settings module:
 *   - profile editor (existing /profiles) as primary tab
 *   - avatar manager (existing /avatars) as second tab
 *   - system preferences (theme, language, data cleanup) as
 *     third tab — currently scattered, will be collected here
 *   - help (existing /help) as fourth tab
 */
import { T } from "@/components/I18n";
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="hub-h1">
          <T k="settings.h1" />
        </h1>
        <p className="hub-subtitle">
          <T k="settings.subtitle" />
        </p>
      </header>

      <div className="surface rounded-lg p-6 text-sm text-[var(--text-muted)]">
        <p className="mb-3">
          <strong className="text-[var(--text)]">
            <T k="settings.comingSoon.title" />
          </strong>
        </p>
        <p className="mb-4">
          <T k="settings.comingSoon.body" />
        </p>
        <p className="text-xs">
          <T k="settings.comingSoon.routes" />
          <code className="kbd ml-1">/profiles</code>
          <code className="kbd ml-1">/avatars</code>
          <code className="kbd ml-1">/help</code>
        </p>
      </div>
    </div>
  );
}
