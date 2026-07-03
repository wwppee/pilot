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
  "footer.copy": "pilot-web v{version} · reads + policy + compose over pilot server",
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
  "btn.add": "Add",
  "btn.remove": "Remove",
  "btn.create": "Create",
  "btn.ariaConfirmDelete": "Confirm delete policy (click again to delete)",
  "btn.ariaDelete": "Delete this policy",
  "btn.ariaApplyTitle":
    "Generate ~/.pilot/extensions/pilot-policy-<name>.ts and have pi load it",
  "btn.ariaUnapplyTitle": "Remove the generated extension",

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

  // Packages
  "packages.h1": "Package Center",
  "packages.subtitle": "{n} installed · search npm without leaving the dashboard.",
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
  "tools.empty": "No tools discovered. Run pi once to initialize the directory.",
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
  "profiles.subtitle":
    "{n} profile{s} · stored under ~/.pilot/profiles/",
  "profiles.newNameLabel": "New profile name (kebab-case)",
  "profiles.newNamePlaceholder": "my-work",
  "profiles.empty": "No profiles yet. Use the form above to create one.",
  "profiles.delete": "delete",

  // Capabilities
  "capabilities.h1": "Capabilities",
  "capabilities.subtitle":
    "{n} capability installed · Forge ships in v0.4.",
  "capabilities.refreshHint": "auto-refresh 15s",
  "capabilities.empty":
    "No capabilities installed yet. Forge ships in v0.4.",
  "capabilities.sources": "{n} source(s)",
  "capabilities.requires": "requires {n}",
  "capabilities.conflicts": "conflicts {n}",
};
export default en;