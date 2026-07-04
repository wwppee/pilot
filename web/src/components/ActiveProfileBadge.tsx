import { api } from "@/lib/pilot";
import type { ActiveProfile } from "@/lib/types";

/**
 * <ActiveProfileBadge> — server component shown in the header next
 * to the language switcher. Visible only when a profile is active.
 *
 * Clicking the badge jumps to /profiles so the user can change it.
 *
 * We load via `api.activeProfile()` and tolerate failure (e.g.
 * pilot server down) — the badge just doesn't render.
 */

export async function ActiveProfileBadge() {
  let active: ActiveProfile | null = null;
  try {
    active = await api.activeProfile();
  } catch {
    /* pilot server may be down — that's fine, badge just doesn't show */
  }
  if (!active) return null;

  return (
    <a
      href="/profiles"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors"
      style={{
        background: "var(--accent-2)",
        color: "var(--bg)",
        textDecoration: "none",
      }}
      aria-label={`${active.name} (active profile)`}
      title={`Active profile: ${active.name} — click to change`}
    >
      <span aria-hidden="true">★</span>
      <span className="font-mono">{active.name}</span>
    </a>
  );
}
