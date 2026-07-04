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
  "nav.forge": string;
  "nav.capabilities": string;
  "nav.avatars": string;
  "nav.groupInspect": string;
  "nav.groupManage": string;

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
  "btn.clear": string;
  "btn.add": string;
  "btn.remove": string;
  "btn.create": string;
  "btn.edit": string;
  "btn.filter": string;
  "btn.submit": string;
  "btn.ariaConfirmDelete": string;
  "btn.ariaDelete": string;
  "btn.ariaDeleteProfile": string;
  "btn.ariaApplyTitle": string;
  "btn.ariaUnapplyTitle": string;
  "btn.ariaEditPolicy": string;
  "btn.ariaFormActions": string;
  "btn.ariaRange": string;
  "btn.ariaSearch": string;
  "btn.ariaSearchCatalog": string;
  "btn.ariaComposeCanvas": string;
  "btn.ariaRemoveBlock": string;

  // ─── Loading / empty / errors ────────────────────────────────
  "loading.generic": string;
  "loading.form": string;
  "loading.catalog": string;
  "loading.policies": string;
  "loading.policyForm": string;
  "error.couldntLoad.title": string;
  "error.couldntLoad.body": string;
  "status.unsaved": string;
  "status.saving": string;

  // ─── Policy list / edit ─────────────────────────────────────
  "policy.edit.h1": string;
  "policy.edit.backToList": string;
  "policy.edit.backToListAria": string;
  "policy.edit.ariaEdit": string;
  "policy.descriptionLabel": string;
  "policy.empty.title": string;
  "policy.empty.body": string;
  "policy.serverHint": string;
  "policy.newCard.title": string;
  "policy.newCard.nameLabel": string;
  "policy.newCard.namePlaceholder": string;
  "policy.newCard.templateLabel": string;
  "policy.newCard.templateSafeBash": string;
  "policy.newCard.templateSafeBashDesc": string;
  "policy.newCard.templateReadonly": string;
  "policy.newCard.templateReadonlyDesc": string;
  "policy.newCard.templateEmpty": string;
  "policy.newCard.templateEmptyDesc": string;
  "policy.newCard.submit": string;
  "policy.newCard.errorInvalidName": string;
  "policy.tryRule.h2": string;
  "policy.tryRule.noPolicies": string;
  "policy.tryRule.policyLabel": string;
  "policy.tryRule.toolLabel": string;
  "policy.tryRule.argsLabel": string;
  "policy.tryRule.runCheck": string;
  "policy.check": string;
  "policy.allowBadge": string;
  "policy.denyBadge": string;
  "policy.warnBadge": string;
  "policy.hitlBadge": string;
  "policy.hitlDesc": string;
  "policy.applyFailed": string;
  "policy.unapplyFailed": string;
  "policy.confirmDeleteProfile": string;

  // ─── Compose ────────────────────────────────────────────────
  "compose.searchPlaceholder": string;
  "compose.emptySearch": string;
  "compose.dragHint": string;
  "compose.canvasAria": string;
  "compose.canvasEmpty": string;
  "compose.canvasSelectBlock": string;
  "compose.removeBlock": string;

  // ─── Packages ───────────────────────────────────────────────
  "packages.noPacksHint": string;

  // ─── Profiles [name] ────────────────────────────────────────
  "profiles.editHeading": string;
  "profiles.descriptionPlaceholder": string;
  "profiles.saved": string;
  "profiles.model": string;
  "profiles.thinking": string;
  "profiles.packages": string;
  "profiles.activate": string;
  "profiles.active": string;
  "profiles.activeHint": string;
  "profiles.activatedToast": string;
  "profiles.clearedToast": string;
  "profiles.noActive": string;
  "profiles.activateFailed": string;

  // ─── Context ────────────────────────────────────────────────
  "context.loadedTitle": string;
  "context.infoTitle": string;

  // ─── Range nav ──────────────────────────────────────────────
  "range.today": string;

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
  "home.emptyState.title": string;
  "home.emptyState.subtitle": string;
  "home.emptyState.card1Title": string;
  "home.emptyState.card1Body": string;
  "home.emptyState.card1Cta": string;
  "home.emptyState.card2Title": string;
  "home.emptyState.card2Body": string;
  "home.emptyState.card2Cta": string;
  "home.emptyState.card3Title": string;
  "home.emptyState.card3Body": string;
  "home.emptyState.card3Cta": string;

  // packages
  "packages.h1": string;
  "packages.subtitle": string;
  "packages.searchPlaceholder": string;
  "packages.searchResultsFor": string;
  "packages.nothingMatches": string;
  "packages.installed": string;
  "packages.installedToast": string;
  "packages.uninstalledToast": string;
  "packages.installError": string;
  "packages.fetchError": string;
  "packages.viewAll": string;
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
  // Snapshot banner (v0.4.13+)
  "sessions.snapshot.h2": string;
  "sessions.snapshot.captured": string;
  "sessions.snapshot.profile": string;
  "sessions.snapshot.extensions": string;
  "sessions.snapshot.packs": string;
  "sessions.snapshot.none": string;
  "sessions.snapshot.missing": string;

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
  // Profile pre-fill from session (v0.4.13+)
  "profiles.fromSession.banner": string;
  "profiles.fromSession.modelLabel": string;
  "profiles.fromSession.toolsLabel": string;
  "profiles.fromSession.noTools": string;
  "profiles.fromSession.notFound": string;
  "profiles.fromSession.cta": string;
  "sessions.createProfileCta": string;
  // Session tree explorer (v0.4.13+)
  "sessions.tree.searchPlaceholder": string;
  "sessions.tree.searchLabel": string;
  "sessions.tree.filterLabel": string;
  "sessions.tree.expandAll": string;
  "sessions.tree.collapseAll": string;
  "sessions.tree.matchCount": string;

  // capabilities
  "capabilities.h1": string;
  "capabilities.subtitle": string;
  "capabilities.refreshHint": string;
  "capabilities.empty": string;
  "capabilities.sources": string;
  "capabilities.requires": string;
  "capabilities.conflicts": string;
  // Forge (v0.4.14+)
  "forge.h1": string;
  "forge.subtitle": string;
  "forge.searchLabel": string;
  "forge.searchPlaceholder": string;
  "forge.searchButton": string;
  "forge.empty": string;
  "forge.resultCount": string;
  "forge.inspect.h1": string;
  "forge.inspect.version": string;
  "forge.inspect.kind": string;
  "forge.inspect.description": string;
  "forge.inspect.skills": string;
  "forge.inspect.themes": string;
  "forge.inspect.prompts": string;
  "forge.inspect.commands": string;
  "forge.inspect.keybindings": string;
  "forge.inspect.extension": string;
  "forge.inspect.absorbMode": string;
  "forge.inspect.absorbCta": string;
  "forge.inspect.asIdLabel": string;
  "forge.inspect.asIdHint": string;
  "forge.inspect.absorbedToast": string;
  "forge.inspect.error": string;
  "forge.inspect.errorNotFound": string;
  "forge.inspect.errorInvalidId": string;
  "forge.inspect.errorSchema": string;
  "forge.inspect.notFound": string;
  "forge.noManifest": string;
  // Avatars (v0.5+)
  "avatars.h1": string;
  "avatars.subtitle": string;
  "avatars.empty": string;
  "avatars.captureCta": string;
  "avatars.cwdLabel": string;
  "avatars.cwdPlaceholder": string;
  "avatars.delete": string;
  "avatars.confirmDelete": string;
  "avatars.capturedToast": string;
  "avatars.deletedToast": string;
  "avatars.diffLink": string;
  "avatars.captured": string;
  "avatars.profile": string;
  "avatars.model": string;
  "avatars.packSources": string;
  "avatars.extensions": string;
  "avatars.status.match": string;
  "avatars.status.drift": string;
  "avatars.status.missing": string;
  "avatars.status.extra": string;
  "avatars.clean": string;
  "avatars.dirty": string;
  "avatars.detail.h1": string;
  "avatars.detail.capturedAt": string;
  "avatars.detail.expected": string;
  "avatars.detail.actual": string;
};
