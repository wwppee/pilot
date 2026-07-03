/**
 * i18n — Pilot Web UI locale system.
 *
 * Scope: layout (nav, status, footer, skip link, language switcher) + every
 * page hero + every button label + every table header. Not translated:
 * API data (model / pack / tool names) — that's real data, not UI chrome.
 *
 * Resolution order (highest → lowest priority):
 *   1. localStorage["pilot-locale"]   (user explicitly switched)
 *   2. Accept-Language header        (browser/system default)
 *   3. fallback "en"
 *
 * Use the `<T k="key" />` component in server components, or `useT()` in
 * client components. See `<I18nProvider>` for the runtime that keeps the
 * context in sync with localStorage.
 */

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Dict = {
  // ─── Skip link / a11y ────────────────────────────────────────
  "skip.toMain": string;
  "nav.ariaLabel": string;

  // ─── Brand ───────────────────────────────────────────────────
  "brand.name": string;
  "brand.ariaHome": string;

  // ─── Nav (10 items) ──────────────────────────────────────────
  "nav.dashboard": string;
  "nav.packages": string;
  "nav.sessions": string;
  "nav.usage": string;
  "nav.tools": string;
  "nav.context": string;
  "nav.policy": string;
  "nav.compose": string;
  "nav.profiles": string;
  "nav.capabilities": string;

  // ─── Server status pill ──────────────────────────────────────
  "server.up": string;
  "server.down": string;

  // ─── Footer ──────────────────────────────────────────────────
  "footer.copy": string;
  "footer.endpoint": string;

  // ─── Language switcher ───────────────────────────────────────
  "lang.label": string;
  "lang.en": string;
  "lang.zh": string;

  // ─── Common buttons ──────────────────────────────────────────
  "btn.save": string;
  "btn.saved": string;
  "btn.saving": string;
  "btn.cancel": string;
  "btn.back": string;
  "btn.backToList": string;
  "btn.apply": string;
  "btn.applyGenerate": string;
  "btn.unapply": string;
  "btn.delete": string;
  "btn.confirmDelete": string;
  "btn.search": string;
  "btn.refresh": string;
  "btn.export": string;
  "btn.import": string;
  "btn.add": string;
  "btn.remove": string;
  "btn.create": string;
  "btn.ariaConfirmDelete": string;
  "btn.ariaDelete": string;
  "btn.ariaApplyTitle": string;
  "btn.ariaUnapplyTitle": string;

  // ─── Pages ───────────────────────────────────────────────────
  // home (dashboard)
  "home.h1": string;
  "home.subtitle": string;
  "home.error.title": string;
  "home.error.body": string;
  "home.card.sessions": string;
  "home.card.messages": string;
  "home.card.toolCalls": string;
  "home.card.tokens": string;
  "home.card.cost": string;
  "home.section.today": string;
  "home.section.byModel": string;
  "home.section.topTools": string;
  "home.section.recentSessions": string;
  "home.section.installedPacks": string;
  "home.link.seeAll": string;
  "home.link.manage": string;
  "home.empty.sessions": string;
  "home.empty.packs": string;
  "home.refreshHint": string;

  // packages
  "packages.h1": string;
  "packages.subtitle": string;
  "packages.searchPlaceholder": string;
  "packages.searchResultsFor": string;
  "packages.nothingMatches": string;
  "packages.installed": string;
  "packages.empty": string;

  // sessions
  "sessions.h1": string;
  "sessions.subtitle": string;
  "sessions.empty": string;
  "sessions.col.id": string;
  "sessions.col.cwd": string;
  "sessions.col.lastUsed": string;
  "sessions.col.entries": string;
  "sessions.col.size": string;
  "sessions.col.model": string;

  // usage
  "usage.h1": string;
  "usage.subtitle": string;
  "usage.range.today": string;
  "usage.range.week": string;
  "usage.range.month": string;
  "usage.range.all": string;
  "usage.card.sessions": string;
  "usage.card.assistantMessages": string;
  "usage.card.totalTokens": string;
  "usage.card.totalCost": string;
  "usage.byModel.title": string;
  "usage.byDay.title": string;
  "usage.col.model": string;
  "usage.col.msgs": string;
  "usage.col.input": string;
  "usage.col.output": string;
  "usage.col.cacheR": string;
  "usage.col.cacheW": string;
  "usage.col.total": string;
  "usage.col.cost": string;
  "usage.empty": string;
  "usage.empty.model": string;
  "usage.empty.day": string;
  "usage.showingLastN": string;

  // tools
  "tools.h1": string;
  "tools.subtitle": string;
  "tools.empty": string;
  "tools.section.builtin.title": string;
  "tools.section.builtin.subtitle": string;
  "tools.section.local.title": string;
  "tools.section.local.subtitle": string;
  "tools.section.npm.title": string;
  "tools.section.npm.subtitle": string;
  "tools.col.name": string;
  "tools.col.source": string;
  "tools.col.safety": string;
  "tools.col.description": string;
  "tools.col.status": string;

  // context
  "context.h1": string;
  "context.subtitle": string;
  "context.empty": string;
  "context.section.loaded.title": string;
  "context.section.loaded.subtitle": string;
  "context.section.info.title": string;
  "context.section.info.subtitle": string;

  // policy
  "policy.h1": string;
  "policy.subtitle": string;

  // compose
  "compose.h1": string;
  "compose.subtitle": string;
  "compose.inspector": string;
  "compose.emptyCanvas": string;

  // profiles
  "profiles.h1": string;
  "profiles.subtitle": string;
  "profiles.newNameLabel": string;
  "profiles.newNamePlaceholder": string;
  "profiles.empty": string;
  "profiles.delete": string;

  // capabilities
  "capabilities.h1": string;
  "capabilities.subtitle": string;
  "capabilities.refreshHint": string;
  "capabilities.empty": string;
  "capabilities.sources": string;
  "capabilities.requires": string;
  "capabilities.conflicts": string;
};