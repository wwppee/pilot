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
  "aria.moreActions": string;

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
  // v0.7.0: workflows nav entry.
  "nav.workflows": string;
  "nav.profiles": string;
  "nav.forge": string;
  "nav.capabilities": string;
  "nav.avatars": string;
  "nav.plans": string;
  // v0.5.18: /help page.
  "help.h1": string;
  "help.subtitle": string;
  "help.section.howDoI": string;
  "help.section.glossary": string;
  "help.section.glossaryHint": string;
  "help.section.architecture": string;
  "help.section.architectureBody": string;
  // v0.5.22: /help "How do I…" cards (one title + one body per card).
  "help.howDo.firstSession.title": string;
  "help.howDo.firstSession.body": string;
  "help.howDo.findSession.title": string;
  "help.howDo.findSession.body": string;
  "help.howDo.installTool.title": string;
  "help.howDo.installTool.body": string;
  "help.howDo.switchModel.title": string;
  "help.howDo.switchModel.body": string;
  "help.howDo.blockDangerous.title": string;
  "help.howDo.blockDangerous.body": string;
  "help.howDo.checkSpending.title": string;
  "help.howDo.checkSpending.body": string;
  // v0.5.22: per-page inline <Hint> blocks. `summary` is the
  // collapsed line; `body` is the expanded paragraph. Bodies
  // use {placeholder} tokens for inline <code>, <strong>, <em>,
  // and <GlossaryTerm> nodes.
  "hint.defaultSummary": string;
  "tools.hint.summary": string;
  "tools.hint.body": string;
  "context.hint.summary": string;
  "context.hint.body": string;
  "capabilities.hint.summary": string;
  "capabilities.hint.body": string;
  "plans.hint.summary": string;
  "plans.hint.body": string;
  "compose.hint.summary": string;
  "compose.hint.body": string;
  "usage.hint.summary": string;
  "usage.hint.body": string;
  "sessions.hint.summary": string;
  "sessions.hint.body": string;
  "forge.hint.summary": string;
  "forge.hint.body": string;
  "packages.hint.summary": string;
  "packages.hint.body": string;
  "try.hint.summary": string;
  "try.hint.body": string;
  "profiles.hint.summary": string;
  "profiles.hint.body": string;
  "avatars.hint.summary": string;
  "avatars.hint.body": string;
  "policy.hint.summary": string;
  "policy.hint.body": string;
  // v0.5.15+: try pi — chat UI in the browser.
  "nav.try": string;
  "nav.hint.dashboard": string;
  "nav.hint.try": string;
  "nav.hint.sessions": string;
  "nav.hint.usage": string;
  "nav.hint.tools": string;
  "nav.hint.context": string;
  "nav.hint.capabilities": string;
  "nav.hint.avatars": string;
  "nav.hint.plans": string;
  "nav.hint.packages": string;
  "nav.hint.forge": string;
  "nav.hint.policy": string;
  "nav.hint.compose": string;
  // v0.7.0: workflows nav hint.
  "nav.hint.workflows": string;
  "nav.hint.profiles": string;
  "nav.hint.help": string;
  "home.welcome.title": string;
  "home.welcome.intro": string;
  "home.welcome.step1.label": string;
  "home.welcome.step1.desc": string;
  "home.welcome.step2.label": string;
  "home.welcome.step2.desc": string;
  "home.welcome.step3.label": string;
  "home.welcome.step3.desc": string;
  // v0.6.1: WelcomeBanner client-side strings.
  "home.welcome.stepN": string;
  "home.welcome.dismiss": string;
  // v0.6.1: PlanEditor (visual plan builder).
  "plans.editor.goalLabel": string;
  "plans.editor.goalPlaceholder": string;
  "plans.editor.titleLabel": string;
  "plans.editor.titlePlaceholder": string;
  "plans.editor.strategyLabel": string;
  "plans.editor.tasksLabel": string;
  "plans.editor.addTask": string;
  "plans.editor.noTasks": string;
  "plans.editor.taskIndex": string;
  "plans.editor.taskDescriptionPlaceholder": string;
  "plans.editor.profileLabel": string;
  "plans.editor.profileNone": string;
  "plans.editor.dependsOnLabel": string;
  "plans.editor.dependsOnNone": string;
  "plans.editor.stepsLabel": string;
  "plans.editor.addStep": string;
  "plans.editor.noSteps": string;
  "plans.editor.stepDescriptionPlaceholder": string;
  "plans.editor.removeTask": string;
  "plans.editor.removeStep": string;
  "plans.editor.moveUp": string;
  "plans.editor.moveDown": string;
  "plans.editor.conditionHelp": string;
  "plans.editor.submit": string;
  "plans.editor.submitting": string;
  "plans.editor.cancel": string;
  "plans.editor.error.goalEmpty": string;
  "plans.editor.error.noTasks": string;
  "plans.editor.error.fieldRequired": string;
  "plans.editor.field.command": string;
  "plans.editor.field.prompt": string;
  "plans.editor.field.profileName": string;
  "plans.editor.field.packSource": string;
  "plans.editor.field.policyName": string;
  "plans.editor.field.check": string;
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
  // v0.5.20: SessionTree view.
  "try.tree.title": string;
  "try.tree.hint": string;
  "try.tree.empty": string;
  "try.tree.stats": string;
  "try.tree.branches.one": string;
  "try.tree.branches.other": string;
  "try.tree.depth": string;
  // v0.5.16: pi session tree (rename / clone / fork).
  "try.session.title": string;
  "try.session.unnamed": string;
  "try.session.rename": string;
  "try.session.renamePlaceholder": string;
  "try.session.renameSave": string;
  "try.session.renameCancel": string;
  "try.session.clone": string;
  "try.session.cloneHint": string;
  "try.session.messageCount.one": string;
  "try.session.messageCount.other": string;
  "try.session.forkedFrom": string;
  "try.session.forkHere": string;
  "try.session.forkConfirm": string;
  "try.session.forkButton": string;
  "try.session.forkCancel": string;
  "try.session.cloneOk": string;
  "try.events.title": string;
  "try.events.clear": string;
  "try.events.emptyConnected": string;
  "try.events.emptyDisconnected": string;
  "nav.groupInspect": string;
  "nav.groupManage": string;
  "nav.groupLearn": string;
  "nav.help": string;

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
  // v0.6.16: error card heading when /policy can't load. The
  // previous text was `<T k="error.couldntLoad.title" />: policies`
  // — a raw ": policies" suffix that was English-only.
  "policy.loadErrorTitle": string;
  "policy.tryRule.noPolicies": string;
  "policy.tryRule.policyLabel": string;
  "policy.tryRule.toolLabel": string;
  "policy.tryRule.toolBash": string;
  "policy.tryRule.toolRead": string;
  "policy.tryRule.toolEdit": string;
  "policy.tryRule.toolWrite": string;
  "policy.tryRule.argsLabel": string;
  "policy.tryRule.runCheck": string;
  "policy.check": string;
  "policy.allowBadge": string;
  "policy.denyBadge": string;
  "policy.warnBadge": string;
  "policy.hitlBadge": string;
  "policy.toolRuleLabel": string;
  "policy.toolRuleEmpty": string;
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
  // v0.8.6: per-tool rule editor (closes the B1 governance
  // loop — v0.8.0 added the schema, v0.8.4 added the read-
  // only viewer, v0.8.6 finally makes it editable from the
  // form so the dashboard can be the single source of truth
  // for both global and per-tool rules).
  "policy.form.toolRules.legend": string;
  "policy.form.toolRules.hint": string;
  "policy.form.toolRules.empty": string;
  "policy.form.toolRules.addTool": string;
  "policy.form.toolRules.removeTool": string;
  "policy.form.toolRules.toolNameLabel": string;
  "policy.form.toolRules.toolNamePlaceholder": string;
  "policy.form.toolRules.toolNameAriaLabel": string;
  "policy.form.toolRules.field.deny.label": string;
  "policy.form.toolRules.field.requireApproval.label": string;
  "policy.form.toolRules.field.denyPaths.label": string;
  "policy.form.toolRules.field.denyCommands.label": string;

  // ─── Compose ────────────────────────────────────────────────
  "compose.searchPlaceholder": string;
  "compose.emptySearch": string;
  "compose.dragHint": string;
  "compose.canvasAria": string;
  "compose.canvasEmpty": string;
  "compose.canvasSelectBlock": string;
  // v0.6.11: same as `canvasSelectBlock` but with the key
  // names baked in (no placeholders). The plain `canvasSelectBlock`
  // is kept for the few places that still want to interpolate
  // a custom key label; new code should prefer this variant.
  "compose.canvasSelectBlock.keys": string;
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
  // v0.6.2: undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) toolbar.
  "compose.toolbar.undo": string;
  "compose.toolbar.redo": string;
  "compose.toolbar.undoTitle": string;
  "compose.toolbar.redoTitle": string;
  "compose.toolbar.clearTitle": string;
  "compose.toolbar.exportTitle": string;
  "compose.toolbar.importTitle": string;
  "compose.toolbar.viewModeLabel": string;
  "compose.toolbar.viewModeModern": string;
  "compose.toolbar.viewModeCozy": string;
  "compose.toolbar.viewModeTooltip": string;
  // v0.6.2: empty-state onboarding copy (3 numbered steps + keyboard tip).
  "compose.empty.title": string;
  "compose.empty.step1": string;
  "compose.empty.step2": string;
  "compose.empty.step3": string;
  "compose.empty.keyboardHint": string;
  // v0.6.2: sidebar item affordances — the explicit "+" button beside
  // each catalog item, plus a one-liner reminding users they can drag
  // *or* click.
  "compose.sidebar.addAria": string;
  "compose.sidebar.dragAffordance": string;
  // v0.6.2: mobile inspector becomes a bottom-sheet drawer; these
  // labels wire the open/close button + drawer header.
  "compose.inspector.openDrawer": string;
  "compose.inspector.closeDrawer": string;
  "compose.inspector.mobileTitle": string;
  // v0.6.2: live-region announcements for undo / redo.
  "compose.announce.undone": string;
  "compose.announce.redone": string;
  "compose.announce.historyEmpty": string;
  // v0.6.4: undo/redo with stack-count suffix.
  "compose.toolbar.undoWithCount": string;
  "compose.toolbar.redoWithCount": string;
  // v0.6.4: per-block actions (duplicate, move to top/bottom).
  "compose.inspector.duplicate": string;
  "compose.inspector.duplicateTitle": string;
  "compose.inspector.moveTop": string;
  "compose.inspector.moveBottom": string;
  // v0.6.4: block-creation feedback ("just added" announcement).
  "compose.announce.justAdded": string;
  // v0.6.5: inspector detail (real-entity fields, not just id+kind).
  "compose.inspector.loading": string;
  "compose.inspector.error": string;
  "compose.inspector.detail.cwd": string;
  "compose.inspector.detail.entries": string;
  "compose.inspector.detail.size": string;
  "compose.inspector.detail.lastUsed": string;
  "compose.inspector.detail.firstUsed": string;
  "compose.inspector.detail.model": string;
  "compose.inspector.detail.packages": string;
  "compose.inspector.detail.thinking": string;
  "compose.inspector.detail.provider": string;
  "compose.inspector.detail.team": string;
  "compose.inspector.detail.preview": string;
  "compose.inspector.detail.source": string;
  "compose.inspector.detail.enabled": string;
  "compose.inspector.detail.title": string;
  "compose.inspector.detail.type": string;
  "compose.inspector.detail.description": string;
  "compose.inspector.detail.sources": string;
  "compose.inspector.detail.allow": string;
  "compose.inspector.detail.deny": string;
  "compose.inspector.detail.denyPaths": string;
  "compose.inspector.detail.denyCommands": string;
  "compose.inspector.detail.sensitivePatterns": string;
  "compose.inspector.detail.requireApproval": string;
  "compose.inspector.detail.conflicts": string;
  "compose.inspector.detail.requires": string;
  "compose.inspector.detail.noneCount": string;
  // v0.6.7: block-to-block connections.
  "compose.inspector.connections": string;
  "compose.inspector.connect": string;
  "compose.inspector.connectTo": string;
  "compose.inspector.cancelConnect": string;
  "compose.inspector.disconnect": string;
  "compose.inspector.noConnections": string;
  "compose.inspector.connectionsFrom": string;
  "compose.inspector.connectionsTo": string;
  // v0.6.11: BlockInspector field labels for the always-shown
  // metadata (id / kind / refId / position). zh translations are
  // human-readable; en stays as the schema field name so the
  // mapping is obvious when reading the code.
  "compose.inspector.field.id": string;
  "compose.inspector.field.kind": string;
  "compose.inspector.field.refId": string;
  "compose.inspector.field.position": string;
  // v0.6.16: relative-time unit suffixes for formatRelative().
  // Previously the helper hardcoded "s ago" / "m ago" / "h ago"
  // / "d ago" / "mo ago" / "y ago" — English only. Each
  // suffix is split into a unit + an "ago" prefix so non-en
  // languages can phrase it as "5 分钟前" / "il y a 5 min" /
  // "vor 5 Min" etc. without re-implementing the helper.
  "compose.inspector.time.second": string;
  "compose.inspector.time.minute": string;
  "compose.inspector.time.hour": string;
  "compose.inspector.time.day": string;
  "compose.inspector.time.month": string;
  "compose.inspector.time.year": string;
  "compose.announce.connectionAdded": string;
  "compose.announce.connectionRemoved": string;
  // v0.6.8: right-edge connector handle on selected blocks.
  "compose.handle.aria": string;
  "compose.handle.title": string;
  // v0.6.9: arrow head + connection label.
  "compose.inspector.connectionLabel": string;
  "compose.inspector.connectionLabel.placeholder": string;
  "compose.inspector.connectionLabel.none": string;
  "compose.connectionLabel.kind.flows": string;
  "compose.connectionLabel.kind.uses": string;
  "compose.connectionLabel.kind.feeds": string;
  "compose.connectionLabel.kind.depends": string;
  "compose.connectionLabel.kind.produces": string;
  "compose.connectionLabel.kind.manual": string;
  // v0.6.18: connection direction. Same (from, to) pair can
  // have up to three connections (one per direction) without
  // colliding, so the "kind" enum doesn't conflict with this.
  "compose.connection.dir.label": string;
  "compose.connection.dir.forward": string;
  "compose.connection.dir.backward": string;
  "compose.connection.dir.bidirectional": string;
  // v0.6.19: per-edge color override. The {color} placeholder
  // receives the user-picked hex (e.g. "#ff8800") for the
  // announcement, not a translated name — the picker is a
  // hex-by-construction UI, so the announce echoes the
  // actual value.
  "compose.connection.color.label": string;
  "compose.connection.color.tooltip": string;
  "compose.connection.color.default": string;
  "compose.connection.color.reset": string;
  "compose.announce.connectionColorUpdated": string;
  // v0.6.20: routing style. Same omit-the-default pattern as
  // `dir` and `color` — missing `route` means "curve" (the
  // v0.6.19 look). "orthogonal" is a 3-segment right-angle
  // polyline (Visio / Lucidchart style). The {route} placeholder
  // in the announcement receives the translated label, not
  // the raw enum value.
  "compose.connection.route.label": string;
  "compose.connection.route.curve": string;
  "compose.connection.route.orthogonal": string;
  "compose.announce.connectionRouteUpdated": string;
  "compose.connectionLabel.tooltip": string;
  "compose.announce.connectionLabelUpdated": string;
  // v0.6.18: live-region message when the user flips a
  // connection's direction in the inspector. The {dir}
  // placeholder receives the translated dir label
  // (e.g. "A → B" / "A ↔ B"), not the raw key value.
  "compose.announce.connectionDirUpdated": string;
  // v0.6.10: server-side board persistence (Save to / Load from server).
  "compose.toolbar.saveTitle": string;
  "compose.toolbar.loadTitle": string;
  "compose.toolbar.boardsTitle": string;
  "compose.board.saving": string;
  "compose.board.saved": string;
  "compose.board.saveError": string;
  "compose.board.loading": string;
  "compose.board.loaded": string;
  "compose.board.loadError": string;
  "compose.board.empty": string;
  "compose.board.namePrompt": string;
  "compose.board.namePlaceholder": string;
  "compose.board.confirmOverwrite": string;
  "compose.board.confirmDelete": string;
  "compose.board.deleted": string;
  "compose.board.deleteError": string;
  // v0.6.11: board list meta. The toolbar / drawer entries use
  // `compose.inspector.blockCount.{one,other}` which embed the
  // count. The list row only wants the *unit* ("block" / "blocks"
  // / "个块") so the number sits in a separate span. Keeping the
  // two surfaces separate is much cleaner than a `.replace("1 ", "")`
  // hack on a string that already has the count baked in.
  "compose.boardList.blockCount.one": string;
  "compose.boardList.blockCount.other": string;
  "compose.boardList.connectionCount.one": string;
  "compose.boardList.connectionCount.other": string;
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
  // v0.6.16: confirmation banner ("✓ Created <name>.") shown
  // after a new profile is saved. Was hardcoded in the page.
  "profiles.createdBanner": string;
  // v0.6.16: not-found error card body for /profiles/[name].
  // Was "Profile <id> not found." hardcoded.
  "profiles.notFound": string;
  // v0.6.16: section heading above the env (read-only) block
  // on /profiles/[name]. Was "env (read-only — edit TOML
  // directly)" hardcoded.
  "profiles.envHeading": string;
  // v0.6.14: per-field placeholders for the profile editor.
  // Previously hardcoded as raw string literals on the
  // <Field placeholder="..." /> props.
  "profiles.field.providerPlaceholder": string;
  "profiles.field.modelPlaceholder": string;
  "profiles.field.thinkingPlaceholder": string;
  "profiles.field.packagesPlaceholder": string;
  "profiles.field.packagesLabelSuffix": string;
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
  // v0.6.12: /compose/boards list page — multi-board picker,
  // rename, bulk delete, copy-as-JSON share. Mirrors the
  // /compose toolbar's "Boards" affordance.
  "compose.boards.title": string;
  "compose.boards.subtitle": string;
  "compose.boards.open": string;
  "compose.boards.openTitle": string;
  "compose.boards.column.name": string;
  "compose.boards.column.blocks.one": string;
  "compose.boards.column.blocks.other": string;
  "compose.boards.column.connections.one": string;
  "compose.boards.column.connections.other": string;
  "compose.boards.column.updated": string;
  "compose.boards.column.actions": string;
  "compose.boards.empty.title": string;
  "compose.boards.empty.hint": string;
  "compose.boards.empty.cta": string;
  "compose.boards.loading": string;
  "compose.boards.error.title": string;
  "compose.boards.error.hint": string;
  "compose.boards.error.retry": string;
  "compose.boards.action.rename": string;
  "compose.boards.action.renameTitle": string;
  "compose.boards.action.delete": string;
  "compose.boards.action.deleteTitle": string;
  "compose.boards.action.share": string;
  "compose.boards.action.shareTitle": string;
  "compose.boards.confirm.delete": string;
  "compose.boards.confirm.bulkDelete": string;
  "compose.boards.announce.renamed": string;
  "compose.boards.announce.deleted": string;
  "compose.boards.announce.bulkDeleted": string;
  "compose.boards.announce.copied": string;
  "compose.boards.bulk.selected": string;
  "compose.boards.bulk.clear": string;
  "compose.boards.bulk.selectAll": string;
  "compose.boards.bulk.deleteSelected": string;
  "compose.boards.bulk.copySelected": string;
  "compose.boards.renameDialog.title": string;
  "compose.boards.renameDialog.label": string;
  "compose.boards.renameDialog.placeholder": string;
  "compose.boards.renameDialog.confirm": string;
  "compose.boards.renameDialog.cancel": string;
  // v0.6.13: inline max-length error in the rename dialog
  // (was `Max 200 characters` hardcoded).
  "compose.boards.renameDialog.maxLengthError": string;
  // v0.6.13: bulk delete partial-failure message (was
  // `(${failed} failed)` hardcoded).
  "compose.boards.announce.bulkDeletedWithFailures": string;
  // v0.6.13: per-row checkbox accessible label (was
  // `{n} selected` with n=0 producing nonsense "0 selected"
  // when the row was unchecked).
  "compose.boards.row.select": string;
  // v0.6.13: select-all column header accessible name
  // (was bare "select" hardcoded).
  "compose.boards.column.selectAria": string;
  // v0.6.13: the "Fork from here" affordance on the /try
  // hint — extracted out of a `<strong>Fork from here</strong>`
  // inside the hint body so zh users see the translation
  // instead of the English.
  "try.hint.forkFromHere": string;
  "compose.boards.toolbar.openBoards": string;
  "compose.boards.toolbar.openBoardsTitle": string;

  // ─── Workflows (v0.7.0) ────────────────────────────────
  // Reusable agent workflows — list of LLM-powered steps
  // that the user can compose in the visual editor and (in
  // a future release) run.
  "workflows.h1": string;
  "workflows.subtitle": string;
  "workflows.empty": string;
  "workflows.empty.hint": string;
  "workflows.create": string;
  "workflows.duplicate": string;
  "workflows.delete": string;
  "workflows.confirmDelete": string;
  "workflows.nodeCount": string;
  "workflows.edgeCount": string;
  "workflows.updatedAt": string;
  "workflows.notFound": string;
  "workflows.newIdPrompt": string;
  "workflows.newIdHint": string;
  "workflows.invalidId": string;
  "workflows.field.name": string;
  "workflows.field.description": string;
  "workflows.field.id": string;
  "workflows.field.provider": string;
  "workflows.field.model": string;
  "workflows.field.apiKeyRef": string;
  "workflows.field.systemPrompt": string;
  "workflows.field.inputTemplate": string;
  "workflows.field.inputCustom": string;
  "workflows.field.outputVar": string;
  "workflows.field.tools": string;
  "workflows.field.onFailure": string;
  "workflows.field.position": string;
  "workflows.field.retryCount": string;
  "workflows.field.escalateToModel": string;
  "workflows.onFailure.stop": string;
  "workflows.onFailure.skip": string;
  "workflows.onFailure.retry": string;
  "workflows.onFailure.escalate": string;
  "workflows.provider.anthropic": string;
  "workflows.provider.openai": string;
  "workflows.provider.google": string;
  "workflows.provider.ollama": string;
  "workflows.provider.custom": string;
  "workflows.editor.addNode": string;
  "workflows.editor.removeNode": string;
  "workflows.editor.addEdge": string;
  "workflows.editor.removeEdge": string;
  "workflows.editor.noNodes": string;
  "workflows.editor.noEdges": string;
  "workflows.editor.preview": string;
  "workflows.editor.save": string;
  "workflows.editor.saved": string;
  "workflows.editor.saveFailed": string;
  "workflows.editor.duplicate": string;
  "workflows.editor.delete": string;
  "workflows.editor.layoutHint": string;
  "workflows.layoutBtn": string;
  "workflows.savedAt": string;
  "workflows.editor.cancel": string;
  "workflows.editor.open": string;
  // v0.7.1 (audit fix): error messages. Previously these
  // were hardcoded English strings ("Duplicate failed: ...",
  // "Could not load ...") — fine in dev, but jarring when
  // a zh user hits the error path. The error is appended
  // after the i18n'd prefix so the underlying cause stays
  // identifiable.
  "workflows.editor.error.duplicateFailed": string;
  "workflows.editor.error.loadFailed": string;
  "workflows.editor.error.deleteFailed": string;
  "workflows.editor.run": string;
  "workflows.editor.runHint": string;
  "workflows.editor.runFailed": string;
  // v0.8.10: structural validation. The Validate
  // button calls /workflows/:id/validate and we
  // surface the issue list (or "ok") below the
  // action bar.
  "workflows.editor.validate": string;
  "workflows.editor.validateHint": string;
  "workflows.editor.validateOk": string;
  "workflows.editor.validateIssuesTitle": string;
  "workflows.editor.validateErrorBadge": string;
  "workflows.editor.validateWarningBadge": string;
  "workflows.editor.validateErrorPrefix": string;
  // v0.9.0 (A2 — tool wrapper): the /wrappers
  // dashboard. Mirrors the policy dashboard copy
  // (the two surfaces are parallel: policy = gate,
  // wrapper = transform).
  "wrappers.h1": string;
  "wrappers.subtitle": string;
  "wrappers.loadErrorTitle": string;
  "wrappers.empty.title": string;
  "wrappers.empty.body": string;
  "wrappers.card.applied": string;
  "wrappers.card.notApplied": string;
  "wrappers.card.kind": string;
  "wrappers.card.tools": string;
  "wrappers.apply": string;
  "wrappers.unapply": string;
  "wrappers.delete": string;
  "wrappers.applyOk": string;
  "wrappers.applyFailed": string;
  "wrappers.unapplyOk": string;
  "wrappers.unapplyNotApplied": string;
  "wrappers.unapplyFailed": string;
  "wrappers.deleteFailed": string;
  "wrappers.confirmDelete": string;
  "wrappers.newCard.title": string;
  "wrappers.newCard.subtitle": string;
  "wrappers.newCard.nameLabel": string;
  "wrappers.newCard.namePlaceholder": string;
  "wrappers.newCard.nameRequired": string;
  "wrappers.newCard.kindLabel": string;
  "wrappers.newCard.kindRetry": string;
  "wrappers.newCard.kindLog": string;
  "wrappers.newCard.kindTransform": string;
  "wrappers.newCard.toolsLabel": string;
  "wrappers.newCard.submit": string;
  "nav.wrappers": string;
  // v0.7.3 (B2): observability dashboard keys. No storage
  // path, no JSONL, no Zod field names — see user memory
  // "storage is a blind box".
  "nav.observability": string;
  "nav.hint.observability": string;
  "observability.title": string;
  "observability.refresh": string;
  "observability.total": string;
  "observability.success": string;
  "observability.fail": string;
  "observability.denied": string;
  "observability.empty": string;
  "observability.empty.hint": string;
  "observability.worstTool": string;
  "observability.col.tool": string;
  "observability.col.total": string;
  "observability.col.success": string;
  "observability.col.fail": string;
  "observability.col.denied": string;
  "observability.outcome.success": string;
  "observability.outcome.fail": string;
  "observability.outcome.denied": string;
  "observability.reason": string;
  "observability.managePolicy": string;
  "observability.chat.hint": string;
  "observability.chat.placeholder": string;
  "observability.chat.ask": string;
  "observability.range.24h": string;
  "observability.range.7d": string;
  "observability.range.all": string;
  // v0.8.7 (B2 闭环): per-outcome rate labels rendered
  // under each aggregate card. `rate.empty` is shown
  // when total === 0 (a fresh install has no data to
  // divide by; "0%" would be technically correct but
  // visually noisy).
  "observability.rate.success": string;
  "observability.rate.fail": string;
  "observability.rate.denied": string;
  "observability.rate.empty": string;
};
