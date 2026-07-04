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
  "nav.capabilities": "Capabilities",

  // Server status
  "server.up": "pilot server · v{version}",
  "server.down": "server not running",

  // Footer
  "footer.copy":
    "pilot-web v{version} · reads + policy + compose over pilot server",
  "footer.endpoint": "server expected at",

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

  // Packages
  "packages.noPacksHint":
    "No packs installed yet. Try `pilot pack search subagent`.",

  // Profiles [name]
  "profiles.editHeading": "Edit",
  "profiles.descriptionPlaceholder": "What is this profile for?",
  "profiles.saved": "Profile updated.",
  "profiles.model": "model",
  "profiles.thinking": "thinking",
  "profiles.packages": "package(s)",
  "profiles.activate": "Activate",
  "profiles.active": "Active",
  "profiles.activeHint":
    "This profile is the one Pilot will hand to pi on next session.",
  "profiles.activatedToast": "✓ {name} is now the active profile.",
  "profiles.clearedToast": "Active profile cleared.",
  "profiles.noActive":
    "No profile is active yet. Click Activate on any profile to set one.",
  "profiles.activateFailed": "Could not activate: {msg}",

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
  "home.empty.packs": "No packs installed.",
  "home.refreshHint": "auto-refresh 10s · updated now",
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
  "packages.empty": "No packs installed yet. Try `pilot pack search subagent`.",

  // Sessions
  "sessions.h1": "Sessions",
  "sessions.subtitle": "{n} session{s} under {home} · most recent first.",
  "sessions.empty": "No sessions yet. Run pi to create one.",
  "sessions.col.id": "ID",
  "sessions.col.cwd": "CWD",
  "sessions.col.lastUsed": "Last used",
  "sessions.col.entries": "Entries",
  "sessions.col.size": "Size",
  "sessions.col.model": "Model",

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
  "usage.showingLastN": "(showing last 14 of {n} days)",

  // Tools
  "tools.h1": "Tool inventory",
  "tools.subtitle":
    "{n} tool{s} available to pi — built-in ({builtin}), npm extensions ({npm}).",
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

  // Context
  "context.h1": "Project context",
  "context.subtitle":
    "Files visible from {cwd} that pi may load into its system prompt. Mirrors pi's `loadProjectContextFiles` algorithm.",
  "context.empty":
    "No context files found. Create an `AGENTS.md` or `CLAUDE.md` in this directory.",
  "context.section.loaded.title": "Loaded by pi",
  "context.section.loaded.subtitle":
    "Injected into the system prompt at session start",
  "context.section.info.title": "Informational only",
  "context.section.info.subtitle": "Visible in Pilot; not auto-loaded by pi",

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
  "profiles.fromSession.cta":
    "Create a profile from this session →",
  "sessions.createProfileCta":
    "Create profile from this session",

  // Session tree explorer (v0.4.13+)
  "sessions.tree.searchPlaceholder": "search preview…",
  "sessions.tree.searchLabel": "Search node preview text",
  "sessions.tree.filterLabel": "Filter by node type",
  "sessions.tree.expandAll": "expand all",
  "sessions.tree.collapseAll": "collapse all",
  "sessions.tree.matchCount": "{n} match{es}",

  // Capabilities
  "capabilities.h1": "Capabilities",
  "capabilities.subtitle": "{n} capability installed · Forge ships in v0.4.",
  "capabilities.refreshHint": "auto-refresh 15s",
  "capabilities.empty": "No capabilities installed yet. Forge ships in v0.4.",
  "capabilities.sources": "{n} source(s)",
  "capabilities.requires": "requires {n}",
  "capabilities.conflicts": "conflicts {n}",
};
export default en;
