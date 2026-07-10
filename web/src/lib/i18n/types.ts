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
  "nav.plans": string;
  // v0.5.15+: try pi — chat UI in the browser.
  "nav.try": string;
  // v0.5.15+: /try page.
  "try.h1": string;
  "try.subtitle": string;
  "try.status.idle": string;
  "try.status.fetchingToken": string;
  "try.status.connecting": string;
  "try.status.connected": string;
  "try.status.disconnected": string;
  "try.status.errorUnknown": string;
  "try.action.connect": string;
  "try.action.disconnect": string;
  "try.action.send": string;
  "try.action.newSession": string;
  "try.action.abort": string;
  "try.prompt.label": string;
  "try.prompt.placeholder": string;
  "try.chat.emptyConnected": string;
  "try.chat.emptyDisconnected": string;
  "try.thinking": string;
  "try.streaming": string;
  "try.tool.executing": string;
  "try.tool.result": string;
  "try.tool.error": string;
  "try.tool.args": string;
  "try.developerDetails": string;
  "try.developerDetailsHint": string;
  "try.events.title": string;
  "try.events.clear": string;
  "try.events.emptyConnected": string;
  "try.events.emptyDisconnected": string;
  "nav.groupInspect": string;
  "nav.groupManage": string;

  // ─── Server status pill ──────────────────────────────────────
  "server.up": string;
  "server.down": string;

  // ─── Footer ──────────────────────────────────────────────────
  "footer.copy": string;
  "footer.endpoint": string;
  // v0.5.10+: layout <meta> tag i18n.
  "meta.title": string;
  "meta.description": string;

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
  // v0.5.11+ status labels.
  "status.disabled": string;
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
  // v0.5.10+: root error boundary + 404 page.
  "error.boundary.title": string;
  "error.boundary.body": string;
  "error.boundary.retry": string;
  "error.boundary.backHome": string;
  "error.boundary.digest": string;
  "error.notFound.code": string;
  "error.notFound.title": string;
  "error.notFound.body": string;
  // v0.5.10+: loading skeleton copy.
  "loading.skeleton": string;
  "loading.skeletonHint": string;
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
  // v0.5.11+: policy list page (badges + dry-run prose + new-card
  // template picker intro). Were hardcoded English.
  "policy.card.applied": string;
  "policy.card.notApplied": string;
  "policy.card.rulesCount": string;
  "policy.card.updatedAt": string;
  "policy.card.extSize": string;
  "policy.card.extMissing": string;
  "policy.dryRun.subtitle": string;
  "policy.newCard.subtitle": string;
  "policy.fieldLabel.paths": string;
  "policy.fieldLabel.cmds": string;
  "policy.fieldLabel.redact": string;
  "policy.error.notFound": string;
  // v0.5.10+: PolicyForm extension status + field hints + short labels.
  "policy.form.saveFirstApply": string;
  "policy.form.extensionRemoved": string;
  "policy.form.extensionNotApplied": string;
  "policy.form.extensionWrittenTo": string;
  "policy.form.errorPrefix": string;
  "policy.form.savedAt": string;
  "policy.form.ruleCount.one": string;
  "policy.form.ruleCount.many": string;
  "policy.form.descriptionPlaceholder": string;
  "policy.form.label.allow": string;
  "policy.form.label.paths": string;
  "policy.form.label.cmds": string;
  "policy.form.label.redact": string;
  "policy.form.label.hitl": string;
  "policy.form.label.unknown": string;
  // v0.5.10+: section legends + hints + placeholders for each
  // ToolPolicy field. These were hardcoded English in SECTION_DEFS.
  "policy.form.field.allow.legend": string;
  "policy.form.field.allow.hint": string;
  "policy.form.field.allow.placeholder": string;
  "policy.form.field.deny.legend": string;
  "policy.form.field.deny.hint": string;
  "policy.form.field.deny.placeholder": string;
  "policy.form.field.denyPaths.legend": string;
  "policy.form.field.denyPaths.hint": string;
  "policy.form.field.denyPaths.placeholder": string;
  "policy.form.field.denyCommands.legend": string;
  "policy.form.field.denyCommands.hint": string;
  "policy.form.field.denyCommands.placeholder": string;
  "policy.form.field.sensitivePatterns.legend": string;
  "policy.form.field.sensitivePatterns.hint": string;
  "policy.form.field.sensitivePatterns.placeholder": string;
  "policy.form.field.requireApproval.legend": string;
  "policy.form.field.requireApproval.hint": string;
  "policy.form.field.requireApproval.placeholder": string;

  // ─── Compose ────────────────────────────────────────────────
  "compose.searchPlaceholder": string;
  "compose.emptySearch": string;
  "compose.dragHint": string;
  "compose.canvasAria": string;
  "compose.canvasEmpty": string;
  "compose.canvasSelectBlock": string;
  "compose.removeBlock": string;
  // v0.5.10+: entity labels (singular + plural section header).
  "compose.entity.session": string;
  "compose.entity.pack": string;
  "compose.entity.profile": string;
  "compose.entity.policy": string;
  "compose.entity.capability": string;
  "compose.section.sessions": string;
  "compose.section.packs": string;
  "compose.section.profiles": string;
  "compose.section.policies": string;
  "compose.section.capabilities": string;
  // v0.5.10+: live-region announcements + keyboard hints.
  "compose.announce.movedLeft": string;
  "compose.announce.movedRight": string;
  "compose.announce.movedUp": string;
  "compose.announce.movedDown": string;
  "compose.announce.selectionCleared": string;
  "compose.confirm.removeAll": string;
  "compose.alert.invalidVersion": string;
  "compose.alert.invalidJson": string;
  // v0.5.10+: view-mode toggle (modern ↔ cozy 2.5D skin).
  "compose.viewMode.cozy": string;
  "compose.viewMode.modern": string;
  "compose.viewMode.tooltip.cozy": string;
  "compose.viewMode.tooltip.modern": string;
  // v0.5.11+ misc.
  "compose.filterAll": string;
  "compose.inspector.stale": string;
  "compose.aria.selected": string;
  "compose.inspector.blockCount.one": string;
  "compose.inspector.blockCount.other": string;
  "compose.inspector.openDetail": string;
  "compose.inspector.remove": string;
  "compose.announce.removedBlock": string;
  "compose.announce.addedBlock": string;
  "compose.aria.addEntity": string;
  // v0.5.11+ currency formatting.
  "currency.usd": string;

  // ─── Packages ───────────────────────────────────────────────
  "packages.noPacksHint": string;
  // v0.5.12: EmptyState hint with <code>cmd</code> — uses {cmd} placeholder
  // for the inline command; consumed by <RichT>.
  "packages.installed.emptyHint": string;
  // v0.5.10+: pack detail page (was hardcoded English).
  "packages.field.source": string;
  "packages.field.enabled": string;
  "packages.field.homepage": string;
  "packages.field.yes": string;
  "packages.field.no": string;
  "packages.install.h2": string;
  "packages.install.alreadyInstalled": string;
  "packages.install.notInstalled": string;
  "packages.install.update": string;
  "packages.install.install": string;
  "packages.install.underHood.before": string;
  "packages.install.underHood.after": string;
  "packages.uninstall.confirm": string;
  "packages.uninstall.h2": string;

  // ─── Profiles [name] ────────────────────────────────────────
  "profiles.editHeading": string;
  "profiles.descriptionPlaceholder": string;
  "profiles.saved": string;
  "profiles.model": string;
  "profiles.thinking": string;
  "profiles.packages": string;
  "profiles.provider": string;
  "profiles.description": string;
  "profiles.notes": string;
  "profiles.notesPlaceholder": string;
  "profiles.activate": string;
  "profiles.active": string;
  "profiles.activeHint": string;
  "profiles.activatedToast": string;
  "profiles.clearedToast": string;
  "profiles.noActive": string;
  "profiles.activateFailed": string;
  // v0.5.10+: profiles list empty state (long hint text + actionLabel).
  "profiles.empty.hint": string;
  "profiles.openForm": string;
  "profiles.packageCount.one": string;
  "profiles.packageCount.other": string;

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
  "home.empty.sessions.hint": string;
  "home.empty.packs": string;
  "home.empty.packs.hint": string;
  "home.refreshHint": string;
  "home.emptyState.title": string;
  // v0.5.10+: home quick-start aria-label.
  "home.quickStart.aria": string;
  // v0.5.12+: dashboard unit labels.
  "home.unit.messages": string;
  "home.unit.calls": string;
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
  "sessions.empty.hint": string;
  "sessions.col.id": string;
  "sessions.col.cwd": string;
  "sessions.col.lastUsed": string;
  "sessions.col.entries": string;
  "sessions.col.size": string;
  "sessions.col.model": string;
  // v0.5.9+: short preview of first user message — gives the list
  // scanability. Empty for sessions with no user-role entry.
  "sessions.col.topic": string;
  "sessions.topic.empty": string;
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
  "usage.empty.hint": string;
  "usage.showingLastN": string;
  "usage.loadError": string;

  // tools
  "tools.h1": string;
  "tools.subtitle": string;
  "tools.empty": string;
  "tools.empty.hint": string;
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
  "tools.loadError": string;

  // context
  "context.h1": string;
  "context.subtitle": string;
  "context.empty": string;
  "context.empty.hint": string;
  "context.section.loaded.title": string;
  "context.section.loaded.subtitle": string;
  "context.section.info.title": string;
  "context.section.info.subtitle": string;
  // v0.5.12+: discovery rules panel — show the user the search priority
  // + path so they understand "why this file showed up".
  "context.discovery.h2": string;
  "context.discovery.filenames": string;
  "context.discovery.filenamesHint": string;
  "context.discovery.paths": string;
  "context.discovery.pathsHint": string;
  "context.discovery.info": string;
  // v0.5.9+: friendly error when /context fails to load.
  "context.error.title": string;

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
  // Session info card (v0.5.3+)
  "sessions.info.h2": string;
  "sessions.info.model": string;
  "sessions.info.duration": string;
  "sessions.info.totalTokens": string;
  "sessions.info.totalCost": string;
  "sessions.info.toolsUsed": string;
  "sessions.info.assistantMessages": string;
  "sessions.info.noUsage": string;
  "sessions.info.noTools": string;
  "sessions.info.noModel": string;
  // Session tree explorer (v0.4.13+)
  "sessions.tree.searchPlaceholder": string;
  "sessions.tree.searchLabel": string;
  "sessions.tree.filterLabel": string;
  "sessions.tree.expandAll": string;
  "sessions.tree.collapseAll": string;
  "sessions.tree.matchCount": string;
  // v0.5.8+: filter chip labels per node type. Bucketized — `system`
  // covers all meta types (compaction, label, session_info, etc.).
  "sessions.tree.types.user": string;
  "sessions.tree.types.assistant": string;
  "sessions.tree.types.tool": string;
  "sessions.tree.types.system": string;
  "sessions.tree.types.model_change": string;
  "sessions.tree.types.thinking_level_change": string;
  // v0.5.8+: stats row labels above the tree.
  "sessions.tree.cols.cwd": string;
  "sessions.tree.cols.totalNodes": string;
  "sessions.tree.cols.maxDepth": string;
  "sessions.tree.cols.models": string;
  "sessions.tree.h2": string;
  "sessions.tree.noData": string;
  // v0.5.8+: error / empty state on the detail page.
  "sessions.backToList": string;
  "sessions.error.title": string;
  "sessions.error.hint": string;
  "sessions.error.retry": string;

  // capabilities
  "capabilities.h1": string;
  "capabilities.subtitle": string;
  "capabilities.refreshHint": string;
  "capabilities.empty": string;
  "capabilities.empty.hint": string;
  "capabilities.sources": string;
  "capabilities.requires": string;
  "capabilities.conflicts": string;
  "capabilities.diffLink": string;
  // Capability diff (v0.5.1+)
  "capdiff.h1": string;
  "capdiff.subtitle": string;
  "capdiff.pickerA": string;
  "capdiff.pickerB": string;
  "capdiff.pickerPlaceholder": string;
  "capdiff.swapCta": string;
  "capdiff.empty": string;
  "capdiff.notFound": string;
  "capdiff.equal": string;
  "capdiff.unequal": string;
  "capdiff.sourcesA": string;
  "capdiff.sourcesB": string;
  "capdiff.evalAbsent": string;
  "capdiff.field.title": string;
  "capdiff.field.type": string;
  "capdiff.field.description": string;
  "capdiff.field.sources": string;
  "capdiff.field.extensions": string;
  "capdiff.field.skills": string;
  "capdiff.field.prompts": string;
  "capdiff.field.themes": string;
  "capdiff.field.eval": string;
  "capdiff.field.conflicts": string;
  "capdiff.field.requires": string;
  "capdiff.field.inspiredBy": string;
  "capdiff.field.tags": string;
  "capdiff.field.createdAt": string;
  "capdiff.field.updatedAt": string;
  // Forge (v0.4.14+)
  "forge.h1": string;
  "forge.subtitle": string;
  "forge.searchLabel": string;
  "forge.searchPlaceholder": string;
  "forge.searchButton": string;
  "forge.empty": string;
  "forge.empty.unsearched": string;
  "forge.empty.hint": string;
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
  // v0.5.10+: list empty hint + capture-first actionLabel.
  "avatars.empty.hint": string;
  "avatars.captureFirst": string;
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
  // Avatar apply (v0.5.2+)
  "avatars.apply.caption": string;
  "avatars.apply.cta": string;
  "avatars.apply.confirm": string;
  "avatars.apply.running": string;
  "avatars.apply.done": string;
  "avatars.apply.installed": string;
  "avatars.apply.activated": string;
  "avatars.apply.skipped": string;
  "avatars.apply.failed": string;
  "avatars.apply.steps": string;
  // Avatar apply dry-run (v0.5.3+)
  "avatars.apply.dryCaption": string;
  "avatars.apply.dryCta": string;
  "avatars.apply.dryBadge": string;
  "avatars.apply.dryNote": string;
  "avatars.apply.noOp": string;

  // Plans (v0.5.7+)
  "plans.h1": string;
  "plans.subtitle": string;
  "plans.empty.title": string;
  "plans.empty.hint": string;
  "plans.empty.cta": string;
  "plans.col.id": string;
  "plans.col.status": string;
  "plans.col.strategy": string;
  "plans.col.tasks": string;
  "plans.col.updated": string;
  "plans.col.goal": string;
  "plans.status.draft": string;
  "plans.status.running": string;
  "plans.status.paused": string;
  "plans.status.completed": string;
  "plans.status.failed": string;
  "plans.status.cancelled": string;
  "plans.strategy.sequential": string;
  "plans.strategy.parallel": string;
  "plans.strategy.adaptive": string;
  "plans.action.start": string;
  "plans.action.pause": string;
  "plans.action.resume": string;
  "plans.action.cancel": string;
  "plans.action.delete": string;
  "plans.action.created": string;
  "plans.action.paused": string;
  "plans.action.resumed": string;
  "plans.action.cancelled": string;
  "plans.action.deleted": string;
  "plans.action.failed": string;
  "plans.detail.h1": string;
  "plans.detail.goal": string;
  "plans.detail.strategy": string;
  "plans.detail.created": string;
  "plans.detail.updated": string;
  "plans.detail.started": string;
  "plans.detail.completed": string;
  "plans.detail.context": string;
  "plans.detail.cwd": string;
  "plans.detail.profile": string;
  "plans.detail.tasks": string;
  "plans.detail.steps": string;
  "plans.detail.noTasks": string;
  "plans.detail.actions": string;
  "plans.detail.startHint": string;
  "plans.detail.executorNote": string;
  "plans.detail.confirmDelete": string;
  // v0.5.13+ — DAG visualization + event timeline + per-step details
  "plans.detail.dependsOn": string;
  "plans.detail.retries": string;
  "plans.detail.action": string;
  "plans.detail.graph": string;
  "plans.detail.graph.empty": string;
  "plans.detail.blocks": string;
  "plans.detail.events": string;
  "plans.detail.events.empty": string;
  "plans.detail.tasksByStatus": string;
  // Task statuses
  "plans.taskStatus.pending": string;
  "plans.taskStatus.running": string;
  "plans.taskStatus.completed": string;
  "plans.taskStatus.failed": string;
  "plans.taskStatus.skipped": string;
  "plans.taskStatus.blocked": string;
  // Step statuses
  "plans.stepStatus.pending": string;
  "plans.stepStatus.running": string;
  "plans.stepStatus.completed": string;
  "plans.stepStatus.failed": string;
  "plans.stepStatus.skipped": string;
  // Step action types — shown as compact labels in the step list
  "plans.actionType.pilot_command": string;
  "plans.actionType.pi_session": string;
  "plans.actionType.profile_switch": string;
  "plans.actionType.pack_install": string;
  "plans.actionType.policy_apply": string;
  "plans.actionType.condition": string;
  "plans.actionType.wait": string;
  "plans.actionType.manual": string;
  // Plan event types — shown in the timeline
  "plans.event.plan_created": string;
  "plans.event.plan_started": string;
  "plans.event.plan_paused": string;
  "plans.event.plan_resumed": string;
  "plans.event.plan_completed": string;
  "plans.event.plan_failed": string;
  "plans.event.plan_cancelled": string;
  "plans.event.plan_deleted": string;
  "plans.event.task_started": string;
  "plans.event.task_completed": string;
  "plans.event.task_failed": string;
  "plans.event.task_skipped": string;
  "plans.event.step_started": string;
  "plans.event.step_completed": string;
  "plans.event.step_failed": string;
  "plans.event.step_retried": string;
  "plans.event.waiting_human": string;
  "plans.new.h1": string;
  "plans.new.subtitle": string;
  "plans.new.goalLabel": string;
  "plans.new.goalPlaceholder": string;
  "plans.new.submit": string;
  "plans.new.cancel": string;
  "plans.new.errorEmpty": string;
  "plans.suggest.title": string;
  "plans.suggest.subtitle": string;
  "plans.suggest.label": string;
  "plans.suggest.placeholder": string;
  "plans.suggest.button": string;
  "plans.suggest.matchedTools": string;
  "plans.suggest.matchedProfiles": string;
  "plans.suggest.noneTools": string;
  "plans.suggest.noneProfiles": string;
};
