# Changelog

## Unreleased

### v0.5.12 — audit follow-up (12 items)

Round 2 of the v0.5.11 audit. Closes the remaining 6 P1 + 6 P2 items and adds a project-context discovery panel.

**Web UI**

- `RichT` component — translates a key with `{name}` placeholder values that can themselves be `ReactNode` (`<code>`, `<a>`, etc.). Replaces inline-English `<>...</>` JSX in `EmptyState` hints across 6 pages.
- `packages.installed.emptyHint`, `usage.empty.hint`, `tools.empty.hint`, `context.empty.hint`, `capabilities.empty.hint`, `sessions.empty.hint` — new i18n keys, with `dir`/`cmd`/`link`/`file1`/`file2` placeholders. Both en + zh.
- `compose.inspector.blockCount` (ICU plural: `n block` / `n blocks`) and ZH `n 个块`.
- `compose.inspector.openDetail`, `compose.inspector.remove`, `compose.announce.removedBlock`, `compose.announce.addedBlock`, `compose.aria.addEntity` — i18n'd the 10 hardcoded English strings in `ComposeBoard` (announcements, aria-label, inspector labels, action buttons).
- `profiles.packageCount` (ICU plural) + ZH `n 个包`.
- `usage.loadError`, `tools.loadError` — i18n'd the "Couldn't load …" error surface on `/usage` and `/tools`.
- `currency.usd` — unchanged from v0.5.11.
- `home.unit.messages`, `home.unit.calls` — i18n'd the dashboard's `${m.messages} msg` / `${t.count} calls` count units.
- Section headings unified to `section-h2` across `packages`, `usage`, `tools`, `context`.
- Inline Tailwind buttons collapsed to `.btn` / `.btn.secondary` / `.btn.danger` — `plans/[id]` (pause/resume/cancel), `plans/new` (cancel), `plans` (suggest-tools + new), `profiles` (create), `avatars` (capture).
- `pack → var(--cozy-accent-2)`, `profile → var(--cozy-profile)` (new token), `policy → var(--hitl)`, `capability → var(--cozy-accent)` — hardcoded hex tints in `KIND_META` now reference CSS palette tokens.
- `--cozy-profile: #7b8fa1` added to `globals.css` (slate blue, modern-mode profile tint).
- PolicyForm CSS tightened — input `font-size: 14px → 13px`, textarea `padding: 8px → 6px` to match the rest of the form controls.
- `<DiscoveryRules>` collapsible panel on `/context` — exposes the filename priority (AGENTS.md > AGENTS.MD > CLAUDE.md > CLAUDE.MD) and search path (`~/.pi/agent/` → cwd → .../parent → .../grandparent → ...) plus an informational-only clarification. Previously users saw the results without knowing the rules.
- Dashboard: `Empty` helper removed in favor of `<EmptyState>` from `@/components/EmptyState` (renamed local `EmptyState` → `EmptyStateCards` to avoid the collision).

**Test counts**

- web: 118/118 ✓
- core: 512/513 (1 pre-existing flaky `[network] absorb` timeout when run with the full suite — passes when isolated, unrelated to these changes)

## [0.4.0](https://github.com/wwppee/pilot/compare/v0.3.10...v0.4.0) (2026-07-02)


### Features

* add CI + release badges to README ([04425e8](https://github.com/wwppee/pilot/commit/04425e899260aa9985270c012f156bcde0578e5c))
