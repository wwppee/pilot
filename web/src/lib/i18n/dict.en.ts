import type { Dict } from "./types";

const en: Dict = {
  // Skip link / a11y
  "skip.toMain": "Skip to main content",
  "nav.ariaLabel": "Main",
  "aria.moreActions": "More actions",

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
  // v0.7.0
  "nav.workflows": "Workflows",
  "nav.profiles": "Profiles",
  "nav.forge": "Forge",
  "nav.capabilities": "Capabilities",
  "nav.avatars": "Avatars",
  "nav.plans": "Plans",
  "nav.try": "Try pi",
  "nav.hint.dashboard": "Today's stats + recent activity",
  "nav.hint.try": "Chat with pi from the browser",
  "nav.hint.sessions": "Browse past pi conversations",
  "nav.hint.usage": "Tokens, cost, by-model breakdown",
  "nav.hint.tools": "Tools pi can call + their usage",
  "nav.hint.context": "Project rules pi reads on startup",
  "nav.hint.capabilities": "What pi is currently allowed to do",
  "nav.hint.avatars": "Project's expected config (diff vs current)",
  "nav.hint.plans": "Multi-step tasks for pi (v0.5.13+ UI)",
  "nav.hint.packages": "Browse + install pi extensions",
  "nav.hint.forge": "Create / package your own extension",
  "nav.hint.policy": "Tool safety rules + confirm/block lists",
  "nav.hint.compose": "Try composable Box Garden prototypes",
  "nav.hint.workflows": "Reusable agent workflow templates",
  "nav.hint.profiles": "Saved capability bundles (model + tools)",
  "nav.hint.help": "Glossary + how-tos for beginners",
  // v0.5.21: welcome banner content.
  "home.welcome.title": "Welcome to Pilot",
  "home.welcome.intro":
    "Pilot is pi's management dashboard. Three steps to get going:",
  "home.welcome.step1.label": "Chat with pi",
  "home.welcome.step1.desc":
    "Open the Try page, connect, and send your first prompt.",
  "home.welcome.step2.label": "Install a tool",
  "home.welcome.step2.desc": "Browse the registry and add one pi extension.",
  "home.welcome.step3.label": "Read the glossary",
  "home.welcome.step3.desc":
    "Hover any underlined term, or open the help page.",
  "home.welcome.stepN": "Step {n}",
  "home.welcome.dismiss": "Dismiss welcome banner",
  // v0.6.1: PlanEditor (visual plan builder).
  "plans.editor.goalLabel": "Goal",
  "plans.editor.goalPlaceholder": "What do you want pi to do?",
  "plans.editor.titleLabel": "Title",
  "plans.editor.titlePlaceholder": "(auto-derived from goal)",
  "plans.editor.strategyLabel": "Strategy",
  "plans.editor.tasksLabel": "Tasks",
  "plans.editor.addTask": "Add task",
  "plans.editor.noTasks": "No tasks yet — add at least one.",
  "plans.editor.taskIndex": "Task {n}",
  "plans.editor.taskDescriptionPlaceholder": "What this task does",
  "plans.editor.profileLabel": "Profile",
  "plans.editor.profileNone": "(none)",
  "plans.editor.dependsOnLabel": "Depends on",
  "plans.editor.dependsOnNone": "—",
  "plans.editor.stepsLabel": "Steps ({n})",
  "plans.editor.addStep": "Add step",
  "plans.editor.noSteps": "No steps yet — add at least one.",
  "plans.editor.stepDescriptionPlaceholder": "What this step does",
  "plans.editor.removeTask": "Remove task",
  "plans.editor.removeStep": "Remove step",
  "plans.editor.moveUp": "Move up",
  "plans.editor.moveDown": "Move down",
  "plans.editor.conditionHelp":
    "DSL: true / false / step.<id>.success / and(a,b) / or(a,b) / not(a) / eq(a,b) / neq(a,b) / contains(a,b)",
  "plans.editor.submit": "Create plan",
  "plans.editor.submitting": "Creating…",
  "plans.editor.cancel": "Cancel",
  "plans.editor.error.goalEmpty": "Goal cannot be empty.",
  "plans.editor.error.noTasks": "Add at least one task.",
  "plans.editor.error.fieldRequired":
    "Task {task}, step {step}: {field} is required.",
  "plans.editor.field.command": "command",
  "plans.editor.field.prompt": "prompt",
  "plans.editor.field.profileName": "profile name",
  "plans.editor.field.packSource": "pack source",
  "plans.editor.field.policyName": "policy name",
  "plans.editor.field.check": "check expression",
  "try.h1": "Try pi",
  "try.subtitle":
    "Chat with the real pi agent. Each browser tab spawns a fresh pi subprocess via the WebSocket bridge — type a prompt and watch the response stream in.",
  "try.status.idle": "Click Connect to start",
  "try.status.fetchingToken": "Reading auth token…",
  "try.status.connecting": "Opening WebSocket…",
  "try.status.connected": "Connected — pi is running in the background",
  "try.status.disconnected": "Disconnected",
  "try.status.errorUnknown": "Error: unknown",
  "try.action.connect": "Connect",
  "try.action.disconnect": "Disconnect",
  "try.action.send": "Send",
  "try.action.newSession": "New session",
  "try.action.abort": "Abort",
  "try.prompt.label": "Message",
  "try.prompt.placeholder": 'e.g. "List the files in the current directory"',
  "try.chat.emptyConnected":
    "Connected. Send a message to start chatting with pi.",
  "try.chat.emptyDisconnected":
    "Not connected. Click Connect to start a pi session.",
  "try.thinking": "Thinking…",
  "try.streaming": "pi is typing…",
  "try.tool.executing": "Running {tool}…",
  "try.tool.result": "Result",
  "try.tool.error": "Tool error",
  "try.tool.args": "Arguments",
  "try.developerDetails": "Developer details",
  "try.developerDetailsHint":
    "Raw events from the pi RPC bridge — useful for debugging.",
  // v0.5.20: SessionTree view of the full conversation DAG.
  "try.tree.title": "Conversation tree",
  "try.tree.hint":
    "Branches show where the conversation forked. Click ↳ on a user prompt to branch from that exact point.",
  "try.tree.empty": "No tree data — start a prompt to populate.",
  "try.tree.stats": "{n} nodes",
  "try.tree.branches.one": "{n} branch",
  "try.tree.branches.other": "{n} branches",
  "try.tree.depth": "depth {n}",
  // v0.5.18: /help page — glossary + how-tos for beginners.
  "help.h1": "Help — Pilot for beginners",
  "help.subtitle":
    "Glossary, how-tos, and architecture overview. Every page in Pilot also has inline hints — look for the small italic prompts.",
  "help.section.howDoI": "How do I…",
  "help.section.glossary": "Glossary",
  "help.section.glossaryHint":
    "The same definitions are used by the inline tooltip hints across the app — hover any underlined term.",
  "help.section.architecture": "Architecture",
  "help.section.architectureBody":
    "Pilot is a management plane for pi. pi (the coding agent) runs as a Node subprocess. Pilot spawns one subprocess per browser tab via WebSocket → RPC bridge, reads its session JSONL files for stats, and exposes the result as a Next.js web UI. You can use pi directly from your terminal without Pilot — Pilot just makes the state visible and manageable from a browser.",
  // v0.5.22: "How do I…" cards.
  "help.howDo.firstSession.title": "Start my first pi session",
  "help.howDo.firstSession.body":
    "Click Try pi, then Connect. Type a prompt, watch pi stream a reply.",
  "help.howDo.findSession.title": "Find a past session",
  "help.howDo.findSession.body":
    "Sessions lists every conversation pi has had. Click any row to see the full transcript.",
  "help.howDo.installTool.title": "Install a new tool",
  "help.howDo.installTool.body":
    "Packages → search → Install. Restart pi to pick up the new tool.",
  "help.howDo.switchModel.title": "Switch pi's model / behavior",
  "help.howDo.switchModel.body":
    "Profiles bundle model + tools + thinking level. Pick one in the dropdown on /try.",
  "help.howDo.blockDangerous.title": "Stop pi from running a dangerous command",
  "help.howDo.blockDangerous.body":
    "Policy → add the tool name to the block list, or require confirmation.",
  "help.howDo.checkSpending.title": "Check how much I've spent",
  "help.howDo.checkSpending.body":
    "Usage → set the date range, see token + cost by model and by day.",
  // v0.5.22: per-page inline <Hint> blocks.
  "hint.defaultSummary": "What is this?",
  // tools
  "tools.hint.summary": "What are these tools?",
  "tools.hint.body":
    "Tools are what pi can call on your behalf — read a file, run a shell command, search code, etc. There are three sources: {s1} (ship with pi), {s2} (your custom extensions under {c1}), and {s3} (installed via /packages). The colored safety badge tells you what kind of side effects a tool has: {c2} is safe, {c3} modifies files, {c4} runs shell, {c5} hits the web, {c6} handles credentials. Edit which tools are allowed in {policy}.",
  // context
  "context.hint.summary": "What is project context?",
  "context.hint.body":
    "When you start a pi session, pi auto-loads a few files (the {s1} ones below) and stuffs them into its system prompt. These are how you tell pi the rules of your project — coding conventions, what to never touch, where the tests live. Files marked {s2} are just for your reference here in Pilot; pi does {em1} see them. Use the Discovery rules panel below to debug why a file is or isn't loading. See the full glossary entry for {context}.",
  // capabilities
  "capabilities.hint.summary": "What is a capability?",
  "capabilities.hint.body":
    "A {capability} is a named permission / setting that pi can use: a model, a set of tools, a thinking level, system-prompt text. They're the atomic units — packages contribute them, profiles bundle them, avatars diff them. Click any card to see its sources (which packages provide it) and conflicts (which other capabilities it can't coexist with).",
  // plans
  "plans.hint.summary": "What is a plan?",
  "plans.hint.body":
    "A {plan} is a multi-step task you want pi to execute. Each plan has a {s1} (the high-level outcome), a list of {s2} (milestones), and each task has {s3} (the actual pi actions). Click any plan to see its DAG and event history. {em1} adds the executor that runs plans automatically — for now this page is the data + UI shell.",
  // compose
  "compose.hint.summary": "What is compose?",
  "compose.hint.body":
    "Compose is a visual canvas for arranging Pilot {capability} on a board — drag from the sidebar onto the canvas, snap them together, and explore how they connect. It's a sandbox / prototype tool, not a way to actually configure pi (use {profile} for that). Useful for visualizing a stack before writing a long {c1} command.",
  // usage
  "usage.hint.summary": "What do these numbers mean?",
  "usage.hint.body":
    "{token} are the units LLMs charge by — roughly ¾ of an English word. Every prompt you send to pi and every reply you get back costs tokens (input / output). {c1} / {c2} are Anthropic's prompt caching — repeats are much cheaper. The total cost is computed from the per-model rate (set in your {profile}). Use the range tabs (Today / Week / Month / All) to spot trends.",
  // sessions
  "sessions.hint.summary": "What's a session?",
  "sessions.hint.body":
    "A {s1} is one continuous conversation with pi — saved as a JSONL file in {c1}. Each prompt you send is a new entry. Click any row to see the full transcript and any tool calls pi made.",
  // forge
  "forge.hint.summary": "What is forge?",
  "forge.hint.body":
    "Forge is the workshop for creating your own {capability}. Search an npm package above, click into it, and Pilot inspects its metadata, lets you declare a name + description, and then {em1} it into Pilot's local registry. Once absorbed, the new tools show up in /tools and you can enable them in a {profile}. This is for users who want to package a private extension without publishing to npm first.",
  // packages
  "packages.hint.summary": "What is a package?",
  "packages.hint.body":
    "A {pack} is a pi extension installed from npm — it can add new tools, prompt templates, or skills. Search the registry above to discover; install from the CLI with {c1}. Once installed, the new {tool} show up in /tools and the {capability} show up in /capabilities.",
  // try
  "try.hint.summary": "What is this page?",
  "try.hint.body":
    "This page opens a real pi session in your browser. Click {s1}, type a message, and watch pi stream a reply. Every user bubble has a hidden {s2} button (hover over it) — forking creates a new branch of the conversation from that exact prompt. Rename / Clone at the top save or duplicate the session. {rpc} is the protocol pi speaks over WebSocket; the dev-details panel at the bottom shows the raw events if you're curious.",
  // profiles
  "profiles.hint.summary": "What is a profile?",
  "profiles.hint.body":
    "A {profile} is a saved bundle of {capability} — a model, a set of enabled packages, a thinking level. Use profiles to switch between “fast iteration” (cheap model, small tool set) and “careful work” (expensive model, full tools) without re-configuring pi every time. Activate one here and it sticks until you activate another. Different from {avatar} (which are snapshots you compare against, not switch between).",
  // avatars
  "avatars.hint.summary": "What is an avatar?",
  "avatars.hint.body":
    "An {avatar} is a snapshot of “what this project is supposed to look like” — which profile, model, packages, and extensions should be active. Capture one for each project so you can see at a glance when something has drifted. The diff page highlights the difference between the avatar and the current state. Don't confuse avatars with {profile}: a profile is something you actively switch between; an avatar is a baseline you compare against.",
  // policy
  "policy.hint.summary": "What is a policy?",
  "policy.hint.body":
    "A {policy} is a safety rule: which tools pi can call freely, which need your confirmation, and which are blocked outright. Policies compile to a small extension installed under {c1}; the {em1} button generates + installs it, the {em2} button removes it. Use the dry-run panel to test a policy against a sample tool call before applying.",
  // v0.5.16: pi session tree (rename / clone / fork).
  "try.session.title": "Session",
  "try.session.unnamed": "Untitled session",
  "try.session.rename": "Rename",
  "try.session.renamePlaceholder": "Session name",
  "try.session.renameSave": "Save",
  "try.session.renameCancel": "Cancel",
  "try.session.clone": "Clone",
  "try.session.cloneHint": "Copy the current branch into a new session file.",
  "try.session.messageCount.one": "{count} message",
  "try.session.messageCount.other": "{count} messages",
  "try.session.forkedFrom": "↳ Forked from “{name}”",
  "try.session.forkHere": "Fork from here",
  "try.session.forkConfirm":
    "Start a new branch from this message? The current branch stays; future messages go to the new one.",
  "try.session.forkButton": "Fork",
  "try.session.forkCancel": "Cancel",
  "try.session.cloneOk": "Cloned — now in “{name}”",
  "try.events.title": "Event stream",
  "try.events.clear": "clear",
  "try.events.emptyConnected":
    "Connected. Send a message to see streaming events.",
  "try.events.emptyDisconnected": "Not connected.",
  // v0.4.14: nav groups
  "nav.groupInspect": "Inspect",
  "nav.groupManage": "Manage",
  "nav.groupLearn": "Learn",
  "nav.help": "Help",

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
  "policy.loadErrorTitle": "Couldn't load policies",
  "policy.tryRule.noPolicies": "No policies to test against.",
  "policy.tryRule.policyLabel": "Policy",
  "policy.tryRule.toolLabel": "Tool",
  "policy.tryRule.toolBash": "bash",
  "policy.tryRule.toolRead": "read",
  "policy.tryRule.toolEdit": "edit",
  "policy.tryRule.toolWrite": "write",
  "policy.tryRule.argsLabel": "Args (JSON)",
  "policy.tryRule.runCheck": "Check",
  "policy.check": "Check",
  "policy.allowBadge": "allow",
  "policy.denyBadge": "deny",
  "policy.warnBadge": "warn",
  "policy.hitlBadge": "HITL",
  // v0.8.4: per-tool rule label on the policy card.
  // The dashboard is read-only today; this is just
  // surfacing what the saved policy contains so the
  // user can see "bash has a custom deny list" at
  // a glance. Editing lives in v0.8.5+.
  "policy.toolRuleLabel": "per-tool ({tool}):",
  "policy.toolRuleEmpty": "(empty override)",
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
  // v0.8.6: per-tool rule editor. Each row overrides the
  // global rule for one tool name. Leave a field empty to
  // fall back to the global rule for that sub-field.
  "policy.form.toolRules.legend":
    "Per-tool rules · override the globals for one tool at a time",
  "policy.form.toolRules.hint":
    "Useful when one tool needs stricter (or looser) rules than the globals. Empty sub-fields fall back to the global rule.",
  "policy.form.toolRules.empty":
    "No per-tool overrides. The global rules above apply to every tool.",
  "policy.form.toolRules.addTool": "+ Add per-tool rule",
  "policy.form.toolRules.removeTool": "Remove",
  "policy.form.toolRules.toolNameLabel": "Tool",
  "policy.form.toolRules.toolNamePlaceholder": "bash",
  "policy.form.toolRules.toolNameAriaLabel": "Tool name for per-tool rule row {n}",
  "policy.form.toolRules.field.deny.label": "deny (override)",
  "policy.form.toolRules.field.requireApproval.label":
    "requireApproval (override)",
  "policy.form.toolRules.field.denyPaths.label": "denyPaths (additive)",
  "policy.form.toolRules.field.denyCommands.label": "denyCommands (additive)",

  // Compose
  "compose.searchPlaceholder": "Search…",
  "compose.emptySearch": "No matches. Adjust the filter or search.",
  "compose.dragHint": "Drag to canvas, or press Enter to add to center",
  "compose.canvasAria":
    "Compose canvas. When a block is selected, use arrow keys to move it, Delete to remove, Escape to deselect.",
  "compose.canvasEmpty": "Empty canvas — pick a sidebar item and press {key}.",
  "compose.canvasSelectBlock":
    "Click a block on the canvas to inspect it. Press {del} to remove it, or {esc} to deselect.",
  // v0.6.11: same text as `canvasSelectBlock` but without
  // {del}/{esc} placeholders — the caller used to pass
  // `{del: "Delete", esc: "Escape"}` as a hardcoded English
  // literal, which broke under zh locale. Key names (Delete /
  // Escape / Esc) are keyboard conventions and don't translate,
  // so we bake them into the translation string directly.
  "compose.canvasSelectBlock.keys":
    "Click a block on the canvas to inspect it. Press Delete to remove it, or Escape to deselect.",
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
  "compose.inspector.blockCount.one": "{n} block",
  "compose.inspector.blockCount.other": "{n} blocks",
  "compose.inspector.openDetail": "Open detail page →",
  "compose.inspector.remove": "Remove",
  "compose.announce.removedBlock": "Removed block {label}",
  "compose.announce.addedBlock": "Added {label} block to canvas",
  "compose.aria.addEntity": "Add {kind} “{label}” to canvas",
  // v0.6.2: undo/redo toolbar.
  "compose.toolbar.undo": "Undo",
  "compose.toolbar.redo": "Redo",
  "compose.toolbar.undoTitle": "Undo last change (⌘/Ctrl+Z)",
  "compose.toolbar.redoTitle": "Redo last change (⌘/Ctrl+Shift+Z)",
  "compose.toolbar.clearTitle": "Remove all blocks from the canvas",
  "compose.toolbar.exportTitle": "Export current canvas as JSON",
  "compose.toolbar.importTitle": "Import canvas from JSON",
  "compose.toolbar.viewModeLabel": "Skin",
  "compose.toolbar.viewModeModern": "Modern",
  "compose.toolbar.viewModeCozy": "Cozy",
  "compose.toolbar.viewModeTooltip":
    "Toggle between modern flat and cozy 2.5D sandbox skin",
  // v0.6.2: empty-state onboarding.
  "compose.empty.title": "Start by adding a block",
  "compose.empty.step1": "Drag any item from the sidebar onto the canvas",
  "compose.empty.step2": "Or click the + button to drop it at the center",
  "compose.empty.step3":
    "Click a block to inspect it on the right (or in the bottom sheet on mobile)",
  "compose.empty.keyboardHint":
    "Tip: arrow keys move the selected block, Delete removes it, ⌘/Ctrl+Z undoes.",
  // v0.6.2: sidebar affordances.
  "compose.sidebar.addAria": "Add “{label}” to canvas",
  "compose.sidebar.dragAffordance": "Drag, or click +",
  // v0.6.2: mobile inspector drawer.
  "compose.inspector.openDrawer": "Open details",
  "compose.inspector.closeDrawer": "Close",
  "compose.inspector.mobileTitle": "Block details",
  // v0.6.2: undo/redo announcements.
  "compose.announce.undone": "Undid last change",
  "compose.announce.redone": "Redid last change",
  "compose.announce.historyEmpty": "Nothing to undo",
  // v0.6.4: undo/redo with stack-count suffix.
  "compose.toolbar.undoWithCount": "↶ Undo · {n}",
  "compose.toolbar.redoWithCount": "↷ Redo · {n}",
  // v0.6.4: per-block actions.
  "compose.inspector.duplicate": "Duplicate",
  "compose.inspector.duplicateTitle": "Add a copy of this block beside it",
  "compose.inspector.moveTop": "Top",
  "compose.inspector.moveBottom": "Bottom",
  // v0.6.4: just-added announcement.
  "compose.announce.justAdded": "Added {label} — press ⌘/Ctrl+Z to undo",
  // v0.6.5: inspector detail fields.
  "compose.inspector.loading": "Loading details…",
  "compose.inspector.error": "Could not load entity details",
  "compose.inspector.detail.cwd": "cwd",
  "compose.inspector.detail.entries": "entries",
  "compose.inspector.detail.size": "size",
  "compose.inspector.detail.lastUsed": "last used",
  "compose.inspector.detail.firstUsed": "first used",
  "compose.inspector.detail.model": "model",
  "compose.inspector.detail.packages": "packages",
  "compose.inspector.detail.thinking": "thinking",
  "compose.inspector.detail.provider": "provider",
  "compose.inspector.detail.team": "team",
  "compose.inspector.detail.preview": "preview",
  "compose.inspector.detail.source": "source",
  "compose.inspector.detail.enabled": "enabled",
  "compose.inspector.detail.title": "title",
  "compose.inspector.detail.type": "type",
  "compose.inspector.detail.description": "description",
  "compose.inspector.detail.sources": "sources",
  "compose.inspector.detail.allow": "allow",
  "compose.inspector.detail.deny": "deny",
  "compose.inspector.detail.denyPaths": "deny paths",
  "compose.inspector.detail.denyCommands": "deny commands",
  "compose.inspector.detail.sensitivePatterns": "sensitive patterns",
  "compose.inspector.detail.requireApproval": "require approval",
  "compose.inspector.detail.conflicts": "conflicts",
  "compose.inspector.detail.requires": "requires",
  "compose.inspector.detail.noneCount": "(none)",
  // v0.6.7: connections.
  "compose.inspector.connections": "Connections",
  "compose.inspector.connect": "Connect to…",
  "compose.inspector.connectTo": "Connect to {label}",
  "compose.inspector.cancelConnect": "Cancel",
  "compose.inspector.disconnect": "Disconnect",
  "compose.inspector.noConnections": "No connections yet",
  "compose.inspector.connectionsFrom": "From this block",
  "compose.inspector.connectionsTo": "To this block",
  // v0.6.11: BlockInspector always-shown metadata fields.
  // English stays as the schema field name so the mapping
  // between code and UI is obvious.
  "compose.inspector.field.id": "id",
  "compose.inspector.field.kind": "kind",
  "compose.inspector.field.refId": "refId",
  "compose.inspector.field.position": "position",
  "compose.inspector.time.second": "{n}s ago",
  "compose.inspector.time.minute": "{n}m ago",
  "compose.inspector.time.hour": "{n}h ago",
  "compose.inspector.time.day": "{n}d ago",
  "compose.inspector.time.month": "{n}mo ago",
  "compose.inspector.time.year": "{n}y ago",
  "compose.announce.connectionAdded": "Connected {from} → {to}",
  "compose.announce.connectionRemoved": "Disconnected {from} → {to}",
  // v0.6.8: right-edge connector handle on selected blocks. Drag
  // it to another block to draw a connection in one gesture (vs.
  // the inspector's two-click picker).
  "compose.handle.aria": "Drag to another block to connect",
  "compose.handle.title": "Drag to connect",
  "compose.inspector.connectionLabel": "Connection label",
  "compose.inspector.connectionLabel.placeholder": "Type a label…",
  "compose.inspector.connectionLabel.none": "No label",
  "compose.connectionLabel.kind.flows": "flows to",
  "compose.connectionLabel.kind.uses": "uses",
  "compose.connectionLabel.kind.feeds": "feeds",
  "compose.connectionLabel.kind.depends": "depends on",
  "compose.connectionLabel.kind.produces": "produces",
  "compose.connectionLabel.kind.manual": "manual",
  "compose.connection.dir.label": "Direction",
  "compose.connection.dir.forward": "A → B",
  "compose.connection.dir.backward": "B → A",
  "compose.connection.dir.bidirectional": "A ↔ B",
  "compose.connection.color.label": "Color",
  "compose.connection.color.tooltip":
    "Pick a per-edge color (default: theme accent)",
  "compose.connection.color.default": "Theme default",
  "compose.connection.color.reset": "Reset to theme",
  "compose.announce.connectionColorUpdated": "Connection color: {color}",
  "compose.connection.route.label": "Routing",
  "compose.connection.route.curve": "Curve",
  "compose.connection.route.orthogonal": "Orthogonal",
  "compose.announce.connectionRouteUpdated": "Connection routing: {route}",
  "compose.connectionLabel.tooltip": "Click to edit connection label",
  "compose.announce.connectionLabelUpdated": "Connection label updated",
  "compose.announce.connectionDirUpdated": "Connection direction: {dir}",
  // v0.6.10: server-side board persistence.
  "compose.toolbar.saveTitle": "Save to server",
  "compose.toolbar.loadTitle": "Load from server",
  "compose.toolbar.boardsTitle": "Manage boards",
  "compose.board.saving": "Saving…",
  "compose.board.saved": "Saved",
  "compose.board.saveError": "Save failed",
  "compose.board.loading": "Loading…",
  "compose.board.loaded": "Loaded",
  "compose.board.loadError": "Load failed",
  "compose.board.empty": "No saved boards yet",
  "compose.board.namePrompt": "Name this layout",
  "compose.board.namePlaceholder": "e.g. data-pipeline-v2",
  "compose.board.confirmOverwrite":
    "A layout with this name already exists. Replace it?",
  "compose.board.confirmDelete":
    "Delete this saved board? Your current local layout is kept.",
  "compose.board.deleted": "Board deleted",
  "compose.board.deleteError": "Delete failed",
  // v0.6.11: board list meta — unit only (no count baked in).
  "compose.boardList.blockCount.one": "block",
  "compose.boardList.blockCount.other": "blocks",
  "compose.boardList.connectionCount.one": "connection",
  "compose.boardList.connectionCount.other": "connections",
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
  "profiles.createdBanner": "✓ Created {name}.",
  "profiles.notFound": "Profile {name} not found.",
  "profiles.envHeading": "env (read-only — edit TOML directly)",
  "profiles.field.providerPlaceholder": "anthropic / openai / google",
  "profiles.field.modelPlaceholder": "e.g. claude-opus-4.6",
  "profiles.field.thinkingPlaceholder": "low / medium / high",
  "profiles.field.packagesPlaceholder": "npm:pi-lens, npm:pi-subagents",
  "profiles.field.packagesLabelSuffix": " (comma-separated)",
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
  "profiles.packageCount.one": "{n} package",
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
  "sessions.subtitle": "{n} sessions under {home} · most recent first.",
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
  "usage.empty": "No usage data yet.",
  "usage.empty.model": "No model data.",
  "usage.empty.day": "No daily data.",
  "usage.empty.hint": "Run {cmd} with a real model to record tokens + cost.",
  "usage.showingLastN": "(showing last 14 of {n} days)",
  "usage.loadError": "Couldn’t load usage: {message}",

  // Tools
  "tools.h1": "Tool inventory",
  "tools.subtitle":
    "{n} tools available to pi — built-in ({builtin}), npm extensions ({npm}).",
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
    "A free-form sandbox for arranging sessions, packs, profiles, policies, and capabilities. Visualize combinations — it doesn't actually configure pi.",
  "compose.inspector": "Inspector",
  "compose.emptyCanvas": "Empty canvas — pick a sidebar item and press {key}.",

  // Profiles
  "profiles.h1": "Profiles",
  "profiles.subtitle": "{n} profiles · stored under ~/.pilot/profiles/",
  "profiles.newNameLabel": "New profile name (kebab-case)",
  "profiles.newNamePlaceholder": "my-work",
  "profiles.empty": "No profiles yet. Use the form above to create one.",
  "profiles.delete": "delete",

  // Profile pre-fill from session (v0.4.13+)
  "profiles.fromSession.banner":
    "Pre-filled from session {sessionId}: model + {nTool} tools detected.",
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
  "sessions.tree.matchCount": "{n} matches",
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
  // v0.6.12: /compose/boards list page.
  "compose.boards.title": "Boards",
  "compose.boards.subtitle": "Server-persisted /compose layouts",
  "compose.boards.open": "Open",
  "compose.boards.openTitle": "Open this board in /compose",
  "compose.boards.column.name": "Name",
  "compose.boards.column.blocks.one": "block",
  "compose.boards.column.blocks.other": "blocks",
  "compose.boards.column.connections.one": "connection",
  "compose.boards.column.connections.other": "connections",
  "compose.boards.column.updated": "Updated",
  "compose.boards.column.actions": "Actions",
  "compose.boards.empty.title": "No boards yet",
  "compose.boards.empty.hint":
    "Save a board from /compose to see it listed here. Boards live in ~/.pilot/compose-boards.",
  "compose.boards.empty.cta": "Open /compose",
  "compose.boards.loading": "Loading boards…",
  "compose.boards.error.title": "Couldn't load boards",
  "compose.boards.error.hint":
    "Check that the pilot server is running and your token is correct.",
  "compose.boards.error.retry": "Retry",
  "compose.boards.action.rename": "Rename",
  "compose.boards.action.renameTitle": "Rename this board",
  "compose.boards.action.delete": "Delete",
  "compose.boards.action.deleteTitle": "Delete this board",
  "compose.boards.action.share": "Copy as JSON",
  "compose.boards.action.shareTitle":
    "Copy this board's JSON to the clipboard (paste into a new board)",
  "compose.boards.confirm.delete":
    'Delete board "{name}"? This cannot be undone.',
  "compose.boards.confirm.bulkDelete":
    "Delete {n} board(s)? This cannot be undone.",
  "compose.boards.announce.renamed": 'Renamed board to "{name}"',
  "compose.boards.announce.deleted": 'Deleted board "{name}"',
  "compose.boards.announce.bulkDeleted": "Deleted {n} board(s)",
  "compose.boards.announce.copied": 'Copied board "{name}" as JSON',
  "compose.boards.bulk.selected": "{n} selected",
  "compose.boards.bulk.clear": "Clear selection",
  "compose.boards.bulk.selectAll": "Select all",
  "compose.boards.bulk.deleteSelected": "Delete selected",
  "compose.boards.bulk.copySelected": "Copy selected as JSON",
  "compose.boards.renameDialog.title": "Rename board",
  "compose.boards.renameDialog.label": "Board name",
  "compose.boards.renameDialog.placeholder": "e.g. Research session 2026-07-15",
  "compose.boards.renameDialog.confirm": "Save",
  "compose.boards.renameDialog.cancel": "Cancel",
  "compose.boards.renameDialog.maxLengthError": "Max {n} characters",
  "compose.boards.announce.bulkDeletedWithFailures":
    "Deleted {n} board(s), {m} failed",
  "compose.boards.row.select": "Select this board",
  "compose.boards.column.selectAria": "Select",
  "try.hint.forkFromHere": "Fork from here",
  "compose.boards.toolbar.openBoards": "Boards",
  "compose.boards.toolbar.openBoardsTitle":
    "Browse / rename / delete saved boards",

  // v0.7.0: workflows — reusable agent workflow templates.
  // See `core/workflow.ts` for the persistence model and
  // `/workflows` for the editor UI. The keys are kept small
  // (one key per string, not per node / edge / etc.) so the
  // translator's job is bounded.
  "workflows.h1": "Workflows",
  "workflows.subtitle":
    "Reusable agent workflows — capture a proven pattern, change the variables, repeat.",
  "workflows.empty": "No workflows yet.",
  "workflows.empty.hint": "Create one to capture a proven pattern.",
  "workflows.create": "New workflow",
  "workflows.duplicate": "Duplicate",
  "workflows.delete": "Delete",
  "workflows.confirmDelete": 'Delete "{id}"? This can\'t be undone.',
  "workflows.nodeCount": "{n} steps",
  "workflows.edgeCount": "{n} connections",
  "workflows.updatedAt": "Updated {when}",
  "workflows.notFound": "Workflow not found.",
  "workflows.newIdPrompt": "Workflow id",
  "workflows.newIdHint": 'kebab-case identifier, e.g. "research-and-test"',
  "workflows.invalidId":
    "id must be kebab-case (lowercase letters, digits, and dashes)",
  "workflows.field.name": "Name",
  "workflows.field.description": "Description",
  "workflows.field.id": "Id",
  "workflows.field.provider": "Provider",
  "workflows.field.model": "Model",
  "workflows.field.apiKeyRef": "API key ref",
  "workflows.field.systemPrompt": "System prompt",
  "workflows.field.inputTemplate": "Input template",
  // v0.8.3: when the inputTemplate field is rendered as
  // a dropdown (because upstream variables are
  // available), this is the empty-default option that
  // lets the user keep a custom literal.
  "workflows.field.inputCustom": "— custom —",
  "workflows.field.outputVar": "Output variable",
  "workflows.field.tools": "Tools",
  "workflows.field.onFailure": "On failure",
  "workflows.field.position": "Position",
  "workflows.field.retryCount": "Retry count",
  "workflows.field.escalateToModel": "Escalate to model",
  "workflows.onFailure.stop": "Stop the workflow",
  "workflows.onFailure.skip": "Skip this step, continue",
  "workflows.onFailure.retry": "Retry the same model",
  "workflows.onFailure.escalate": "Retry with a stronger model",
  "workflows.provider.anthropic": "Anthropic",
  "workflows.provider.openai": "OpenAI",
  "workflows.provider.google": "Google",
  "workflows.provider.ollama": "Ollama (local)",
  "workflows.provider.custom": "Custom endpoint",
  "workflows.editor.addNode": "Add step",
  "workflows.editor.removeNode": "Remove",
  "workflows.editor.addEdge": "Connect to…",
  "workflows.editor.removeEdge": "Disconnect",
  "workflows.editor.noNodes": 'No steps yet. Click "Add step" to begin.',
  "workflows.editor.noEdges":
    "No connections yet. Steps run in the order you connect them.",
  "workflows.editor.preview": "Preview",
  "workflows.editor.save": "Save",
  "workflows.editor.saved": "Saved.",
  "workflows.editor.saveFailed": "Save failed. Check the id is kebab-case.",
  "workflows.editor.duplicate": "Duplicate",
  "workflows.editor.delete": "Delete",
  "workflows.editor.layoutHint":
    'Tip: the preview reflects the data model, not the order you added nodes in. Click "Auto-layout" to clean it up.',
  "workflows.layoutBtn": "Auto-layout",
  "workflows.savedAt": "Saved at {when}",
  "workflows.editor.cancel": "Cancel",
  "workflows.editor.open": "Open",
  "workflows.editor.error.duplicateFailed": "Duplicate failed: {error}",
  "workflows.editor.error.loadFailed": "Could not load {id}",
  "workflows.editor.error.deleteFailed": "Delete failed: {error}",
  // v0.7.5: Run button labels. The server returns the
  // "what the runtime said" string in the live region
  // announcement, so the button label just needs to be
  // short + the hint explains that runtime is staged.
  "workflows.editor.run": "Run",
  "workflows.editor.runHint":
    "Run this workflow. Runtime lands in v0.7.6+.",
  "workflows.editor.runFailed": "Run failed: ",
  // v0.8.10: structural validation. The "ok"
  // case is the only fully positive feedback;
  // the issues case renders a list with severity
  // badges so the user can see what's blocking.
  "workflows.editor.validate": "Validate",
  "workflows.editor.validateHint":
    "Check the workflow for structural issues (cycles, dangling edges, missing variables) before running.",
  "workflows.editor.validateOk": "✓ No structural issues found.",
  "workflows.editor.validateIssuesTitle": "{n} issue(s) found:",
  "workflows.editor.validateErrorBadge": "error",
  "workflows.editor.validateWarningBadge": "warning",
  "workflows.editor.validateErrorPrefix": "Validation failed: {msg}",
  // v0.9.0 (A2 — tool wrapper): /wrappers dashboard.
  "wrappers.h1": "Wrappers",
  "wrappers.subtitle":
    "Tool wrappers transform a tool call before it runs (retry on failure, log to a separate audit log, rewrite the args). Mirrors the policy surface.",
  "wrappers.loadErrorTitle": "Couldn't load wrappers",
  "wrappers.empty.title": "No wrappers yet",
  "wrappers.empty.body":
    "Create a wrapper below to add a transform to one or more tools.",
  "wrappers.card.applied": "applied",
  "wrappers.card.notApplied": "not applied",
  "wrappers.card.kind": "kind:",
  "wrappers.card.tools": "tools:",
  "wrappers.apply": "Apply",
  "wrappers.unapply": "Unapply",
  "wrappers.delete": "Delete",
  "wrappers.applyOk":
    "✓ Stub extension written to {path} ({bytes} bytes).",
  "wrappers.applyFailed": "Apply failed",
  "wrappers.unapplyOk": "Extension removed.",
  "wrappers.unapplyNotApplied": "Extension was not applied.",
  "wrappers.unapplyFailed": "Unapply failed",
  "wrappers.deleteFailed": "Delete failed",
  "wrappers.confirmDelete": "Delete wrapper {name}?",
  "wrappers.newCard.title": "New wrapper",
  "wrappers.newCard.subtitle":
    "Pick a kind, give it a kebab-case name, and the wrapper will be saved to ~/.pilot/wrappers/.",
  "wrappers.newCard.nameLabel": "Name",
  "wrappers.newCard.namePlaceholder": "bash-retry",
  "wrappers.newCard.nameRequired": "Name is required",
  "wrappers.newCard.kindLabel": "Kind",
  "wrappers.newCard.kindRetry": "Retry on failure",
  "wrappers.newCard.kindLog": "Log to audit trail",
  "wrappers.newCard.kindTransform": "Transform args",
  "wrappers.newCard.toolsLabel": "Tools (comma-separated)",
  "wrappers.newCard.submit": "Create",
  "nav.wrappers": "Wrappers",
  // v0.9.3: wrapper edit form.
  "wrappers.edit.h1": "Edit wrapper",
  "wrappers.edit.backToList": "← back to wrappers",
  "wrappers.edit.deleteTitle": "Delete wrapper?",
  "wrappers.error.notFound": "Wrapper not found:",
  "loading.wrapperForm": "Loading form…",
  "wrappers.form.ariaEdit": "Edit wrapper {name}",
  "wrappers.form.savedClean": "✓ Saved",
  "wrappers.form.savedAt": "✓ Saved at {time}",
  "wrappers.form.errorPrefix": "Error: {msg}",
  "wrappers.form.saveFirstApply": "Save changes first, then apply.",
  "wrappers.form.descriptionLabel": "Description",
  "wrappers.form.descriptionPlaceholder": "What this wrapper does",
  "wrappers.form.toolsLabel": "Tools (comma-separated)",
  "wrappers.form.toolsHint": "Tool names this wrapper applies to (e.g. bash, write).",
  "wrappers.form.kindLabel": "Rule kind",
  "wrappers.form.maxRetriesLabel": "Max retries (1-10)",
  "wrappers.form.initialBackoffLabel": "Initial backoff (ms)",
  "wrappers.form.initialBackoffHint": "Doubled each retry. 1000 = 1s.",
  "wrappers.form.logPathLabel": "Log path (relative to home)",
  "wrappers.form.logPathHint":
    "Where the audit log is written. The parent dir is auto-created.",
  "wrappers.form.transformLabel": "Transform mode",
  "wrappers.form.transformPathRedact": "Rewrite path (mask .env → .env.redacted)",
  "wrappers.form.transformContentRedact":
    "Rewrite content (replace matched substrings with [REDACTED])",
  "wrappers.form.patternsLabel": "Patterns (one per line, regex or substring)",
  "wrappers.form.patternsHint":
    "Used as regex when valid; substring otherwise.",
  // v0.9.1 (template marketplace).
  "workflows.import.button": "Import",
  "workflows.import.title": "Import workflow",
  "workflows.import.hint":
    "Paste a workflow JSON below or pick a file. You'll choose a new id for the imported copy.",
  "workflows.import.pickFile": "Pick file…",
  "workflows.import.jsonLabel": "Workflow JSON",
  "workflows.import.jsonRequired": "JSON is required",
  "workflows.import.idLabel": "New id (kebab-case)",
  "workflows.import.idRequired": "Id is required",
  "workflows.import.submit": "Import",
  "workflows.import.success": "Imported",
  "workflows.editor.export": "Export",
  "workflows.editor.exportHint":
    "Download this workflow as a JSON template you can share or version-control.",
  // v0.9.5: visual edge editor hint.
  "workflows.editor.connectModeHint":
    "Click the target node to connect from {name}. Click Cancel to abort.",
  // v0.7.3 (B2): observability dashboard i18n. Note we don't
  // mention the storage path, JSONL, or any implementation
  // detail — the user just sees "tool calls" + "policy
  // blocks". Per user memory: storage is a blind box.
  "nav.observability": "Observability",
  "nav.hint.observability": "Tool call outcomes + policy blocks",
  "observability.title": "Observability",
  "observability.refresh": "Refresh",
  "observability.total": "Total calls",
  "observability.success": "Succeeded",
  "observability.fail": "Failed",
  "observability.denied": "Policy blocked",
  "observability.empty": "No tool calls recorded yet.",
  "observability.empty.hint":
    "Calls will appear here as the policy engine evaluates them.",
  "observability.worstTool": "Highest fail-rate: {tool}",
  "observability.col.tool": "Tool",
  "observability.col.total": "Total",
  "observability.col.success": "✓",
  "observability.col.fail": "Failed",
  "observability.col.denied": "Blocked",
  // v0.9.2: per-tool rate columns.
  "observability.col.successRate": "ok %",
  "observability.col.failRate": "fail %",
  "observability.outcome.success": "success",
  "observability.outcome.fail": "fail",
  "observability.outcome.denied": "denied",
  "observability.reason": "rule: {reason}",
  "observability.managePolicy": "Manage policies →",
  // v0.7.7: chat-to-dashboard. Per user memory
  // §Engineering Philosophy, the chat input's
  // placeholder should hint at the kinds of questions
  // that work — the LLM is v0.8+, so today it's a
  // keyword matcher. Telling the user "what works
  // today" is more useful than promising general chat.
  "observability.chat.hint":
    "Ask in plain English. Today: 'recent errors', 'policy blocks', or a free-form summary.",
  "observability.chat.placeholder": "What failed recently?",
  "observability.chat.ask": "Ask",
  // v0.8.1: time-range filter on the observability
  // dashboard. The underlying API supported `since`
  // since v0.7.3 but the UI always queried all-time;
  // this surfaces the control.
  "observability.range.24h": "Last 24h",
  "observability.range.7d": "Last 7 days",
  "observability.range.all": "All time",
  // v0.8.7 (B2 闭环): per-outcome rate. The string
  // template is "{pct}%" rendered as a single line
  // under the count — the dashboard substitutes
  // "—" when total === 0.
  "observability.rate.success": "success rate",
  "observability.rate.fail": "fail rate",
  "observability.rate.denied": "denied rate",
  "observability.rate.empty": "—",
};
export default en;
