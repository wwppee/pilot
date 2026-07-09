import type { Dict } from "./types";

const en: Dict = {
  // Skip link / a11y
  "skip.toMain": "Skip to main content",
  "nav.ariaLabel": "Main",

  // Brand
  "brand.name": "pilot",
  "brand.ariaHome": "Pilot home",

  // Nav
  "nav.dashboard": "Dashboard",
  "nav.packages": "Packages",
  "nav.sessions": "Sessions",
  "nav.usage": "Usage",
  "nav.tools": "Tools",
  "nav.context": "Context",
  "nav.policy": "Policy",
  "nav.compose": "Compose",
  "nav.profiles": "Profiles",
  "nav.forge": "Forge",
  "nav.capabilities": "Capabilities",
  "nav.avatars": "Avatars",
  "nav.plans": "Plans",
  "nav.playground": "Playground",
  // v0.4.14: nav groups
  "nav.groupInspect": "Inspect",
  "nav.groupManage": "Manage",

  // Server status
  "server.up": "pilot server · v{version}",
  "server.down": "server not running",

  // Footer
  "footer.copy":
    "pilot-web v{version} · reads + policy + compose over pilot server",
  "footer.endpoint": "server expected at",
  // v0.5.10+: layout <meta> tag i18n.
  "meta.title": "Pilot — pi.dev management plane",
  "meta.description":
    "Local dashboard for pi sessions, packs, profiles, policies, and stats.",

  // Language switcher
  "lang.label": "Language",
  "lang.en": "EN",
  "lang.zh": "中",

  // Common buttons
  "btn.save": "Save changes",
  "btn.saved": "Saved",
  "btn.saving": "Saving…",
  "btn.cancel": "Cancel",
  "btn.back": "Back",
  "btn.backToList": "Back to list",
  "btn.apply": "Apply",
  "btn.applyGenerate": "Apply (generate extension)",
  "btn.unapply": "Unapply",
  "btn.delete": "Delete",
  "btn.confirmDelete": "Confirm delete?",
  "btn.search": "Search",
  "btn.refresh": "Refresh",
  "btn.export": "Export",
  "btn.import": "Import",
  "btn.clear": "Clear",
  "btn.add": "Add",
  "btn.remove": "Remove",
  "btn.create": "Create",
  "btn.edit": "Edit",
  "btn.filter": "Filter",
  "btn.submit": "Submit",
  // v0.5.11+
  "status.disabled": "disabled",
  "btn.ariaConfirmDelete": "Confirm delete policy (click again to delete)",
  "btn.ariaDelete": "Delete this policy",
  "btn.ariaDeleteProfile": "Delete this profile",
  "btn.ariaApplyTitle":
    "Generate ~/.pilot/extensions/pilot-policy-<name>.ts and have pi load it",
  "btn.ariaUnapplyTitle": "Remove the generated extension",
  "btn.ariaEditPolicy": "Edit policy {name}",
  "btn.ariaFormActions": "Form actions",
  "btn.ariaRange": "Range",
  "btn.ariaSearch": "Search",
  "btn.ariaSearchCatalog": "Search catalog",
  "btn.ariaComposeCanvas":
    "Compose canvas. When a block is selected, use arrow keys to move it, Delete to remove, Escape to deselect.",
  "btn.ariaRemoveBlock": "Remove block",

  // Loading / empty / errors
  "loading.generic": "Loading…",
  "loading.form": "Loading form…",
  "loading.catalog": "Loading catalog…",
  "loading.policies": "Loading…",
  "loading.policyForm": "Loading form…",
  "error.couldntLoad.title": "Couldn't load",
  "error.couldntLoad.body":
    "Is `pilot server` running? Try `pilot server start`.",
  // v0.5.10+: root error boundary + 404.
  "error.boundary.title": "Something went wrong",
  "error.boundary.body":
    "An unexpected error stopped this page from rendering. The error is shown below — your data isn't lost. You can retry, or head back to the dashboard.",
  "error.boundary.retry": "Retry",
  "error.boundary.backHome": "← back to dashboard",
  "error.boundary.digest": "Reference:",
  "error.notFound.code": "404",
  "error.notFound.title": "Page not found",
  "error.notFound.body":
    "The page you tried to open doesn't exist (anymore). Pick a top-level page from the list below to keep going.",
  // v0.5.10+: loading skeleton copy.
  "loading.skeleton": "Loading…",
  "loading.skeletonHint":
    "If this takes longer than a few seconds, the Pilot server may not be reachable.",
  "status.unsaved": "Unsaved changes",
  "status.saving": "Saving…",

  // Policy list / edit
  "policy.edit.h1": "Edit policy",
  "policy.edit.backToList": "← back to policies",
  "policy.edit.backToListAria": "Back to policy list",
  "policy.edit.ariaEdit": "Edit policy {name}",
  "policy.descriptionLabel": "Description",
  "policy.empty.title": "No policies yet",
  "policy.empty.body":
    "Create one with `pilot policy new <name>` or `pilot policy apply`.",
  "policy.serverHint": "Is `pilot server` running? Try `pilot server start`.",
  "policy.newCard.title": "New policy",
  "policy.newCard.nameLabel": "Policy name (kebab-case)",
  "policy.newCard.namePlaceholder": "safe-bash",
  "policy.newCard.templateLabel": "Starter template",
  "policy.newCard.templateSafeBash": "Safe bash",
  "policy.newCard.templateSafeBashDesc":
    "Block destructive shell patterns, require approval for risky tools.",
  "policy.newCard.templateReadonly": "Read-only",
  "policy.newCard.templateReadonlyDesc":
    "Deny every tool that mutates (bash / write / edit).",
  "policy.newCard.templateEmpty": "Empty",
  "policy.newCard.templateEmptyDesc":
    "Blank policy — fill in the rules next page.",
  "policy.newCard.submit": "Create policy",
  "policy.newCard.errorInvalidName":
    "Policy name must be kebab-case (lowercase letters, digits, hyphens).",
  "policy.tryRule.h2": "Try a rule",
  "policy.tryRule.noPolicies": "No policies to test against.",
  "policy.tryRule.policyLabel": "Policy",
  "policy.tryRule.toolLabel": "Tool",
  "policy.tryRule.argsLabel": "Args (JSON)",
  "policy.tryRule.runCheck": "Check",
  "policy.check": "Check",
  "policy.allowBadge": "allow",
  "policy.denyBadge": "deny",
  "policy.warnBadge": "warn",
  "policy.hitlBadge": "HITL",
  "policy.hitlDesc":
    "Pauses the session and asks the user via `ctx.ui.confirm()` before the tool runs.",
  "policy.applyFailed": "Apply failed: {msg}",
  "policy.unapplyFailed": "Unapply failed: {msg}",
  "policy.confirmDeleteProfile": 'Delete "{name}"? This cannot be undone.',
  // v0.5.11+: policy list page badges + prose.
  "policy.card.applied": "● applied",
  "policy.card.notApplied": "○ not applied",
  "policy.card.rulesCount": "{n} rules",
  "policy.card.updatedAt": "updated {when}",
  "policy.card.extSize": "ext: {bytes}B",
  "policy.card.extMissing": "ext: —",
  "policy.dryRun.subtitle":
    "Run a dry-run check: which policy rule fires (if any) for a given tool call?",
  "policy.newCard.subtitle":
    "Pick a starter template, give it a kebab-case name, and you'll land on the edit page to refine.",
  "policy.fieldLabel.paths": "paths",
  "policy.fieldLabel.cmds": "cmds",
  "policy.fieldLabel.redact": "redact",
  "policy.error.notFound": "Policy not found:",
  // v0.5.10+: PolicyForm extension status + field hints.
  "policy.form.saveFirstApply": "Save changes first, then apply.",
  "policy.form.extensionRemoved": "Extension removed",
  "policy.form.extensionNotApplied": "Extension was not applied",
  "policy.form.extensionWrittenTo": "Extension written to {path}",
  "policy.form.errorPrefix": "Error: {msg}",
  "policy.form.savedAt": "✓ Saved at {time}",
  "policy.form.ruleCount.one": "{n} rule",
  "policy.form.ruleCount.many": "{n} rules",
  "policy.form.descriptionPlaceholder":
    "One-line summary of what this policy enforces",
  "policy.form.label.allow": "allow",
  "policy.form.label.paths": "paths",
  "policy.form.label.cmds": "cmds",
  "policy.form.label.redact": "redact",
  "policy.form.label.hitl": "HITL",
  "policy.form.label.unknown": "decision",
  // v0.5.10+: section metadata.
  "policy.form.field.allow.legend":
    "allow · exclusive allowlist (only these tools may run)",
  "policy.form.field.allow.hint":
    "Leave empty to allow all (modulo deny). If non-empty, only these tools work.",
  "policy.form.field.allow.placeholder": "read\nls",
  "policy.form.field.deny.legend": "deny · tools that cannot be called",
  "policy.form.field.deny.hint":
    "deny wins over allow. One tool name per line.",
  "policy.form.field.deny.placeholder": "bash\nwrite\nedit",
  "policy.form.field.denyPaths.legend":
    "denyPaths · glob patterns for read / edit / write",
  "policy.form.field.denyPaths.hint":
    "Globs: * = any chars except /, ** = any path segments.",
  "policy.form.field.denyPaths.placeholder": "**/.env\n**/.env.*\n/etc/**",
  "policy.form.field.denyCommands.legend":
    "denyCommands · regex for bash commands to block",
  "policy.form.field.denyCommands.hint":
    "JavaScript regex syntax. Backslashes must be doubled in TOML.",
  "policy.form.field.denyCommands.placeholder": "^rm\\s+-rf\\s+/\n^mkfs",
  "policy.form.field.sensitivePatterns.legend":
    "sensitivePatterns · redact from tool results",
  "policy.form.field.sensitivePatterns.hint":
    "Used as regex when valid; substring otherwise. Common: API keys, passwords.",
  "policy.form.field.sensitivePatterns.placeholder":
    "sk-[A-Za-z0-9]{20,}\nghp_[A-Za-z0-9]{20,}",
  "policy.form.field.requireApproval.legend":
    "requireApproval · tools that pause for human confirmation",
  "policy.form.field.requireApproval.hint":
    "Triggers ctx.ui.confirm() in the generated extension before the tool runs.",
  "policy.form.field.requireApproval.placeholder": "bash\nwrite",

  // Compose
  "compose.searchPlaceholder": "Search…",
  "compose.emptySearch": "No matches. Adjust the filter or search.",
  "compose.dragHint": "Drag to canvas, or press Enter to add to center",
  "compose.canvasAria":
    "Compose canvas. When a block is selected, use arrow keys to move it, Delete to remove, Escape to deselect.",
  "compose.canvasEmpty": "Empty canvas — pick a sidebar item and press {key}.",
  "compose.canvasSelectBlock":
    "Click a block on the canvas to inspect it. Press {del} to remove it, or {esc} to deselect.",
  "compose.removeBlock": "Remove block",
  // v0.5.10+: entity labels.
  "compose.entity.session": "Session",
  "compose.entity.pack": "Pack",
  "compose.entity.profile": "Profile",
  "compose.entity.policy": "Policy",
  "compose.entity.capability": "Capability",
  "compose.section.sessions": "Sessions",
  "compose.section.packs": "Packs",
  "compose.section.profiles": "Profiles",
  "compose.section.policies": "Policies",
  "compose.section.capabilities": "Capabilities",
  // v0.5.10+: live-region announcements + alerts.
  "compose.announce.movedLeft": "Moved block left {n} pixels",
  "compose.announce.movedRight": "Moved block right {n} pixels",
  "compose.announce.movedUp": "Moved block up {n} pixels",
  "compose.announce.movedDown": "Moved block down {n} pixels",
  "compose.announce.selectionCleared": "Selection cleared",
  "compose.confirm.removeAll": "Remove all blocks from the canvas?",
  "compose.alert.invalidVersion": "Invalid compose file (version mismatch)",
  "compose.alert.invalidJson": "Invalid JSON: {msg}",
  // v0.5.10+: view-mode toggle.
  "compose.viewMode.cozy": "🌿 Cozy",
  "compose.viewMode.modern": "🌑 Modern",
  "compose.viewMode.tooltip.cozy": "Switch to 2.5D cozy sandbox skin",
  "compose.viewMode.tooltip.modern": "Switch back to modern flat look",
  // v0.5.11+ misc.
  "compose.filterAll": "all",
  "compose.inspector.stale":
    "Not in current catalog — entity may have been deleted. Block is preserved with cached label.",
  "compose.aria.selected": ", selected",
  "compose.inspector.blockCount.one": "1 block",
  "compose.inspector.blockCount.other": "{n} blocks",
  "compose.inspector.openDetail": "Open detail page →",
  "compose.inspector.remove": "Remove",
  "compose.announce.removedBlock": "Removed block {label}",
  "compose.announce.addedBlock": "Added {label} block to canvas",
  "compose.aria.addEntity": "Add {kind} “{label}” to canvas",
  // v0.5.11+ currency formatting.
  "currency.usd": "${amount}",

  // Packages
  "packages.noPacksHint":
    "No packs installed yet. Try `pilot pack search subagent`.",
  "packages.installed.emptyHint": "Try {cmd}.",
  // v0.5.10+: pack detail page.
  "packages.field.source": "Source",
  "packages.field.enabled": "Enabled",
  "packages.field.homepage": "Homepage",
  "packages.field.yes": "yes",
  "packages.field.no": "no",
  "packages.install.h2": "Install",
  "packages.install.alreadyInstalled": "Already installed. Re-run to update.",
  "packages.install.notInstalled":
    "Not yet installed. Install via the pilot CLI or this Web UI.",
  "packages.install.update": "Update {name}",
  "packages.install.install": "Install {name}",
  "packages.install.underHood.before": "runs ",
  "packages.install.underHood.after": " under the hood",
  "packages.uninstall.confirm":
    "Uninstall this pack? It will be removed from Pi and any settings generated from it will be cleaned up.",
  "packages.uninstall.h2": "Uninstall",

  // Profiles [name]
  "profiles.editHeading": "Edit",
  "profiles.descriptionPlaceholder": "What is this profile for?",
  "profiles.saved": "Profile updated.",
  "profiles.model": "model",
  "profiles.provider": "provider",
  "profiles.thinking": "thinking",
  "profiles.packages": "package(s)",
  "profiles.description": "description (short tagline)",
  "profiles.notes": "notes (long-form)",
  "profiles.notesPlaceholder":
    "Why does this profile exist? When should the user pick it?",
  "profiles.activate": "Activate",
  "profiles.active": "Active",
  "profiles.activeHint":
    "This profile is the one Pilot will hand to pi on next session.",
  "profiles.activatedToast": "✓ {name} is now the active profile.",
  "profiles.clearedToast": "Active profile cleared.",
  "profiles.noActive":
    "No profile is active yet. Click Activate on any profile to set one.",
  "profiles.activateFailed": "Could not activate: {msg}",
  // v0.5.10+: list empty-state hint + actionLabel.
  "profiles.empty.hint":
    "A profile bundles a model + thinking level + provider + package list. Use the Create profile form above to make one, then activate it from a profile card. Activated profiles are written to ~/.pi/agent/settings.json and picked up by Pi on next launch.",
  "profiles.openForm": "Open the profile form",
  "profiles.packageCount.one": "1 package",
  "profiles.packageCount.other": "{n} packages",

  // Context
  "context.loadedTitle": "Loaded by pi",
  "context.infoTitle": "Informational only",

  // Range nav
  "range.today": "Today",

  // Home (dashboard)
  "home.h1": "Dashboard",
  "home.subtitle": "A live look at your local pi activity. Last 24 hours.",
  "home.error.title": "Can't reach pilot server",
  "home.error.body":
    "Run `pilot dashboard` to start both the server and the Web UI in one go,\nor start the server alone with `pilot server start` if you only need the CLI.",
  "home.card.sessions": "Sessions",
  "home.card.messages": "Messages",
  "home.card.toolCalls": "Tool calls",
  "home.card.tokens": "Tokens",
  "home.card.cost": "Cost (USD)",
  "home.section.today": "Today",
  "home.section.byModel": "By model",
  "home.section.topTools": "Top tools",
  "home.section.recentSessions": "Recent sessions",
  "home.section.installedPacks": "Installed packs",
  "home.link.seeAll": "See all →",
  "home.link.manage": "Manage →",
  "home.empty.sessions": "No sessions yet.",
  "home.empty.sessions.hint": "Run {cmd} in any project to create a session.",
  "home.empty.packs": "No packs installed.",
  "home.empty.packs.hint": "Search {cmd} to find packs.",
  "home.refreshHint": "auto-refresh 10s · updated now",
  "home.quickStart.aria": "Quick start",
  // v0.5.12+
  "home.unit.messages": "{n} msgs",
  "home.unit.calls": "{n} calls",
  "home.emptyState.title": "Welcome to Pilot",
  "home.emptyState.subtitle":
    "Pilot reads your pi state and lets you manage it. Three quick wins to get started:",
  "home.emptyState.card1Title": "Create a profile",
  "home.emptyState.card1Body":
    "Profiles capture a model + thinking level + packages as one named unit, then you can switch between them.",
  "home.emptyState.card1Cta": "New profile →",
  "home.emptyState.card2Title": "Install a pack",
  "home.emptyState.card2Body":
    "Packs are npm packages that extend pi with subagents, lenses, themes, etc. Try one and see what fits.",
  "home.emptyState.card2Cta": "Browse packs →",
  "home.emptyState.card3Title": "Create a policy",
  "home.emptyState.card3Body":
    "Policies block dangerous shell commands, redact secrets, or require human approval before risky tools run.",
  "home.emptyState.card3Cta": "New policy →",

  // Packages
  "packages.h1": "Package Center",
  "packages.subtitle":
    "{n} installed · search npm without leaving the dashboard.",
  "packages.searchPlaceholder": "search npm… (e.g. pi-subagents)",
  "packages.searchResultsFor": "Search results for \u201c{q}\u201d",
  "packages.nothingMatches": "Nothing matches.",
  "packages.installed": "Installed",
  "packages.installedToast": "✓ Installed {name} successfully.",
  "packages.uninstalledToast": "✓ Uninstalled {name} successfully.",
  "packages.installError": "Install failed: {error}",
  "packages.fetchError": "Couldn't fetch this pack: {error}",
  "packages.viewAll": "View installed packs",
  "packages.empty": "No packs installed yet. Try `pilot pack search subagent`.",

  // Sessions
  "sessions.h1": "Sessions",
  "sessions.subtitle": "{n} session{s} under {home} · most recent first.",
  "sessions.empty": "No sessions yet. Run pi to create one.",
  "sessions.empty.hint":
    "Pilot reads Pi's session JSONL from {dir}. Run {cmd} in any project to create your first session — it'll show up here on the next page refresh.",
  "sessions.col.id": "ID",
  "sessions.col.cwd": "CWD",
  "sessions.col.lastUsed": "Last used",
  "sessions.col.entries": "Entries",
  "sessions.col.size": "Size",
  "sessions.col.model": "Model",
  // v0.5.9+
  "sessions.col.topic": "Topic",
  "sessions.topic.empty": "(no user message)",

  // Snapshot banner (v0.4.13+)
  "sessions.snapshot.h2": "Snapshot",
  "sessions.snapshot.captured": "Captured {when}",
  "sessions.snapshot.profile": "Active profile",
  "sessions.snapshot.extensions": "Policy extensions",
  "sessions.snapshot.packs": "Pack sources",
  "sessions.snapshot.none": "None",
  "sessions.snapshot.missing":
    "Snapshot unavailable — session file may have been pruned.",

  // Usage
  "usage.h1": "Token usage & cost",
  "usage.subtitle":
    "Aggregated from `AssistantMessage.usage` across every pi v3 session.",
  "usage.range.today": "Today",
  "usage.range.week": "7 days",
  "usage.range.month": "30 days",
  "usage.range.all": "All",
  "usage.card.sessions": "Sessions",
  "usage.card.assistantMessages": "Assistant messages",
  "usage.card.totalTokens": "Total tokens",
  "usage.card.totalCost": "Total cost",
  "usage.byModel.title": "By model",
  "usage.byDay.title": "By day (local TZ)",
  "usage.col.model": "Model",
  "usage.col.msgs": "Msgs",
  "usage.col.input": "Input",
  "usage.col.output": "Output",
  "usage.col.cacheR": "Cache R",
  "usage.col.cacheW": "Cache W",
  "usage.col.total": "Total",
  "usage.col.cost": "Cost",
  "usage.empty":
    "No usage data yet. Run pi with a real model to record tokens and cost.",
  "usage.empty.model": "No model data.",
  "usage.empty.day": "No daily data.",
  "usage.empty.hint": "Run {cmd} with a real model to record tokens + cost.",
  "usage.showingLastN": "(showing last 14 of {n} days)",
  "usage.loadError": "Couldn’t load usage: {message}",

  // Tools
  "tools.h1": "Tool inventory",
  "tools.subtitle":
    "{n} tool{s} available to pi — built-in ({builtin}), npm extensions ({npm}).",
  "tools.empty.hint":
    "Run {cmd} in any project to populate its {dir} directory.",
  "tools.empty":
    "No tools discovered. Run pi once to initialize the directory.",
  "tools.section.builtin.title": "Built-in",
  "tools.section.builtin.subtitle": "Hardcoded into pi (per `pi --help`)",
  "tools.section.local.title": "Extensions (project-local)",
  "tools.section.local.subtitle":
    "~/.pi/agent/extensions/*.ts — AST scan pending",
  "tools.section.npm.title": "Extensions (npm)",
  "tools.section.npm.subtitle": "Installed via `pi install <pkg>`",
  "tools.col.name": "Name",
  "tools.col.source": "Source",
  "tools.col.safety": "Safety",
  "tools.col.description": "Description",
  "tools.col.status": "Status",
  "tools.loadError": "Couldn’t load tools: {message}",

  // Context
  "context.h1": "Project context",
  "context.subtitle":
    "Files visible from {cwd} that pi may load into its system prompt. Mirrors pi's `loadProjectContextFiles` algorithm.",
  "context.empty.hint": "Create {file1} or {file2} in this directory.",
  "context.empty":
    "No context files found. Create an `AGENTS.md` or `CLAUDE.md` in this directory.",
  "context.error.title": "Couldn't load context: {error}",
  "context.section.loaded.title": "Loaded by pi",
  "context.section.loaded.subtitle":
    "Injected into the system prompt at session start",
  "context.section.info.title": "Informational only",
  "context.section.info.subtitle": "Visible in Pilot; not auto-loaded by pi",
  // v0.5.12+: discovery rules panel.
  "context.discovery.h2": "How discovery works",
  "context.discovery.filenames": "Filename priority",
  "context.discovery.filenamesHint":
    "First hit wins per directory. AGENTS.md beats AGENTS.MD beats CLAUDE.md beats CLAUDE.MD.",
  "context.discovery.paths": "Search path",
  "context.discovery.pathsHint":
    "1. ~/.pi/agent/ (global)  →  2. cwd  →  3. each parent directory up to filesystem root.",
  "context.discovery.info":
    "Only canonical names (AGENTS.md / AGENTS.MD / CLAUDE.md / CLAUDE.MD) get loaded into pi's prompt. README.md, .cursor/rules, and CONTRIBUTING.md are Pilot-only — informational, never sent to the model.",

  // Policy
  "policy.h1": "Tool Policies",
  "policy.subtitle":
    "Generate pi enforcement extensions from declarative TOML rules.",

  // Compose
  "compose.h1": "Compose",
  "compose.subtitle":
    "Drag blocks from the sidebar to plan a session — save as Profile, apply, run.",
  "compose.inspector": "Inspector",
  "compose.emptyCanvas": "Empty canvas — pick a sidebar item and press {key}.",

  // Profiles
  "profiles.h1": "Profiles",
  "profiles.subtitle": "{n} profile{s} · stored under ~/.pilot/profiles/",
  "profiles.newNameLabel": "New profile name (kebab-case)",
  "profiles.newNamePlaceholder": "my-work",
  "profiles.empty": "No profiles yet. Use the form above to create one.",
  "profiles.delete": "delete",

  // Profile pre-fill from session (v0.4.13+)
  "profiles.fromSession.banner":
    "Pre-filled from session {sessionId}: model + {nTool} tool{s} detected.",
  "profiles.fromSession.modelLabel": "Detected model",
  "profiles.fromSession.toolsLabel": "Tools used in this session",
  "profiles.fromSession.noTools": "(no tool calls recorded)",
  "profiles.fromSession.notFound":
    "Could not load session template — the file may have been pruned.",
  "profiles.fromSession.cta": "Create a profile from this session →",
  "sessions.createProfileCta": "Create profile from this session",

  // Session info card (v0.5.3+)
  "sessions.info.h2": "Summary",
  "sessions.info.model": "model",
  "sessions.info.duration": "duration",
  "sessions.info.totalTokens": "total tokens",
  "sessions.info.totalCost": "total cost",
  "sessions.info.toolsUsed": "tools used",
  "sessions.info.assistantMessages": "assistant messages",
  "sessions.info.noUsage": "(no usage recorded)",
  "sessions.info.noTools": "(no tool calls recorded)",
  "sessions.info.noModel": "(no assistant messages yet)",

  // Session tree explorer (v0.4.13+)
  "sessions.tree.searchPlaceholder": "search preview…",
  "sessions.tree.searchLabel": "Search node preview text",
  "sessions.tree.filterLabel": "Filter by node type",
  "sessions.tree.expandAll": "expand all",
  "sessions.tree.collapseAll": "collapse all",
  "sessions.tree.matchCount": "{n} match{es}",
  // v0.5.8+: filter chip labels per node type (see types.ts).
  "sessions.tree.types.user": "User",
  "sessions.tree.types.assistant": "Assistant",
  "sessions.tree.types.tool": "Tool",
  "sessions.tree.types.system": "System",
  "sessions.tree.types.model_change": "Model",
  "sessions.tree.types.thinking_level_change": "Thinking",
  // v0.5.8+: stats row labels above the tree.
  "sessions.tree.cols.cwd": "cwd",
  "sessions.tree.cols.totalNodes": "total nodes",
  "sessions.tree.cols.maxDepth": "max depth",
  "sessions.tree.cols.models": "models",
  "sessions.tree.h2": "Tree",
  "sessions.tree.noData": "No tree data.",
  // v0.5.8+: error / empty state on the detail page.
  "sessions.backToList": "← back to sessions",
  "sessions.error.title": "Couldn't load this session",
  "sessions.error.hint":
    "Make sure the Pilot server is running. Start it from the dashboard, or run: pilot server",
  "sessions.error.retry": "Retry",

  // Capabilities
  "capabilities.h1": "Capabilities",
  "capabilities.subtitle": "{n} capability installed · Forge ships in v0.4.",
  "capabilities.refreshHint": "auto-refresh 15s",
  "capabilities.empty": "No capabilities installed yet. Forge ships in v0.4.",
  "capabilities.empty.hint": "Absorb a pack from {link}.",
  "capabilities.sources": "{n} source(s)",
  "capabilities.requires": "requires {n}",
  "capabilities.conflicts": "conflicts {n}",
  "capabilities.diffLink": "diff with…",

  // Capability diff (v0.5.1+)
  "capdiff.h1": "Capability diff",
  "capdiff.subtitle":
    "Compare two absorbed Capabilities. Per-field match / drift / missing / extra, side by side.",
  "capdiff.pickerA": "Capability A",
  "capdiff.pickerB": "Capability B",
  "capdiff.pickerPlaceholder": "— pick one —",
  "capdiff.swapCta": "Swap",
  "capdiff.empty":
    "Need at least two capabilities to diff. Absorb one from /forge first.",
  "capdiff.notFound":
    "One or both capabilities don't exist on disk. Try a different pair.",
  "capdiff.equal": "Identical",
  "capdiff.unequal": "Differences",
  "capdiff.sourcesA": "sources (A)",
  "capdiff.sourcesB": "sources (B)",
  "capdiff.evalAbsent": "(no eval recorded)",
  "capdiff.field.title": "title",
  "capdiff.field.type": "type",
  "capdiff.field.description": "description",
  "capdiff.field.sources": "sources",
  "capdiff.field.extensions": "extensions",
  "capdiff.field.skills": "skills",
  "capdiff.field.prompts": "prompts",
  "capdiff.field.themes": "themes",
  "capdiff.field.eval": "eval",
  "capdiff.field.conflicts": "conflicts",
  "capdiff.field.requires": "requires",
  "capdiff.field.inspiredBy": "inspiredBy",
  "capdiff.field.tags": "tags",
  "capdiff.field.createdAt": "createdAt",
  "capdiff.field.updatedAt": "updatedAt",

  // Forge (v0.4.14+) — Web entrypoint
  "forge.h1": "Forge",
  "forge.subtitle":
    "Search npm for Pi-compatible packages and absorb them into local Capabilities.",
  "forge.searchLabel": "Search npm for forge-able packages",
  "forge.searchPlaceholder": "try 'pi-subagent' or 'pi-git'…",
  "forge.searchButton": "Search",
  "forge.empty": "No results yet — try a query.",
  "forge.empty.unsearched": "Type at least 2 characters above to search npm.",
  "forge.empty.hint": 'Try "pi-subagent", "pi-lens", or "pi-git".',
  "forge.resultCount": "{n} result(s)",
  "forge.inspect.h1": "Inspect {name}",
  "forge.inspect.version": "version",
  "forge.inspect.kind": "kind",
  "forge.inspect.description": "description",
  "forge.inspect.skills": "skills",
  "forge.inspect.themes": "themes",
  "forge.inspect.prompts": "prompts",
  "forge.inspect.commands": "commands",
  "forge.inspect.keybindings": "keybindings",
  "forge.inspect.extension": "extension entry",
  "forge.inspect.absorbMode": "absorb would create",
  "forge.inspect.absorbCta": "Absorb as Capability",
  "forge.inspect.asIdLabel": "Capability id (optional, kebab-case)",
  "forge.inspect.asIdHint":
    "Leave blank to use the derived id (stripped of npm scope).",
  "forge.inspect.absorbedToast": "Absorbed — redirecting to /capabilities/{id}",
  "forge.inspect.error": "Could not absorb: {error}",
  "forge.inspect.errorNotFound": "Package not found on npm or has no manifest.",
  "forge.inspect.errorInvalidId":
    "Capability id is invalid — must be kebab-case (a-z0-9-).",
  "forge.inspect.errorSchema": "Built capability failed schema validation.",
  "forge.inspect.notFound": "Package not found or no manifest.",
  "forge.noManifest": "No `pi` field — would absorb as L1-referenced only.",

  // Avatars (v0.5+)
  "avatars.h1": "Avatars",
  "avatars.subtitle":
    "Project-level expected config. One Avatar per cwd. Diff against current state to see drift.",
  "avatars.empty":
    "No Avatars yet. Capture one to lock in a project's expected config.",
  "avatars.captureCta": "Capture current state →",
  "avatars.cwdLabel": "Project (encoded cwd)",
  "avatars.cwdPlaceholder": "--home-me-myproj--",
  "avatars.delete": "delete",
  "avatars.confirmDelete": "Delete Avatar for {cwd}?",
  "avatars.capturedToast": "Captured Avatar for {cwd}",
  "avatars.deletedToast": "Deleted Avatar for {cwd}",
  // v0.5.10+: list empty hint + capture-first actionLabel.
  "avatars.empty.hint":
    "Use the Capture current state form above to lock in this project's expected setup (active profile, model, installed packs, generated policy files). You'll then see drift when any of those change.",
  "avatars.captureFirst": "Capture your first Avatar",
  "avatars.diffLink": "view diff",
  "avatars.captured": "captured",
  "avatars.profile": "profile",
  "avatars.model": "model",
  "avatars.packSources": "pack sources",
  "avatars.extensions": "policy extensions",
  "avatars.status.match": "match",
  "avatars.status.drift": "drift",
  "avatars.status.missing": "missing",
  "avatars.status.extra": "extra",
  "avatars.clean": "clean",
  "avatars.dirty": "needs attention",
  "avatars.detail.h1": "Avatar · {cwd}",
  "avatars.detail.capturedAt": "Captured {when}",
  "avatars.detail.expected": "Expected",
  "avatars.detail.actual": "Actual",

  // Avatar apply (v0.5.2+)
  "avatars.apply.caption":
    "Install missing packs + activate the Avatar's profile. Generated policy files are NOT regenerated — use `pilot policy apply` for that.",
  "avatars.apply.cta": "Apply Avatar",
  "avatars.apply.confirm":
    "Apply this Avatar? Missing packs will be installed via `pi install` and the Avatar's profile will be activated.",
  "avatars.apply.running": "Applying…",
  "avatars.apply.done": "Apply complete",
  "avatars.apply.installed": "installed",
  "avatars.apply.activated": "activated",
  // Avatar apply dry-run (v0.5.3+)
  "avatars.apply.dryCaption":
    "Preview what Apply would do — same report, but no `pi install` runs and no profile gets activated. Nothing changes on disk.",
  "avatars.apply.dryCta": "Dry-run",
  "avatars.apply.dryBadge": "dry run",
  "avatars.apply.dryNote": "(dry run — no changes made)",
  "avatars.apply.skipped": "skipped",
  "avatars.apply.failed": "failed",
  "avatars.apply.steps": "Steps",
  "avatars.apply.noOp":
    "Nothing to do — current state already matches this Avatar.",

  // Plans (v0.5.7+ — Agent capability layer)
  "plans.h1": "Plans",
  "plans.subtitle":
    "Execution plans — break a goal into tasks and steps. Real execution lands in v0.6.0; this page manages the data + lifecycle.",
  "plans.empty.title": "No plans yet.",
  "plans.empty.hint":
    'A Plan captures a goal, the tasks it breaks into, and the steps each task runs. Create one from the CLI (`pilot plan new "your goal"`) or via the New Plan button. v0.5.7 ships the data model; the executor comes in v0.6.0.',
  "plans.empty.cta": "New Plan",
  "plans.col.id": "ID",
  "plans.col.status": "Status",
  "plans.col.strategy": "Strategy",
  "plans.col.tasks": "Tasks",
  "plans.col.updated": "Updated",
  "plans.col.goal": "Goal",
  "plans.status.draft": "draft",
  "plans.status.running": "running",
  "plans.status.paused": "paused",
  "plans.status.completed": "completed",
  "plans.status.failed": "failed",
  "plans.status.cancelled": "cancelled",
  "plans.strategy.sequential": "sequential",
  "plans.strategy.parallel": "parallel",
  "plans.strategy.adaptive": "adaptive",
  "plans.action.start": "Start",
  "plans.action.pause": "Pause",
  "plans.action.resume": "Resume",
  "plans.action.cancel": "Cancel",
  "plans.action.delete": "Delete",
  "plans.action.created": "Plan created",
  "plans.action.paused": "Plan paused",
  "plans.action.resumed": "Plan resumed",
  "plans.action.cancelled": "Plan cancelled",
  "plans.action.deleted": "Plan deleted",
  "plans.action.failed": "Action failed",
  "plans.detail.h1": "Plan · {id}",
  "plans.detail.goal": "Goal",
  "plans.detail.strategy": "Strategy",
  "plans.detail.created": "Created",
  "plans.detail.updated": "Updated",
  "plans.detail.started": "Started",
  "plans.detail.completed": "Completed",
  "plans.detail.context": "Context",
  "plans.detail.cwd": "CWD",
  "plans.detail.profile": "Profile",
  "plans.detail.tasks": "Tasks",
  "plans.detail.steps": "Steps",
  "plans.detail.noTasks":
    "No tasks yet. v0.5.7 ships the data model — add tasks via the API or the future executor.",
  "plans.detail.actions": "Actions",
  "plans.detail.startHint":
    "Start sets the plan to running and logs the `plan_started` event. The actual executor lands in v0.6.0.",
  "plans.detail.executorNote":
    "(execution engine coming in v0.6.0 — status set to running)",
  "plans.detail.confirmDelete":
    "Delete this Plan? The plan + its event log will be removed. Cannot be undone.",
  "plans.detail.dependsOn": "depends on",
  "plans.detail.retries": "retries {count}/{max}",
  "plans.detail.action": "action",
  "plans.detail.graph": "Task graph",
  "plans.detail.graph.empty":
    "No task dependencies declared. Tasks will run sequentially by ID order.",
  "plans.detail.blocks": "blocks",
  "plans.detail.events": "Event log",
  "plans.detail.events.empty":
    "No events yet. Start the Plan to record lifecycle transitions.",
  "plans.detail.tasksByStatus": "Tasks by status",
  "plans.taskStatus.pending": "pending",
  "plans.taskStatus.running": "running",
  "plans.taskStatus.completed": "completed",
  "plans.taskStatus.failed": "failed",
  "plans.taskStatus.skipped": "skipped",
  "plans.taskStatus.blocked": "blocked",
  "plans.stepStatus.pending": "pending",
  "plans.stepStatus.running": "running",
  "plans.stepStatus.completed": "completed",
  "plans.stepStatus.failed": "failed",
  "plans.stepStatus.skipped": "skipped",
  "plans.actionType.pilot_command": "pilot command",
  "plans.actionType.pi_session": "pi session",
  "plans.actionType.profile_switch": "switch profile",
  "plans.actionType.pack_install": "install pack",
  "plans.actionType.policy_apply": "apply policy",
  "plans.actionType.condition": "condition",
  "plans.actionType.wait": "wait",
  "plans.actionType.manual": "manual",
  "plans.event.plan_created": "Plan created",
  "plans.event.plan_started": "Plan started",
  "plans.event.plan_paused": "Plan paused",
  "plans.event.plan_resumed": "Plan resumed",
  "plans.event.plan_completed": "Plan completed",
  "plans.event.plan_failed": "Plan failed",
  "plans.event.plan_cancelled": "Plan cancelled",
  "plans.event.plan_deleted": "Plan deleted",
  "plans.event.task_started": "Task started",
  "plans.event.task_completed": "Task completed",
  "plans.event.task_failed": "Task failed",
  "plans.event.task_skipped": "Task skipped",
  "plans.event.step_started": "Step started",
  "plans.event.step_completed": "Step completed",
  "plans.event.step_failed": "Step failed",
  "plans.event.step_retried": "Step retried",
  "plans.event.waiting_human": "Waiting for human input",
  "plans.new.h1": "New Plan",
  "plans.new.subtitle":
    'Give it a goal. Pilot derives a short title, sets strategy to "sequential", and creates a draft. You can add tasks via the API or wait for the v0.6.0 executor.',
  "plans.new.goalLabel": "Goal",
  "plans.new.goalPlaceholder": "e.g. 实现用户登录功能",
  "plans.new.submit": "Create Plan",
  "plans.new.cancel": "Cancel",
  "plans.new.errorEmpty": "Goal cannot be empty.",
  "plans.suggest.title": "Suggest tools",
  "plans.suggest.subtitle":
    "Based on the goal, pick tools + profile keywords from what's installed. Currently a v0.5.7 baseline (keyword match) — LLM-based matching lands with the v0.6.0 executor.",
  "plans.suggest.label": "Goal",
  "plans.suggest.placeholder": "e.g. parse CSV with Python",
  "plans.suggest.button": "Suggest",
  "plans.suggest.matchedTools": "Matched tools",
  "plans.suggest.matchedProfiles": "Matched profiles",
  "plans.suggest.noneTools":
    "No matching tools. All available tools are listed under /tools.",
  "plans.suggest.noneProfiles":
    "No matching profiles. All available profiles are listed under /profiles.",
};
export default en;
